import { describe, it, expect } from 'vitest';
import { identifyConjugation, levenshtein, describeDiff } from '../utils/checkIdentify.js';
import { STARTER_VERBS, STARTER_ADJECTIVES } from '../data/starterWords.js';

const ALL = [...STARTER_VERBS, ...STARTER_ADJECTIVES];
const taberu = STARTER_VERBS.find((w) => w.reading === 'たべる'); // ichidan, to eat
const nomu = STARTER_VERBS.find((w) => w.reading === 'のむ'); // godan, to drink
const takai = STARTER_ADJECTIVES.find((w) => w.reading === 'たかい'); // i-adjective

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('たべた', 'たべた')).toBe(0);
  });
  it('counts a single substitution', () => {
    expect(levenshtein('たべた', 'たべる')).toBe(1);
  });
  it('counts insertions/deletions', () => {
    expect(levenshtein('たべ', 'たべた')).toBe(1);
  });
});

describe('describeDiff', () => {
  it('points at the first differing position', () => {
    const d = describeDiff('たべる', 'たべた');
    expect(d.firstDiff).toBe(2);
    expect(d.summary).toContain('position 3');
  });
});

describe('identifyConjugation', () => {
  it('finds an exact kana match (plain past of 食べる)', () => {
    const res = identifyConjugation('たべた', ALL);
    expect(res.near).toHaveLength(0);
    const hit = res.exact.find((e) => e.word.reading === 'たべる' && e.type === 'plain-past');
    expect(hit).toBeTruthy();
    expect(hit.kana).toBe('たべた');
  });

  it('finds an exact kanji match (食べた)', () => {
    const res = identifyConjugation('食べた', ALL);
    const hit = res.exact.find((e) => e.word.reading === 'たべる' && e.type === 'plain-past');
    expect(hit).toBeTruthy();
    expect(hit.kanji).toBe('食べた');
  });

  it('finds an exact romaji-typed match (tabeta)', () => {
    const res = identifyConjugation('tabeta', ALL);
    expect(res.normalized).toBe('たべた');
    const hit = res.exact.find((e) => e.word.reading === 'たべる' && e.type === 'plain-past');
    expect(hit).toBeTruthy();
  });

  it('can keep close wrong candidates after an exact match', () => {
    const res = identifyConjugation('kaemasu', ALL, { includeNearWhenExact: true });
    expect(res.normalized).toBe('かえます');
    expect(res.exact.some((e) => e.word.reading === 'かう' && e.type === 'potential-polite')).toBe(
      true,
    );
    const closeWrong = res.near.find(
      (e) => e.word.reading === 'かえる' && e.type === 'polite-present',
    );
    expect(res.near[0]).toMatchObject({ word: { reading: 'かえる' }, type: 'polite-present' });
    expect(res.near.every((e) => e.distance === res.near[0].distance)).toBe(true);
    expect(closeWrong).toBeTruthy();
    expect(closeWrong.kana).toBe('かえります');
    expect(closeWrong.diff.summary).toBeTruthy();
  });

  it('finds an exact match for a godan verb (のんだ = past of 飲む)', () => {
    const res = identifyConjugation('のんだ', ALL);
    const hit = res.exact.find((e) => e.word.reading === 'のむ' && e.type === 'plain-past');
    expect(hit).toBeTruthy();
  });

  it('finds an exact match for an i-adjective (たかかった)', () => {
    const res = identifyConjugation('たかかった', ALL);
    const hit = res.exact.find((e) => e.word.reading === 'たかい');
    expect(hit).toBeTruthy();
  });

  it('identifies a near-miss typo with the right intended word+form', () => {
    // One extra character vs. the plain past of 食べる (たべた).
    const res = identifyConjugation('たべえた', ALL);
    expect(res.exact).toHaveLength(0);
    expect(res.near.length).toBeGreaterThan(0);
    const best = res.near[0];
    expect(best.word.reading).toBe('たべる');
    expect(best.type).toBe('plain-past');
    expect(best.kana).toBe('たべた');
    expect(best.distance).toBeLessThanOrEqual(2);
    expect(best.diff.summary).toBeTruthy();
  });

  it('returns no exact and no near for unrelated gibberish', () => {
    const res = identifyConjugation('ぱぴぷぺぽ', ALL);
    expect(res.exact).toHaveLength(0);
    expect(res.near).toHaveLength(0);
  });

  it('does not produce junk near-misses for a tiny 1-char input', () => {
    // A single kana is within edit distance 1-2 of many short forms; the
    // shared-character floor should suppress those meaningless matches.
    const res = identifyConjugation('ぷ', ALL);
    expect(res.exact).toHaveLength(0);
    expect(res.near).toHaveLength(0);
  });

  it('recognises any valid form, not just a restricted subset', () => {
    // te-form and polite present should both be identified as exact when no
    // typesFor restriction is supplied (the Check view default).
    const te = identifyConjugation('たべて', ALL);
    expect(te.exact.some((e) => e.word.reading === 'たべる' && e.type === 'te-form')).toBe(true);
    const masu = identifyConjugation('たべます', ALL);
    expect(masu.exact.some((e) => e.word.reading === 'たべる' && e.type === 'polite-present')).toBe(
      true,
    );
  });

  describe('stem-aware near-miss (onbin / sound-change errors)', () => {
    // For each: the learner kept the right verb but formed the ending wrongly.
    // The lead near-miss should name THAT verb and the form they reached for —
    // not a coincidentally-closer unrelated word.
    const cases = [
      ['のみて', 'のむ', 'のんで', 'te-form'], // 飲む te: みて, not んで
      ['しにて', 'しぬ', 'しんで', 'te-form'], // 死ぬ te
      ['いいて', 'いく', 'いって', 'te-form'], // 行く irregular te
      ['まちて', 'まつ', 'まって', 'te-form'], // 待つ te
      ['およいて', 'およぐ', 'およいで', 'te-form'], // 泳ぐ te (voicing)
      ['のみた', 'のむ', 'のんだ', 'plain-past'], // 飲む past
    ];
    for (const [input, reading, expectedKana, expectedType] of cases) {
      it(`${input} → ${expectedKana} (${expectedType} of ${reading})`, () => {
        const res = identifyConjugation(input, ALL);
        expect(res.exact).toHaveLength(0);
        expect(res.near.length).toBeGreaterThan(0);
        const best = res.near[0];
        expect(best.word.reading).toBe(reading);
        expect(best.type).toBe(expectedType);
        expect(best.kana).toBe(expectedKana);
      });
    }

    it('does not read a plain noun as a botched verb (ねこ is not 寝る)', () => {
      const res = identifyConjugation('ねこ', ALL);
      expect(res.exact).toHaveLength(0);
      expect(res.near).toHaveLength(0);
    });
  });

  it('reports both readings of an ambiguous form (potential = passive)', () => {
    const res = identifyConjugation('たべられる', ALL);
    const types = res.exact.filter((e) => e.word.reading === 'たべる').map((e) => e.type);
    expect(types).toContain('potential');
    expect(types).toContain('passive');
  });

  it('returns an empty result for blank input', () => {
    const res = identifyConjugation('   ', ALL);
    expect(res.exact).toHaveLength(0);
    expect(res.near).toHaveLength(0);
  });

  it('respects a restricted word set (only 飲む enabled)', () => {
    const res = identifyConjugation('たべた', [nomu]);
    expect(res.exact).toHaveLength(0);
  });

  it('honours a typesFor override (only plain-past considered)', () => {
    const res = identifyConjugation('たべる', ALL, {
      typesFor: () => ['plain-past'],
    });
    // たべる is the dictionary/plain-present form, so restricting to plain-past
    // means it should NOT be found as an exact plain-present match.
    expect(res.exact.some((e) => e.type === 'plain-present')).toBe(false);
  });

  it('recognises katakana-typed input (タベタ = 食べた)', () => {
    const res = identifyConjugation('タベタ', ALL);
    const hit = res.exact.find((e) => e.word.reading === 'たべる' && e.type === 'plain-past');
    expect(hit).toBeTruthy();
  });

  it('treats a bare masu-stem as unidentified (たべ is not a conjugation)', () => {
    const res = identifyConjugation('たべ', ALL);
    expect(res.exact.some((e) => e.type === 'masu-stem')).toBe(false);
    expect(res.exact).toHaveLength(0);
    // No near-miss guesses toward fuller forms — it's an incomplete fragment.
    expect(res.near).toHaveLength(0);
  });

  it('uses real starter words', () => {
    expect(taberu).toBeTruthy();
    expect(nomu).toBeTruthy();
    expect(takai).toBeTruthy();
  });
});
