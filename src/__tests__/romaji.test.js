import { describe, it, expect } from 'vitest';
import { toHiragana, toHiraganaProgress, kanaToRomaji, isAllKana } from '../utils/romaji.js';

describe('toHiragana', () => {
  it('converts basic romaji syllables', () => {
    expect(toHiragana('ka')).toBe('か');
    expect(toHiragana('ki')).toBe('き');
    expect(toHiragana('tsu')).toBe('つ');
    expect(toHiragana('shi')).toBe('し');
    expect(toHiragana('chi')).toBe('ち');
  });

  it('converts digraphs', () => {
    expect(toHiragana('sha')).toBe('しゃ');
    expect(toHiragana('kyo')).toBe('きょ');
    expect(toHiragana('ryu')).toBe('りゅ');
    expect(toHiragana('cha')).toBe('ちゃ');
  });

  it('converts double consonants to っ', () => {
    expect(toHiragana('kka')).toBe('っか');
    expect(toHiragana('tte')).toBe('って');
    expect(toHiragana('ssa')).toBe('っさ');
  });

  it('handles n correctly', () => {
    expect(toHiragana('n')).toBe('ん');
    expect(toHiragana('nn')).toBe('んん');
    expect(toHiragana('na')).toBe('な');
    expect(toHiragana('taberu')).toBe('たべる');
    expect(toHiragana('hanbun')).toBe('はんぶん');
  });

  it('converts full verb readings', () => {
    expect(toHiragana('taberu')).toBe('たべる');
    expect(toHiragana('kaku')).toBe('かく');
    expect(toHiragana('mimasu')).toBe('みます');
    expect(toHiragana('hanashimashita')).toBe('はなしました');
  });

  it('returns empty string for empty input', () => {
    expect(toHiragana('')).toBe('');
    expect(toHiragana(null)).toBe('');
    expect(toHiragana(undefined)).toBe('');
  });

  it('passes through existing hiragana unchanged', () => {
    expect(toHiragana('たべる')).toBe('たべる');
  });

  it('handles macron long vowels', () => {
    expect(toHiragana('tōkyō')).toBe('とうきょう');
    expect(toHiragana('ōsaka')).toBe('おうさか');
  });
});

describe('kanaToRomaji', () => {
  it('converts basic hiragana to romaji', () => {
    expect(kanaToRomaji('か')).toBe('ka');
    expect(kanaToRomaji('き')).toBe('ki');
    expect(kanaToRomaji('つ')).toBe('tsu');
    expect(kanaToRomaji('し')).toBe('shi');
  });

  it('converts digraphs', () => {
    expect(kanaToRomaji('きょ')).toBe('kyo');
    expect(kanaToRomaji('りゅ')).toBe('ryu');
  });

  it('converts っ as double consonant', () => {
    expect(kanaToRomaji('って')).toBe('tte');
    expect(kanaToRomaji('っか')).toBe('kka');
    expect(kanaToRomaji('っち')).toBe('tchi');
  });

  it('converts ん', () => {
    expect(kanaToRomaji('ん')).toBe('n');
    expect(kanaToRomaji('はんぶん')).toBe('hanbun');
  });

  it('round-trips with toHiragana for common words', () => {
    const words = ['たべる', 'みます', 'かく', 'はなす', 'よむ', 'のむ'];
    for (const w of words) {
      expect(toHiragana(kanaToRomaji(w))).toBe(w);
    }
  });

  it('returns empty string for empty input', () => {
    expect(kanaToRomaji('')).toBe('');
    expect(kanaToRomaji(null)).toBe('');
  });
});

describe('toHiraganaProgress', () => {
  it('converts fully typed romaji', () => {
    expect(toHiraganaProgress('ta')).toBe('た');
    expect(toHiraganaProgress('tabe')).toBe('たべ');
  });

  it('stops at incomplete prefix and does not append garbage', () => {
    // 'taber' – 'r' alone is a valid prefix, should not output anything for trailing 'r'
    const result = toHiraganaProgress('taber');
    expect(result).toBe('たべ');
  });

  it('handles double consonant in progress', () => {
    expect(toHiraganaProgress('tt')).toBe('っ');
  });

  it('returns empty for empty input', () => {
    expect(toHiraganaProgress('')).toBe('');
  });

  it('holds trailing n as pending (ambiguous without following character)', () => {
    // trailing 'n' alone is held pending — caller must resolve with context
    expect(toHiraganaProgress('n')).toBe('');
    expect(toHiraganaProgress('kikimasen')).toBe('ききませ');
  });

  it('converts n followed by consonant to ん mid-word', () => {
    expect(toHiraganaProgress('kenko')).toBe('けんこ');
  });
});

describe('isAllKana', () => {
  it('returns true for pure hiragana', () => {
    expect(isAllKana('たべる')).toBe(true);
    expect(isAllKana('あいうえお')).toBe(true);
  });

  it('returns true for pure katakana', () => {
    expect(isAllKana('テスト')).toBe(true);
  });

  it('returns false for mixed content', () => {
    expect(isAllKana('食べる')).toBe(false);
    expect(isAllKana('taberu')).toBe(false);
    expect(isAllKana('た食べる')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isAllKana('')).toBe(false);
  });
});
