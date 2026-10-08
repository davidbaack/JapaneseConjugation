import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  reportBundledSentenceCorpusQuality,
  loadBundledCorpusChunks,
} from '../../scripts/report-sentence-corpus-quality.js';
import { loadSentenceWordMap } from '../../scripts/sentenceEnglish.js';
import { buildReviewedSentence } from '../utils/reviewedSentenceFrames.js';
import { sha256 } from '../../scripts/sentenceReview.js';

describe('published sentence trust', () => {
  it('ships only structurally valid current content approvals', () => {
    const report = reportBundledSentenceCorpusQuality();
    expect(report.totalRows).toBeGreaterThan(0);
    expect(report.hardIssueCount).toBe(0);
    expect(report.trustIssueCount).toBe(0);
  });
  it('keeps approved profile compositions paired with their exact reviewed English and sense', () => {
    const words = loadSentenceWordMap();
    for (const chunk of loadBundledCorpusChunks())
      for (const [key, jaTemplate, en, , review] of chunk.rows) {
        if (review?.basis !== 'explicit-bilingual-profile-and-compatible-frame') continue;
        const expected = buildReviewedSentence(words.get(key), chunk.type);
        expect(expected, `${key}|${chunk.type}`).not.toBeNull();
        expect({ jaTemplate, en, sense: review.sense }).toEqual({
          jaTemplate: expected.jaTemplate,
          en: expected.en,
          sense: expected.sense,
        });
      }
  });
  it('accounts for every original pair without calling unreviewed content approved', () => {
    const summary = JSON.parse(
      readFileSync('data/sentence-reviews/2026-10-07-summary.json', 'utf8'),
    );
    const text = gunzipSync(
      readFileSync('data/sentence-reviews/2026-10-07-ledger.jsonl.gz'),
    ).toString('utf8');
    expect(sha256(text)).toBe(summary.ledgerDigest);
    const rows = text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(rows.length).toBe(summary.counts.expectedPairs + summary.counts.stale);
    expect(rows.filter((row) => row.status === 'accepted').length).toBe(summary.counts.accepted);
    expect(summary.humanEditorialReview).toBe(false);
    const unique = new Set(rows.map((row) => `${row.word_key}|${row.type}`));
    expect(unique.size).toBe(rows.length);
  });
});
