import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../data/defaults.js';
import {
  TODAY_DRILL_LIST_ID,
  buildTodayDrillPlan,
  practicePrefsForTodayDrill,
  upsertTodayDrillList,
} from '../utils/todayDrill.js';
import { cardIdFor, defaultState } from '../utils/storage.js';

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
const KAKU = { dict: '\u66f8\u304f', reading: '\u304b\u304f', meaning: 'to write', group: 'godan' };
const TAKAI = {
  dict: '\u9ad8\u3044',
  reading: '\u305f\u304b\u3044',
  meaning: 'expensive',
  group: 'i-adjective',
};

describe('today drill planner', () => {
  it('combines due cards, weak forms, and minimal-pair recommendations', () => {
    const state = {
      ...defaultState(),
      cards: {
        [cardIdFor(HASHIRU, 'plain-past')]: {
          reps: 1,
          interval: 1,
          ease: 2.3,
          nextReview: 1,
          correct: 1,
          incorrect: 2,
        },
      },
      mistakes: [
        {
          key: 'godan|\u8d70\u308b|plain-past|dictionary',
          dict: '\u8d70\u308b',
          reading: '\u306f\u3057\u308b',
          meaning: 'to run',
          group: 'godan',
          type: 'plain-past',
          count: 2,
          resolved: false,
        },
      ],
    };

    const plan = buildTodayDrillPlan(state, [TABERU, HASHIRU, KAKU, TAKAI], DEFAULT_PREFS, [], {
      now: 10,
    });

    expect(plan.available).toBe(true);
    expect(plan.reviewLimit).toBe(DEFAULT_PREFS.dailyGoal);
    expect(plan.typeIds).toContain('plain-past');
    expect(plan.wordKeys).toContain('godan:\u8d70\u308b');
    expect(plan.sourceCounts.due).toBeGreaterThan(0);
    expect(plan.sourceCounts.weak).toBeGreaterThan(0);
    expect(plan.sourceCounts.minimalPairs).toBeGreaterThan(0);
    expect(plan.minimalPairSetIds).toContain('ichidan-godan-ru');
  });

  it('builds launcher prefs and a reusable Today word list', () => {
    const plan = {
      reviewLimit: 0,
      reviewLimitSource: '',
      wordKeys: ['godan:\u8d70\u308b'],
      sourceCounts: { weak: 1 },
    };

    const prefs = practicePrefsForTodayDrill(
      {
        ...DEFAULT_PREFS,
        drillMode: 'transformation',
        promptForm: 'dictionary',
        reviewLimit: 0,
        minimalPairSetId: 'godan-onbin',
      },
      plan,
    );
    const lists = upsertTodayDrillList([], plan);

    expect(prefs).toMatchObject({
      reviewStyle: 'auto',
      sourceFormStrategy: 'auto',
      promptForm: 'dictionary',
      minimalPairSetId: '',
      reviewLimit: 0,
      reviewLimitSource: '',
      practicePath: '',
      wordListIds: [TODAY_DRILL_LIST_ID],
    });
    expect(prefs.drillMode).toBeUndefined();
    expect(
      practicePrefsForTodayDrill({ ...DEFAULT_PREFS, drillMode: 'sentence' }, plan).drillMode,
    ).toBeUndefined();
    expect(lists).toEqual([
      {
        id: TODAY_DRILL_LIST_ID,
        name: "Today's Drill",
        wordKeys: ['godan:\u8d70\u308b'],
      },
    ]);
  });
});
