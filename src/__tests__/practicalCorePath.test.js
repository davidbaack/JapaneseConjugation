import { describe, expect, it } from 'vitest';
import { BASICS_TYPE_IDS } from '../data/conjugationTypes.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import {
  buildPracticalCorePath,
  practicePrefsForPracticalCorePath,
} from '../utils/practicalCorePath.js';
import { cardIdFor, defaultState } from '../utils/storage.js';
import { TODAY_DRILL_LIST_ID } from '../utils/todayDrill.js';

const TABERU = {
  dict: '\u98df\u3079\u308b',
  reading: '\u305f\u3079\u308b',
  meaning: 'to eat',
  group: 'ichidan',
};
const HASHIRU = {
  dict: '\u8d70\u308b',
  reading: '\u306f\u3057\u308b',
  meaning: 'to run',
  group: 'godan',
};
const TAKAI = {
  dict: '\u9ad8\u3044',
  reading: '\u305f\u304b\u3044',
  meaning: 'expensive',
  group: 'i-adjective',
};

function reviewedCard(correct, incorrect = 0) {
  return {
    reps: 1,
    interval: 1,
    ease: 2.5,
    nextReview: 1,
    correct,
    incorrect,
  };
}

describe('practical core path', () => {
  it('starts new learners on foundations using Basics forms', () => {
    const path = buildPracticalCorePath(
      defaultState(),
      [TABERU, HASHIRU, TAKAI],
      DEFAULT_PREFS,
      [],
      {
        now: 10,
      },
    );

    expect(path.activeStageId).toBe('foundations');
    expect(path.available).toBe(true);
    expect(path.plan.title).toBe('Practical Core Path');
    expect(path.plan.typeIds.every((typeId) => BASICS_TYPE_IDS.includes(typeId))).toBe(true);
  });

  it('advances to everyday production after enough foundation wins', () => {
    const state = {
      ...defaultState(),
      cards: {
        [cardIdFor(TABERU, 'plain-past')]: reviewedCard(12),
      },
    };

    const path = buildPracticalCorePath(state, [TABERU, HASHIRU, TAKAI], DEFAULT_PREFS, [], {
      now: 10,
    });

    expect(path.activeStageId).toBe('everyday');
    expect(path.stages[0].stats.complete).toBe(true);
    expect(path.activeStage.typeIds).toContain('potential');
  });

  it('builds launcher prefs without preserving side drills', () => {
    const prefs = practicePrefsForPracticalCorePath(
      {
        ...DEFAULT_PREFS,
        minimalPairSetId: 'godan-onbin',
        reviewLimitSource: 'repair',
        wordListIds: ['custom-list'],
      },
      {
        wordKeys: ['godan:\u8d70\u308b'],
        sourceCounts: {},
      },
    );

    expect(prefs).toMatchObject({
      reviewStyle: 'auto',
      sourceFormStrategy: 'auto',
      promptForm: 'dictionary',
      minimalPairSetId: '',
      minimalPairReturn: null,
      reviewLimit: 0,
      reviewLimitSource: '',
      practicePath: 'practical-core',
      wordListIds: [TODAY_DRILL_LIST_ID],
    });
  });
});
