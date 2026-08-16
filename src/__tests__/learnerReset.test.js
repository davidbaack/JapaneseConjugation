import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { EVERYDAY_TYPE_IDS } from '../data/conjugationTypes.js';
import { buildSyncPayload, cardIdFor, defaultState } from '../utils/storage.js';
import { excludeWordFromReviewState } from '../utils/reviewScope.js';
import { buildLearnerResetPayload, commitLearnerResetPayload } from '../utils/learnerReset.js';
import { practiceScopeFromEnabledTypes } from '../utils/practiceScope.js';
import { commitCloudWithRetry } from '../hooks/useCloudAutoSync.js';
import { adoptSyncMetadata, stampSyncChanges } from '../utils/syncMetadata.js';

const WORD = { dict: 'taberu', reading: 'taberu', meaning: 'to eat', group: 'ichidan' };
const CUSTOM_WORD = { dict: 'custom', reading: 'custom', meaning: 'custom', group: 'godan' };

function populatedParts() {
  const cardId = cardIdFor(WORD, 'plain-past');
  const state = excludeWordFromReviewState(
    {
      ...defaultState(),
      enabledTypes: ['plain-past'],
      practiceScope: practiceScopeFromEnabledTypes(['plain-past']),
      cards: {
        [cardId]: {
          reps: 3,
          interval: 8,
          ease: 2.5,
          nextReview: 123,
          correct: 3,
          incorrect: 1,
          lastSeen: 99,
        },
      },
      verbStats: { taberu: { 'plain-past': { seen: 4, incorrect: 1 } } },
      mistakes: [{ key: 'miss', dict: 'taberu', group: 'ichidan', type: 'plain-past' }],
      daily: { ...defaultState().daily, count: 12, goalHit: true },
      game: { ...defaultState().game, played: 2, bestScore: 100 },
      minimalPairs: {
        bySet: {
          vowel: {
            attempted: 3,
            correct: 2,
            incorrect: 1,
            streak: 1,
            bestStreak: 2,
            lastAt: 99,
            byContrast: { long: { attempted: 3, correct: 2, incorrect: 1 } },
          },
        },
      },
    },
    WORD,
  );

  return {
    state,
    customVerbs: [CUSTOM_WORD],
    customAdjectives: [{ dict: 'custom-adj', reading: 'custom-adj', group: 'i-adjective' }],
    wordLists: [{ id: 'list-1', name: 'Custom list', wordKeys: ['godan:custom'] }],
    practicePrefs: {
      ...DEFAULT_PREFS,
      theme: 'dark',
      dailyGoal: 12,
      wordListIds: ['list-1'],
    },
  };
}

function highClockRemotePayload() {
  const baseline = adoptSyncMetadata(buildSyncPayload(), 'device-cloud');
  const parts = populatedParts();
  const remote = buildSyncPayload({
    ...parts,
    practicePrefs: { ...parts.practicePrefs, dailyGoal: 99 },
    customVerbs: [
      ...parts.customVerbs,
      { dict: 'miru', reading: 'miru', meaning: 'to see', group: 'ichidan' },
    ],
    wordLists: [
      ...parts.wordLists,
      { id: 'remote-list', name: 'Remote list', wordKeys: ['ichidan:miru'] },
    ],
    syncMeta: baseline.syncMeta,
  });
  const stamped = stampSyncChanges(baseline.syncMeta, baseline, remote);
  const remoteResetClock = {
    deviceId: 'device-cloud',
    revision: 50,
    eventId: 'remote-reset-50',
  };
  return {
    ...remote,
    syncMeta: {
      ...stamped,
      revision: 50,
      clocks: Object.fromEntries(
        Object.entries(stamped.clocks).map(([path, clock]) => [path, { ...clock, revision: 50 }]),
      ),
      tombstones: Object.fromEntries(
        Object.entries(stamped.tombstones).map(([path, clock]) => [
          path,
          { ...clock, revision: 50 },
        ]),
      ),
      resetEpochs: {
        factory: remoteResetClock,
        progress: remoteResetClock,
        settings: remoteResetClock,
        'custom-content': remoteResetClock,
      },
    },
  };
}

function changeResetPayload(before, changes = {}) {
  const after = buildSyncPayload({
    state: changes.state || before.state,
    customVerbs: changes.customVerbs || before.customVerbs,
    customAdjectives: changes.customAdjectives || before.customAdjectives,
    wordLists: changes.wordLists || before.wordLists,
    practicePrefs: changes.practicePrefs || before.practicePrefs,
    syncMeta: before.syncMeta,
  });
  return {
    ...after,
    syncMeta: stampSyncChanges(before.syncMeta, before, after),
  };
}

async function commitPendingResetAgainstRemote(payload, writeCloud = null) {
  const remote = highClockRemotePayload();
  const writeRow =
    writeCloud ||
    vi.fn((nextPayload) =>
      Promise.resolve({
        data: nextPayload,
        updated_at: '2026-08-15T12:00:00.000Z',
        revision: 8,
      }),
    );
  const committed = await commitCloudWithRetry(payload, 'user-1', {
    fetchCloud: vi.fn(() =>
      Promise.resolve({ data: remote, revision: 7, updated_at: '2026-08-15T11:00:00.000Z' }),
    ),
    writeCloud: writeRow,
  });
  return { committed: committed.payload, writeRow };
}

async function commitResetAgainstRemote(kind) {
  const payload = buildLearnerResetPayload(populatedParts(), kind);
  const remote = highClockRemotePayload();
  const saveLocal = vi.fn();
  const applyLocal = vi.fn();
  const writeRow = vi.fn((nextPayload) =>
    Promise.resolve({
      data: nextPayload,
      updated_at: '2026-08-15T12:00:00.000Z',
      revision: 8,
    }),
  );

  await commitLearnerResetPayload({
    payload,
    kind,
    session: { user: { id: 'user-1' } },
    writeCloud: (nextPayload, options) =>
      commitCloudWithRetry(nextPayload, 'user-1', {
        ...options,
        fetchCloud: vi.fn(() =>
          Promise.resolve({ data: remote, revision: 7, updated_at: '2026-08-15T11:00:00.000Z' }),
        ),
        writeCloud: writeRow,
      }),
    saveLocal,
    applyLocal,
  });

  return {
    committed: saveLocal.mock.calls[0][0],
    written: writeRow.mock.calls[0][0],
  };
}

describe('buildLearnerResetPayload', () => {
  it('resets practice progress while preserving settings, map scope, word scope, and custom content', () => {
    const parts = populatedParts();
    const reset = buildLearnerResetPayload(parts, 'progress');

    expect(reset.state.cards).toEqual({});
    expect(reset.state.verbStats).toEqual({});
    expect(reset.state.mistakes).toEqual([]);
    expect(reset.state.daily.count).toBe(0);
    expect(reset.state.game.played).toBe(0);
    expect(reset.state.minimalPairs).toEqual({ bySet: {} });
    expect(reset.state.enabledTypes).toEqual(['plain-past']);
    expect(reset.state.practiceScope.activeFamilyIds).toEqual(['te-ta-sound-changes']);
    expect(reset.state.reviewScope.excludedWordKeys).toEqual(['ichidan:taberu']);
    expect(reset.practicePrefs.theme).toBe('dark');
    expect(reset.customVerbs).toEqual(parts.customVerbs);
    expect(reset.wordLists).toEqual(parts.wordLists);
  });

  it('restores settings defaults without clearing progress or custom content', () => {
    const parts = populatedParts();
    const reset = buildLearnerResetPayload(parts, 'settings');

    expect(reset.state.cards).toEqual(parts.state.cards);
    expect(reset.state.reviewScope).toEqual(parts.state.reviewScope);
    expect(reset.state.enabledTypes).toEqual(EVERYDAY_TYPE_IDS);
    expect(reset.state.practiceScope).toEqual(defaultState().practiceScope);
    expect(reset.practicePrefs).toEqual(DEFAULT_PREFS);
    expect(reset.customVerbs).toEqual(parts.customVerbs);
    expect(reset.wordLists).toEqual(parts.wordLists);
  });

  it('clears custom learner content and active list selections while preserving progress', () => {
    const parts = populatedParts();
    const reset = buildLearnerResetPayload(parts, 'custom-content');

    expect(reset.customVerbs).toEqual([]);
    expect(reset.customAdjectives).toEqual([]);
    expect(reset.wordLists).toEqual([]);
    expect(reset.practicePrefs.wordListIds).toEqual([]);
    expect(reset.practicePrefs.theme).toBe('dark');
    expect(reset.state.cards).toEqual(parts.state.cards);
  });

  it('factory resets to a clean learner payload', () => {
    const reset = buildLearnerResetPayload(populatedParts(), 'factory', {
      ownerUserId: 'user-1',
    });

    expect(reset.state.cards).toEqual({});
    expect(reset.state.enabledTypes).toEqual(EVERYDAY_TYPE_IDS);
    expect(reset.state.reviewScope.excludedWordKeys).toEqual([]);
    expect(reset.customVerbs).toEqual([]);
    expect(reset.customAdjectives).toEqual([]);
    expect(reset.wordLists).toEqual([]);
    expect(reset.practicePrefs).toEqual(DEFAULT_PREFS);
    expect(reset.syncMeta.pendingReset).toMatchObject({
      domains: ['factory', 'progress', 'settings', 'custom-content', 'review'],
      ownerUserId: 'user-1',
    });
  });
});

describe('commitLearnerResetPayload', () => {
  it('writes to cloud before applying local state for signed-in resets', async () => {
    const payload = buildLearnerResetPayload(populatedParts(), 'factory');
    const writeCloud = vi.fn(() =>
      Promise.resolve({ row: { updated_at: '2026-08-15T12:00:00.000Z', revision: 1 } }),
    );
    const saveLocal = vi.fn();
    const applyLocal = vi.fn();

    const result = await commitLearnerResetPayload({
      payload,
      session: { user: { id: 'user-1' } },
      writeCloud,
      saveLocal,
      applyLocal,
      now: () => 12345,
    });

    expect(writeCloud).toHaveBeenCalledWith(payload);
    const serverAt = Date.parse('2026-08-15T12:00:00.000Z');
    expect(saveLocal).toHaveBeenCalledWith(payload, serverAt);
    expect(applyLocal).toHaveBeenCalledWith(payload, serverAt);
    expect(result).toEqual({ cloud: true, at: serverAt });
  });

  it('does not apply local state when a signed-in cloud reset fails', async () => {
    const payload = buildLearnerResetPayload(populatedParts(), 'factory');
    const saveLocal = vi.fn();
    const applyLocal = vi.fn();

    await expect(
      commitLearnerResetPayload({
        payload,
        session: { user: { id: 'user-1' } },
        writeCloud: vi.fn(() => Promise.reject(new Error('network down'))),
        saveLocal,
        applyLocal,
      }),
    ).rejects.toThrow('network down');

    expect(saveLocal).not.toHaveBeenCalled();
    expect(applyLocal).not.toHaveBeenCalled();
  });

  it('applies the converged payload acknowledged by a cloud reset', async () => {
    const payload = buildLearnerResetPayload(populatedParts(), 'progress');
    const committedPayload = {
      ...payload,
      customVerbs: [...payload.customVerbs, { ...CUSTOM_WORD, dict: 'from-other-device' }],
    };
    const saveLocal = vi.fn();
    const applyLocal = vi.fn();

    await commitLearnerResetPayload({
      payload,
      session: { user: { id: 'user-1' } },
      writeCloud: vi.fn(() =>
        Promise.resolve({
          payload: committedPayload,
          row: { updated_at: '2026-08-15T12:00:00.000Z', revision: 2 },
        }),
      ),
      saveLocal,
      applyLocal,
    });

    const serverAt = Date.parse('2026-08-15T12:00:00.000Z');
    expect(saveLocal).toHaveBeenCalledWith(committedPayload, serverAt);
    expect(applyLocal).toHaveBeenCalledWith(committedPayload, serverAt);
  });

  it('rebases factory, settings, and custom-content resets above newer cloud clocks', async () => {
    const factory = await commitResetAgainstRemote('factory');
    expect(factory.committed).toEqual(factory.written);
    expect(factory.committed.state.cards).toEqual({});
    expect(factory.committed.state.minimalPairs).toEqual({ bySet: {} });
    expect(factory.committed.customVerbs).toEqual([]);
    expect(factory.committed.wordLists).toEqual([]);
    expect(factory.committed.practicePrefs).toEqual(DEFAULT_PREFS);
    expect(factory.committed.syncMeta.resetEpochs.factory.revision).toBeGreaterThan(50);

    const settings = await commitResetAgainstRemote('settings');
    expect(settings.committed.practicePrefs).toEqual(DEFAULT_PREFS);
    expect(settings.committed.state.enabledTypes).toEqual(EVERYDAY_TYPE_IDS);
    expect(settings.committed.state.cards).not.toEqual({});
    expect(settings.committed.customVerbs.length).toBeGreaterThan(0);
    expect(settings.committed.syncMeta.resetEpochs.settings.revision).toBeGreaterThan(50);

    const customContent = await commitResetAgainstRemote('custom-content');
    expect(customContent.committed.customVerbs).toEqual([]);
    expect(customContent.committed.customAdjectives).toEqual([]);
    expect(customContent.committed.wordLists).toEqual([]);
    expect(customContent.committed.practicePrefs.wordListIds).toEqual([]);
    expect(customContent.committed.practicePrefs.theme).toBe('dark');
    expect(customContent.committed.syncMeta.resetEpochs['custom-content'].revision).toBeGreaterThan(
      50,
    );
  });

  it('carries signed-out reset intent through normal login commits for every reset domain', async () => {
    const factoryReset = buildLearnerResetPayload(populatedParts(), 'factory', {
      ownerUserId: 'user-1',
    });
    const factory = await commitPendingResetAgainstRemote(factoryReset);
    expect(factory.committed.state.cards).toEqual({});
    expect(factory.committed.state.minimalPairs).toEqual({ bySet: {} });
    expect(factory.committed.customVerbs).toEqual([]);
    expect(factory.committed.practicePrefs).toEqual(DEFAULT_PREFS);
    expect(factory.committed.syncMeta.resetEpochs.factory.revision).toBeGreaterThan(50);

    const settingsReset = buildLearnerResetPayload(populatedParts(), 'settings', {
      ownerUserId: 'user-1',
    });
    const settingsEdited = changeResetPayload(settingsReset, {
      practicePrefs: { ...settingsReset.practicePrefs, dailyGoal: 23 },
    });
    const settings = await commitPendingResetAgainstRemote(settingsEdited);
    expect(settings.committed.practicePrefs.dailyGoal).toBe(23);
    expect(settings.committed.syncMeta.resetEpochs.settings.revision).toBeGreaterThan(50);

    const customReset = buildLearnerResetPayload(populatedParts(), 'custom-content', {
      ownerUserId: 'user-1',
    });
    const readdedWord = {
      dict: 'kiku',
      reading: 'kiku',
      meaning: 'to listen again',
      group: 'godan',
    };
    const customEdited = changeResetPayload(customReset, { customVerbs: [readdedWord] });
    const custom = await commitPendingResetAgainstRemote(customEdited);
    expect(custom.committed.customVerbs).toEqual([readdedWord]);
    expect(custom.committed.wordLists).toEqual([]);
    expect(custom.committed.syncMeta.resetEpochs['custom-content'].revision).toBeGreaterThan(50);

    const progressReset = buildLearnerResetPayload(populatedParts(), 'progress', {
      ownerUserId: 'user-1',
    });
    const guideState = {
      ...progressReset.state,
      guide: {
        ...progressReset.state.guide,
        attempted: 1,
        correct: 1,
        byStep: {
          ...progressReset.state.guide.byStep,
          answer: { attempted: 1, correct: 1, assisted: 0 },
        },
        recent: [{ id: 'post-reset-guide', at: 200, correct: true }],
      },
    };
    const progressEdited = changeResetPayload(progressReset, { state: guideState });
    const progress = await commitPendingResetAgainstRemote(progressEdited);
    expect(progress.committed.state.cards).toEqual({});
    expect(progress.committed.state.minimalPairs).toEqual({ bySet: {} });
    expect(progress.committed.state.guide.attempted).toBe(1);
    expect(progress.committed.state.guide.recent.map((row) => row.id)).toEqual([
      'post-reset-guide',
    ]);
    expect(progress.committed.syncMeta.resetEpochs.progress.revision).toBeGreaterThan(50);

    for (const result of [factory, settings, custom, progress]) {
      expect(result.committed.syncMeta.pendingReset).toBeNull();
      expect(result.writeRow.mock.calls[0][0].syncMeta.pendingReset).toBeNull();
    }
  });

  it('accumulates distinct signed-out reset domains until one later cloud acknowledgement', async () => {
    const settingsReset = buildLearnerResetPayload(populatedParts(), 'settings', {
      ownerUserId: 'user-1',
    });
    const combinedReset = buildLearnerResetPayload(settingsReset, 'custom-content', {
      ownerUserId: 'user-1',
    });

    expect(combinedReset.syncMeta.pendingReset).toMatchObject({
      domains: ['settings', 'custom-content'],
      ownerUserId: 'user-1',
    });

    const { committed, writeRow } = await commitPendingResetAgainstRemote(combinedReset);

    expect(committed.practicePrefs.dailyGoal).toBe(DEFAULT_PREFS.dailyGoal);
    expect(committed.customVerbs).toEqual([]);
    expect(committed.customAdjectives).toEqual([]);
    expect(committed.wordLists).toEqual([]);
    expect(committed.syncMeta.resetEpochs.settings.revision).toBeGreaterThan(50);
    expect(committed.syncMeta.resetEpochs['custom-content'].revision).toBeGreaterThan(50);
    expect(committed.syncMeta.pendingReset).toBeNull();
    expect(writeRow.mock.calls[0][0].syncMeta.pendingReset).toBeNull();
  });

  it('keeps pending reset intent durable across failure and clears it only after CAS success', async () => {
    const payload = buildLearnerResetPayload(populatedParts(), 'settings', {
      ownerUserId: 'user-1',
    });
    const eventId = payload.syncMeta.pendingReset.eventId;
    const failedWrite = vi.fn(() => Promise.reject(new Error('network down')));

    await expect(commitPendingResetAgainstRemote(payload, failedWrite)).rejects.toThrow(
      'network down',
    );
    expect(payload.syncMeta.pendingReset.eventId).toBe(eventId);
    expect(failedWrite.mock.calls[0][0].syncMeta.pendingReset).toBeNull();

    const conflict = Object.assign(new Error('revision conflict'), {
      code: 'SYNC_REVISION_CONFLICT',
    });
    const retryingWrite = vi.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce({
      updated_at: '2026-08-15T12:00:00.000Z',
      revision: 9,
    });
    const remote = highClockRemotePayload();
    const committed = await commitCloudWithRetry(payload, 'user-1', {
      fetchCloud: vi
        .fn()
        .mockResolvedValueOnce({ data: remote, revision: 7 })
        .mockResolvedValueOnce({ data: remote, revision: 8 }),
      writeCloud: retryingWrite,
    });

    expect(retryingWrite).toHaveBeenCalledTimes(2);
    expect(
      retryingWrite.mock.calls.every(([written]) => written.syncMeta.pendingReset === null),
    ).toBe(true);
    expect(committed.payload.syncMeta.pendingReset).toBeNull();
    expect(payload.syncMeta.pendingReset.eventId).toBe(eventId);
  });

  it('does not apply one account pending reset intent to a different account', async () => {
    const parts = populatedParts();
    parts.state.cards['a-private-card'] = { reps: 7, nextReview: 123 };
    const payload = buildLearnerResetPayload(parts, 'settings', {
      ownerUserId: 'user-a',
    });
    const remote = highClockRemotePayload();
    const fetchCloud = vi.fn(() => Promise.resolve({ data: remote, revision: 7 }));
    const writeCloud = vi.fn(() =>
      Promise.resolve({
        updated_at: '2026-08-15T12:00:00.000Z',
        revision: 8,
      }),
    );

    await expect(
      commitCloudWithRetry(payload, 'user-b', { fetchCloud, writeCloud }),
    ).rejects.toMatchObject({ code: 'SYNC_OWNER_MISMATCH' });

    expect(fetchCloud).not.toHaveBeenCalled();
    expect(writeCloud).not.toHaveBeenCalled();
    expect(payload.syncMeta.pendingReset.ownerUserId).toBe('user-a');
    expect(payload.state.cards['a-private-card']).toBeDefined();
  });

  it('does not apply local state when a signed-in reset becomes stale after the cloud write', async () => {
    const payload = buildLearnerResetPayload(populatedParts(), 'factory');
    const writeCloud = vi.fn(() => Promise.resolve());
    const shouldCommit = vi.fn(() => false);
    const saveLocal = vi.fn();
    const applyLocal = vi.fn();

    const result = await commitLearnerResetPayload({
      payload,
      session: { user: { id: 'user-1' } },
      writeCloud,
      shouldCommit,
      saveLocal,
      applyLocal,
      now: () => 12345,
    });

    expect(writeCloud).toHaveBeenCalledWith(payload);
    expect(shouldCommit).toHaveBeenCalled();
    expect(saveLocal).not.toHaveBeenCalled();
    expect(applyLocal).not.toHaveBeenCalled();
    expect(result).toEqual({ cloud: true, at: null, stale: true });
  });
});
