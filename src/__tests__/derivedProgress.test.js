import { describe, expect, it } from 'vitest';
import { reconcileDerivedProgressState } from '../utils/derivedProgress.js';
import { mergeReadinessState } from '../utils/readiness.js';
import { cardIdFor, gradeCard } from '../utils/storage.js';
import { mergeWeaknessState, weaknessLaneForCard } from '../utils/subcategoryWeakness.js';

const KAKU = {
  dict: '書く',
  reading: 'かく',
  meaning: 'to write',
  group: 'godan',
};

function recentMiss(at = 1000) {
  return { correct: false, at, responseMs: 9000, wordKey: 'godan:書く' };
}

function weaknessRow(word, typeId, overrides = {}) {
  const lane = weaknessLaneForCard(word, typeId);
  return {
    ...lane,
    attempted: 1,
    correct: 0,
    incorrect: 1,
    totalResponseMs: 9000,
    lastAt: 1000,
    recent: [recentMiss()],
    ...overrides,
  };
}

describe('derived progress cloud merges', () => {
  it('keeps repeated weakness merges idempotent and deduplicates recent attempts', () => {
    const lane = weaknessRow(KAKU, 'plain-past');
    const weakness = { byLane: { [lane.key]: lane } };

    const once = mergeWeaknessState(weakness, weakness);
    const twice = mergeWeaknessState(once, weakness);

    expect(once.byLane[lane.key].attempted).toBe(1);
    expect(once.byLane[lane.key].recent).toHaveLength(1);
    expect(twice).toEqual(once);
  });

  it('keeps repeated readiness merges idempotent while preserving distinct dimensions', () => {
    const ruleId = cardIdFor(KAKU, 'plain-past');
    const local = {
      byRule: {
        [ruleId]: {
          production: {
            attempted: 2,
            correct: 1,
            totalResponseMs: 12000,
            lastAt: 1000,
          },
        },
      },
    };
    const cloud = {
      byRule: {
        [ruleId]: {
          recognition: {
            attempted: 1,
            correct: 1,
            totalResponseMs: 4000,
            lastAt: 2000,
          },
        },
      },
    };

    const once = mergeReadinessState(local, cloud);
    const twice = mergeReadinessState(once, cloud);

    expect(once.byRule[ruleId].production.attempted).toBe(2);
    expect(once.byRule[ruleId].recognition.attempted).toBe(1);
    expect(twice).toEqual(once);
  });
});

describe('derived progress repair', () => {
  it('rebuilds inflated weakness and readiness totals from card history', () => {
    const ruleId = cardIdFor(KAKU, 'plain-past');
    const lane = weaknessRow(KAKU, 'plain-past', {
      attempted: Number('11009957400750354400'),
      correct: Number('733971600500236300'),
      incorrect: Number('10275985800250118000'),
      totalResponseMs: Number('44039829603001420000000'),
      recent: [recentMiss(), recentMiss()],
    });
    const metric = {
      attempted: Number('11009957400750354400'),
      correct: Number('733971600500236300'),
      totalResponseMs: Number('44039829603001420000000'),
      correctResponseMs: Number('1467943201000472600000'),
      fastCorrect: 100,
      fastestMs: 1200,
      lastMs: 9000,
      lastAt: 1000,
    };
    const state = {
      cards: {
        [ruleId]: { correct: 3, incorrect: 2 },
      },
      weakness: { byLane: { [lane.key]: lane } },
      readiness: {
        byRule: {
          [ruleId]: { production: metric, speed: metric },
        },
      },
    };

    const repaired = reconcileDerivedProgressState(state);
    const repairedLane = repaired.state.weakness.byLane[lane.key];
    const repairedRule = repaired.state.readiness.byRule[ruleId];

    expect(repaired.repaired).toBe(true);
    expect(repairedLane).toMatchObject({ attempted: 5, correct: 3, incorrect: 2 });
    expect(repairedLane.recent).toHaveLength(1);
    expect(Number.isSafeInteger(repairedLane.totalResponseMs)).toBe(true);
    expect(repairedRule.production).toMatchObject({ attempted: 5, correct: 3 });
    expect(repairedRule.speed).toMatchObject({ attempted: 5, correct: 3 });
    expect(reconcileDerivedProgressState(repaired.state)).toEqual({
      state: repaired.state,
      repaired: false,
    });
  });

  it('repairs reverse-practice rows from persisted source-type stats', () => {
    const customWord = {
      dict: 'test:書く',
      reading: 'てすとかく',
      meaning: 'custom test word',
      group: 'godan',
    };
    const dictionaryId = cardIdFor(customWord, 'dictionary');
    const teFormId = cardIdFor(customWord, 'te-form');
    const lane = weaknessRow(customWord, 'te-form', {
      attempted: Number('99999999999999990000'),
      correct: Number('33333333333333330000'),
      incorrect: Number('66666666666666660000'),
    });
    const state = {
      cards: {
        [dictionaryId]: {
          correct: 2,
          incorrect: 1,
          sourceTypeStats: {
            'te-form': { correct: 2, incorrect: 1, lastAt: 2000 },
          },
        },
      },
      weakness: { byLane: { [lane.key]: lane } },
      readiness: {
        byRule: {
          [teFormId]: {
            recognition: {
              attempted: Number('99999999999999990000'),
              correct: Number('33333333333333330000'),
              totalResponseMs: Number('99999999999999990000'),
              lastAt: 2000,
            },
          },
        },
      },
    };

    const { state: repaired } = reconcileDerivedProgressState(state);

    expect(repaired.weakness.byLane[lane.key]).toMatchObject({
      attempted: 3,
      correct: 2,
      incorrect: 1,
    });
    expect(repaired.readiness.byRule[teFormId].recognition).toMatchObject({
      attempted: 3,
      correct: 2,
    });
  });

  it('removes diagnostic rows without supporting card history', () => {
    const ruleId = cardIdFor(KAKU, 'plain-past');
    const lane = weaknessRow(KAKU, 'plain-past', {
      attempted: Number.MAX_SAFE_INTEGER * 2,
      correct: 0,
      incorrect: Number.MAX_SAFE_INTEGER * 2,
    });
    const repaired = reconcileDerivedProgressState({
      cards: {},
      weakness: { byLane: { [lane.key]: lane } },
      readiness: {
        byRule: {
          [ruleId]: {
            production: {
              attempted: Number.MAX_SAFE_INTEGER * 2,
              correct: 0,
              lastAt: 1000,
            },
          },
        },
      },
    });

    expect(repaired.state.weakness).toEqual({ byLane: {} });
    expect(repaired.state.readiness).toEqual({ byRule: {} });
  });

  it('preserves accumulated reverse source-type stats while grading', () => {
    const existing = {
      ease: 2.5,
      interval: 1,
      reps: 1,
      nextReview: 1000,
      correct: 1,
      incorrect: 0,
      lastSeen: 1000,
      sourceTypeStats: {
        'plain-past': { correct: 1, incorrect: 0, lastAt: 1000 },
      },
    };

    expect(gradeCard(existing, true, 2000).sourceTypeStats).toEqual(existing.sourceTypeStats);
  });
});
