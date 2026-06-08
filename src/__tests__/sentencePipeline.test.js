import { describe, expect, it } from 'vitest';
import { buildPair, isKana, validateGenerated } from '../../scripts/sentencePipeline.js';

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
