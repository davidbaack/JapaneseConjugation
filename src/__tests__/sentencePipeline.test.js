import { describe, expect, it } from 'vitest';
import {
  buildPair,
  buildSegments,
  capTemplates,
  englishQualityIssue,
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
    const result = /** @type {any} */ (validateGenerated(TABERU, 'plain-past', validOut()));
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
    expect(/** @type {any} */ (validateGenerated(TABERU, 'plain-past', noPlaceholder)).reason).toBe(
      'placeholder-count',
    );
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
    expect(/** @type {any} */ (validateGenerated(TABERU, 'plain-past', out)).reason).toBe(
      'non-kana-reading',
    );
  });

  it('rejects empty/garbage output', () => {
    expect(/** @type {any} */ (validateGenerated(TABERU, 'plain-past', null)).reason).toBe(
      'not-an-object',
    );
    expect(
      /** @type {any} */ (validateGenerated(TABERU, 'plain-past', validOut({ en: '' }))).reason,
    ).toBe('no-en');
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
    const result = /** @type {any} */ (buildSegments(TOKENS, '買わない'));
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
    const { segments } = /** @type {any} */ (buildSegments(TOKENS, '買わない'));
    const result = /** @type {any} */ (
      validateGenerated(KAU, 'plain-negative', {
        ja: '雨の日は、たいてい買わない。',
        en: "On rainy days, I usually don't buy.",
        segments,
      })
    );
    expect(result.ok).toBe(true);
    expect(result.row.ja_template).toBe('雨の日は、たいてい{w}。');
  });

  it('fails when the form is not aligned to token boundaries', () => {
    expect(/** @type {any} */ (buildSegments(TOKENS, '買う')).ok).toBe(false);
    expect(/** @type {any} */ (buildSegments([], '買う')).reason).toBe('no-tokens');
  });
});

describe('englishQualityIssue', () => {
  it('accepts a genuine translation', () => {
    expect(englishQualityIssue("On rainy days, I usually don't buy.", 'plain-negative')).toBe('');
    expect(englishQualityIssue('I ate a meal today.', 'plain-past')).toBe('');
  });

  it('rejects the stub boilerplate pattern', () => {
    expect(
      englishQualityIssue(
        'A short practice sentence using 買う in the Plain Negative form.',
        'plain-negative',
      ),
    ).not.toBe('');
  });

  it('rejects English that contains Japanese', () => {
    expect(englishQualityIssue('I will 買う it.', 'plain-past')).toBe('en-not-english');
  });

  it('rejects English that names the grammar form', () => {
    expect(englishQualityIssue('This is the potential form of the verb.', 'potential')).toBe(
      'en-echoes-form',
    );
  });

  it('rejects empty or letterless text', () => {
    expect(englishQualityIssue('', 'plain-past')).toBe('no-en');
    expect(englishQualityIssue('!!! ???', 'plain-past')).toBe('en-not-english');
  });

  it('is enforced by validateGenerated', () => {
    const KAU = { dict: '買う', reading: 'かう', meaning: 'to buy', group: 'godan' };
    const { segments } = /** @type {any} */ (
      buildSegments(
        [
          { surface: '私', reading: 'わたし' },
          { surface: 'は', reading: '' },
          { surface: '買わない', reading: '' },
          { surface: '。', reading: '' },
        ],
        '買わない',
      )
    );
    const result = validateGenerated(KAU, 'plain-negative', {
      ja: '私は買わない。',
      en: 'A short practice sentence using 買う in the Plain Negative form.',
      segments,
    });
    expect(result.ok).toBe(false);
  });
});

describe('capTemplates', () => {
  const rows = [
    { ja_template: 'A{w}', word_key: 'w1' },
    { ja_template: 'A{w}', word_key: 'w2' },
    { ja_template: 'A{w}', word_key: 'w3' },
    { ja_template: 'B{w}', word_key: 'w4' },
  ];

  it('rejects rows beyond the per-template cap', () => {
    const { kept, rejected } = capTemplates(rows, 2);
    expect(kept).toHaveLength(3); // 2x A + 1x B
    expect(rejected).toHaveLength(1);
    expect(rejected[0].word_key).toBe('w3');
  });

  it('counts existing DB usage toward the cap', () => {
    const { kept, rejected } = capTemplates(rows, 2, { 'A{w}': 2 });
    expect(kept.map((r) => r.ja_template)).toEqual(['B{w}']);
    expect(rejected).toHaveLength(3);
  });

  it('is a no-op when disabled', () => {
    expect(capTemplates(rows, 0).rejected).toHaveLength(0);
  });
});
