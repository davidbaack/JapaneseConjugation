#!/usr/bin/env node
// Audit the checked-in bundled sentence corpus for hard quality issues and
// high-volume review signals.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  analyzeSentenceRows,
  formatSentenceQualityReport,
  rowsFromCorpusChunks,
} from './sentenceCorpusQuality.js';
import { loadSentenceWordMap } from './sentenceEnglish.js';
import { sha256, verifiedReview } from './sentenceReview.js';
import { checkCorpusFiles } from './export-sentence-corpus.js';

export const DEFAULT_CORPUS_BY_TYPE_DIR = join('public', 'data', 'sentences', 'by-type');

export function loadBundledCorpusChunks(dir = DEFAULT_CORPUS_BY_TYPE_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
}

export function reportBundledSentenceCorpusQuality({ dir = DEFAULT_CORPUS_BY_TYPE_DIR } = {}) {
  const chunks = loadBundledCorpusChunks(dir);
  const result = analyzeSentenceRows(rowsFromCorpusChunks(chunks));
  const words = loadSentenceWordMap();
  let trustIssues = checkCorpusFiles(chunks, dirname(dir)).ok ? 0 : 1;
  for (const chunk of chunks) {
    if (chunk.schema !== 2 || chunk.revision !== sha256(JSON.stringify(chunk.rows))) trustIssues++;
    for (const [key, jaTemplate, en, segments, review] of chunk.rows) {
      const word = words.get(key);
      if (!word || !verifiedReview(word, chunk.type, { jaTemplate, en, segments, review }))
        trustIssues++;
    }
  }
  return {
    ...result,
    hardIssueCount: result.hardIssueCount + trustIssues,
    trustIssueCount: trustIssues,
    reviewedRows: result.totalRows,
  };
}

async function main() {
  const json = process.argv.includes('--json');
  const result = reportBundledSentenceCorpusQuality();
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatSentenceQualityReport(result));
    console.log(`Review/hash issues: ${result.trustIssueCount}`);
  }
  if (result.hardIssueCount) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
