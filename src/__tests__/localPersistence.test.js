// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, STORAGE_KEY } from '../data/defaults.js';
import {
  acceptCurrentStorageSnapshot,
  defaultState,
  loadAll,
  markMistakeResolved,
  mergeSyncPayload,
  recordMistake,
  recordPracticeRetry,
  saveAll,
} from '../utils/storage.js';
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
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
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
  it.each(['plain-past', 'dictionary|plain-past'])(
    'keeps a %s correction after history eviction, stale merge, and reload',
    async (type) => {
      const word = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
      const [targetType, sourceType] = type.split('|');
      const key = `verb:ichidan:食べる:たべる|${type}`;
      const original = baseline();
      const missed = recordMistake([], word, targetType, sourceType, 'x', 'たべた', { now: 1000 });
      const stale = {
        ...original,
        state: { ...original.state, mistakes: missed, retryQueue: [key] },
      };
      let mistakes = markMistakeResolved(missed, missed[0].key, { now: 2000 });
      for (let i = 0; i < 50; i += 1) {
        const other = { ...word, dict: `fixture-${i}` };
        mistakes = recordMistake(mistakes, other, 'plain-past', null, 'x', 'たべた', {
          now: 3000 + i * 2,
        });
        mistakes = markMistakeResolved(mistakes, mistakes[0].key, { now: 3001 + i * 2 });
      }
      const corrected = {
        ...stale,
        state: {
          ...stale.state,
          ...recordPracticeRetry(stale.state, key, { at: 2000, eventId: 'fixed', correct: true }),
          mistakes,
        },
      };
      // The bounded mistake history no longer includes this card's resolution.
      expect(corrected.state.mistakes).toHaveLength(50);
      expect(corrected.state.mistakes.some((mistake) => mistake.key === missed[0].key)).toBe(false);
      expect(mergeSyncPayload(stale, corrected).state.retryQueue).toEqual([]);
      expect(mergeSyncPayload(corrected, stale).state.retryQueue).toEqual([]);
      save(stale);
      await persistLocalSnapshot(corrected);
      await persistLocalSnapshot(stale);
      expect(loadAll().state.retryQueue).toEqual([]);

      const newer = {
        ...stale,
        state: {
          ...stale.state,
          ...recordPracticeRetry(stale.state, key, { at: 3000, eventId: 'miss', correct: false }),
        },
      };
      await persistLocalSnapshot(newer);
      expect(loadAll().state.retryQueue).toEqual([key]);
    },
  );

  it('reclaims disposable cache space before staging and persists the answer through reload', async () => {
    const original = baseline();
    save(original);
    localStorage.setItem('katachiya_ai_sentence_cache', JSON.stringify({ fixture: 'large cache' }));
    localStorage.setItem('jp-backup-recovery:fixture', 'irreplaceable recovery copy');
    const setItem = window.Storage.prototype.setItem;
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      // Model quota occupied by regenerable cache, at the real staging boundary.
      if (key.includes(':pending:') && this.getItem('katachiya_ai_sentence_cache'))
        throw Object.assign(new Error('Cache occupies the remaining quota'), {
          name: 'QuotaExceededError',
        });
      return setItem.call(this, key, value);
    });
    await persistLocalSnapshot(answer(original, 'quota-writer', true));
    expect(loadAll().state.practiceStats.lifetime).toMatchObject({ attempted: 1, correct: 1 });
    expect(localStorage.getItem('katachiya_ai_sentence_cache')).toBeNull();
    expect(localStorage.getItem('jp-backup-recovery:fixture')).toBe('irreplaceable recovery copy');
    expect(
      [...Array(localStorage.length)]
        .map((_, i) => localStorage.key(i))
        .filter((key) => key.includes(':pending:')),
    ).toEqual([]);
  });

  it('retains the saved snapshot and abandoned answer when staging still exceeds quota after eviction', async () => {
    const original = baseline();
    save(original);
    navigator.locks.request.mockImplementationOnce(() => new Promise(() => {}));
    void persistLocalSnapshot(answer(original, 'abandoned-writer', false));
    localStorage.setItem('katachiya_ai_sentence_cache', JSON.stringify({ fixture: 'cache' }));
    localStorage.setItem('jp-backup-recovery:fixture', 'recovery bytes');
    const mainBefore = localStorage.getItem(STORAGE_KEY);
    const pendingBefore = JSON.parse(serializeSavedRecoveryData()).pending;
    const setItem = window.Storage.prototype.setItem;
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key.includes(':pending:'))
        throw Object.assign(new Error('Learner data fills quota'), { name: 'QuotaExceededError' });
      return setItem.call(this, key, value);
    });
    await expect(persistLocalSnapshot(answer(original, 'new-writer', true))).rejects.toMatchObject({
      isQuotaError: true,
      message: expect.stringContaining('Storage full'),
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe(mainBefore);
    expect(JSON.parse(serializeSavedRecoveryData()).pending).toEqual(pendingBefore);
    expect(loadAll().state.practiceStats.lifetime).toMatchObject({ attempted: 1, correct: 0 });
    expect(localStorage.getItem('jp-backup-recovery:fixture')).toBe('recovery bytes');
    expect(navigator.locks.request).toHaveBeenCalledTimes(1);
  });

  it('does not evict caches or change saved learner data on a non-quota staging failure', async () => {
    const original = baseline();
    save(original);
    localStorage.setItem('katachiya_ai_sentence_cache', 'cache bytes');
    const mainBefore = localStorage.getItem(STORAGE_KEY);
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('Storage access denied'), { name: 'SecurityError' });
    });
    await expect(
      persistLocalSnapshot(answer(original, 'denied-writer', true)),
    ).rejects.toMatchObject({ name: 'SecurityError' });
    expect(localStorage.getItem('katachiya_ai_sentence_cache')).toBe('cache bytes');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(mainBefore);
    expect(navigator.locks.request).not.toHaveBeenCalled();
  });
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
