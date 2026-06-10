import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { onbinPatternForVerb, wordKey } from '../utils/conjugator.js';
import {
  buildLabReviewRecommendations,
  buildLessonReviewRecommendation,
  buildRuleReviewRecommendation,
} from '../utils/reviewRecommendations.js';
import { normalizeReviewScope } from '../utils/reviewScope.js';
import { defaultState } from '../utils/storage.js';

const TABERU = {
  dict: '\u98df\u3079\u308b',
  reading: '\u305f\u3079\u308b',
  meaning: 'to eat',
  group: 'ichidan',
};
const KAKU = {
  dict: '\u66f8\u304f',
  reading: '\u304b\u304f',
  meaning: 'to write',
  group: 'godan',
};
const TAKAI = {
  dict: '\u9ad8\u3044',
  reading: '\u305f\u304b\u3044',
  meaning: 'expensive',
  group: 'i-adjective',
};

describe('review recommendations', () => {
  it('builds an Ending Lab recommendation from weak onbin patterns', () => {
    const pattern = onbinPatternForVerb(KAKU).label;
    const state = {
      ...defaultState(),
      onbin: {
        ...defaultState().onbin,
        byPattern: {
          [pattern]: { attempted: 4, correct: 2, lastAt: 100 },
        },
      },
    };

    const recommendations = buildLabReviewRecommendations(
      state,
      [TABERU, KAKU, TAKAI],
      DEFAULT_PREFS,
      [],
      { activeTool: 'endings' },
    );
    const rec = recommendations.find((item) => item.id === 'lab-onbin-review');

    expect(rec).toMatchObject({
      source: 'lab',
      typeIds: ['te-form', 'plain-past'],
    });
    expect(rec.wordKeys).toEqual([wordKey(KAKU)]);
  });

  it('builds a Groups recommendation with adjective forms for weak adjective classification', () => {
    const state = {
      ...defaultState(),
      classify: {
        attempted: 3,
        correct: 1,
        byGroup: {
          'i-adjective': { attempted: 3, correct: 1 },
        },
      },
    };

    const [rec] = buildLabReviewRecommendations(state, [TABERU, KAKU, TAKAI], DEFAULT_PREFS, [], {
      activeTool: 'classify',
    });

    expect(rec.id).toBe('lab-classify-review');
    expect(rec.wordKeys).toEqual([wordKey(TAKAI)]);
    expect(rec.typeIds).toContain('adj-plain-past');
    expect(rec.typeIds).not.toContain('plain-past');
  });

  it('builds a Rush recommendation from Lab-only game stats', () => {
    const state = {
      ...defaultState(),
      game: {
        ...defaultState().game,
        byType: {
          potential: { attempted: 3, correct: 1, incorrect: 2, lastAt: 100 },
        },
        byWord: {
          [wordKey(TABERU)]: { attempted: 2, correct: 0, incorrect: 2, lastAt: 100 },
        },
      },
    };

    const [rec] = buildLabReviewRecommendations(state, [TABERU, KAKU, TAKAI], DEFAULT_PREFS, [], {
      activeTool: 'games',
    });

    expect(rec).toMatchObject({
      id: 'lab-rush-review',
      source: 'lab',
      wordKeys: [wordKey(TABERU)],
    });
    expect(rec.typeIds).toEqual(['potential']);
  });

  it('builds lesson handoffs as visible Practice recommendations', () => {
    const rec = buildLessonReviewRecommendation(
      {
        groupId: 'basic-past',
        title: 'Basic Past',
        typeIds: ['plain-past', 'te-form'],
      },
      [TABERU, KAKU, TAKAI],
      { suggestedCount: 8 },
    );

    expect(rec).toMatchObject({
      id: 'lesson-basic-past',
      source: 'lesson',
      label: 'Basic Past Practice',
      suggestedCount: 8,
      typeIds: ['plain-past', 'te-form'],
    });
    expect(new Set(rec.wordKeys)).toEqual(new Set([wordKey(TABERU), wordKey(KAKU)]));
  });

  it('builds one-form rule handoffs with the current card word first', () => {
    const rec = buildRuleReviewRecommendation(
      {
        lessonGroupId: 'te-ta-sound-changes',
        lessonTitle: 'Te/Ta Sound Changes',
        typeId: 'plain-past',
        typeLabel: 'Plain Past',
        word: KAKU,
      },
      [TABERU, KAKU, TAKAI],
      { suggestedCount: 8 },
    );

    expect(rec).toMatchObject({
      id: 'lesson-te-ta-sound-changes-plain-past',
      source: 'lesson',
      label: 'Plain Past Practice',
      typeIds: ['plain-past'],
      suggestedCount: 8,
    });
    expect(rec.wordKeys[0]).toBe(wordKey(KAKU));
    expect(rec.wordKeys).toContain(wordKey(TABERU));
    expect(rec.wordKeys).not.toContain(wordKey(TAKAI));
  });

  it('normalizes legacy saved recommendation copy to Practice language', () => {
    const scope = normalizeReviewScope({
      recommendations: [
        {
          id: 'lesson-basic-past',
          source: 'lesson',
          label: 'Basic Past Reviews',
          detail: 'Move this review set out of SRS.',
          typeIds: ['plain-past'],
          wordKeys: [wordKey(TABERU)],
        },
      ],
    });

    expect(scope.recommendations[0]).toMatchObject({
      label: 'Basic Past Practice',
      detail: 'Move this practice set out of Practice history.',
    });
  });
});
