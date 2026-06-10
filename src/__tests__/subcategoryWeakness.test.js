import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { cardIdFor, DAY, defaultState, localDateKey, selectNext } from '../utils/storage.js';
import {
  RECENT_DECAY_MS,
  buildWeaknessFamilyRows,
  defaultWeaknessState,
  deriveWeaknessSubcategory,
  rankedWeaknessLanes,
  recencyDecayFactor,
  recordWeaknessAttempt,
  weaknessScoreForCard,
} from '../utils/subcategoryWeakness.js';

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
const KIKU = {
  dict: '\u805e\u304f',
  reading: '\u304d\u304f',
  meaning: 'to listen',
  group: 'godan',
};
const YOMU = {
  dict: '\u8aad\u3080',
  reading: '\u3088\u3080',
  meaning: 'to read',
  group: 'godan',
};
const IKU = {
  dict: '\u884c\u304f',
  reading: '\u3044\u304f',
  meaning: 'to go',
  group: 'godan',
};
const SURU = {
  dict: '\u3059\u308b',
  reading: '\u3059\u308b',
  meaning: 'to do',
  group: 'suru',
};

describe('recencyDecayFactor', () => {
  it('returns 1 for an attempt happening now', () => {
    const now = Date.now();
    expect(recencyDecayFactor(now, now)).toBe(1);
  });

  it('halves after one half-life', () => {
    const now = Date.now();
    expect(recencyDecayFactor(now - RECENT_DECAY_MS, now)).toBeCloseTo(0.5, 5);
  });

  it('treats an unknown timestamp as undecayed', () => {
    expect(recencyDecayFactor(0)).toBe(1);
  });
});

function withMisses(weakness, word, typeId, count = 3) {
  let next = weakness;
  for (let i = 0; i < count; i += 1) {
    next = recordWeaknessAttempt(next, {
      word,
      typeId,
      correct: false,
      responseMs: 9000,
      now: Date.now() - i * 1000,
    });
  }
  return next;
}

describe('subcategory weakness model', () => {
  it('derives broad groups, irregulars, and te/ta godan sound-change buckets', () => {
    expect(deriveWeaknessSubcategory(TABERU, 'plain-past').id).toBe('ichidan');
    expect(deriveWeaknessSubcategory(SURU, 'te-form').id).toBe('suru');
    expect(deriveWeaknessSubcategory(KAKU, 'te-form').id).toBe('godan-onbin-ku');
    expect(deriveWeaknessSubcategory(YOMU, 'plain-past').id).toBe('godan-onbin-mnb');
    expect(deriveWeaknessSubcategory(IKU, 'te-form').id).toBe('iku-exception');
    expect(deriveWeaknessSubcategory(KAKU, 'plain-negative').id).toBe('godan');
  });

  it('records attempts and ranks weak type plus subcategory lanes', () => {
    let weakness = defaultWeaknessState();
    weakness = withMisses(weakness, KAKU, 'te-form', 2);
    weakness = recordWeaknessAttempt(weakness, {
      word: TABERU,
      typeId: 'plain-past',
      correct: true,
      responseMs: 1200,
      now: Date.now(),
    });

    const lanes = rankedWeaknessLanes(weakness);
    expect(lanes[0].key).toBe('te-form|godan-onbin-ku');
    expect(lanes[0].attempted).toBe(2);
    expect(lanes[0].incorrect).toBe(2);
    expect(lanes[0].score).toBeGreaterThan(weaknessScoreForCard(weakness, TABERU, 'plain-past'));
  });

  it('keeps correct-only history out of weak lanes', () => {
    const weakness = recordWeaknessAttempt(defaultWeaknessState(), {
      word: TABERU,
      typeId: 'plain-past',
      correct: true,
      responseMs: 12000,
      now: Date.now(),
    });

    expect(weaknessScoreForCard(weakness, TABERU, 'plain-past')).toBe(0);
    expect(rankedWeaknessLanes(weakness)).toEqual([]);
    const familyRows = buildWeaknessFamilyRows({ weakness });
    expect(familyRows.every((family) => family.rows.length === 0)).toBe(true);
    const teTa = familyRows.find((family) => family.id === 'te-ta-sound-changes');
    expect(teTa.correct).toBe(1);
    expect(teTa.incorrect).toBe(0);
    expect(teTa.skillStatus).toBe('untested');
    expect(teTa.skillLabel).toBe('Gathering data');
    expect(teTa.learnerState).toEqual({ id: 'learning', label: 'Learning' });
  });

  it('labels family learner state from introduction, weakness, and reliability signals', () => {
    const freshRows = buildWeaknessFamilyRows({});
    const freshBasics = freshRows.find((family) => family.id === 'basic-tenses');
    expect(freshBasics.introduced).toBe(false);
    expect(freshBasics.skillLabel).toBe('Untested');
    expect(freshBasics.learnerState).toEqual({
      id: 'not-introduced',
      label: 'Not introduced',
    });

    const introducedRows = buildWeaknessFamilyRows({
      cards: {
        [cardIdFor(TABERU, 'plain-negative')]: {
          introducedDate: localDateKey(),
          reps: 0,
          correct: 0,
          incorrect: 0,
          lastSeen: 0,
        },
      },
    });
    const introducedBasics = introducedRows.find((family) => family.id === 'basic-tenses');
    expect(introducedBasics.introduced).toBe(true);
    expect(introducedBasics.skillLabel).toBe('Untested');
    expect(introducedBasics.learnerState).toEqual({ id: 'learning', label: 'Learning' });

    const weakRows = buildWeaknessFamilyRows({
      weakness: withMisses(defaultWeaknessState(), KAKU, 'te-form', 2),
    });
    const weakTeTa = weakRows.find((family) => family.id === 'te-ta-sound-changes');
    expect(weakTeTa.introduced).toBe(true);
    expect(weakTeTa.learnerState).toEqual({ id: 'needs-review', label: 'Needs review' });

    const reliableRows = buildWeaknessFamilyRows({
      cards: {
        [cardIdFor(KAKU, 'plain-negative')]: {
          introducedDate: localDateKey(-1),
          reps: 3,
          correct: 3,
          incorrect: 0,
          lastSeen: Date.now(),
        },
      },
    });
    const reliableBasics = reliableRows.find((family) => family.id === 'basic-tenses');
    expect(reliableBasics.introduced).toBe(true);
    expect(reliableBasics.learnerState).toEqual({ id: 'reliable', label: 'Reliable' });
  });

  it('selects fresh related cards in a weak subcategory before unrelated cards', () => {
    const weakness = withMisses(defaultWeaknessState(), KAKU, 'te-form', 3);
    const state = { ...defaultState(), weakness };

    const card = selectNext(
      state,
      [TABERU, KAKU, KIKU, YOMU],
      ['te-form'],
      null,
      DEFAULT_PREFS,
      null,
      { recentCardIds: [cardIdFor(KAKU, 'te-form')] },
    );

    expect(card.type).toBe('te-form');
    expect(card.verb).toBe(KIKU);
  });

  it('rotates verbs within a weak lane instead of repeating the same verb', () => {
    const weakness = withMisses(defaultWeaknessState(), KAKU, 'te-form', 3);
    const state = { ...defaultState(), weakness };
    const words = [KAKU, KIKU, YOMU];

    const first = selectNext(state, words, ['te-form'], null, DEFAULT_PREFS);
    const second = selectNext(state, words, ['te-form'], first.id, DEFAULT_PREFS, null, {
      recentCardIds: [first.id],
    });

    expect(first.type).toBe('te-form');
    expect(second.type).toBe('te-form');
    expect(deriveWeaknessSubcategory(second.verb, second.type).id).toBe('godan-onbin-ku');
    expect(second.verb.dict).not.toBe(first.verb.dict);
  });

  it('prefers weak family practice before due cards in default continuous Practice', () => {
    const weakness = withMisses(defaultWeaknessState(), KAKU, 'te-form', 3);
    const dueId = cardIdFor(TABERU, 'plain-past');
    const state = {
      ...defaultState(),
      weakness,
      cards: {
        [dueId]: {
          reps: 1,
          interval: 1,
          ease: 2.5,
          nextReview: Date.now() - DAY,
          correct: 1,
          incorrect: 0,
          introducedDate: localDateKey(-1),
        },
      },
    };

    const card = selectNext(state, [TABERU, KAKU, KIKU], ['plain-past', 'te-form']);

    expect(card.type).toBe('te-form');
    expect(card.id).not.toBe(dueId);
  });
});
