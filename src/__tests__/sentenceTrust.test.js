import { createHash, webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as conjugator from '../utils/conjugator.js';
import {
  hashSentenceContent,
  parseSentenceReview,
  sentenceContentSerialization,
  sentenceReviewIssue,
  verifySentenceValue,
} from '../utils/sentenceTrust.js';

const WORD = { dict: '買う', reading: 'かう', meaning: 'to buy', group: 'godan' };
const TYPE = 'plain-past';

function reviewedValue(overrides = {}) {
  const value = {
    jaTemplate: '昼に{w}。',
    en: 'I bought it at noon.',
    segments: [{ t: '昼', r: 'ひる' }, { t: 'に', r: '' }, { w: true }, { t: '。', r: '' }],
    review: { status: 'accepted', version: 1, sense: 'to buy', basis: 'bilingual-fixture' },
    ...overrides,
  };
  value.review.hash = createHash('sha256')
    .update(sentenceContentSerialization(WORD, TYPE, value))
    .digest('hex');
  return value;
}

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('TextEncoder', TextEncoder);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('content-bound sentence review', () => {
  it('uses the same canonical content hash in browser and Node tooling', async () => {
    const value = reviewedValue();
    expect(await hashSentenceContent(WORD, TYPE, value)).toBe(value.review.hash);
    expect(sentenceReviewIssue(WORD, TYPE, value)).toBe('');
    expect(await verifySentenceValue(WORD, TYPE, value)).toBe(true);
  });

  it('parses direct reviews and the backwards-compatible database model envelope', () => {
    const review = reviewedValue().review;
    expect(parseSentenceReview(review)).toBe(review);
    expect(
      parseSentenceReview(JSON.stringify({ generator: 'codex-sentence-trust', review })),
    ).toEqual(review);
    expect(parseSentenceReview('old-generator-name')).toBeNull();
    expect(parseSentenceReview([])).toBeNull();
    expect(parseSentenceReview({ review: 'accepted' })).toBeNull();
  });

  it.each(['pending', 'needs-repair', 'unsuitable'])('rejects %s reviews', async (status) => {
    const value = reviewedValue();
    value.review.status = status;
    expect(await verifySentenceValue(WORD, TYPE, value)).toBe(false);
  });

  it.each([
    [
      'Japanese',
      (value) => {
        value.jaTemplate = '夜に{w}。';
        value.segments[0].t = '夜';
      },
    ],
    [
      'English',
      (value) => {
        value.en = 'I sold it at noon.';
      },
    ],
    [
      'reading segments',
      (value) => {
        value.segments[0].r = 'よる';
      },
    ],
    [
      'intended sense',
      (value) => {
        value.review.sense = 'to purchase a service';
      },
    ],
  ])('invalidates approval after changing %s', async (_name, change) => {
    const value = reviewedValue();
    change(value);
    expect(await verifySentenceValue(WORD, TYPE, value)).toBe(false);
  });

  it('invalidates approval after dictionary meaning, reading, or engine form changes', async () => {
    const value = reviewedValue();
    for (const changedWord of [
      { ...WORD, meaning: 'to keep a pet' },
      { ...WORD, exerciseMeaning: 'a different learner-facing sense' },
      { ...WORD, reading: 'こう' },
      { ...WORD, group: 'ichidan' },
    ]) {
      expect(await verifySentenceValue(changedWord, TYPE, value)).toBe(false);
    }
    expect(await verifySentenceValue(WORD, 'plain-negative', value)).toBe(false);
  });

  it('invalidates the same word and type after the conjugation engine changes its answer', async () => {
    const value = reviewedValue();
    const engine = vi.spyOn(conjugator, 'surfaceFormFor').mockReturnValue('買いました');
    expect(await verifySentenceValue(WORD, TYPE, value)).toBe(false);
    engine.mockRestore();
    expect(await verifySentenceValue(WORD, TYPE, value)).toBe(true);
  });

  it('rejects non-kana dictionary readings even with a matching signed content hash', async () => {
    const word = { ...WORD, reading: '買う' };
    const value = reviewedValue();
    value.review.hash = createHash('sha256')
      .update(sentenceContentSerialization(word, TYPE, value))
      .digest('hex');
    expect(sentenceReviewIssue(word, TYPE, value)).toBe('non-kana-word-reading');
    expect(await verifySentenceValue(word, TYPE, value)).toBe(false);
  });

  it('rejects non-kana engine answers even when the claimed approval hash matches', async () => {
    const value = reviewedValue();
    vi.spyOn(conjugator, 'conjugateItem').mockReturnValue('買った');
    value.review.hash = createHash('sha256')
      .update(sentenceContentSerialization(WORD, TYPE, value))
      .digest('hex');
    expect(sentenceReviewIssue(WORD, TYPE, value)).toBe('non-kana-engine-answer');
    expect(await verifySentenceValue(WORD, TYPE, value)).toBe(false);
  });

  it('rejects missing or obsolete review evidence and malformed digests', async () => {
    const cases = [
      { ...reviewedValue(), review: null },
      reviewedValue({ review: { status: 'accepted', version: 0, sense: 'to buy', basis: 'old' } }),
      reviewedValue({ review: { status: 'accepted', version: 1, sense: '', basis: 'review' } }),
      reviewedValue({ review: { status: 'accepted', version: 1, sense: 'to buy', basis: '' } }),
    ];
    const invalidHash = reviewedValue();
    invalidHash.review.hash = 'not-a-sha256';
    cases.push(invalidHash);
    for (const value of cases) {
      expect(await verifySentenceValue(WORD, TYPE, value)).toBe(false);
    }
  });

  it('rejects broken segment tiling even when somebody stamps it accepted', async () => {
    const value = reviewedValue({ segments: [{ w: true }] });
    expect(sentenceReviewIssue(WORD, TYPE, value)).toBe('segments-mismatch');
    expect(await verifySentenceValue(WORD, TYPE, value)).toBe(false);
  });

  it.each([
    { jaTemplate: '{w}と{w}。' },
    { segments: [{ w: true }, { w: true }] },
    { segments: [{ t: '昼に', r: 'noon' }, { w: true }, { t: '。', r: '' }] },
    {
      segments: [
        { t: '昼に', r: '' },
        { w: true, t: '買った' },
        { t: '。', r: '' },
      ],
    },
  ])('rejects malformed approved templates and ruby', async (overrides) => {
    expect(await verifySentenceValue(WORD, TYPE, reviewedValue(overrides))).toBe(false);
  });

  it('accepts database column names with the same exact serialization', async () => {
    const value = reviewedValue();
    const row = {
      ja_template: value.jaTemplate,
      en: value.en,
      segments: value.segments,
      model: JSON.stringify({ generator: 'codex-sentence-trust', review: value.review }),
    };
    expect(sentenceContentSerialization(WORD, TYPE, row)).toBe(
      sentenceContentSerialization(WORD, TYPE, value),
    );
    expect(await verifySentenceValue(WORD, TYPE, row)).toBe(true);
  });

  it('fails closed when cryptographic verification is unavailable', async () => {
    const value = reviewedValue();
    vi.stubGlobal('crypto', {});
    expect(await verifySentenceValue(WORD, TYPE, value)).toBe(false);
  });
});
