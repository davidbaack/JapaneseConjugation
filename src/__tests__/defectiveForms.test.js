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
const ARU = { dict: '有る', reading: 'ある', meaning: 'to be, to have', group: 'godan' };
const IRU_NEED = { dict: '要る', reading: 'いる', meaning: 'to need', group: 'godan' };

// True verbs that share a reading / look similar but are NOT defective.
const IRU_ROAST = { dict: '煎る', reading: 'いる', meaning: 'to roast', group: 'godan' };
const IRU_EXIST = {
  dict: '居る',
  reading: 'いる',
  meaning: 'to exist (animate)',
  group: 'ichidan',
};
const KAU = { dict: '買う', reading: 'かう', meaning: 'to buy', group: 'godan' };

const DEAD_FORMS = [
  'potential',
  'volitional',
  'passive',
  'causative',
  'causative-passive',
  'desiderative',
  'progressive',
  'imperative',
  'honorific',
];
const NATURAL_FORMS = ['plain-past', 'plain-negative', 'te-form', 'conditional-ba', 'polite-past'];

describe('defective stative verbs', () => {
  for (const word of [ARU, IRU_NEED]) {
    it(`excludes advanced forms for ${word.dict}`, () => {
      const ids = new Set(compatibleTypes(word).map((t) => t.id));
      for (const dead of DEAD_FORMS) expect(ids.has(dead)).toBe(false);
      for (const ok of NATURAL_FORMS) expect(ids.has(ok)).toBe(true);
    });

    it(`treats advanced forms as not practiceable for ${word.dict}`, () => {
      expect(isTypeCompatible(word, 'passive')).toBe(false);
      expect(isRedundantPracticeType(word, 'causative', [])).toBe(true);
      expect(isRedundantPracticeType(word, 'plain-past', [])).toBe(false);
      const practiced = practiceTypesForItem(word, [], { skipDuplicateForms: false }).map(
        (t) => t.id,
      );
      expect(practiced).not.toContain('potential');
      expect(practiced).toContain('plain-past');
    });
  }

  it('does not restrict true verbs that share a reading or spelling', () => {
    for (const word of [IRU_ROAST, IRU_EXIST, KAU]) {
      const ids = compatibleTypes(word).map((t) => t.id);
      expect(ids).toHaveLength(CONJ_TYPES.length);
      expect(ids).toContain('passive');
      expect(ids).toContain('causative');
    }
  });
});
