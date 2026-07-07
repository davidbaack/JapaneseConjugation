#!/usr/bin/env node
// Audit the checked-in bundled sentence corpus for hard quality issues and
// high-volume review signals.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  analyzeSentenceRows,
  formatSentenceQualityReport,
  rowsFromCorpusChunks,
} from './sentenceCorpusQuality.js';

export const DEFAULT_CORPUS_BY_TYPE_DIR = join('public', 'data', 'sentences', 'by-type');

export function loadBundledCorpusChunks(dir = DEFAULT_CORPUS_BY_TYPE_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
}

export function reportBundledSentenceCorpusQuality({ dir = DEFAULT_CORPUS_BY_TYPE_DIR } = {}) {
  const chunks = loadBundledCorpusChunks(dir);
  return analyzeSentenceRows(rowsFromCorpusChunks(chunks));
}

async function main() {
  const json = process.argv.includes('--json');
  const result = reportBundledSentenceCorpusQuality();
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatSentenceQualityReport(result));
  }
  if (result.hardIssueCount) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
