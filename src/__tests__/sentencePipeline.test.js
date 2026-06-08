import { describe, expect, it } from 'vitest';
import {
  buildPair,
  buildSegments,
  isKana,
  validateGenerated,
} from '../../scripts/sentencePipeline.js';

const TABERU = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };

// A valid Codex output for 食べる / plain-past: 今日、ごはんを食べた。
function validOut(overrides = {}) {
  return {
    word_key: 'ichidan:食べる',
    type: 'plain-past',
    ja: '今日、ごはんを食べた。',
    en: 'I ate a meal today.',
    segments: [
      { t: '今日', r: 'きょう' },
      { t: '、', r: '' },
      { t: 'ごはんを', r: 'ごはんを' },
      { w: true },
      { t: '。', r: '' },
    ],
    ...overrides,
  };
}

describe('isKana', () => {
  it('accepts kana and rejects kanji', () => {
    expect(isKana('きょう')).toBe(true);
    expect(isKana('')).toBe(true);
    expect(isKana('今日')).toBe(false);
  });
});

describe('buildPair', () => {
  it('builds a work item with engine-derived forms', () => {
    const pair = buildPair(TABERU, 'plain-past');
    expect(pair).toMatchObject({
      word_key: 'ichidan:食べる',
      type: 'plain-past',
      expected_surface: '食べた',
      expected_kana: 'たべた',
      type_label: expect.any(String),
      transitive: expect.any(String),
    });
  });

  it('returns null for a form the engine cannot produce', () => {
    // An adjective-only form is not conjugatable for a verb.
    expect(buildPair(TABERU, 'adj-plain-past')).toBeNull();
  });
});

describe('validateGenerated', () => {
  it('accepts a well-formed entry and builds the row', () => {
    const result = validateGenerated(TABERU, 'plain-past', validOut());
    expect(result.ok).toBe(true);
    expect(result.row).toMatchObject({
      word_key: 'ichidan:食べる',
      type: 'plain-past',
      surface: '食べた',
      ja_template: '今日、ごはんを{w}。',
      en: 'I ate a meal today.',
    });
    // Placeholder preserved; readings kept.
    expect(result.row.segments).toContainEqual({ w: true });
    expect(result.row.segments[0]).toEqual({ t: '今日', r: 'きょう' });
  });

  it('rejects when the conjugated surface is missing from the sentence', () => {
    const out = validOut({ ja: '今日、ごはんを食べる。', segments: validOut().segments });
    // segments still reconstruct to ...食べた..., which won't equal this ja.
    expect(validateGenerated(TABERU, 'plain-past', out)).toEqual({
      ok: false,
      reason: 'segments-mismatch',
    });
  });

  it('rejects a missing or multiple placeholder', () => {
    const noPlaceholder = validOut({ segments: [{ t: '今日', r: 'きょう' }] });
    expect(validateGenerated(TABERU, 'plain-past', noPlaceholder).reason).toBe('placeholder-count');
  });

  it('rejects non-kana readings', () => {
    const out = validOut({
      segments: [
        { t: '今日', r: 'today' },
        { t: '、', r: '' },
        { t: 'ごはんを', r: '' },
        { w: true },
        { t: '。', r: '' },
      ],
      ja: '今日、ごはんを食べた。',
    });
    expect(validateGenerated(TABERU, 'plain-past', out).reason).toBe('non-kana-reading');
  });

  it('rejects empty/garbage output', () => {
    expect(validateGenerated(TABERU, 'plain-past', null).reason).toBe('not-an-object');
    expect(validateGenerated(TABERU, 'plain-past', validOut({ en: '' })).reason).toBe('no-en');
  });
});

describe('buildSegments', () => {
  // Mimics kuromoji output (readings already converted to hiragana).
  const TOKENS = [
    { surface: '雨', reading: 'あめ' },
    { surface: 'の', reading: 'の' },
    { surface: '日', reading: 'ひ' },
    { surface: 'は', reading: 'は' },
    { surface: '、', reading: '' },
    { surface: 'たいてい', reading: 'たいてい' },
    { surface: '買わ', reading: 'かわ' },
    { surface: 'ない', reading: 'ない' },
    { surface: '。', reading: '' },
  ];

  it('collapses the multi-token conjugated run into one placeholder', () => {
    const result = buildSegments(TOKENS, '買わない');
    expect(result.ok).toBe(true);
    // Kanji tokens keep readings; kana tokens drop them; one {w:true}.
    expect(result.segments).toEqual([
      { t: '雨', r: 'あめ' },
      { t: 'の', r: '' },
      { t: '日', r: 'ひ' },
      { t: 'は', r: '' },
      { t: '、', r: '' },
      { t: 'たいてい', r: '' },
      { w: true },
      { t: '。', r: '' },
    ]);
  });

  it('produces segments that pass validateGenerated', () => {
    const KAU = { dict: '買う', reading: 'かう', meaning: 'to buy', group: 'godan' };
    const { segments } = buildSegments(TOKENS, '買わない');
    const result = validateGenerated(KAU, 'plain-negative', {
      ja: '雨の日は、たいてい買わない。',
      en: "On rainy days, I usually don't buy.",
      segments,
    });
    expect(result.ok).toBe(true);
    expect(result.row.ja_template).toBe('雨の日は、たいてい{w}。');
  });

  it('fails when the form is not aligned to token boundaries', () => {
    expect(buildSegments(TOKENS, '買う').ok).toBe(false);
    expect(buildSegments([], '買う').reason).toBe('no-tokens');
  });
});
