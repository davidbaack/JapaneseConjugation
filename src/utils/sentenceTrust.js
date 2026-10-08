import { conjugateItem, surfaceFormFor, wordKey } from './conjugator.js';
import { sentenceRowQualityIssue } from './sentenceQuality.js';

export const SENTENCE_REVIEW_VERSION = 1;
const SHA256_RE = /^[a-f0-9]{64}$/;
const KANA_RE = /^[぀-ヿ\s]*$/;

/** Review metadata is content approval, never a result inferred from regex checks. */
export function parseSentenceReview(modelOrObject) {
  let value = modelOrObject;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const review = value.review || value;
  return review &&
    typeof review === 'object' &&
    !Array.isArray(review) &&
    typeof review.status === 'string'
    ? review
    : null;
}

function reviewFor(value) {
  return parseSentenceReview(value?.review || value?.model);
}

function safeForm(build) {
  try {
    return String(build() || '');
  } catch {
    return '';
  }
}

function normalizedSegments(segments) {
  if (!Array.isArray(segments)) return null;
  return segments.map((segment) =>
    segment?.w === true
      ? { w: true }
      : { t: String(segment?.t || ''), r: String(segment?.r || '') },
  );
}

/**
 * Shared canonical input for Node tooling and browser WebCrypto. The exact
 * current dictionary meaning and engine output are included: a custom sense or
 * conjugator change cannot silently reuse approval for a different exercise.
 */
export function sentenceContentSerialization(word, type, value, review = reviewFor(value)) {
  return JSON.stringify([
    'sentence-review',
    review?.version,
    wordKey(word),
    String(type || ''),
    String(word?.dict || ''),
    String(word?.reading || ''),
    String(word?.group || ''),
    String(word?.meaning || ''),
    String(word?.exerciseMeaning || ''),
    safeForm(() => surfaceFormFor(word, type)),
    safeForm(() => conjugateItem(word, type)),
    String(value?.jaTemplate ?? value?.ja_template ?? ''),
    String(value?.en || ''),
    normalizedSegments(value?.segments),
    String(review?.sense || ''),
  ]);
}

export async function sha256Hex(text) {
  if (!globalThis.crypto?.subtle || !globalThis.TextEncoder) return null;
  try {
    const bytes = new globalThis.TextEncoder().encode(String(text));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new globalThis.Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  } catch {
    return null;
  }
}

export function hashSentenceContent(word, type, value, review = reviewFor(value)) {
  return sha256Hex(sentenceContentSerialization(word, type, value, review));
}

/** Structural and review-policy checks, kept separate from bilingual approval. */
export function sentenceReviewIssue(word, type, value) {
  if (!word?.dict || !word?.reading || !word?.group || !type) return 'missing-word-or-type';
  const review = reviewFor(value);
  if (review?.status !== 'accepted') return 'sentence-not-reviewed';
  if (review.version !== SENTENCE_REVIEW_VERSION) return 'sentence-review-version';
  if (typeof review.hash !== 'string' || !SHA256_RE.test(review.hash))
    return 'sentence-review-hash';
  if (typeof review.basis !== 'string' || !review.basis.trim()) return 'sentence-review-basis';
  if (typeof review.sense !== 'string' || !review.sense.trim()) return 'sentence-review-sense';
  const kana = safeForm(() => conjugateItem(word, type));
  if (!safeForm(() => surfaceFormFor(word, type)) || !kana) {
    return 'not-conjugatable';
  }
  if (!String(word.reading).trim() || !KANA_RE.test(String(word.reading))) {
    return 'non-kana-word-reading';
  }
  if (!KANA_RE.test(kana)) return 'non-kana-engine-answer';

  const template = value?.jaTemplate ?? value?.ja_template;
  if (typeof template !== 'string' || template.split('{w}').length !== 2) {
    return 'sentence-placeholder-count';
  }
  if (typeof value.en !== 'string' || !value.en.trim()) return 'missing-english';
  const segments = value.segments;
  if (!Array.isArray(segments) || !segments.length) return 'missing-segments';
  if (segments.filter((segment) => segment?.w === true).length !== 1) {
    return 'segment-placeholder-count';
  }
  for (const segment of segments) {
    if (!segment || typeof segment !== 'object' || Array.isArray(segment)) return 'invalid-segment';
    if (segment.w === true) {
      if ('t' in segment || 'r' in segment) return 'invalid-placeholder-segment';
    } else if (
      'w' in segment ||
      typeof segment.t !== 'string' ||
      typeof segment.r !== 'string' ||
      !KANA_RE.test(segment.r)
    ) {
      return 'invalid-segment';
    }
  }
  const reconstructed = segments.map((segment) => (segment.w ? '{w}' : segment.t)).join('');
  if (reconstructed !== template) return 'segments-mismatch';
  return sentenceRowQualityIssue({ en: value.en, type, jaTemplate: template });
}

export async function verifySentenceValue(word, type, value) {
  if (sentenceReviewIssue(word, type, value)) return false;
  const hash = await hashSentenceContent(word, type, value);
  return !!hash && hash === reviewFor(value).hash;
}
