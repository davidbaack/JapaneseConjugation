import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from '../data/defaults.js';
import { getRecoveryBackup, persistBackupRestore } from '../utils/restorePersistence.js';
import { loadAll, saveAll } from '../utils/storage.js';
import { serializeBackup } from '../utils/backup.js';
import { makeLearnerSnapshot } from './fixtures/learnerSnapshot.js';

let entries;
beforeEach(() => {
  entries = new Map();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key) => entries.get(key) ?? null),
    setItem: vi.fn((key, value) => entries.set(key, value)),
    removeItem: vi.fn((key) => entries.delete(key)),
  });
});
const save = (parts) =>
  saveAll(
    parts.state,
    parts.customVerbs,
    parts.customAdjectives,
    parts.wordLists,
    parts.syncConfig,
    parts.lastSyncedAt,
    parts.practicePrefs,
    parts.syncMeta,
  );

describe('durable backup restore', () => {
  it('commits one learner bundle with a verified recovery pointer surviving normal saves', () => {
    const original = makeLearnerSnapshot();
    save(original);
    const replacement = makeLearnerSnapshot();
    replacement.state.session.reviewed = 30;
    const result = persistBackupRestore(replacement, serializeBackup(original));
    expect(loadAll().state).toEqual(replacement.state);
    expect(JSON.parse(getRecoveryBackup()).state).toEqual(original.state);
    expect(result.recoveryBackup).toBe(getRecoveryBackup());
    save(replacement);
    expect(getRecoveryBackup()).toBe(result.recoveryBackup);
  });
  it('keeps original raw unsupported data in the recovery copy', () => {
    const raw = '{"state":{"schemaVersion":99,"cards":{}}}';
    entries.set(STORAGE_KEY, raw);
    expect(() => loadAll()).toThrow(/schema/);
    persistBackupRestore(makeLearnerSnapshot(), null);
    expect(getRecoveryBackup()).toBe(raw);
  });
  it.each(['stage', 'commit', 'security'])(
    'preserves original state and previous recovery on %s failure',
    (failure) => {
      const parts = makeLearnerSnapshot();
      save(parts);
      persistBackupRestore(parts, 'previous recovery');
      const before = entries.get(STORAGE_KEY);
      const priorRecovery = getRecoveryBackup();
      const realSet = localStorage.setItem;
      localStorage.setItem = vi.fn((key, value) => {
        if (
          (failure === 'stage' && key.startsWith('jp-backup-recovery:')) ||
          (failure !== 'stage' && key === STORAGE_KEY)
        )
          throw Object.assign(new Error(failure), {
            name: failure === 'security' ? 'SecurityError' : 'QuotaExceededError',
          });
        realSet(key, value);
      });
      expect(() => persistBackupRestore(parts, 'new recovery')).toThrow();
      expect(entries.get(STORAGE_KEY)).toBe(before);
      expect(getRecoveryBackup()).toBe(priorRecovery);
    },
  );
  it('rolls back a write when readback does not verify', () => {
    const parts = makeLearnerSnapshot();
    save(parts);
    const before = entries.get(STORAGE_KEY);
    const realGet = localStorage.getItem;
    let readback = false;
    const realSet = localStorage.setItem;
    localStorage.setItem = vi.fn((key, value) => {
      realSet(key, value);
      if (key === STORAGE_KEY) readback = true;
    });
    localStorage.getItem = vi.fn((key) => {
      if (key === STORAGE_KEY && readback) {
        readback = false;
        return 'not the saved data';
      }
      return realGet(key);
    });
    expect(() => persistBackupRestore(parts, 'recovery')).toThrow(/verify/);
    expect(entries.get(STORAGE_KEY)).toBe(before);
  });
  it('surfaces parse and nonquota read/write errors', () => {
    entries.set(STORAGE_KEY, 'broken');
    expect(() => loadAll()).toThrow(/could not be read/);
    entries.clear();
    loadAll();
    localStorage.setItem = vi.fn(() => {
      throw new Error('denied');
    });
    expect(() => save(makeLearnerSnapshot())).toThrow('denied');
  });
  it('refuses stale-tab restore and autosave instead of losing newer durable progress', () => {
    const original = makeLearnerSnapshot();
    save(original);
    const newer = JSON.parse(entries.get(STORAGE_KEY));
    newer.state.session.reviewed = 99;
    entries.set(STORAGE_KEY, JSON.stringify(newer));
    expect(() => persistBackupRestore(original, serializeBackup(original))).toThrow(/another tab/);
    expect(() => save(original)).toThrow(/another tab/);
    expect(JSON.parse(entries.get(STORAGE_KEY)).state.session.reviewed).toBe(99);
  });
  it('never rolls back over another tab write during readback verification', () => {
    const original = makeLearnerSnapshot();
    save(original);
    const realGet = localStorage.getItem;
    let committed = false;
    const realSet = localStorage.setItem;
    localStorage.setItem = vi.fn((key, value) => {
      realSet(key, value);
      if (key === STORAGE_KEY) committed = true;
    });
    localStorage.getItem = vi.fn((key) => {
      if (key === STORAGE_KEY && committed) {
        committed = false;
        const external = JSON.parse(entries.get(key));
        external.state.session.reviewed = 99;
        entries.set(key, JSON.stringify(external));
      }
      return realGet(key);
    });
    expect(() => persistBackupRestore(original, serializeBackup(original))).toThrow(
      expect.objectContaining({
        message: expect.stringMatching(/Reload Settings/),
        restoreMayHaveCommitted: true,
        cause: expect.objectContaining({
          message: 'Another tab changed saved data during verification.',
          cause: expect.objectContaining({
            message: 'Could not verify the restored learner data.',
          }),
        }),
      }),
    );
    expect(JSON.parse(entries.get(STORAGE_KEY)).state.session.reviewed).toBe(99);
  });
});
