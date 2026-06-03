import { describe, it, expect } from 'vitest';
import { DEFAULT_PREFS } from '../data/defaults.js';
import {
  gradeCard,
  bumpDaily,
  recordMistake,
  markMistakeResolved,
  localDateKey,
  mergeState,
  mergeCloudState,
  getCardLevel,
  normalizeReferenceState,
  buildFocusCard,
  cardIdFor,
  dailyNewCardLimit,
  defaultState,
  bonusNewCardLimit,
  selectNext,
  SRS_SCHEMA_VERSION,
  gradeTransformationStats,
  mergeTransformationStats,
  DAY,
} from '../utils/storage.js';
import { conjugateItem } from '../utils/conjugator.js';
import { filterWordsForStudyScope } from '../utils/vocabularyProgression.js';
import {
  ALL_CARD_TYPES,
  INTRODUCED_DEFAULT_TYPE_IDS,
  LEGACY_BROAD_DEFAULT_TYPE_IDS,
  TEXTBOOK_CORE_TYPE_IDS,
} from '../data/conjugationTypes.js';
import {
  excludeFormFamilyFromReviewState,
  excludeWordFromReviewState,
  includeFormFamilyInReviewState,
  includeWordInReviewState,
  reviewTypeIdsForState,
} from '../utils/reviewScope.js';

// Mock localStorage for storage tests (mergeState etc. are pure but defaultState references CONJ_TYPES)
// No localStorage calls in the functions we're testing — they're all pure.

describe('localDateKey', () => {
  it('returns a YYYY-MM-DD string', () => {
    const key = localDateKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('offsets by days correctly', () => {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + DAY);
    const expected = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    expect(localDateKey(1)).toBe(expected);
  });
});

describe('gradeCard', () => {
  it('starts fresh card at reps=1, interval=1 on correct', () => {
    const card = gradeCard(null, true);
    expect(card.reps).toBe(1);
    expect(card.interval).toBe(1);
    expect(card.correct).toBe(1);
    expect(card.incorrect).toBe(0);
    expect(card.nextReview).toBeGreaterThan(Date.now());
  });

  it('increments interval on second correct answer', () => {
    let card = gradeCard(null, true); // reps=1 interval=1
    card = gradeCard(card, true); // reps=2 interval=3
    expect(card.reps).toBe(2);
    expect(card.interval).toBe(3);
  });

  it('uses ease factor for third+ correct answer', () => {
    let card = gradeCard(null, true); // reps=1 interval=1
    card = gradeCard(card, true); // reps=2 interval=3
    card = gradeCard(card, true); // reps=3 interval=ceil(3 * 2.5) = 8
    expect(card.reps).toBe(3);
    expect(card.interval).toBe(Math.ceil(3 * 2.5));
  });

  it('resets reps to 0 and sets short interval on incorrect', () => {
    let card = gradeCard(null, true);
    card = gradeCard(card, true);
    card = gradeCard(card, false);
    expect(card.reps).toBe(0);
    expect(card.interval).toBe(0);
    expect(card.incorrect).toBe(1);
    // nextReview should be ~1 minute away
    expect(card.nextReview).toBeLessThan(Date.now() + 120000);
  });

  it('reduces ease on incorrect but not below 1.3', () => {
    let card = {
      ease: 1.4,
      interval: 5,
      reps: 2,
      nextReview: 0,
      correct: 2,
      incorrect: 0,
      lastSeen: 0,
    };
    card = gradeCard(card, false);
    // Math.max(1.3, 1.4 - 0.2) = Math.max(1.3, 1.2) = 1.3
    expect(card.ease).toBe(1.3);
  });

  it('tracks correct and incorrect counts across rounds', () => {
    let card = gradeCard(null, true);
    card = gradeCard(card, true);
    card = gradeCard(card, false);
    expect(card.correct).toBe(2);
    expect(card.incorrect).toBe(1);
  });
});

describe('getCardLevel', () => {
  it('returns 0 for null or reps=0 card', () => {
    expect(getCardLevel(null)).toBe(0);
    expect(getCardLevel({ reps: 0, interval: 5 })).toBe(0);
  });

  it('returns 1 for interval < 4', () => {
    expect(getCardLevel({ reps: 1, interval: 1 })).toBe(1);
    expect(getCardLevel({ reps: 1, interval: 3 })).toBe(1);
  });

  it('returns 2 for interval 4-13', () => {
    expect(getCardLevel({ reps: 2, interval: 4 })).toBe(2);
    expect(getCardLevel({ reps: 2, interval: 13 })).toBe(2);
  });

  it('returns 3 for interval 14-59', () => {
    expect(getCardLevel({ reps: 3, interval: 14 })).toBe(3);
    expect(getCardLevel({ reps: 3, interval: 59 })).toBe(3);
  });

  it('returns 4 for interval 60-179', () => {
    expect(getCardLevel({ reps: 4, interval: 60 })).toBe(4);
    expect(getCardLevel({ reps: 4, interval: 179 })).toBe(4);
  });

  it('returns 5 for interval >= 180', () => {
    expect(getCardLevel({ reps: 5, interval: 180 })).toBe(5);
    expect(getCardLevel({ reps: 5, interval: 365 })).toBe(5);
  });
});

describe('bumpDaily', () => {
  it('initialises a fresh daily state on first call', () => {
    const today = localDateKey();
    const result = bumpDaily(null, true, 10);
    expect(result.date).toBe(today);
    expect(result.count).toBe(1);
    expect(result.goalHit).toBe(false);
  });

  it('marks goalHit when count reaches dailyGoal', () => {
    const today = localDateKey();
    let d = {
      date: today,
      count: 9,
      goalHit: false,
      goalStreak: 0,
      bestGoalStreak: 0,
      currentAnswerStreak: 0,
      bestAnswerStreak: 0,
    };
    d = bumpDaily(d, true, 10);
    expect(d.goalHit).toBe(true);
    expect(d.goalStreak).toBe(1);
  });

  it('increments answer streak on correct', () => {
    const today = localDateKey();
    let d = {
      date: today,
      count: 0,
      goalHit: false,
      goalStreak: 0,
      bestGoalStreak: 0,
      currentAnswerStreak: 2,
      bestAnswerStreak: 2,
    };
    d = bumpDaily(d, true, 10);
    expect(d.currentAnswerStreak).toBe(3);
    expect(d.bestAnswerStreak).toBe(3);
  });

  it('resets answer streak on incorrect', () => {
    const today = localDateKey();
    let d = {
      date: today,
      count: 5,
      goalHit: false,
      goalStreak: 0,
      bestGoalStreak: 0,
      currentAnswerStreak: 5,
      bestAnswerStreak: 5,
    };
    d = bumpDaily(d, false, 10);
    expect(d.currentAnswerStreak).toBe(0);
    expect(d.bestAnswerStreak).toBe(5); // best preserved
  });

  it('resets count when date changes', () => {
    const yesterday = localDateKey(-1);
    let d = {
      date: yesterday,
      count: 99,
      goalHit: true,
      goalStreak: 3,
      bestGoalStreak: 3,
      currentAnswerStreak: 10,
      bestAnswerStreak: 10,
    };
    d = bumpDaily(d, true, 10);
    expect(d.date).toBe(localDateKey());
    expect(d.count).toBe(1);
    expect(d.goalHit).toBe(false);
    expect(d.goalStreak).toBe(3); // kept because yesterday's goal was hit
  });
});

describe('recordMistake', () => {
  const item = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };

  it('adds a new mistake entry', () => {
    const result = recordMistake([], item, 'plain-past', null, 'たべた', 'たべた');
    expect(result).toHaveLength(1);
    expect(result[0].dict).toBe('食べる');
    expect(result[0].type).toBe('plain-past');
    expect(result[0].count).toBe(1);
  });

  it('increments count for duplicate mistakes', () => {
    let mistakes = recordMistake([], item, 'plain-past', null, 'wrong', 'たべた');
    mistakes = recordMistake(mistakes, item, 'plain-past', null, 'wrong2', 'たべた');
    expect(mistakes).toHaveLength(1);
    expect(mistakes[0].count).toBe(2);
  });

  it('keeps separate entries for different types', () => {
    let mistakes = recordMistake([], item, 'plain-past', null, 'x', 'たべた');
    mistakes = recordMistake(mistakes, item, 'te-form', null, 'y', 'たべて');
    expect(mistakes).toHaveLength(2);
  });

  it('tags transformation mistakes as a distinct practice dimension', () => {
    const result = recordMistake(
      [],
      item,
      'polite-present',
      'plain-past-negative',
      'たべます',
      'たべます',
      {
        dimension: 'transformation',
        sourceType: 'plain-past-negative',
        targetType: 'polite-present',
        direction: 'forward',
      },
    );
    expect(result[0]).toMatchObject({
      dimension: 'transformation',
      sourceType: 'plain-past-negative',
      targetType: 'polite-present',
      direction: 'forward',
    });
  });

  it('caps at 50 mistakes', () => {
    let mistakes = [];
    for (let i = 0; i < 55; i++) {
      const fakeItem = { dict: `verb${i}`, reading: `v${i}`, meaning: 'x', group: 'godan' };
      mistakes = recordMistake(mistakes, fakeItem, 'plain-past', null, 'x', 'y');
    }
    expect(mistakes.length).toBe(50);
  });
});

describe('transformation stats', () => {
  it('tracks attempts separately by source, target, pair, and direction', () => {
    const stats = gradeTransformationStats(null, {
      correct: true,
      sourceType: 'plain-past-negative',
      targetType: 'polite-present',
      direction: 'forward',
    });

    expect(stats.attempted).toBe(1);
    expect(stats.correct).toBe(1);
    expect(stats.bySource['plain-past-negative'].attempted).toBe(1);
    expect(stats.byTarget['polite-present'].correct).toBe(1);
    expect(stats.byPair['plain-past-negative->polite-present'].attempted).toBe(1);
    expect(stats.byDirection.forward.correct).toBe(1);
  });

  it('merges transformation stats without dropping cloud-only buckets', () => {
    const local = gradeTransformationStats(null, {
      correct: true,
      sourceType: 'te-form',
      targetType: 'plain-negative',
      direction: 'forward',
    });
    const cloud = gradeTransformationStats(null, {
      correct: false,
      sourceType: 'polite-present',
      targetType: 'dictionary',
      direction: 'reverse',
    });

    const merged = mergeTransformationStats(local, cloud);

    expect(merged.attempted).toBe(2);
    expect(merged.correct).toBe(1);
    expect(merged.byPair['te-form->plain-negative'].attempted).toBe(1);
    expect(merged.byPair['polite-present->dictionary'].attempted).toBe(1);
    expect(merged.byDirection.forward.correct).toBe(1);
    expect(merged.byDirection.reverse.correct).toBe(0);
  });
});

describe('markMistakeResolved', () => {
  it('marks a specific mistake as resolved', () => {
    const item = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
    let mistakes = recordMistake([], item, 'plain-past', null, 'x', 'たべた');
    const key = mistakes[0].key;
    mistakes = markMistakeResolved(mistakes, key);
    expect(mistakes[0].resolved).toBe(true);
    expect(mistakes[0].resolvedAt).toBeDefined();
  });

  it('does not affect other mistakes', () => {
    const item = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
    let mistakes = recordMistake([], item, 'plain-past', null, 'x', 'たべた');
    mistakes = recordMistake(mistakes, item, 'te-form', null, 'y', 'たべて');
    const keyToResolve = mistakes[0].key;
    mistakes = markMistakeResolved(mistakes, keyToResolve);
    expect(mistakes[0].resolved).toBe(true);
    expect(mistakes[1].resolved).toBe(false);
  });
});

describe('normalizeReferenceState', () => {
  it('returns empty arrays for empty input', () => {
    const result = normalizeReferenceState({});
    expect(result.recentSearches).toEqual([]);
    expect(result.history).toEqual([]);
  });

  it('trims and filters blank searches', () => {
    const result = normalizeReferenceState({ recentSearches: ['  food  ', '', '  ', 'eat'] });
    expect(result.recentSearches).toEqual(['food', 'eat']);
  });

  it('filters invalid history entries', () => {
    const result = normalizeReferenceState({
      history: [
        { dict: '食べる', reading: 'たべる', group: 'ichidan' },
        { dict: null, reading: 'x', group: 'godan' }, // invalid: no dict
        null,
      ],
    });
    expect(result.history).toHaveLength(1);
  });

  it('preserves selected reference context', () => {
    const result = normalizeReferenceState({
      selected: { dict: 'kaku', reading: 'kaku', meaning: 'to write', group: 'godan' },
    });
    expect(result.selected).toMatchObject({ dict: 'kaku', group: 'godan' });
  });

  it('deduplicates weak reference rule pins', () => {
    const result = normalizeReferenceState({
      weakRules: [
        { key: 'godan|te-form', group: 'godan', typeId: 'te-form', label: 'Godan te-form' },
        { key: 'godan|te-form', group: 'godan', typeId: 'te-form', label: 'Duplicate' },
        { key: '', group: 'godan', typeId: 'plain-past' },
      ],
    });
    expect(result.weakRules).toHaveLength(1);
    expect(result.weakRules[0]).toMatchObject({ key: 'godan|te-form', typeId: 'te-form' });
  });
});

describe('mergeState', () => {
  it('returns base defaults when called with null', () => {
    const state = mergeState(null, null);
    expect(state).toHaveProperty('cards');
    expect(state).toHaveProperty('enabledTypes');
    expect(state).toHaveProperty('daily');
    expect(state).toHaveProperty('mistakes');
    expect(Array.isArray(state.enabledTypes)).toBe(true);
    expect(state.enabledTypes.length).toBeGreaterThan(0);
  });

  it('starts new learners on the textbook core conjugation scope', () => {
    const state = defaultState();
    expect(state.enabledTypes).toEqual(TEXTBOOK_CORE_TYPE_IDS);
    expect(state.enabledTypes).not.toContain('request-kudasai');
    expect(state.enabledTypes).not.toContain('permission');
    expect(state.enabledTypes).not.toContain('obligation');
    expect(state.enabledTypes).toContain('passive');
    expect(state.enabledTypes).toContain('causative');
    expect(state.enabledTypes).toContain('command-nasai');
    expect(state.enabledTypes).not.toContain('passive-polite-past-negative');
    expect(state.enabledTypes).not.toContain('short-causative');
    expect(state.enabledTypes).not.toContain('short-causative-passive-polite-past-negative');
  });

  it('migrates the old broad default scope to textbook core', () => {
    const state = mergeState({ enabledTypes: LEGACY_BROAD_DEFAULT_TYPE_IDS }, null);
    expect(state.enabledTypes).toEqual(TEXTBOOK_CORE_TYPE_IDS);
  });

  it('migrates pre-introduced broad default scopes to textbook core', () => {
    const preIntroducedIds = LEGACY_BROAD_DEFAULT_TYPE_IDS.filter(
      (id) => !INTRODUCED_DEFAULT_TYPE_IDS.includes(id),
    );
    const state = mergeState({ enabledTypes: preIntroducedIds }, null);
    expect(state.enabledTypes).toEqual(TEXTBOOK_CORE_TYPE_IDS);
  });

  it('preserves an explicit all-forms scope', () => {
    const allTypeIds = ALL_CARD_TYPES.map((t) => t.id);
    const state = mergeState({ schemaVersion: SRS_SCHEMA_VERSION, enabledTypes: allTypeIds }, null);
    expect(state.enabledTypes).toEqual(allTypeIds);
  });

  it('preserves saved cards from the current SRS schema', () => {
    const word = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
    const cardId = cardIdFor(word, 'plain-past');
    const saved = {
      schemaVersion: SRS_SCHEMA_VERSION,
      cards: {
        [cardId]: {
          reps: 3,
          interval: 8,
          ease: 2.5,
          nextReview: 9999999999999,
          correct: 3,
          incorrect: 0,
          lastSeen: 1,
        },
      },
    };
    const state = mergeState(saved, null);
    expect(state.cards[cardId].reps).toBe(3);
  });

  it('resets legacy rule-keyed cards during the word-form migration', () => {
    const state = mergeState(
      {
        cards: {
          'ichidan|plain-past': {
            reps: 3,
            interval: 8,
            ease: 2.5,
            nextReview: 9999999999999,
            correct: 3,
            incorrect: 0,
            lastSeen: 1,
          },
        },
      },
      null,
    );
    expect(state.cards).toEqual({});
  });

  it('uses sessionOverride for session', () => {
    const override = { reviewed: 5, correct: 3, skipped: 1 };
    const state = mergeState(null, override);
    expect(state.session).toEqual(override);
  });

  it('backfills adj types for old saves without them', () => {
    const saved = { enabledTypes: ['plain-past', 'te-form'] }; // no adj- types
    const state = mergeState(saved, null);
    expect(state.enabledTypes.some((id) => id.startsWith('adj-'))).toBe(true);
  });

  it('backfills readiness for old saves', () => {
    const state = mergeState({ cards: {} }, null);
    expect(state.readiness).toEqual({ byRule: {} });
  });
});

describe('mergeCloudState', () => {
  it('does not revive the legacy broad default during cloud merges', () => {
    const merged = mergeCloudState(
      { cards: {}, verbStats: {}, mistakes: [], enabledTypes: TEXTBOOK_CORE_TYPE_IDS },
      { cards: {}, verbStats: {}, mistakes: [], enabledTypes: LEGACY_BROAD_DEFAULT_TYPE_IDS },
    );
    expect(merged.enabledTypes).toEqual(TEXTBOOK_CORE_TYPE_IDS);
  });

  it('preserves explicit all-forms cloud scopes', () => {
    const allTypeIds = ALL_CARD_TYPES.map((t) => t.id);
    const merged = mergeCloudState(
      {
        schemaVersion: SRS_SCHEMA_VERSION,
        cards: {},
        verbStats: {},
        mistakes: [],
        enabledTypes: TEXTBOOK_CORE_TYPE_IDS,
      },
      {
        schemaVersion: SRS_SCHEMA_VERSION,
        cards: {},
        verbStats: {},
        mistakes: [],
        enabledTypes: allTypeIds,
      },
    );
    expect(new Set(merged.enabledTypes)).toEqual(new Set(allTypeIds));
    expect(merged.enabledTypes).toHaveLength(allTypeIds.length);
  });

  it('merges readiness dimensions from both devices', () => {
    const merged = mergeCloudState(
      {
        schemaVersion: SRS_SCHEMA_VERSION,
        cards: {},
        verbStats: {},
        mistakes: [],
        enabledTypes: ['plain-past'],
        readiness: {
          byRule: {
            'ichidan|plain-past': {
              production: { attempted: 1, correct: 1, totalResponseMs: 5000 },
            },
          },
        },
      },
      {
        schemaVersion: SRS_SCHEMA_VERSION,
        cards: {},
        verbStats: {},
        mistakes: [],
        enabledTypes: ['plain-past'],
        readiness: {
          byRule: {
            'ichidan|plain-past': {
              recognition: { attempted: 2, correct: 1, totalResponseMs: 12000 },
            },
          },
        },
      },
    );

    expect(merged.readiness.byRule['ichidan|plain-past'].production.attempted).toBe(1);
    expect(merged.readiness.byRule['ichidan|plain-past'].recognition.attempted).toBe(2);
  });

  it('merges Lab-only Rush stats without creating SRS history', () => {
    const merged = mergeCloudState(
      {
        schemaVersion: SRS_SCHEMA_VERSION,
        cards: {},
        verbStats: {},
        mistakes: [],
        enabledTypes: ['plain-past'],
        game: {
          played: 1,
          bestScore: 400,
          bestCombo: 4,
          byType: {
            'plain-past': { attempted: 3, correct: 2, incorrect: 1, lastAt: 200 },
          },
          byWord: {
            'ichidan:\u98df\u3079\u308b': {
              dict: '\u98df\u3079\u308b',
              reading: '\u305f\u3079\u308b',
              meaning: 'to eat',
              group: 'ichidan',
              attempted: 3,
              correct: 2,
              incorrect: 1,
              lastAt: 200,
            },
          },
        },
      },
      {
        schemaVersion: SRS_SCHEMA_VERSION,
        cards: {},
        verbStats: {},
        mistakes: [],
        enabledTypes: ['plain-past'],
        game: {
          played: 2,
          bestScore: 300,
          bestCombo: 5,
          byType: {
            'te-form': { attempted: 2, correct: 0, incorrect: 2, lastAt: 300 },
          },
          byWord: {
            'godan:\u66f8\u304f': {
              dict: '\u66f8\u304f',
              reading: '\u304b\u304f',
              meaning: 'to write',
              group: 'godan',
              attempted: 2,
              correct: 0,
              incorrect: 2,
              lastAt: 300,
            },
          },
        },
      },
    );

    expect(merged.cards).toEqual({});
    expect(merged.verbStats).toEqual({});
    expect(merged.game.played).toBe(2);
    expect(merged.game.bestScore).toBe(400);
    expect(merged.game.bestCombo).toBe(5);
    expect(merged.game.byType['plain-past']).toMatchObject({ attempted: 3, incorrect: 1 });
    expect(merged.game.byType['te-form']).toMatchObject({ attempted: 2, incorrect: 2 });
    expect(merged.game.byWord['ichidan:\u98df\u3079\u308b'].dict).toBe('\u98df\u3079\u308b');
    expect(merged.game.byWord['godan:\u66f8\u304f'].dict).toBe('\u66f8\u304f');
  });
});

describe('buildFocusCard', () => {
  const state = defaultState();

  it('gives built-in and custom duplicate words the same SRS card id', () => {
    const builtIn = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
    const custom = { ...builtIn, meaning: 'custom gloss' };
    expect(cardIdFor(custom, 'plain-past')).toBe(cardIdFor(builtIn, 'plain-past'));
  });

  it('builds a card matching the word group and requested form', () => {
    const word = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
    const card = buildFocusCard(state, word, 'plain-past');
    expect(card).toMatchObject({
      id: cardIdFor(word, 'plain-past'),
      verb: word,
      type: 'plain-past',
    });
  });

  it('uses the shared word-form key even when an exception rule supplies the answer', () => {
    const iku = { dict: '行く', reading: 'いく', meaning: 'to go', group: 'godan' };
    const card = buildFocusCard(state, iku, 'plain-past');
    expect(card.id).toBe(cardIdFor(iku, 'plain-past'));
  });

  it('uses the same word-form key shape for non-exception forms', () => {
    const iku = { dict: '行く', reading: 'いく', meaning: 'to go', group: 'godan' };
    const card = buildFocusCard(state, iku, 'polite-present');
    expect(card.id).toBe(cardIdFor(iku, 'polite-present'));
  });

  it('returns null when no rule covers the word/form', () => {
    const word = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
    expect(buildFocusCard(state, word, 'adj-plain-past')).toBeNull();
    expect(buildFocusCard(state, null, 'plain-past')).toBeNull();
  });
});

describe('selectNext never serves an unconjugatable (blank) card', () => {
  // short-causative-passive is empty for ichidan/す-godan/する verbs.
  const ICHIDAN = [{ dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' }];
  const GODAN = [{ dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' }];
  const enabled = ['short-causative-passive'];
  const freshState = () => ({ enabledTypes: enabled, cards: {}, verbStats: {}, session: {} });

  for (const skipDuplicateForms of [true, false]) {
    it(`returns no card for an ichidan verb when only the empty form is enabled (skipDuplicateForms=${skipDuplicateForms})`, () => {
      const card = selectNext(freshState(), ICHIDAN, enabled, null, { skipDuplicateForms });
      expect(card).toBeNull();
    });
  }

  it('still serves a valid card for a godan verb with the same form (skipDuplicateForms=false)', () => {
    const card = selectNext(freshState(), GODAN, enabled, null, { skipDuplicateForms: false });
    expect(card).not.toBeNull();
    expect(conjugateItem(card.verb, card.type)).toBe('かかされる');
  });
});

describe('word-form SRS selection', () => {
  const TABERU = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
  const KAKU = { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' };
  const YOMU = {
    dict: '\u8aad\u3080',
    reading: '\u3088\u3080',
    meaning: 'to read',
    group: 'godan',
  };
  const SURU = {
    dict: '\u3059\u308b',
    reading: '\u3059\u308b',
    meaning: 'to do',
    group: 'suru',
  };
  const IKU = {
    dict: '\u884c\u304f',
    reading: '\u3044\u304f',
    meaning: 'to go',
    group: 'godan',
  };
  const KAU = {
    dict: '\u8cb7\u3046',
    reading: '\u304b\u3046',
    meaning: 'to buy',
    group: 'godan',
  };

  it('keeps exclusion state separate from word-form SRS history', () => {
    const dueCardId = cardIdFor(TABERU, 'plain-past');
    const dueCard = {
      reps: 3,
      interval: 8,
      ease: 2.5,
      nextReview: 1,
      correct: 3,
      incorrect: 1,
      lastSeen: 1,
    };
    const state = { ...defaultState(), cards: { [dueCardId]: dueCard } };
    const excluded = excludeWordFromReviewState(state, TABERU);

    expect(excluded.cards[dueCardId]).toEqual(dueCard);
    expect(filterWordsForStudyScope([TABERU], excluded, DEFAULT_PREFS, [])).toEqual([]);

    const restored = includeWordInReviewState(excluded, TABERU);
    expect(restored.cards[dueCardId]).toEqual(dueCard);
    expect(filterWordsForStudyScope([TABERU], restored, DEFAULT_PREFS, [])).toEqual([TABERU]);
  });

  it('suspends and restores form families without deleting card history', () => {
    const dueCardId = cardIdFor(TABERU, 'plain-past');
    const state = {
      ...defaultState(),
      cards: {
        [dueCardId]: {
          reps: 2,
          interval: 3,
          ease: 2.5,
          nextReview: 1,
          correct: 2,
          incorrect: 0,
          lastSeen: 1,
        },
      },
    };

    const excluded = excludeFormFamilyFromReviewState(state, 'basic-tenses');
    expect(reviewTypeIdsForState(excluded, ['plain-past', 'te-form'])).toEqual(['te-form']);
    expect(excluded.cards[dueCardId]).toEqual(state.cards[dueCardId]);

    const restored = includeFormFamilyInReviewState(excluded, 'basic-tenses');
    expect(reviewTypeIdsForState(restored, ['plain-past', 'te-form'])).toEqual([
      'plain-past',
      'te-form',
    ]);
    expect(restored.cards[dueCardId]).toEqual(state.cards[dueCardId]);
  });

  it('schedules due cards by exact word-form card id', () => {
    const dueCardId = cardIdFor(TABERU, 'plain-past');
    const state = {
      ...defaultState(),
      cards: {
        [dueCardId]: {
          reps: 1,
          interval: 1,
          ease: 2.5,
          nextReview: 1,
          correct: 1,
          incorrect: 0,
          lastSeen: 1,
        },
      },
    };
    const card = selectNext(state, [TABERU, KAKU], ['plain-past'], null, DEFAULT_PREFS);
    expect(card.id).toBe(dueCardId);
    expect(card.type).toBe('plain-past');
    expect(card.verb).toBe(TABERU);
  });

  it('uses dictionary target cards for reading practice without adding dictionary to core', () => {
    const card = selectNext(defaultState(), [TABERU], ['plain-past'], null, {
      ...DEFAULT_PREFS,
      reviewStyle: 'reading',
    });
    expect(TEXTBOOK_CORE_TYPE_IDS).not.toContain('dictionary');
    expect(card.id).toBe(cardIdFor(TABERU, 'dictionary'));
    expect(card.type).toBe('dictionary');
    expect(card.sourceType).toBe('plain-past');
  });

  it('introduces new review cards by textbook word order before form order', () => {
    const earlyWord = {
      ...KAKU,
      lesson: 3,
      lessons: [3],
      minnaLesson: 5,
    };
    const laterWord = {
      ...TABERU,
      lesson: 12,
      lessons: [12],
      minnaLesson: 13,
    };
    const card = selectNext(
      defaultState(),
      [laterWord, earlyWord],
      ['te-form', 'plain-past'],
      null,
      DEFAULT_PREFS,
    );

    expect(card.verb).toBe(earlyWord);
  });

  it('ladders fresh Core Warmup through regular ichidan and godan before irregulars', () => {
    const words = [SURU, IKU, KAU, TABERU, KAKU];
    const enabled = ['plain-past', 'plain-negative', 'polite-present'];
    let state = defaultState();
    let lastCardId = null;
    const seen = [];

    for (let i = 0; i < 5; i += 1) {
      const card = selectNext(state, words, enabled, lastCardId, DEFAULT_PREFS, null, {
        beginnerLadder: true,
      });
      expect(card).toBeTruthy();
      seen.push(card);
      lastCardId = card.id;
      state = {
        ...state,
        cards: {
          ...state.cards,
          [card.id]: {
            reps: 1,
            interval: 1,
            ease: 2.5,
            nextReview: Date.now() + DAY,
            correct: 1,
            incorrect: 0,
            lastSeen: i + 1,
            introducedDate: localDateKey(),
          },
        },
      };
    }

    expect(seen[0].verb.group).toBe('ichidan');
    expect(seen[0].type).toBe('plain-past');
    expect(seen[1].verb.group).toBe('ichidan');
    expect(seen[1].type).toBe('plain-negative');
    expect(seen.some((card) => card.verb.group === 'godan' && card.verb.dict !== IKU.dict)).toBe(
      true,
    );
    expect(seen.map((card) => card.verb.group)).not.toContain('suru');
    expect(seen.map((card) => card.verb.dict)).not.toContain(IKU.dict);
  });

  it('caps new cards by daily goal and uses a smaller bonus-study batch', () => {
    expect(dailyNewCardLimit({ ...DEFAULT_PREFS, dailyGoal: 10 })).toBe(3);
    expect(bonusNewCardLimit({ ...DEFAULT_PREFS, dailyGoal: 10 })).toBe(2);
    const introduced = {};
    for (let i = 0; i < 3; i += 1) {
      introduced[`synthetic-${i}`] = {
        introducedDate: localDateKey(),
        reps: 1,
        interval: 1,
        ease: 2.5,
        nextReview: Date.now() + DAY,
        correct: 1,
        incorrect: 0,
      };
    }
    const card = selectNext(
      { ...defaultState(), cards: introduced },
      [TABERU, KAKU],
      ['plain-past'],
      null,
      { ...DEFAULT_PREFS, dailyGoal: 10 },
    );
    expect(card).toBeNull();
  });

  it('moves to fresh material instead of looping recently reviewed weak cards', () => {
    const now = Date.now();
    const weakFutureCard = (lastSeen) => ({
      reps: 1,
      interval: 1,
      ease: 2.3,
      nextReview: now + DAY,
      correct: 1,
      incorrect: 3,
      lastSeen,
    });
    const state = {
      ...defaultState(),
      cards: {
        [cardIdFor(TABERU, 'plain-past')]: weakFutureCard(now - 1000),
        [cardIdFor(KAKU, 'plain-past')]: weakFutureCard(now - 2000),
      },
    };

    const card = selectNext(state, [TABERU, KAKU, YOMU], ['plain-past'], null, DEFAULT_PREFS);

    expect(card.id).toBe(cardIdFor(YOMU, 'plain-past'));
  });

  it('rotates future review away from recently seen weak cards when no fresh cards remain', () => {
    const now = Date.now();
    const recentWeakCard = (lastSeen) => ({
      reps: 1,
      interval: 1,
      ease: 2.3,
      nextReview: now + DAY,
      correct: 1,
      incorrect: 3,
      lastSeen,
    });
    const olderReviewedCard = {
      reps: 3,
      interval: 8,
      ease: 2.5,
      nextReview: now + 2 * DAY,
      correct: 3,
      incorrect: 0,
      lastSeen: now - DAY,
    };
    const state = {
      ...defaultState(),
      cards: {
        [cardIdFor(TABERU, 'plain-past')]: recentWeakCard(now - 1000),
        [cardIdFor(KAKU, 'plain-past')]: recentWeakCard(now - 2000),
        [cardIdFor(YOMU, 'plain-past')]: olderReviewedCard,
      },
    };

    const card = selectNext(state, [TABERU, KAKU, YOMU], ['plain-past'], null, DEFAULT_PREFS);

    expect(card.id).toBe(cardIdFor(YOMU, 'plain-past'));
  });
});
