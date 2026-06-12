import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { EVERYDAY_TYPE_IDS } from '../data/conjugationTypes.js';
import { cardIdFor, defaultState } from '../utils/storage.js';
import { excludeWordFromReviewState } from '../utils/reviewScope.js';
import { buildLearnerResetPayload, commitLearnerResetPayload } from '../utils/learnerReset.js';

const WORD = { dict: 'taberu', reading: 'taberu', meaning: 'to eat', group: 'ichidan' };
const CUSTOM_WORD = { dict: 'custom', reading: 'custom', meaning: 'custom', group: 'godan' };

function populatedParts() {
  const cardId = cardIdFor(WORD, 'plain-past');
  const state = excludeWordFromReviewState(
    {
      ...defaultState(),
      enabledTypes: ['plain-past'],
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

describe('buildLearnerResetPayload', () => {
  it('resets practice progress while preserving settings, map scope, word scope, and custom content', () => {
    const parts = populatedParts();
    const reset = buildLearnerResetPayload(parts, 'progress');

    expect(reset.state.cards).toEqual({});
    expect(reset.state.verbStats).toEqual({});
    expect(reset.state.mistakes).toEqual([]);
    expect(reset.state.daily.count).toBe(0);
    expect(reset.state.game.played).toBe(0);
    expect(reset.state.enabledTypes).toEqual(['plain-past']);
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
    const reset = buildLearnerResetPayload(populatedParts(), 'factory');

    expect(reset.state.cards).toEqual({});
    expect(reset.state.enabledTypes).toEqual(EVERYDAY_TYPE_IDS);
    expect(reset.state.reviewScope.excludedWordKeys).toEqual([]);
    expect(reset.customVerbs).toEqual([]);
    expect(reset.customAdjectives).toEqual([]);
    expect(reset.wordLists).toEqual([]);
    expect(reset.practicePrefs).toEqual(DEFAULT_PREFS);
  });
});

describe('commitLearnerResetPayload', () => {
  it('writes to cloud before applying local state for signed-in resets', async () => {
    const payload = buildLearnerResetPayload(populatedParts(), 'factory');
    const writeCloud = vi.fn(() => Promise.resolve());
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
    expect(saveLocal).toHaveBeenCalledWith(payload, 12345);
    expect(applyLocal).toHaveBeenCalledWith(payload, 12345);
    expect(result).toEqual({ cloud: true, at: 12345 });
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
