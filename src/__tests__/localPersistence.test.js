// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, STORAGE_KEY } from '../data/defaults.js';
import { acceptCurrentStorageSnapshot, defaultState, loadAll, saveAll } from '../utils/storage.js';
import { adoptSyncMetadata, stampSyncChanges } from '../utils/syncMetadata.js';
import { recordPracticeAnswer } from '../utils/practiceStats.js';
import { persistLocalSnapshot } from '../utils/localPersistence.js';
import { serializeSavedRecoveryData } from '../utils/localJournal.js';

let queue;
beforeEach(() => {
  localStorage.clear();
  acceptCurrentStorageSnapshot();
  queue = Promise.resolve();
  vi.stubGlobal('navigator', {
    locks: {
      request: vi.fn((_key, action) => {
        const next = queue.then(action);
        queue = next.catch(() => {});
        return next;
      }),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
function baseline() {
  return adoptSyncMetadata(
    {
      state: defaultState(),
      customVerbs: [],
      customAdjectives: [],
      wordLists: [],
      practicePrefs: DEFAULT_PREFS,
      syncConfig: { enabled: false, userId: '' },
      lastSyncedAt: 0,
    },
    'test-device',
  );
}
function answer(before, id, correct) {
  const state = {
    ...before.state,
    practiceStats: recordPracticeAnswer(before.state.practiceStats, {
      typeId: 'plain-past',
      correct,
      mode: 'input',
      responseMs: 1500,
      at: 1000,
      id,
    }),
  };
  const after = { ...before, state };
  return { ...after, syncMeta: stampSyncChanges(before.syncMeta, before, after, { writerId: id }) };
}
function save(parts) {
  saveAll(
    parts.state,
    parts.customVerbs,
    parts.customAdjectives,
    parts.wordLists,
    parts.syncConfig,
    0,
    parts.practicePrefs,
    parts.syncMeta,
  );
}

describe('coordinated local learner persistence', () => {
  it('serializes two independent candidates and keeps both contributions after reload', async () => {
    const original = baseline();
    save(original);
    await Promise.all([
      persistLocalSnapshot(answer(original, 'writer-a', true)),
      persistLocalSnapshot(answer(original, 'writer-b', false)),
    ]);
    const restored = loadAll();
    expect(restored.state.practiceStats.lifetime).toMatchObject({
      attempted: 2,
      correct: 1,
      responseMs: 3000,
    });
    expect(restored.state.practiceStats.recent).toHaveLength(2);
    expect(
      [...Array(localStorage.length)]
        .map((_x, i) => localStorage.key(i))
        .filter((key) => key.includes(':pending:')),
    ).toEqual([]);
  });
  it('stages an answer durably before waiting for the tab lock, so reload can recover it', () => {
    const original = baseline();
    save(original);
    navigator.locks.request.mockImplementation(() => new Promise(() => {}));
    void persistLocalSnapshot(answer(original, 'closed-writer', false));
    const rawMain = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(rawMain.state.practiceStats.lifetime.attempted).toBe(0);
    expect(loadAll().state.practiceStats.lifetime).toMatchObject({ attempted: 1, correct: 0 });
  });
  it('consumes an abandoned immutable stage only after its answer is committed to main', async () => {
    const original = baseline();
    save(original);
    navigator.locks.request.mockImplementationOnce(() => new Promise(() => {}));
    void persistLocalSnapshot(answer(original, 'closed-runtime', true));
    await persistLocalSnapshot(original);
    expect(loadAll().state.practiceStats.lifetime.attempted).toBe(1);
    const keys = [...Array(localStorage.length)].map((_value, index) => localStorage.key(index));
    expect(keys.filter((key) => key.includes(':pending:'))).toEqual([]);
  });
  it('downloads saved and pending recovery data without including authentication storage', () => {
    const original = baseline();
    save(original);
    localStorage.setItem('sb-test-auth-token', 'fake-auth-secret');
    navigator.locks.request.mockImplementationOnce(() => new Promise(() => {}));
    void persistLocalSnapshot(answer(original, 'pending-runtime', false));
    const text = serializeSavedRecoveryData();
    const recovery = JSON.parse(text);
    expect(recovery.saved).toBe(localStorage.getItem(STORAGE_KEY));
    expect(recovery.pending).toHaveLength(1);
    expect(JSON.parse(recovery.pending[0].raw).state.practiceStats.lifetime.attempted).toBe(1);
    expect(text).not.toContain('fake-auth-secret');
    expect(text).not.toContain('sb-test-auth-token');
  });
  it('does not fold a pending snapshot from another account into this learner', () => {
    const original = baseline();
    save(original);
    localStorage.setItem(
      `${STORAGE_KEY}:pending:other-account`,
      JSON.stringify({
        ...answer(original, 'other-writer', true),
        syncConfig: { enabled: true, userId: 'other-user' },
      }),
    );
    expect(loadAll().state.practiceStats.lifetime.attempted).toBe(0);
  });
  it('refuses an ordinary save across a replacement epoch and preserves the newer snapshot', async () => {
    const original = baseline();
    save(original);
    const newer = baseline();
    newer.syncMeta.resetEpochs.progress = {
      revision: 10,
      deviceId: 'replacement',
      eventId: 'new-epoch',
    };
    newer.syncMeta.progressContributions.epoch = 'new-epoch';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newer));
    await expect(persistLocalSnapshot(answer(original, 'late-writer', true))).rejects.toMatchObject(
      { code: 'STALE_LEARNER_SNAPSHOT' },
    );
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)).syncMeta.resetEpochs.progress.eventId,
    ).toBe('new-epoch');
  });
});
