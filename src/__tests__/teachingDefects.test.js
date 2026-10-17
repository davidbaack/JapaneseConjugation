import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inflateVerbRows, mergeBuiltInWords } from '../data/verbLexicon.js';
import { STARTER_ADJECTIVES, STARTER_VERBS } from '../data/starterWords.js';
import {
  compatibleTypes,
  conjugateItem,
  getSpecialKeigoBase,
  isTypeCompatible,
  keigoForm,
  practiceTypesForItem,
  regularHonorificForm,
  regularHumbleForm,
  surfaceFormFor,
} from '../utils/conjugator.js';
import { explainItem, getConjugationDebugInfo, stepCoachHint } from '../utils/conjugatorExplain.js';
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
  it('withholds automatic keigo for already polite words and unreviewed phrase contexts', () => {
    for (const dict of [
      '致す',
      'いらっしゃる',
      '伺う',
      'おっしゃる',
      'おる',
      'くださる',
      'ごらんになる',
      '差し上げる',
      'なさる',
      '拝見する',
      '参る',
      '召し上がる',
      '申し上げる',
      '申す',
      'いただく',
      '承る',
      'お目に掛かる',
      '存じる',
      '召す',
      'ござる',
      'ご覧になる',
      '失礼いたす',
      'でござる',
      'お先に失礼する',
      '学校に入る',
    ]) {
      const item = words.find((entry) => entry.dict === dict);
      expect(item, dict).toBeDefined();
      for (const type of ['honorific', 'honorific-polite', 'humble', 'humble-polite']) {
        expect(conjugateItem(item, type), `${dict}/${type}`).toBe('');
        expect(surfaceFormFor(item, type)).toBe('');
        expect(isTypeCompatible(item, type)).toBe(false);
        expect(getSpecialKeigoBase(item, type)).toBeUndefined();
        expect(getConjugationDebugInfo(item, type).formula.expression).toBe('');
        expect(getConjugationDebugInfo(item, type).rule.family).toBe('unavailable');
        expect(explainItem(item, type).rule).toContain('reviewed');
        expect(stepCoachHint(item, type, '').text).toContain('reviewed');
      }
      expect(regularHonorificForm(item)).toBe('');
      expect(regularHumbleForm(item)).toBe('');
      expect(keigoForm(item, 'honorific')).toBe('');
      expect(keigoForm(item, 'humble')).toBe('');
      expect(conjugateItem(item, 'polite-present')).not.toBe('');
    }
  });

  it('does not replace homographs with unrelated eating, sleeping, giving or meeting senses', () => {
    for (const dict of [
      '切る',
      '斬る',
      '煎る',
      '炒る',
      '練る',
      '刷る',
      '合う',
      '効く',
      '上げる',
      '揚げる',
      '暮れる',
      '診る',
      '遭う',
    ]) {
      const item = words.find((entry) => entry.dict === dict);
      expect(item, dict).toBeDefined();
      for (const type of ['honorific', 'humble']) {
        expect(getSpecialKeigoBase(item, type)).toBeUndefined();
        expect(conjugateItem(item, type), `${dict}/${type}`).toBe('');
      }
      expect(conjugateItem(item, 'plain-past')).not.toBe('');
    }
  });

  it('requires the known sense for ambiguous kana-only special verbs', () => {
    expect(keigoForm({ dict: '造語', group: 'godan' }, 'honorific')).toBe('');
    for (const [dict, reading, group] of [
      ['読む', 'はなす', 'godan'],
      ['話す', 'かく', 'godan'],
      ['教える', 'たべる', 'ichidan'],
    ]) {
      const changed = { dict, reading, group, meaning: 'different custom identity' };
      expect(conjugateItem(changed, 'honorific')).toBe('');
      expect(conjugateItem(changed, 'humble')).toBe('');
    }
    for (const [dict, meaning, group] of [
      ['あう', 'to fit', 'godan'],
      ['あげる', 'to raise', 'ichidan'],
      ['みる', 'to examine a patient', 'ichidan'],
      ['くれる', 'to get dark', 'ichidan'],
      ['きく', 'to be effective', 'godan'],
    ]) {
      const item = { dict, reading: dict, meaning, group };
      expect(getSpecialKeigoBase(item, 'honorific')).toBeUndefined();
      expect(conjugateItem(item, 'honorific')).toBe('');
    }
    expect(
      conjugateItem(
        { dict: 'きる', reading: 'きる', meaning: 'to cut', group: 'godan' },
        'honorific',
      ),
    ).toBe('');
    expect(
      conjugateItem(
        { dict: '着る', reading: 'きる', meaning: 'to wear', group: 'ichidan' },
        'honorific',
      ),
    ).toBe('おめしになる');
  });

  it('preserves the 27 reviewed ordinary keigo sources and their correct meanings', () => {
    const approved = words.filter((item) =>
      ['honorific', 'humble'].some((type) => !!conjugateItem(item, type)),
    );
    expect(approved.map((item) => item.dict).sort()).toEqual(
      [
        '会う',
        '言う',
        '行く',
        '居る',
        '教える',
        '書く',
        '借りる',
        '聞く',
        '着る',
        '来る',
        '死ぬ',
        '知る',
        'する',
        '食べる',
        '寝る',
        '飲む',
        '話す',
        '待つ',
        '見せる',
        '見る',
        '持つ',
        '読む',
        'あげる',
        'くれる',
        '尋ねる',
        '訪ねる',
        'もらう',
      ].sort(),
    );
    expect(conjugateItem(word('読む', 'godan'), 'honorific')).toBe('およみになる');
    expect(conjugateItem(word('読む', 'godan'), 'humble-polite')).toBe('およみします');
    expect(conjugateItem(word('着る', 'ichidan'), 'honorific')).toBe('おめしになる');
    expect(conjugateItem(word('死ぬ', 'godan'), 'honorific')).toBe('おなくなりになる');
    expect(regularHonorificForm(word('死ぬ', 'godan'))).toBe('おなくなりになる');
    expect(conjugateItem(word('寝る', 'ichidan'), 'honorific')).toBe('おやすみになる');
    expect(conjugateItem(word('寝る', 'ichidan'), 'humble')).toBe('');
    expect(conjugateItem(word('寝る', 'ichidan'), 'humble-polite')).toBe('');
    expect(conjugateItem(word('あげる', 'ichidan'), 'honorific')).toBe('くださる');
    expect(conjugateItem(word('くれる', 'ichidan'), 'honorific-polite')).toBe('くださいます');
  });

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
