#!/usr/bin/env node
// Source-bound editorial repair. Candidate generation is not semantic approval.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { loadSentenceWords, buildCorpusFileBodies } from './export-sentence-corpus.js';
import { deriveSentenceSegments } from './import-sentence-library.js';
import { sha256, reviewedContentHash, verifiedReview } from './sentenceReview.js';
import { buildReviewedSentence } from '../src/utils/reviewedSentenceFrames.js';
import { practiceTypesForItem, wordKey } from '../src/utils/conjugator.js';
import { SENTENCE_REVIEW_VERSION } from '../src/utils/sentenceTrust.js';
import { reviewedSentenceRestriction } from '../src/data/reviewedSentenceProfiles.js';

export const TEACHING_REPAIR_DIR = 'tmp/teaching-repair-2026-10-17';
export const TEACHING_LEDGER_PATH = 'data/sentence-reviews/2026-10-17-teaching-repair.jsonl.gz';
export const TEACHING_SUMMARY_PATH = 'data/sentence-reviews/2026-10-17-teaching-repair.json';
const HASH_POLICY = 'sentence-review-v2';
const BASE_REVISION = '2941ca5b6bd47a101c741bf6c7d78b3d8d9c086d459fd314ee79ab34d0932d37';
const CORPUS_DIR = 'public/data/sentences';
const CONTEXT_PATHS = [
  'public/data/verb-lexicon.json',
  'src/utils/conjugator.js',
  'src/utils/sentenceTrust.js',
  'src/data/reviewedSentenceProfiles.js',
  'src/utils/reviewedSentenceFrames.js',
  'scripts/import-sentence-library.js',
];
const contextSources = () =>
  CONTEXT_PATHS.map((path) => ({ path, sha256: sha256(readFileSync(path)) }));

const readGzip = (path) => JSON.parse(gunzipSync(readFileSync(path)).toString('utf8'));
const writeGzip = (path, value) => writeFileSync(path, gzipSync(JSON.stringify(value)));
const readLines = (path) =>
  readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

function identity(word) {
  return Object.fromEntries(
    ['dict', 'reading', 'group', 'meaning', 'exerciseMeaning'].map((key) => [key, word[key] || '']),
  );
}

function eligibleTypes(word, cache) {
  const key = wordKey(word);
  if (!cache.has(key)) {
    const prefs = /** @type {any} */ ({ skipDuplicateForms: false });
    cache.set(key, new Set(practiceTypesForItem(word, [], prefs).map((type) => type.id)));
  }
  return cache.get(key);
}

export function teachingTargetFingerprint(target) {
  return target
    ? sha256(
        JSON.stringify(target, (_key, value) =>
          value && typeof value === 'object' && !Array.isArray(value)
            ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
            : value,
        ),
      )
    : null;
}

function baselineTarget(source, audit) {
  return {
    word: identity(audit.word),
    type: source.type,
    surface: audit.target.surface,
    kana: audit.target.kana,
    jaTemplate: source.row[1],
    en: source.row[2],
    segments: source.row[3],
    sense: source.row[4].sense,
  };
}

export async function prepareTeachingCandidates(directory = TEACHING_REPAIR_DIR) {
  const source = readGzip(join(directory, 'baseline-corpus.json.gz'));
  const audit = new Map(
    readGzip(join(directory, 'baseline-audit.json.gz')).map((row) => [row.id, row]),
  );
  if (source.length !== 23075 || audit.size !== source.length)
    throw new Error('Incomplete frozen baseline');
  const words = new Map(loadSentenceWords().map((word) => [wordKey(word), word]));
  const eligibilityCache = new Map();
  const candidates = [];
  for (const original of source) {
    const prior = audit.get(original.id);
    if (!prior || sha256(JSON.stringify(original.row)) !== prior.rowSha256)
      throw new Error(`Original row binding changed: ${original.id}`);
    const word = words.get(original.row[0]);
    const eligible = word && eligibleTypes(word, eligibilityCache).has(original.type);
    const composition = eligible && buildReviewedSentence(word, original.type);
    /** @type {any} */
    let target = null;
    if (composition) {
      const readingRepair = prior.finalIssues.some((issue) => /reading|furigana/i.test(issue));
      const segments =
        composition.jaTemplate === original.row[1] && !readingRepair
          ? original.row[3]
          : await deriveSentenceSegments(
              composition.jaTemplate.replace('{w}', composition.surface),
              composition.surface,
            );
      if (!segments) throw new Error(`Cannot derive reviewed readings: ${original.id}`);
      target = {
        word: identity(word),
        type: original.type,
        surface: composition.surface,
        kana: composition.kana,
        jaTemplate: composition.jaTemplate,
        en: composition.en,
        segments,
        sense: composition.sense,
      };
    }
    const before = baselineTarget(original, prior);
    const targetFingerprint = teachingTargetFingerprint(target);
    const unchanged = targetFingerprint === teachingTargetFingerprint(before);
    candidates.push({
      id: original.id,
      rowSha256: prior.rowSha256,
      sourceReview: original.row[4],
      baseline: before,
      priorDecision: prior.finalDecision,
      priorDispositions: prior.issueDisposition,
      priorIssues: prior.finalIssues,
      priorReason: prior.finalReason,
      target,
      targetFingerprint,
      needsReview: !target || !unchanged || prior.finalDecision !== 'accept',
      automaticDisposition: !target
        ? 'withheld'
        : unchanged && prior.finalDecision === 'accept'
          ? 'retained'
          : null,
      unavailableReason: !word
        ? 'lexical identity removed from ordinary conjugation inventory'
        : !eligible
          ? 'word/form unavailable under corrected ordinary conjugation policy'
          : !composition
            ? reviewedSentenceRestriction(word, original.type) ||
              'context withheld by reviewed lexical/frame policy'
            : null,
    });
  }
  writeGzip(join(directory, 'candidates.json.gz'), candidates);
  writeFileSync(
    join(directory, 'candidate-sources.json'),
    JSON.stringify(
      {
        sources: contextSources(),
        candidatesSha256: sha256(readFileSync(join(directory, 'candidates.json.gz'))),
      },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(
    join(directory, 'candidate-review.jsonl'),
    candidates
      .filter((row) => row.needsReview)
      .map((row) => JSON.stringify(row))
      .join('\n') + '\n',
  );
  const counts = {
    originalPairs: candidates.length,
    priorAcceptsRetained: candidates.filter((row) => row.automaticDisposition === 'retained')
      .length,
    unavailable: candidates.filter((row) => !row.target).length,
    needsReview: candidates.filter((row) => row.needsReview).length,
  };
  writeFileSync(join(directory, 'candidate-summary.json'), JSON.stringify(counts, null, 2) + '\n');
  return counts;
}

/** Refuse partial, duplicated, stale, or unexplained editorial decisions. */
export function resolveTeachingCandidates(candidates, decisions) {
  const seen = new Set();
  const reviews = new Map();
  for (const review of decisions) {
    if (reviews.has(review.id)) throw new Error(`Duplicate editorial decision: ${review.id}`);
    if (
      !['accept', 'withhold'].includes(review.decision) ||
      !review.reason?.trim() ||
      !review.reviewer?.trim()
    )
      throw new Error(`Incomplete editorial decision: ${review.id}`);
    reviews.set(review.id, review);
  }
  const records = candidates.map((candidate) => {
    if (seen.has(candidate.id)) throw new Error(`Duplicate original pair: ${candidate.id}`);
    seen.add(candidate.id);
    const review = reviews.get(candidate.id);
    if (review && review.targetFingerprint !== candidate.targetFingerprint)
      throw new Error(`Editorial decision belongs to different content: ${candidate.id}`);
    if (candidate.needsReview && !review)
      throw new Error(`Missing editorial decision: ${candidate.id}`);
    if (!candidate.target && review?.decision === 'accept')
      throw new Error(`Cannot approve unavailable context: ${candidate.id}`);
    const disposition =
      !candidate.target || review?.decision === 'withhold'
        ? 'withheld'
        : candidate.automaticDisposition === 'retained'
          ? 'retained'
          : 'repaired';
    reviews.delete(candidate.id);
    return {
      ...candidate,
      disposition,
      review: review || {
        reviewer: 'source-bound-prior-exhaustive-ai-audit',
        decision: 'accept',
        targetFingerprint: candidate.targetFingerprint,
        reason: 'Exact prior accepted content and lexical identity are unchanged.',
      },
    };
  });
  if (reviews.size) throw new Error('Editorial decisions contain unknown original IDs');
  return records;
}

function reviewedRow(record) {
  const target = record.target;
  if (!target || record.disposition === 'withheld') return null;
  const review = {
    status: 'accepted',
    version: SENTENCE_REVIEW_VERSION,
    basis: 'independent-ai-editorial-repair-2026-10-17',
    sense: target.sense,
    hash: '',
  };
  const value = { jaTemplate: target.jaTemplate, en: target.en, segments: target.segments, review };
  review.hash = reviewedContentHash(target.word, target.type, value, review);
  if (!verifiedReview(target.word, target.type, value))
    throw new Error(`Invalid target review: ${record.id}`);
  return [wordKey(target.word), target.jaTemplate, target.en, target.segments, review];
}

export function applyTeachingRepair(directory = TEACHING_REPAIR_DIR) {
  const snapshot = JSON.parse(readFileSync(join(directory, 'candidate-sources.json'), 'utf8'));
  if (
    snapshot.candidatesSha256 !== sha256(readFileSync(join(directory, 'candidates.json.gz'))) ||
    JSON.stringify(snapshot.sources) !== JSON.stringify(contextSources())
  )
    throw new Error('Candidate sources changed; regenerate and review changed target fingerprints');
  const candidates = readGzip(join(directory, 'candidates.json.gz'));
  const records = resolveTeachingCandidates(
    candidates,
    readLines(join(directory, 'editorial-decisions.jsonl')),
  );
  const types = new Map();
  for (const record of records) {
    const type = record.baseline.type;
    if (!types.has(type)) types.set(type, []);
    const row = reviewedRow(record);
    if (row) types.get(type).push(row);
  }
  const chunks = [...types].map(([type, rows]) => ({
    type,
    rows: rows.sort((a, b) => a[0].localeCompare(b[0])),
  }));
  if (chunks.some((chunk) => !chunk.rows.length))
    throw new Error('Editorial repair would remove all coverage for a grammar form');
  const { files, stats } = buildCorpusFileBodies(chunks);
  const ledger =
    records
      .map((record) =>
        JSON.stringify({
          id: record.id,
          sourceRowSha256: record.rowSha256,
          sourceReview: record.sourceReview,
          priorDecision: record.priorDecision,
          priorDispositions: record.priorDispositions,
          priorIssues: record.priorIssues,
          priorReason: record.priorReason,
          baseline: record.baseline,
          target: record.target,
          targetFingerprint: record.targetFingerprint,
          disposition: record.disposition,
          reason: record.review.reason,
          reviewer: record.review.reviewer,
          targetReviewHash: reviewedRow(record)?.[4].hash || null,
        }),
      )
      .join('\n') + '\n';
  const summary = {
    schema: 1,
    createdAtUtc: new Date().toISOString(),
    hashPolicy: HASH_POLICY,
    metadataVersion: SENTENCE_REVIEW_VERSION,
    baselineCorpusRevision: BASE_REVISION,
    corpusRevision: JSON.parse(files.get('manifest.json')).revision,
    originalPairs: records.length,
    publishedPairs: stats.totalRows,
    grammarTypes: chunks.length,
    counts: Object.fromEntries(
      ['retained', 'repaired', 'withheld'].map((kind) => [
        kind,
        records.filter((row) => row.disposition === kind).length,
      ]),
    ),
    reviewMethod:
      'Source-bound prior exhaustive AI accepts plus independent review of every changed or previously flagged pair.',
    nativeSpeakerSignoff: false,
    ledgerSha256: sha256(ledger),
    contextSources: snapshot.sources,
  };
  for (const [path, body] of files) writeFileSync(join(CORPUS_DIR, path), body);
  mkdirSync('data/sentence-reviews', { recursive: true });
  writeFileSync(TEACHING_LEDGER_PATH, gzipSync(ledger));
  writeFileSync(TEACHING_SUMMARY_PATH, JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

export function checkTeachingRepair() {
  const summary = JSON.parse(readFileSync(TEACHING_SUMMARY_PATH, 'utf8'));
  const ledger = gunzipSync(readFileSync(TEACHING_LEDGER_PATH)).toString('utf8');
  if (sha256(ledger) !== summary.ledgerSha256) throw new Error('Editorial ledger digest mismatch');
  const records = ledger
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  if (records.length !== 23075 || new Set(records.map((row) => row.id)).size !== records.length)
    throw new Error('Original pair coverage mismatch');
  for (const source of summary.contextSources)
    if (sha256(readFileSync(source.path)) !== source.sha256)
      throw new Error(`Reviewed source changed: ${source.path}`);
  const manifest = JSON.parse(readFileSync(join(CORPUS_DIR, 'manifest.json'), 'utf8'));
  if (manifest.revision !== summary.corpusRevision)
    throw new Error('Reviewed corpus revision changed');
  const current = new Map();
  for (const entry of manifest.types) {
    const chunk = JSON.parse(readFileSync(join(CORPUS_DIR, entry.path), 'utf8'));
    for (const row of chunk.rows) {
      const id = row[0] + '|' + chunk.type;
      if (current.has(id)) throw new Error('Duplicate published pair');
      current.set(id, row);
    }
  }
  const words = new Map(loadSentenceWords().map((word) => [wordKey(word), word]));
  const eligibilityCache = new Map();
  for (const record of records) {
    const baselineKey = record.id.slice(0, record.id.lastIndexOf('|'));
    if (
      sha256(
        JSON.stringify([
          baselineKey,
          record.baseline.jaTemplate,
          record.baseline.en,
          record.baseline.segments,
          record.sourceReview,
        ]),
      ) !== record.sourceRowSha256
    )
      throw new Error(`Original row digest changed: ${record.id}`);
    if (!record.reason?.trim() || !record.reviewer?.trim())
      throw new Error(`Unexplained editorial disposition: ${record.id}`);
    const row = current.get(record.id);
    if (record.disposition === 'withheld') {
      if (row) throw new Error(`Withheld pair is still published: ${record.id}`);
      continue;
    }
    if (
      !row ||
      row[4].hash !== record.targetReviewHash ||
      teachingTargetFingerprint(record.target) !== record.targetFingerprint
    )
      throw new Error(`Reviewed pair content changed: ${record.id}`);
    const word = words.get(row[0]);
    const type = record.target.type;
    const composition = word && buildReviewedSentence(word, type);
    if (
      composition &&
      JSON.stringify([
        identity(word),
        composition.surface,
        composition.kana,
        composition.jaTemplate,
        composition.en,
        composition.sense,
      ]) !==
        JSON.stringify([
          record.target.word,
          record.target.surface,
          record.target.kana,
          record.target.jaTemplate,
          record.target.en,
          record.target.sense,
        ])
    )
      throw new Error(`Current composition differs from reviewed target: ${record.id}`);
    if (
      !composition ||
      !eligibleTypes(word, eligibilityCache).has(type) ||
      !verifiedReview(word, type, {
        jaTemplate: row[1],
        en: row[2],
        segments: row[3],
        review: row[4],
      })
    )
      throw new Error(`Published pair no longer eligible or approved: ${record.id}`);
    if (
      JSON.stringify([row[1], row[2], row[3], row[4].sense]) !==
      JSON.stringify([
        record.target.jaTemplate,
        record.target.en,
        record.target.segments,
        record.target.sense,
      ])
    )
      throw new Error(`Published row differs from editorial target: ${record.id}`);
    current.delete(record.id);
  }
  if (current.size) throw new Error('Corpus contains pairs without editorial resolution');
  return {
    originalPairs: records.length,
    publishedPairs: summary.publishedPairs,
    counts: summary.counts,
    corpusRevision: summary.corpusRevision,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--candidates', '--apply', '--check'].includes(args[0]))
    throw new Error('Usage: node scripts/repair-teaching-corpus.js --candidates|--apply|--check');
  const result =
    args[0] === '--candidates'
      ? await prepareTeachingCandidates()
      : args[0] === '--apply'
        ? applyTeachingRepair()
        : checkTeachingRepair();
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
