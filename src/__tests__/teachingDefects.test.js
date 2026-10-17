import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inflateVerbRows, mergeBuiltInWords } from '../data/verbLexicon.js';
import { STARTER_ADJECTIVES, STARTER_VERBS } from '../data/starterWords.js';
import {
  compatibleTypes,
  conjugateItem,
  isTypeCompatible,
  practiceTypesForItem,
  surfaceFormFor,
} from '../utils/conjugator.js';
import { explainItem, getConjugationDebugInfo } from '../utils/conjugatorExplain.js';
import { repairLexicalTeachingRow } from '../../scripts/lexicalTeachingRepairs.js';
import {
  findJmdictEntry,
  groupFromPos,
  matchingJmdictSenses,
  normalizeSupportedWord,
} from '../../scripts/build-verb-lexicon.js';

const lexicon = JSON.parse(readFileSync('public/data/verb-lexicon.json', 'utf8'));
const words = mergeBuiltInWords(inflateVerbRows([...lexicon.verbs, ...lexicon.adjectives]), [
  ...STARTER_VERBS,
  ...STARTER_ADJECTIVES,
]);
const word = (dict, group) => words.find((item) => item.dict === dict && item.group === group);

describe('learner-facing teaching repairs', () => {
  it('never offers pitiable as the appearance form of cute', () => {
    for (const dict of ['かわいい', '可愛い']) {
      const item = word(dict, 'i-adjective');
      expect(conjugateItem(item, 'adj-sou')).toBe('');
      expect(surfaceFormFor(item, 'adj-sou')).toBe('');
      expect(isTypeCompatible(item, 'adj-sou')).toBe(false);
      expect(practiceTypesForItem(item, ['adj-sou'], { skipDuplicateForms: false })).toEqual([]);
      expect(explainItem(item, 'adj-sou').note).toContain('pitiable');
      expect(conjugateItem(item, 'adj-plain-negative')).toBe('かわいくない');
    }
  });

  it('teaches lexical adjective exceptions and conventional noun modifiers', () => {
    expect(conjugateItem(word('ない', 'i-adjective'), 'adj-sou')).toBe('なさそう');
    expect(conjugateItem(word('ない', 'i-adjective'), 'adj-sugiru')).toBe('なさすぎる');
    expect(conjugateItem(word('良い', 'i-adjective'), 'adj-sou')).toBe('よさそう');
    for (const [dict, expected] of [
      ['普通', '普通の'],
      ['本当', '本当の'],
      ['黄色', '黄色の'],
      ['同じ', '同じ'],
      ['たくさん', 'たくさんの'],
    ]) {
      const item = word(dict, 'na-adjective');
      expect(surfaceFormFor(item, 'adj-attributive')).toBe(expected);
      expect(explainItem(item, 'adj-attributive').derivation).not.toContain('+ な');
    }
  });

  it('does not create unsupported potentials or a short irregular causative passive', () => {
    for (const item of [word('間に合う', 'godan'), word('愛する', 'suru')]) {
      for (const type of ['potential', 'potential-negative', 'potential-polite-past']) {
        expect(conjugateItem(item, type)).toBe('');
        expect(isTypeCompatible(item, type)).toBe(false);
      }
    }
    const kuru = word('来る', 'kuru');
    expect(conjugateItem(kuru, 'short-causative-passive')).toBe('');
    expect(conjugateItem(kuru, 'short-causative-passive-polite-past')).toBe('');
    expect(conjugateItem(kuru, 'causative-passive')).toBe('こさせられる');
    expect(conjugateItem(word('勉強する', 'suru'), 'potential')).toBe('べんきょうできる');
  });

  it('retains attested spoken short causatives', () => {
    expect(conjugateItem(word('行く', 'godan'), 'short-causative')).toBe('いかす');
    expect(conjugateItem(word('食べる', 'ichidan'), 'short-causative')).toBe('たべさす');
  });

  it('uses the piano reading in grading and every derived surface', () => {
    const piano = word('弾く', 'godan');
    expect(piano.reading).toBe('ひく');
    expect(piano.pitchAccent).toBeUndefined();
    expect(conjugateItem(piano, 'causative')).toBe('ひかせる');
    expect(conjugateItem(piano, 'plain-past')).toBe('ひいた');
    expect(surfaceFormFor(piano, 'plain-past')).toBe('弾いた');
  });

  it('uses correct honorific stems and the 問う sound-change exception', () => {
    for (const [dict, polite, command] of [
      ['おっしゃる', 'おっしゃいます', 'おっしゃい'],
      ['くださる', 'くださいます', 'ください'],
      ['なさる', 'なさいます', 'なさい'],
    ]) {
      const item = word(dict, 'godan');
      expect(conjugateItem(item, 'polite-present')).toBe(polite);
      expect(conjugateItem(item, 'imperative')).toBe(command);
      expect(conjugateItem(item, 'command-nasai')).toBe('');
      expect(explainItem(item, 'polite-present').derivation).not.toContain('り +');
    }
    const tou = word('問う', 'godan');
    expect(conjugateItem(tou, 'te-form')).toBe('とうて');
    expect(conjugateItem(tou, 'plain-past')).toBe('とうた');
    expect(
      getConjugationDebugInfo(tou, 'te-form').soundChangeVisual.rows.find((row) => row.active).kana,
    ).toBe('うて');
    expect(explainItem(tou, 'te-form').derivation).toBe('とう + て = とうて');
  });

  it('ships kana readings, correct groups and complete standard spellings', () => {
    expect(words.every((item) => /^[\u3040-\u30ff\s]+$/u.test(item.reading))).toBe(true);
    expect(word('助ける', 'godan')).toBeUndefined();
    expect(word('留める', 'godan')).toBeUndefined();
    expect(conjugateItem(word('はねる', 'ichidan'), 'plain-past')).toBe('はねた');
    expect(conjugateItem(word('あせる', 'ichidan'), 'plain-past')).toBe('あせた');
    for (const [dict, surface] of [
      ['浮かぶ', '浮かんだ'],
      ['楽しむ', '楽しんだ'],
      ['落ちる', '落ちた'],
      ['引き受ける', '引き受けた'],
    ]) {
      const item = words.find((entry) => entry.dict === dict);
      expect(surfaceFormFor(item, 'plain-past')).toBe(surface);
    }
    for (const dict of [
      '多分',
      '神',
      '骨',
      '電波',
      'かび',
      'センチ',
      '通',
      'まだ',
      '営',
      'おおい',
    ]) {
      expect(words.some((item) => item.dict === dict)).toBe(false);
    }
    for (const dict of ['一生懸命', '安心', '大抵', 'かなり', '広々', '流石']) {
      expect(word(dict, 'na-adjective')).toBeDefined();
    }
    for (const item of words) {
      expect(compatibleTypes(item).every((type) => !!conjugateItem(item, type.id))).toBe(true);
    }
  });

  it('keeps full ordinary meanings aligned with their register and voice', () => {
    expect(word('居る', 'ichidan').meaning).not.toContain('humble');
    expect(word('過ぎる', 'ichidan').meaning).toContain('elapse');
    expect(word('不味い', 'i-adjective').meaning).toBe('Unpleasant, Unappetising');
    expect(word('済ませる', 'ichidan').meaning).toBe('to finish, to get done');
    expect(word('卸す', 'godan').meaning).toContain('to grate');
    expect(word('陽気', 'na-adjective').meaning).toContain('cheerful');
  });
});

describe('source-specific lexical curation', () => {
  it('repairs a source kana field before dictionary classification', () => {
    const entry = {
      kana: [{ text: 'うれしい' }],
      sense: [{ partOfSpeech: ['adj-i'], gloss: [{ text: 'happy' }] }],
    };
    expect(
      normalizeSupportedWord(
        { dict: 'うれしい', reading: '嬉しい', meaning: 'to be happy; to be glad' },
        new Map([['うれしい', [entry]]]),
      ),
    ).toMatchObject({ dict: 'うれしい', reading: 'うれしい', group: 'i-adjective' });
  });
  it('does not rewrite alternate homographs or unsupported source identities', () => {
    expect(repairLexicalTeachingRow(['弾く', 'はじく', 'to flick', 'godan'])).toEqual([
      '弾く',
      'はじく',
      'to flick',
      'godan',
    ]);
    expect(repairLexicalTeachingRow(['神', 'かみ', 'awesome', 'na-adjective'])).toEqual([
      '神',
      'かみ',
      'awesome',
      'na-adjective',
    ]);
    expect(
      repairLexicalTeachingRow(['多分', 'たぶん', 'perhaps, probably, maybe', 'na-adjective']),
    ).toBeNull();
  });

  it('does not borrow a conjugation group from an unrelated dictionary sense', () => {
    const entry = {
      kanji: [{ text: '骨' }],
      kana: [{ text: 'ほね', appliesToKanji: ['骨'] }],
      sense: [
        { partOfSpeech: ['n'], gloss: [{ text: 'bone' }] },
        { partOfSpeech: ['adj-na'], gloss: [{ text: 'troublesome' }] },
      ],
    };
    const row = { dict: '骨', reading: 'ほね', meaning: 'bone' };
    expect(groupFromPos(entry, row)).toBeNull();
    expect(matchingJmdictSenses(entry, row)).toHaveLength(1);
    expect(groupFromPos(entry, { ...row, meaning: 'troublesome' })).toBe('na-adjective');
    expect(groupFromPos(entry, { ...row, meaning: 'an unmatched imported gloss' })).toBeNull();
  });

  it('requires both the actual reading and its sense restrictions', () => {
    const entry = {
      kanji: [{ text: '同字' }],
      kana: [
        { text: 'どうじ', appliesToKanji: ['同字'] },
        { text: 'べつよみ', appliesToKanji: ['同字'] },
      ],
      sense: [
        { partOfSpeech: ['n'], appliesToKana: ['どうじ'], gloss: [{ text: 'same character' }] },
        {
          partOfSpeech: ['adj-na'],
          appliesToKana: ['べつよみ'],
          gloss: [{ text: 'same character' }],
        },
      ],
    };
    const index = new Map([['同字', [entry]]]);
    expect(findJmdictEntry(index, '同字', 'wrong')).toBeNull();
    expect(findJmdictEntry(index, '同字', 'どうじ')).toBe(entry);
    expect(
      groupFromPos(entry, { dict: '同字', reading: 'どうじ', meaning: 'same character' }),
    ).toBeNull();
  });
});
