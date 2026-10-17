#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadSentenceWords } from './export-sentence-corpus.js';
import { sha256 } from './sentenceReview.js';
import { conjugateItem, surfaceFormFor, wordKey } from '../src/utils/conjugator.js';

export function checkLexicalTeachingReview() {
  const summary = JSON.parse(
    readFileSync('data/sentence-reviews/2026-10-17-lexical-repair.json', 'utf8'),
  );
  const text = gunzipSync(readFileSync(summary.ledgerPath)).toString('utf8');
  if (sha256(text) !== summary.ledgerSha256)
    throw new Error('Lexical review ledger digest mismatch');
  for (const source of summary.sources)
    if (sha256(readFileSync(source.path)) !== source.sha256)
      throw new Error(`Reviewed lexical source changed: ${source.path}`);
  const records = text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  if (records.length !== 2162 || new Set(records.map((record) => record.index)).size !== 2162)
    throw new Error('Original lexical review coverage mismatch');
  const words = new Map(loadSentenceWords().map((word) => [wordKey(word), word]));
  const covered = new Set();
  let unresolved = 0;
  for (const record of records) {
    if (
      sha256(JSON.stringify(record.source)) !== record.sourceSha256 ||
      !record.reviewer ||
      !record.decisions.length
    )
      throw new Error(`Invalid lexical review source: ${record.key}`);
    if (!record.target) continue;
    const word = words.get(wordKey(record.target));
    if (!word || Object.entries(record.target).some(([key, value]) => (word[key] || '') !== value))
      throw new Error(`Reviewed lexical identity changed: ${record.key}`);
    covered.add(wordKey(word));
    for (const form of record.changedForms)
      if (
        conjugateItem(word, form.type) !== form.after ||
        surfaceFormFor(word, form.type) !== form.surface
      )
        throw new Error(`Reviewed lexical form changed: ${record.key}|${form.type}`);
    const unchanged = Object.entries(record.target).every(
      ([key, value]) => (record.source[key] || '') === value,
    );
    if (
      unchanged &&
      !record.changedForms.length &&
      record.decisions.some(
        (decision) => decision.category === 'mandatory-lexical-form-or-display-repair',
      )
    )
      unresolved++;
  }
  if (covered.size !== words.size || unresolved)
    throw new Error('Current lexical identities have unresolved or uncovered teaching flags');
  return {
    originalLexicalIdentities: records.length,
    currentLexicalIdentities: words.size,
    unresolvedMandatoryFlags: unresolved,
    uncoveredCurrentIdentities: words.size - covered.size,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(checkLexicalTeachingReview(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
