import { describe, expect, it } from 'vitest';
import {
  aggregateDiagnosedMistakes,
  bumpSessionMistakePattern,
  diagnoseMistake,
  labRouteForMistakePattern,
  rankSessionMistakePatterns,
} from '../utils/mistakeDiagnosis.js';
import { recordMistake } from '../utils/storage.js';
import { conjugateItem } from '../utils/conjugator.js';

const kaku = {
  dict: '\u66f8\u304f',
  reading: '\u304b\u304f',
  meaning: 'to write',
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

  it('routes te/ta ending misses to Ending Lab', () => {
    const result = diagnoseMistake({
      item: kaku,
      type: 'te-form',
      userAnswer: '\u304b\u3063\u3066',
      expected: '\u304b\u3044\u3066',
    });

    expect(labRouteForMistakePattern(result)).toMatchObject({
      tool: 'endings',
      toolLabel: 'Ending Lab',
      triggerLabel: 'Te/ta ending miss',
    });
  });

  it('routes verb group mistakes to Groups', () => {
    const result = diagnoseMistake({
      item: taberu,
      type: 'plain-past',
      userAnswer: '\u305f\u3079\u3063\u305f',
      expected: '\u305f\u3079\u305f',
    });

    expect(result).toMatchObject({
      category: 'verb-group-confusion',
      patternId: 'verb-group:ichidan:plain-past',
    });
    expect(labRouteForMistakePattern(result)).toMatchObject({
      tool: 'classify',
      toolLabel: 'Groups',
      triggerLabel: 'Wrong verb group',
    });
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
    expect(labRouteForMistakePattern(result)).toBeNull();
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

describe('mistake pattern aggregation and Lab routing', () => {
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

  it('aggregates a verb-group-confusion category the dashboard routes to Groups', () => {
    // Conjugating an ichidan verb with godan rules is the group-confusion miss
    // the Reviews→Groups routing keys on (pattern.category === 'verb-group-confusion').
    const expected = conjugateItem(taberu, 'plain-past');
    const asGodan = conjugateItem({ ...taberu, group: 'godan' }, 'plain-past');
    const mistakes = recordMistake([], taberu, 'plain-past', null, asGodan, expected);

    const rows = aggregateDiagnosedMistakes(mistakes);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: 'verb-group-confusion',
      patternId: 'verb-group:ichidan:plain-past',
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
});
