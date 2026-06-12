import { describe, expect, it } from 'vitest';

import {
  accentForForm,
  compactPitchAccentForWord,
  inflatePitchAccent,
  parseKanjiumAccentRows,
  splitMorae,
  tonesForAccent,
} from '../utils/pitchAccent.js';

const TABERU = {
  dict: '\u98df\u3079\u308b',
  reading: '\u305f\u3079\u308b',
  meaning: 'to eat',
  group: 'ichidan',
  pitchAccent: { accents: [2], source: 'kanjium' },
};
const KIKU = {
  dict: '\u805e\u304f',
  reading: '\u304d\u304f',
  meaning: 'to listen',
  group: 'godan',
  pitchAccent: { accents: [0], source: 'kanjium' },
};

describe('parseKanjiumAccentRows', () => {
  it('parses tab-separated surface, reading, and accent numbers', () => {
    const rows = parseKanjiumAccentRows(
      '\u98df\u3079\u308b\t\u305f\u3079\u308b\t2\n\u4eba\t\u3072\u3068\t0,2\n',
    );

    expect(compactPitchAccentForWord(TABERU, rows)).toEqual([2]);
    expect(compactPitchAccentForWord({ dict: '\u4eba', reading: '\u3072\u3068' }, rows)).toEqual([
      0, 2,
    ]);
  });

  it('normalizes katakana readings for loanword matches', () => {
    const rows = parseKanjiumAccentRows(
      '\u30b3\u30d4\u30fc\u3059\u308b\t\u30b3\u30d4\u30fc\u3059\u308b\t1\n',
    );

    expect(
      compactPitchAccentForWord(
        { dict: '\u30b3\u30d4\u30fc\u3059\u308b', reading: '\u30b3\u30d4\u30fc\u3059\u308b' },
        rows,
      ),
    ).toEqual([1]);
  });
});

describe('pitch accent helpers', () => {
  it('inflates compact generated accent data', () => {
    expect(inflatePitchAccent([2])).toEqual({ accents: [2], source: 'kanjium' });
  });

  it('splits kana into morae and attaches small kana to the previous mora', () => {
    expect(splitMorae('\u304d\u3087\u3046')).toEqual(['\u304d\u3087', '\u3046']);
    expect(splitMorae('\u304b\u3044\u305f')).toEqual(['\u304b', '\u3044', '\u305f']);
  });

  it('converts accent numbers to high and low tones', () => {
    expect(tonesForAccent(['\u305f', '\u3079', '\u308b'], 2)).toEqual(['L', 'H', 'L']);
    expect(tonesForAccent(['\u304d', '\u304f'], 0)).toEqual(['L', 'H']);
    expect(tonesForAccent(['\u307f', '\u308b'], 1)).toEqual(['H', 'L']);
  });
});

describe('accentForForm', () => {
  it('returns verified dictionary-form accents', () => {
    expect(accentForForm(TABERU, 'plain-present', TABERU.reading)).toMatchObject({
      reading: '\u305f\u3079\u308b',
      accent: 2,
      tones: ['L', 'H', 'L'],
      confidence: 'verified',
    });
  });

  it('derives bounded plain-negative verb accents from verified base accents', () => {
    expect(accentForForm(TABERU, 'plain-negative', '\u305f\u3079\u306a\u3044')).toMatchObject({
      reading: '\u305f\u3079\u306a\u3044',
      accent: 2,
      tones: ['L', 'H', 'L', 'L'],
      confidence: 'derived',
    });
  });

  it('keeps heiban verbs heiban for the bounded negative derivation', () => {
    expect(accentForForm(KIKU, 'plain-negative', '\u304d\u304b\u306a\u3044')).toMatchObject({
      accent: 0,
      tones: ['L', 'H', 'H', 'H'],
    });
  });

  it('returns null for ambiguous, missing, or unsupported accent data', () => {
    expect(
      accentForForm(
        { ...TABERU, pitchAccent: { accents: [0, 2], source: 'kanjium' } },
        'plain-present',
      ),
    ).toBeNull();
    expect(accentForForm({ ...TABERU, pitchAccent: null }, 'plain-present')).toBeNull();
    expect(accentForForm(TABERU, 'te-form', '\u305f\u3079\u3066')).toBeNull();
  });
});
