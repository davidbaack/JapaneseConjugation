import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { recordReadinessAttempt } from '../utils/readiness.js';
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
  it('derives exact-form history states and compact family counts', () => {
    const rows = buildWeaknessFamilyRows({
      ...defaultState(),
      cards: {
        [cardIdFor(TABERU, 'plain-present')]: { correct: 3, incorrect: 0 },
        [cardIdFor(TABERU, 'plain-negative')]: { correct: 1, incorrect: 0 },
        [cardIdFor(TABERU, 'polite-present')]: { correct: 1, incorrect: 2 },
      },
    });
    const basics = rows.find((family) => family.id === 'basic-tenses');
    const byType = new Map(basics.typeRows.map((row) => [row.typeId, row]));

    expect(byType.get('plain-present')).toMatchObject({
      status: 'strong',
      statusLabel: 'Strong',
      attempted: 3,
    });
    expect(byType.get('plain-negative')).toMatchObject({
      status: 'gathering',
      statusLabel: 'Gathering data',
      attempted: 1,
    });
    expect(byType.get('polite-present')).toMatchObject({
      status: 'weak',
      statusLabel: 'Needs practice',
      attempted: 3,
    });
    expect(byType.get('polite-past')).toMatchObject({
      status: 'not-practiced',
      statusLabel: 'Not practiced',
      attempted: 0,
    });
    expect(basics.statusCounts).toEqual({
      strong: 1,
      needsPractice: 1,
      learning: 1,
      notPracticed: 4,
    });
  });

  it('attributes reverse-card source history to the exact source form', () => {
    const rows = buildWeaknessFamilyRows({
      ...defaultState(),
      cards: {
        [cardIdFor(TABERU, 'dictionary')]: {
          correct: 2,
          incorrect: 1,
          sourceTypeStats: {
            'plain-negative': { correct: 2, incorrect: 1 },
          },
        },
      },
    });
    const basics = rows.find((family) => family.id === 'basic-tenses');
    const plainNegative = basics.typeRows.find((row) => row.typeId === 'plain-negative');

    expect(plainNegative).toMatchObject({
      correct: 2,
      incorrect: 1,
      attempted: 3,
      status: 'developing',
      statusLabel: 'Developing',
    });
    expect(basics.correct).toBe(2);
    expect(basics.incorrect).toBe(1);
  });

  it('uses readiness and response evidence when card totals are unavailable', () => {
    let readiness = defaultState().readiness;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      readiness = recordReadinessAttempt(readiness, cardIdFor(TABERU, 'plain-negative'), {
        correct: true,
        responseMs: 1200,
        answerMode: 'type',
        now: Date.now() + attempt,
      });
    }
    const rows = buildWeaknessFamilyRows({ ...defaultState(), readiness });
    const basics = rows.find((family) => family.id === 'basic-tenses');
    const plainNegative = basics.typeRows.find((row) => row.typeId === 'plain-negative');

    expect(plainNegative.attempted).toBe(3);
    expect(plainNegative.status).toBe('strong');
    expect(plainNegative.readinessAttempted).toBeGreaterThan(0);
  });

  it('keeps exact-form strength independent from the saved Practice scope', () => {
    const historyState = {
      ...defaultState(),
      cards: {
        [cardIdFor(TABERU, 'plain-negative')]: { correct: 3, incorrect: 0 },
      },
    };
    const enabled = buildWeaknessFamilyRows({
      ...historyState,
      enabledTypes: ['plain-negative'],
    });
    const disabled = buildWeaknessFamilyRows({
      ...historyState,
      enabledTypes: ['polite-present'],
    });

    expect(disabled.map((family) => family.typeRows)).toEqual(
      enabled.map((family) => family.typeRows),
    );
  });

  it('lets an old miss recover to strong after sustained correct answers', () => {
    const now = Date.now();
    let weakness = recordWeaknessAttempt(defaultWeaknessState(), {
      word: TABERU,
      typeId: 'plain-negative',
      correct: false,
      responseMs: 9000,
      now: now - RECENT_DECAY_MS * 2,
    });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      weakness = recordWeaknessAttempt(weakness, {
        word: TABERU,
        typeId: 'plain-negative',
        correct: true,
        responseMs: 1200,
        now: now - attempt * 1000,
      });
    }
    const rows = buildWeaknessFamilyRows({ ...defaultState(), weakness });
    const basics = rows.find((family) => family.id === 'basic-tenses');

    expect(basics.typeRows.find((row) => row.typeId === 'plain-negative').status).toBe('strong');
  });

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
    const emptyRows = buildWeaknessFamilyRows(defaultState());
    const untouched = emptyRows.find((family) => family.id === 'basic-tenses');
    expect(untouched.introduced).toBe(false);
    expect(untouched.skillLabel).toBe('Not introduced');
    expect(untouched.learnerState).toEqual({
      id: 'not-introduced',
      label: 'Not introduced',
    });

    const introducedOnlyId = cardIdFor(TABERU, 'plain-negative');
    const introducedOnlyRows = buildWeaknessFamilyRows({
      ...defaultState(),
      cards: {
        [introducedOnlyId]: {
          reps: 0,
          interval: 1,
          ease: 2.5,
          nextReview: Date.now() + DAY,
          correct: 0,
          incorrect: 0,
          introducedDate: localDateKey(-1),
        },
      },
    });
    const introducedOnly = introducedOnlyRows.find((family) => family.id === 'basic-tenses');
    expect(introducedOnly.introduced).toBe(true);
    expect(introducedOnly.skillLabel).toBe('Untested');
    expect(introducedOnly.learnerState).toEqual({
      id: 'learning',
      label: 'Learning',
    });

    const weakRows = buildWeaknessFamilyRows({
      ...defaultState(),
      weakness: withMisses(defaultWeaknessState(), KAKU, 'te-form', 2),
    });
    expect(weakRows.find((family) => family.id === 'te-ta-sound-changes').learnerState).toEqual({
      id: 'needs-review',
      label: 'Needs review',
    });

    const reliableId = cardIdFor(TABERU, 'plain-negative');
    const reliableRows = buildWeaknessFamilyRows({
      ...defaultState(),
      cards: {
        [reliableId]: {
          reps: 3,
          interval: 6,
          ease: 2.5,
          nextReview: Date.now() + DAY,
          correct: 3,
          incorrect: 0,
          introducedDate: localDateKey(-1),
          lastSeen: Date.now(),
        },
      },
    });
    expect(reliableRows.find((family) => family.id === 'basic-tenses').learnerState).toEqual({
      id: 'reliable',
      label: 'Reliable',
    });
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
