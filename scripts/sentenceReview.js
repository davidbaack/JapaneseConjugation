// @ts-check
// Node-side review evidence. Structural validation never grants semantic approval.
import { createHash } from 'node:crypto';
import {
  sentenceContentSerialization,
  sentenceReviewIssue,
  parseSentenceReview,
} from '../src/utils/sentenceTrust.js';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function reviewedContentHash(word, type, value, review) {
  return sha256(sentenceContentSerialization(word, type, value, review));
}

export function verifiedReview(word, type, value) {
  const review = parseSentenceReview(value.review || value.model);
  if (!review || sentenceReviewIssue(word, type, { ...value, review })) return null;
  return reviewedContentHash(word, type, value, review) === review.hash ? review : null;
}

export function reviewProvenance(review) {
  return JSON.stringify({ generator: 'codex-reviewed-paired-context-v1', review });
}
