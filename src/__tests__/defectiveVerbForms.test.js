import { describe, expect, it } from 'vitest';
import { conjugate, practiceTypesForItem } from '../utils/conjugator.js';
import { ALL_CARD_TYPES } from '../data/conjugationTypes.js';

// Verbs that don't inflect across the full matrix. The engine reports the forms
// they lack as '' so practice and the sentence library skip them.
const ZAIRU = { dict: '在る', reading: 'ある', group: 'godan', meaning: 'to exist' };
const ARU = { dict: '有る', reading: 'ある', group: 'godan', meaning: 'to have' };
const IRU_NEED = { dict: '要る', reading: 'いる', group: 'godan', meaning: 'to need' };
const UMARERU = { dict: '生まれる', reading: 'うまれる', group: 'ichidan', meaning: 'to be born' };

// Controls: these must keep their full inflection (proves we don't over-match).
const IRU_EXIST = { dict: '居る', reading: 'いる', group: 'ichidan', meaning: 'to exist' };
const AU = { dict: '会う', reading: 'あう', group: 'godan', meaning: 'to meet' };

const STATIVE_KEPT = {
  'plain-present': 'ある',
  'plain-negative': 'ない', // suppletive
  'plain-past': 'あった',
  'plain-past-negative': 'なかった',
  'polite-present': 'あります',
  'te-form': 'あって',
  'conditional-ba': 'あれば',
  'conditional-tara': 'あったら',
  'conditional-nara': 'あるなら',
  conjectural: 'あるだろう',
  'negative-te': 'ないで',
  'negative-te-connective': 'なくて',
};

// Forms that don't exist for an inanimate stative verb.
const STATIVE_SUPPRESSED = [
  'potential',
  'potential-polite',
  'passive',
  'passive-past',
  'progressive',
  'progressive-polite',
  'desiderative',
  'desiderative-negative',
  'volitional',
  'polite-volitional',
  'imperative',
  'command-nasai',
  'honorific',
  'humble',
  'causative',
  'causative-passive',
  'short-causative',
  'short-causative-passive',
  'prohibition',
  'request-kudasai',
  'permission',
  'obligation',
  'negative-zuni',
];

describe('defective / stative verb form suppression', () => {
  describe('ある (在る・有る)', () => {
    for (const [type, expected] of Object.entries(STATIVE_KEPT)) {
      it(`keeps ${type} → ${expected}`, () => {
        expect(conjugate(ZAIRU, type)).toBe(expected);
        expect(conjugate(ARU, type)).toBe(expected);
      });
    }
    for (const type of STATIVE_SUPPRESSED) {
      it(`suppresses ${type}`, () => {
        expect(conjugate(ZAIRU, type)).toBe('');
        expect(conjugate(ARU, type)).toBe('');
      });
    }
  });

  describe('要る (godan "to need")', () => {
    it('keeps core everyday forms', () => {
      expect(conjugate(IRU_NEED, 'plain-present')).toBe('いる');
      expect(conjugate(IRU_NEED, 'plain-negative')).toBe('いらない');
      expect(conjugate(IRU_NEED, 'te-form')).toBe('いって');
      expect(conjugate(IRU_NEED, 'conditional-ba')).toBe('いれば');
    });
    for (const type of STATIVE_SUPPRESSED) {
      it(`suppresses ${type}`, () => {
        expect(conjugate(IRU_NEED, type)).toBe('');
      });
    }
  });

  describe('生まれる (intransitive "to be born") — light prune', () => {
    it('keeps the forms it genuinely has', () => {
      expect(conjugate(UMARERU, 'plain-present')).toBe('うまれる');
      expect(conjugate(UMARERU, 'causative')).toBe('うまれさせる');
      expect(conjugate(UMARERU, 'desiderative')).toBe('うまれたい');
      expect(conjugate(UMARERU, 'volitional')).toBe('うまれよう');
      expect(conjugate(UMARERU, 'progressive')).toBe('うまれている');
      expect(conjugate(UMARERU, 'imperative')).toBe('うまれろ');
    });
    for (const type of [
      'passive',
      'passive-polite',
      'passive-past',
      'causative-passive',
      'causative-passive-polite',
      'short-causative',
      'short-causative-passive',
    ]) {
      it(`suppresses ${type}`, () => {
        expect(conjugate(UMARERU, type)).toBe('');
      });
    }
  });

  describe('controls keep their full inflection', () => {
    it('居る (ichidan "to exist") keeps potential/passive', () => {
      expect(conjugate(IRU_EXIST, 'potential')).toBe('いられる');
      expect(conjugate(IRU_EXIST, 'passive')).toBe('いられる');
    });
    it('会う keeps passive and causative-passive', () => {
      expect(conjugate(AU, 'passive')).toBe('あわれる');
      expect(conjugate(AU, 'causative-passive')).toBe('あわせられる');
    });
  });

  describe('practiceTypesForItem reflects suppression', () => {
    const allTypeIds = ALL_CARD_TYPES.map((t) => t.id);
    const idsFor = (verb) => new Set(practiceTypesForItem(verb, allTypeIds).map((t) => t.id));

    it('drops suppressed forms but keeps core forms for ある', () => {
      const ids = idsFor(ZAIRU);
      expect(ids.has('plain-negative')).toBe(true);
      expect(ids.has('te-form')).toBe(true);
      expect(ids.has('passive')).toBe(false);
      expect(ids.has('potential')).toBe(false);
      expect(ids.has('progressive')).toBe(false);
    });

    it('does not over-match 居る', () => {
      const ids = idsFor(IRU_EXIST);
      // 居る (ichidan) keeps its productive forms. (passive いられる is deduped
      // against the identical potential by skipDuplicateForms, so assert a form
      // with a distinct surface.)
      expect(ids.has('potential')).toBe(true);
      expect(ids.has('causative')).toBe(true);
      expect(ids.size).toBeGreaterThan(40);
    });
  });
});
