import { describe, expect, it } from 'vitest';
import {
  aggregateDiagnosedMistakes,
  buildRepairDrillPlan,
  bumpSessionMistakePattern,
  diagnoseMistake,
  rankSessionMistakePatterns,
} from '../utils/mistakeDiagnosis.js';
import { recordMistake } from '../utils/storage.js';

const kaku = {
  dict: '\u66f8\u304f',
  reading: '\u304b\u304f',
  meaning: 'to write',
  group: 'godan',
};

const oyogu = {
  dict: '\u6cf3\u3050',
  reading: '\u304a\u3088\u3050',
  meaning: 'to swim',
  group: 'godan',
};

const matsu = {
  dict: '\u5f85\u3064',
  reading: '\u307e\u3064',
  meaning: 'to wait',
  group: 'godan',
};

const taberu = {
  dict: '\u98df\u3079\u308b',
  reading: '\u305f\u3079\u308b',
  meaning: 'to eat',
  group: 'ichidan',
};

describe('diagnoseMistake', () => {
  it('classifies a godan ku te-form sound-change mix-up', () => {
    const result = diagnoseMistake({
      item: kaku,
      type: 'te-form',
      userAnswer: '\u304b\u3063\u3066',
      expected: '\u304b\u3044\u3066',
    });

    expect(result).toMatchObject({
      category: 'godan-sound-change',
      patternId: 'godan-onbin-ku-gu',
      label: 'Godan ku sound changes',
      repairTypeIds: ['te-form', 'plain-past'],
    });
    expect(result.feedback).toContain('u/tsu/ru');
  });

  it('classifies a plain answer when polite negative was requested', () => {
    const result = diagnoseMistake({
      item: taberu,
      type: 'polite-negative',
      userAnswer: '\u305f\u3079\u306a\u3044',
      expected: '\u305f\u3079\u307e\u305b\u3093',
    });

    expect(result).toMatchObject({
      category: 'politeness-mismatch',
      patternId: 'politeness-mismatch:polite-negative',
      guessedType: 'plain-negative',
    });
  });

  it('does not invent a category for unrelated wrong text', () => {
    const result = diagnoseMistake({
      item: taberu,
      type: 'plain-past',
      userAnswer: '\u306d\u3053',
      expected: '\u305f\u3079\u305f',
    });

    expect(result).toBeNull();
  });
});

describe('mistake pattern aggregation and repair drills', () => {
  it('stores diagnosis on missed cards and aggregates pattern counts', () => {
    const mistakes = recordMistake(
      [],
      kaku,
      'te-form',
      null,
      '\u304b\u3063\u3066',
      '\u304b\u3044\u3066',
    );

    expect(mistakes[0].diagnosis.patternId).toBe('godan-onbin-ku-gu');

    const rows = aggregateDiagnosedMistakes(mistakes);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      patternId: 'godan-onbin-ku-gu',
      count: 1,
      unresolved: 1,
    });
  });

  it('tracks diagnosed patterns inside the current session', () => {
    const found = diagnoseMistake({
      item: taberu,
      type: 'polite-negative',
      userAnswer: '\u305f\u3079\u306a\u3044',
      expected: '\u305f\u3079\u307e\u305b\u3093',
    });

    const session = bumpSessionMistakePattern({ reviewed: 1, correct: 0 }, found);
    const ranked = rankSessionMistakePatterns(session.mistakePatterns);

    expect(ranked[0]).toMatchObject({
      patternId: 'politeness-mismatch:polite-negative',
      count: 1,
    });
  });

  it('builds a scoped repair drill from the highest-value pattern', () => {
    const mistakes = recordMistake(
      [],
      kaku,
      'te-form',
      null,
      '\u304b\u3063\u3066',
      '\u304b\u3044\u3066',
    );
    const [pattern] = aggregateDiagnosedMistakes(mistakes);
    const plan = buildRepairDrillPlan(pattern, [kaku, oyogu, matsu, taberu]);

    expect(plan.typeIds).toEqual(['te-form', 'plain-past']);
    expect(plan.wordKeys).toContain('godan:\u66f8\u304f');
    expect(plan.wordKeys).toContain('godan:\u6cf3\u3050');
    expect(plan.wordKeys).not.toContain('godan:\u5f85\u3064');
    expect(plan.reviewLimit).toBe(10);
  });
});
