import { describe, it, expect } from 'vitest';
import {
  gradeCard,
  bumpDaily,
  recordMistake,
  markMistakeResolved,
  localDateKey,
  mergeState,
  getCardLevel,
  normalizeReferenceState,
  buildFocusCard,
  defaultState,
  DAY,
} from '../utils/storage.js';

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
    let card = gradeCard(null, true);      // reps=1 interval=1
    card = gradeCard(card, true);          // reps=2 interval=3
    expect(card.reps).toBe(2);
    expect(card.interval).toBe(3);
  });

  it('uses ease factor for third+ correct answer', () => {
    let card = gradeCard(null, true);     // reps=1 interval=1
    card = gradeCard(card, true);         // reps=2 interval=3
    card = gradeCard(card, true);         // reps=3 interval=ceil(3 * 2.5) = 8
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
    let card = { ease: 1.4, interval: 5, reps: 2, nextReview: 0, correct: 2, incorrect: 0, lastSeen: 0 };
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
    let d = { date: today, count: 9, goalHit: false, goalStreak: 0, bestGoalStreak: 0, currentAnswerStreak: 0, bestAnswerStreak: 0 };
    d = bumpDaily(d, true, 10);
    expect(d.goalHit).toBe(true);
    expect(d.goalStreak).toBe(1);
  });

  it('increments answer streak on correct', () => {
    const today = localDateKey();
    let d = { date: today, count: 0, goalHit: false, goalStreak: 0, bestGoalStreak: 0, currentAnswerStreak: 2, bestAnswerStreak: 2 };
    d = bumpDaily(d, true, 10);
    expect(d.currentAnswerStreak).toBe(3);
    expect(d.bestAnswerStreak).toBe(3);
  });

  it('resets answer streak on incorrect', () => {
    const today = localDateKey();
    let d = { date: today, count: 5, goalHit: false, goalStreak: 0, bestGoalStreak: 0, currentAnswerStreak: 5, bestAnswerStreak: 5 };
    d = bumpDaily(d, false, 10);
    expect(d.currentAnswerStreak).toBe(0);
    expect(d.bestAnswerStreak).toBe(5); // best preserved
  });

  it('resets count when date changes', () => {
    const yesterday = localDateKey(-1);
    let d = { date: yesterday, count: 99, goalHit: true, goalStreak: 3, bestGoalStreak: 3, currentAnswerStreak: 10, bestAnswerStreak: 10 };
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

  it('caps at 50 mistakes', () => {
    let mistakes = [];
    for (let i = 0; i < 55; i++) {
      const fakeItem = { dict: `verb${i}`, reading: `v${i}`, meaning: 'x', group: 'godan' };
      mistakes = recordMistake(mistakes, fakeItem, 'plain-past', null, 'x', 'y');
    }
    expect(mistakes.length).toBe(50);
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
        { dict: null, reading: 'x', group: 'godan' },   // invalid: no dict
        null,
      ]
    });
    expect(result.history).toHaveLength(1);
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

  it('preserves saved cards', () => {
    const saved = { cards: { 'ichidan|plain-past': { reps: 3, interval: 8, ease: 2.5, nextReview: 9999999999999, correct: 3, incorrect: 0, lastSeen: 1 } } };
    const state = mergeState(saved, null);
    expect(state.cards['ichidan|plain-past'].reps).toBe(3);
  });

  it('uses sessionOverride for session', () => {
    const override = { reviewed: 5, correct: 3, skipped: 1 };
    const state = mergeState(null, override);
    expect(state.session).toEqual(override);
  });

  it('backfills adj types for old saves without them', () => {
    const saved = { enabledTypes: ['plain-past', 'te-form'] }; // no adj- types
    const state = mergeState(saved, null);
    expect(state.enabledTypes.some(id => id.startsWith('adj-'))).toBe(true);
  });
});

describe('buildFocusCard', () => {
  const state = defaultState();

  it('builds a card matching the word group and requested form', () => {
    const word = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
    const card = buildFocusCard(state, word, 'plain-past');
    expect(card).toMatchObject({ id: 'ichidan|plain-past', verb: word, type: 'plain-past' });
  });

  it('routes the 行く exception to its dedicated rule for plain-past', () => {
    const iku = { dict: '行く', reading: 'いく', meaning: 'to go', group: 'godan' };
    const card = buildFocusCard(state, iku, 'plain-past');
    expect(card.id).toBe('exception-いく|plain-past');
  });

  it('uses the ordinary godan rule for 行く on non-exception forms', () => {
    const iku = { dict: '行く', reading: 'いく', meaning: 'to go', group: 'godan' };
    const card = buildFocusCard(state, iku, 'polite-present');
    expect(card.id).toBe('godan|polite-present');
  });

  it('returns null when no rule covers the word/form', () => {
    const word = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
    expect(buildFocusCard(state, word, 'adj-plain-past')).toBeNull();
    expect(buildFocusCard(state, null, 'plain-past')).toBeNull();
  });
});
