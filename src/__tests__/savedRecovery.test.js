// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from '../data/defaults.js';
import { serializeSavedRecoveryData } from '../utils/savedRecovery.js';
import { serializeRestoreRecoveryData } from '../utils/restoreRecovery.js';
import { parseBackup } from '../utils/backup.js';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('lossless raw learner recovery', () => {
  it('keeps raw durable/pending bytes and current learner data without reading auth storage', () => {
    const saved = ' {"unsupported": "saved value"} ';
    const pendingKey = `${STORAGE_KEY}:pending:fixture`;
    const pending = 'unreadable pending bytes';
    localStorage.setItem(STORAGE_KEY, saved);
    localStorage.setItem(pendingKey, pending);
    localStorage.setItem('sb-fixture-auth-token', 'private-auth-fixture');
    const current = { state: { reference: { retainedNote: 'current unsaved evidence' } } };
    const currentBefore = JSON.stringify(current);
    const reads = vi.spyOn(window.Storage.prototype, 'getItem');
    const serialized = serializeRestoreRecoveryData(current);
    const recovery = JSON.parse(serialized);
    expect(recovery).toMatchObject({
      format: 'katachiya-saved-recovery',
      version: 1,
      saved,
      pending: [{ key: pendingKey, raw: pending }],
      current,
    });
    expect(parseBackup(serialized).ok).toBe(false);
    expect(serialized).not.toContain('private-auth-fixture');
    expect(reads).not.toHaveBeenCalledWith('sb-fixture-auth-token');
    expect(JSON.stringify(current)).toBe(currentBefore);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);
    expect(localStorage.getItem(pendingKey)).toBe(pending);
  });

  it('keeps the existing raw export format when no current snapshot is supplied', () => {
    localStorage.setItem(STORAGE_KEY, '{unreadable');
    const recovery = JSON.parse(serializeSavedRecoveryData());
    expect(recovery.saved).toBe('{unreadable');
    expect(recovery).not.toHaveProperty('current');
  });

  it('refuses a lossy current-snapshot serialization before storage or replacement is touched', () => {
    localStorage.setItem(STORAGE_KEY, 'original bytes');
    const reads = vi.spyOn(window.Storage.prototype, 'getItem');
    const writes = vi.spyOn(window.Storage.prototype, 'setItem');
    expect(() => serializeRestoreRecoveryData({ retained: undefined })).toThrow(/JSON data/);
    expect(reads).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
  });
});
