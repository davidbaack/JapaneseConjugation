import { describe, expect, it } from 'vitest';
import { ALL_CARD_TYPES } from '../data/conjugationTypes.js';
import { buildFormStrengthRows } from '../utils/formStrength.js';
import { mergeWeaknessState, recordWeaknessAttempt } from '../utils/subcategoryWeakness.js';
import {
  buildSyncPayload,
  cardIdFor,
  defaultState,
  gradeCard,
  mergeSyncPayload,
} from '../utils/storage.js';
import { adoptSyncMetadata, stampSyncChanges } from '../utils/syncMetadata.js';

const TABERU = { dict: '食べる', reading: 'たべる', group: 'ichidan' };
const KAKU = { dict: '書く', reading: 'かく', group: 'godan' };
const TYPE = 'te-form';

function answer(state, correct, index, word = TABERU, typeId = TYPE) {
  const id = cardIdFor(word, typeId);
  return {
    ...state,
    cards: { ...state.cards, [id]: gradeCard(state.cards?.[id], correct, 1000 + index) },
    weakness: recordWeaknessAttempt(state.weakness, {
      word,
      typeId,
      correct,
      eventId: `attempt-${index}`,
      now: 1000 + index,
    }),
  };
}

function strength(state, typeId = TYPE) {
  return buildFormStrengthRows(state, [typeId])[0];
}

describe('saved exact-form strength', () => {
  it('starts new forms at neutral strength in stable taxonomy order', () => {
    const rows = buildFormStrengthRows({}, ['te-form', 'plain-past', 'te-form', 'invalid']);
    expect(rows.map((row) => row.typeId)).toEqual(
      ALL_CARD_TYPES.filter((type) => ['plain-past', 'te-form'].includes(type.id)).map(
        (type) => type.id,
      ),
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        score: 50,
        attempted: 0,
        correct: 0,
        incorrect: 0,
        statusLabel: 'New',
        latestAttempt: null,
      });
    }
  });

  it('moves on the first answers while labeling sparse evidence', () => {
    const first = answer({}, true, 1);
    const second = answer(first, false, 2);
    expect(strength(first).score).toBeGreaterThan(50);
    expect(strength(first).statusLabel).toBe('First attempt');
    expect(strength(second).score).toBeLessThan(strength(first).score);
    expect(strength(second)).toMatchObject({
      attempted: 2,
      correct: 1,
      incorrect: 1,
      statusLabel: 'Early estimate',
      latestAttempt: { id: 'attempt-2', at: 1002, correct: false },
    });
  });

  it.each([
    ['all correct', Array(45).fill(true)],
    ['all incorrect', Array(45).fill(false)],
    ['mixed', Array.from({ length: 45 }, (_, index) => index % 3 !== 0)],
  ])('keeps answer direction after a full %s history is truncated', (_, outcomes) => {
    let state = {};
    outcomes.forEach((correct, index) => {
      state = answer(state, correct, index, index % 2 ? TABERU : KAKU);
    });
    const before = strength(state).score;
    expect(strength(answer(state, true, 100)).score).toBeGreaterThan(before);
    expect(strength(answer(state, false, 100)).score).toBeLessThan(before);
  });

  it('responds visibly to new answers even after a large historical total', () => {
    const state = {
      cards: { [cardIdFor(TABERU, TYPE)]: { correct: 0, incorrect: 10000 } },
    };
    const before = strength(state).score;
    const after = strength(answer(state, true, 1)).score;
    expect(after - before).toBeGreaterThan(19);
  });

  it('attributes dictionary answers to their source without counting them twice', () => {
    const row = strength({
      cards: {
        [cardIdFor(TABERU, TYPE)]: { correct: 2, incorrect: 1 },
        [cardIdFor(TABERU, 'dictionary')]: {
          correct: 9,
          incorrect: 8,
          sourceType: TYPE,
          sourceTypeStats: {
            [TYPE]: { correct: 3, incorrect: 2 },
            'plain-past': { correct: 6, incorrect: 6 },
          },
        },
        [cardIdFor(KAKU, 'dictionary')]: {
          correct: 1,
          incorrect: 2,
          sourceType: TYPE,
        },
      },
    });
    expect(row).toMatchObject({ correct: 6, incorrect: 5, attempted: 11 });
  });

  it('keeps the legacy dictionary remainder when modern source counters are partial', () => {
    const state = {
      cards: {
        [cardIdFor(TABERU, 'dictionary')]: {
          correct: 101,
          incorrect: 5,
          sourceType: TYPE,
          sourceTypeStats: {
            [TYPE]: { correct: 1, incorrect: 0 },
            'plain-past': { correct: 0, incorrect: 1 },
          },
        },
      },
    };
    expect(strength(state)).toMatchObject({ correct: 101, incorrect: 4, attempted: 105 });
    expect(strength(state, 'plain-past')).toMatchObject({
      correct: 0,
      incorrect: 1,
      attempted: 1,
    });
    // Reading the projection must never materialize old evidence as new counters.
    expect(state.cards[cardIdFor(TABERU, 'dictionary')].sourceTypeStats[TYPE].correct).toBe(1);
  });

  it('preserves a shared dictionary baseline once across concurrent writer merges', () => {
    const cardId = cardIdFor(TABERU, 'dictionary');
    const base = adoptSyncMetadata(
      buildSyncPayload({
        state: {
          ...defaultState(),
          cards: {
            [cardId]: { ...gradeCard(null, true, 1000), correct: 100, sourceType: TYPE },
          },
        },
      }),
      'shared-device',
    );
    function readingAnswer(id, at) {
      const previous = base.state.cards[cardId];
      const after = {
        ...base,
        state: {
          ...base.state,
          cards: {
            ...base.state.cards,
            [cardId]: {
              ...gradeCard(previous, true, at),
              sourceType: previous.sourceType,
              lastAttemptId: id,
              sourceTypeStats: {
                [TYPE]: { correct: 1, incorrect: 0, lastAt: at, lastAttemptId: id },
              },
            },
          },
          weakness: recordWeaknessAttempt(base.state.weakness, {
            word: TABERU,
            typeId: TYPE,
            correct: true,
            eventId: id,
            now: at,
          }),
        },
      };
      return {
        ...after,
        syncMeta: stampSyncChanges(base.syncMeta, base, after, { writerId: id }),
      };
    }

    const left = readingAnswer('writer-left', 1001);
    const right = readingAnswer('writer-right', 1002);
    const merged = mergeSyncPayload(left, right);
    expect(merged.state.cards[cardId]).toMatchObject({
      correct: 102,
      sourceTypeStats: { [TYPE]: { correct: 2 } },
    });
    expect(strength(merged.state)).toMatchObject({ correct: 102, incorrect: 0, attempted: 102 });
    expect(strength(mergeSyncPayload(right, left).state)).toEqual(strength(merged.state));
    for (const replay of [left, right, merged]) {
      expect(strength(mergeSyncPayload(merged, replay).state)).toEqual(strength(merged.state));
    }
    expect(base.state.cards[cardId].sourceTypeStats).toBeUndefined();
  });

  it('uses lane totals only when canonical card evidence is absent', () => {
    const state = answer({}, false, 1);
    const fallback = strength({ weakness: state.weakness });
    expect(fallback).toMatchObject({ correct: 0, incorrect: 1, attempted: 1 });
    const canonical = strength({
      ...state,
      cards: { [cardIdFor(TABERU, TYPE)]: { correct: 7, incorrect: 2 } },
    });
    expect(canonical).toMatchObject({ correct: 7, incorrect: 2, attempted: 9 });
  });

  it('deduplicates retained answers and survives reload and merge order', () => {
    const left = answer({}, true, 1, TABERU);
    const right = answer({}, false, 2, KAKU);
    const cards = { ...left.cards, ...right.cards };
    const forward = {
      cards,
      weakness: mergeWeaknessState(left.weakness, right.weakness),
    };
    const backward = {
      cards,
      weakness: mergeWeaknessState(right.weakness, left.weakness),
    };
    expect(strength(forward)).toEqual(strength(backward));
    expect(strength(JSON.parse(JSON.stringify(forward)))).toEqual(strength(forward));
    const replay = {
      ...forward,
      weakness: mergeWeaknessState(forward.weakness, right.weakness),
    };
    expect(strength(replay)).toEqual(strength(forward));
    const lane = Object.values(replay.weakness.byLane)[0];
    lane.recent.push(...lane.recent);
    expect(strength(replay)).toEqual(strength(forward));
  });

  it('keeps a rare form stable when unrelated practice fills the global history', () => {
    const state = answer({}, false, 1);
    const before = strength(state);
    const unrelated = {
      ...state,
      practiceStats: {
        recent: Array.from({ length: 120 }, (_, index) => ({
          id: `other-${index}`,
          typeId: 'plain-past',
          correct: true,
          at: 10000 + index,
        })),
      },
    };
    expect(strength(unrelated)).toEqual(before);
  });
});
