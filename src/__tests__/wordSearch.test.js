import { describe, expect, it } from 'vitest';
import { createDictionaryWordMatcher } from '../utils/wordSearch.js';

const IKU = { dict: '行く', reading: 'いく', meaning: 'to go', group: 'godan' };
const HASHIRU = { dict: '走る', reading: 'はしる', meaning: 'to run', group: 'godan' };
const words = [IKU, HASHIRU];

describe('dictionary word search', () => {
  it.each(['iku', 'いく', 'イク', '行く', ' IKU ', '　ＩＫＵ　', 'ｲｸ'])(
    'finds the same word for %s',
    (query) => {
      expect(words.filter(createDictionaryWordMatcher(query))).toEqual([IKU]);
    },
  );

  it.each(['go', ' GO ', 'ｇｏ'])('retains English meaning search for %s', (query) => {
    expect(words.filter(createDictionaryWordMatcher(query))).toEqual([IKU]);
  });

  it.each(['ik', 'k', '走', 'はし', 'hash', 'hasi', 'hasiru'])(
    'matches partial dictionary text, canonical romaji, and input aliases for %s',
    (query) => {
      const expected = ['ik', 'k'].includes(query) ? IKU : HASHIRU;
      expect(words.filter(createDictionaryWordMatcher(query))).toContain(expected);
    },
  );

  it('folds katakana in dictionary entries as well as queries', () => {
    const word = { dict: 'テストする', reading: 'テストする', meaning: 'to test' };
    expect(createDictionaryWordMatcher('てすと')(word)).toBe(true);
    expect(createDictionaryWordMatcher('tesuto')(word)).toBe(true);
  });

  it.each(['', ' ', '　'])('includes the inventory for a blank query %s', (query) => {
    expect(words.filter(createDictionaryWordMatcher(query))).toEqual(words);
  });

  it.each(['zzznomatch', "'", 'godan', 'itta'])(
    'does not add fuzzy, group, or conjugated-form matches for %s',
    (query) => {
      expect(words.filter(createDictionaryWordMatcher(query))).toEqual([]);
    },
  );

  it('supports entries with missing optional reading or meaning', () => {
    const kanjiOnly = { dict: '行く' };
    const readingOnly = { reading: 'いく' };
    const meaningOnly = { meaning: 'to go' };
    const entries = [kanjiOnly, readingOnly, meaningOnly, {}];
    expect(entries.filter(createDictionaryWordMatcher('行く'))).toEqual([kanjiOnly]);
    expect(entries.filter(createDictionaryWordMatcher('iku'))).toEqual([readingOnly]);
    expect(entries.filter(createDictionaryWordMatcher('go'))).toEqual([meaningOnly]);
  });
});
