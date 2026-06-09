import { describe, expect, it } from 'vitest';
import {
  compatibleTypes,
  isRedundantPracticeType,
  isTypeCompatible,
  practiceTypesForItem,
} from '../utils/conjugator.js';
import { CONJ_TYPES } from '../data/conjugationTypes.js';

// Defective stative verbs: rules can build advanced forms, but they aren't real
// Japanese, so the app must never present them.
const EXISTENCE = [
  { dict: '有る', reading: 'ある', meaning: 'to be, to have', group: 'godan' },
  { dict: '要る', reading: 'いる', meaning: 'to need', group: 'godan' },
];
// Statives that keep the progressive ～ている but drop agency/potential/volition.
const WITH_PROGRESSIVE = [
  { dict: 'できる', reading: 'できる', meaning: 'to be able to', group: 'ichidan' },
  { dict: '見える', reading: 'みえる', meaning: 'to be visible', group: 'ichidan' },
  { dict: '聞こえる', reading: 'きこえる', meaning: 'to be audible', group: 'ichidan' },
  { dict: '足りる', reading: 'たりる', meaning: 'to be enough', group: 'ichidan' },
  { dict: '似る', reading: 'にる', meaning: 'to resemble', group: 'ichidan' },
  { dict: '優れる', reading: 'すぐれる', meaning: 'to excel', group: 'ichidan' },
  { dict: '違う', reading: 'ちがう', meaning: 'to differ', group: 'godan' },
  { dict: '異なる', reading: 'ことなる', meaning: 'to differ', group: 'godan' },
];
const COGNITION = { dict: '分かる', reading: 'わかる', meaning: 'to understand', group: 'godan' };

// True verbs that share a reading / spelling but are NOT defective.
const NORMAL = [
  { dict: '煎る', reading: 'いる', meaning: 'to roast', group: 'godan' },
  { dict: '煮る', reading: 'にる', meaning: 'to boil', group: 'ichidan' },
  { dict: '居る', reading: 'いる', meaning: 'to exist (animate)', group: 'ichidan' },
  { dict: '買う', reading: 'かう', meaning: 'to buy', group: 'godan' },
];

const AGENCY_AND_VOLITION = ['passive', 'potential', 'volitional', 'imperative', 'desiderative'];
const BASE_FORMS = ['plain-past', 'plain-negative', 'te-form', 'conditional-ba', 'polite-past'];

function ids(word) {
  return new Set(compatibleTypes(word).map((t) => t.id));
}

describe('defective stative verbs', () => {
  for (const word of EXISTENCE) {
    it(`existence verb ${word.dict}: only basic forms, no progressive`, () => {
      const set = ids(word);
      for (const dead of [...AGENCY_AND_VOLITION, 'causative', 'progressive'])
        expect(set.has(dead)).toBe(false);
      for (const ok of BASE_FORMS) expect(set.has(ok)).toBe(true);
    });
  }

  for (const word of WITH_PROGRESSIVE) {
    it(`stative ${word.dict}: keeps ～ている, drops agency/potential/volition`, () => {
      const set = ids(word);
      expect(set.has('progressive')).toBe(true);
      for (const dead of [...AGENCY_AND_VOLITION, 'causative']) expect(set.has(dead)).toBe(false);
      for (const ok of BASE_FORMS) expect(set.has(ok)).toBe(true);
    });
  }

  it(`cognition verb ${COGNITION.dict}: keeps progressive and causative`, () => {
    const set = ids(COGNITION);
    expect(set.has('progressive')).toBe(true);
    expect(set.has('causative')).toBe(true);
    expect(set.has('causative-polite')).toBe(true);
    for (const dead of ['passive', 'potential', 'volitional', 'imperative']) {
      expect(set.has(dead)).toBe(false);
    }
  });

  it('treats excluded forms as not practiceable but keeps allowed ones', () => {
    expect(isTypeCompatible(EXISTENCE[0], 'passive')).toBe(false);
    expect(isRedundantPracticeType(EXISTENCE[0], 'causative', [])).toBe(true);
    expect(isRedundantPracticeType(EXISTENCE[0], 'plain-past', [])).toBe(false);
    const practiced = practiceTypesForItem(WITH_PROGRESSIVE[0], [], {
      skipDuplicateForms: false,
    }).map((t) => t.id);
    expect(practiced).not.toContain('potential');
    expect(practiced).toContain('progressive');
  });

  it('does not restrict true verbs that share a reading or spelling', () => {
    for (const word of NORMAL) {
      const list = compatibleTypes(word).map((t) => t.id);
      expect(list).toHaveLength(CONJ_TYPES.length);
      expect(list).toContain('passive');
      expect(list).toContain('causative');
    }
  });
});
