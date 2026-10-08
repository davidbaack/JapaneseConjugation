// @ts-check
// Exhaustive audit + resumable publication. Approval comes from explicitly
// reviewed lexical profiles and paired bilingual frames, never a regex pass.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { wordKey, surfaceFormFor } from '../src/utils/conjugator.js';
import { sentenceRowQualityIssue } from '../src/utils/sentenceQuality.js';
import { buildReviewedSentence } from '../src/utils/reviewedSentenceFrames.js';
import { deriveSentenceSegments } from './import-sentence-library.js';
import { validateGenerated } from './sentencePipeline.js';
import { sha256, reviewedContentHash, reviewProvenance, verifiedReview } from './sentenceReview.js';
import { loadSentenceWords, expectedSentencePairs } from './export-sentence-corpus.js';
import { parseSentenceReview } from '../src/utils/sentenceTrust.js';
import { sentenceWordReview } from '../src/data/reviewedSentenceProfiles.js';

export function sourceRowHash(row) {
  return sha256(
    JSON.stringify(sourceRowSignature(row), (_key, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, value[key]]),
          )
        : value,
    ),
  );
}

function legacySourceRowHash(row) {
  return sha256(JSON.stringify(sourceRowSignature(row)));
}

export function sourceRowSignature(row) {
  const review = parseSentenceReview(row.review || row.model);
  return [
    row.word_key,
    row.type,
    row.dict || '',
    row.reading || '',
    row.group || '',
    row.surface || '',
    row.ja_template,
    row.en,
    row.segments,
    row.model || '',
    review
      ? [review.status, review.version, review.hash || '', review.basis || '', review.sense || '']
      : null,
  ];
}

function concreteMismatch(row) {
  const issue = sentenceRowQualityIssue({
    en: row.en,
    type: row.type,
    jaTemplate: row.ja_template,
  });
  if (issue) return issue;
  if (/服は\{w\}/u.test(row.ja_template) && /\b(?:the|my|this|that) plan\b/i.test(row.en))
    return 'japanese-clothes-english-plan';
  return '';
}

async function serviceRequest(query, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(
        `${url}/rest/v1/${query.startsWith('rpc/') ? query : `sentences${query}`}`,
        {
          ...options,
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
          signal: globalThis.AbortSignal.timeout(30000),
        },
      );
      if (!response.ok) throw new Error(`Sentence table request failed: HTTP ${response.status}`);
      const body = await response.text();
      return body ? JSON.parse(body) : null;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250 * (attempt + 1)));
    }
  }
}

export async function snapshotSentenceTable() {
  const result = [];
  let cursor = null;
  for (;;) {
    const query = new globalThis.URLSearchParams({
      select: '*',
      order: 'word_key.asc,type.asc',
      limit: '1000',
    });
    if (cursor) {
      const key = JSON.stringify(cursor.word_key);
      const type = JSON.stringify(cursor.type);
      query.set('or', `(word_key.gt.${key},and(word_key.eq.${key},type.gt.${type}))`);
    }
    const page = await serviceRequest(`?${query}`);
    if (!Array.isArray(page)) throw new Error('Invalid sentence snapshot response');
    result.push(...page);
    if (page.length < 1000) break;
    const next = page[page.length - 1];
    if (
      !next?.word_key ||
      !next?.type ||
      (cursor && next.word_key === cursor.word_key && next.type === cursor.type)
    )
      throw new Error('Sentence snapshot cursor did not advance');
    cursor = next;
    if (result.length % 20000 === 0) console.log(`Read ${result.length} source rows.`);
  }
  return result;
}

export async function prepareSentenceReview(sourceRows, outDir, words = loadSentenceWords()) {
  if (
    ['summary.json', 'source-backup.json.gz', 'publication.json.gz', 'ledger.jsonl.gz'].some(
      (name) => existsSync(join(outDir, name)),
    )
  )
    throw new Error('Review package already exists; use a new output directory.');
  mkdirSync(outDir, { recursive: true });
  // This immutable snapshot precedes every content or provenance mutation.
  writeFileSync(join(outDir, 'source-backup.json.gz'), gzipSync(JSON.stringify(sourceRows)), {
    flag: 'wx',
  });
  const wordMap = new Map(words.map((word) => [wordKey(word), word]));
  const expected = expectedSentencePairs(words);
  const sourceMap = new Map(sourceRows.map((row) => [`${row.word_key}|${row.type}`, row]));
  if (sourceMap.size !== sourceRows.length) throw new Error('Duplicate source word/form pairs.');
  const records = [];
  const rows = [];
  const counts = {
    sourceRows: sourceRows.length,
    expectedPairs: expected.length,
    accepted: 0,
    repaired: 0,
    retained: 0,
    needsReview: 0,
    unsuitable: 0,
    stale: 0,
    concreteSourceIssues: 0,
  };
  const byType = {};
  for (const pair of expected) {
    const id = `${pair.word_key}|${pair.type}`;
    const original = sourceMap.get(id);
    const word = wordMap.get(pair.word_key);
    const wordReview = sentenceWordReview(word);
    const proposed = buildReviewedSentence(word, pair.type);
    const issue = original ? concreteMismatch(original) : '';
    if (issue) counts.concreteSourceIssues++;
    let replacement = null;
    if (proposed) {
      const ja = proposed.jaTemplate.replace('{w}', surfaceFormFor(word, pair.type));
      const segments = await deriveSentenceSegments(ja, surfaceFormFor(word, pair.type));
      const result = validateGenerated(word, pair.type, { ja, en: proposed.en, segments });
      if (!result.ok) throw new Error(`Reviewed profile/frame invalid for ${id}: ${result.reason}`);
      const review = {
        status: 'accepted',
        version: 1,
        basis: proposed.basis,
        sense: proposed.sense,
        hash: '',
      };
      review.hash = reviewedContentHash(word, pair.type, result.row, review);
      replacement = { ...result.row, model: reviewProvenance(review), review };
      if (!verifiedReview(word, pair.type, replacement))
        throw new Error(`Review hash verification failed: ${id}`);
      counts.accepted++;
      if (original?.ja_template === replacement.ja_template && original?.en === replacement.en)
        counts.retained++;
      else counts.repaired++;
    } else if (issue || wordReview.status === 'unsuitable') counts.unsuitable++;
    else counts.needsReview++;
    const unavailableReason =
      issue ||
      (wordReview.status === 'supported' ? 'form-not-approved-for-this-sense' : wordReview.reason);
    const status = replacement
      ? 'accepted'
      : issue || wordReview.status === 'unsuitable'
        ? 'unsuitable'
        : 'pending';
    const pendingReview = {
      status,
      version: 1,
      basis: unavailableReason,
    };
    const row =
      replacement ||
      (original
        ? { ...original, model: reviewProvenance(pendingReview), review: pendingReview }
        : null);
    if (row) rows.push(row);
    records.push({
      word_key: pair.word_key,
      type: pair.type,
      sourceHash: original ? sourceRowHash(original) : null,
      sourceAssessment: issue || 'unreviewed-source',
      status: replacement ? 'accepted' : status === 'pending' ? 'needs-review' : 'unsuitable',
      disposition: replacement ? 'reviewed-pair' : 'quarantined',
      reviewedHash: replacement ? JSON.parse(replacement.model).review.hash : null,
      basis: replacement ? proposed?.basis : unavailableReason,
    });
    byType[pair.type] ||= { accepted: 0, unavailable: 0 };
    byType[pair.type][replacement ? 'accepted' : 'unavailable']++;
    sourceMap.delete(id);
    if (records.length % 10000 === 0)
      console.log(`Classified ${records.length}/${expected.length}: ${counts.accepted} approved.`);
  }
  for (const row of sourceMap.values()) {
    counts.stale++;
    const review = { status: 'quarantined', version: 1, basis: 'not-in-current-word-form-matrix' };
    rows.push({ ...row, model: reviewProvenance(review), review });
    records.push({
      word_key: row.word_key,
      type: row.type,
      sourceHash: sourceRowHash(row),
      status: 'unsuitable',
      disposition: 'quarantined',
      reviewedHash: null,
      basis: 'not-in-current-word-form-matrix',
    });
  }
  const ledger = records.map((row) => JSON.stringify(row)).join('\n') + '\n';
  const packageRows = JSON.stringify(rows);
  const summary = {
    sourceHashVersion: 2,
    policyVersion: 1,
    createdAt: new Date().toISOString(),
    reviewMethod:
      'explicit-lexical-sense-and-paired-frame-review; automated exhaustive composition verification',
    humanEditorialReview: false,
    counts,
    wordReview: words.reduce((acc, word) => {
      const status = sentenceWordReview(word).status;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {}),
    byType,
    sourceDigest: sha256(JSON.stringify(sourceRows.map(sourceRowHash).sort())),
    ledgerDigest: sha256(ledger),
    publicationDigest: sha256(packageRows),
  };
  writeFileSync(join(outDir, 'ledger.jsonl.gz'), gzipSync(ledger));
  writeFileSync(join(outDir, 'publication.json.gz'), gzipSync(packageRows));
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

function readReviewPackage(outDir) {
  const summary = JSON.parse(readFileSync(join(outDir, 'summary.json'), 'utf8'));
  const text = gunzipSync(readFileSync(join(outDir, 'publication.json.gz'))).toString('utf8');
  if (sha256(text) !== summary.publicationDigest)
    throw new Error('Review publication package digest mismatch');
  const rows = JSON.parse(text);
  const original = JSON.parse(
    gunzipSync(readFileSync(join(outDir, 'source-backup.json.gz'))).toString('utf8'),
  );
  const sourceHash = summary.sourceHashVersion === 2 ? sourceRowHash : legacySourceRowHash;
  if (sha256(JSON.stringify(original.map(sourceHash).sort())) !== summary.sourceDigest)
    throw new Error('Source backup digest mismatch');
  const ledger = gunzipSync(readFileSync(join(outDir, 'ledger.jsonl.gz'))).toString('utf8');
  if (sha256(ledger) !== summary.ledgerDigest) throw new Error('Review ledger digest mismatch');
  return { summary, rows, original };
}

export async function verifySentencePublication(outDir) {
  const { summary, rows } = readReviewPackage(outDir);
  const words = new Map(loadSentenceWords().map((word) => [wordKey(word), word]));
  for (const row of rows)
    if (
      row.review?.status === 'accepted' &&
      !verifiedReview(words.get(row.word_key), row.type, row)
    )
      throw new Error(
        `Stale approval during publication verification: ${row.word_key}|${row.type}`,
      );
  const targetHashes = new Map(
    rows.map((row) => [`${row.word_key}|${row.type}`, sourceRowHash(row)]),
  );
  const published = await snapshotSentenceTable();
  const publishedKeys = new Set(published.map((row) => `${row.word_key}|${row.type}`));
  if (
    targetHashes.size !== rows.length ||
    publishedKeys.size !== rows.length ||
    [...targetHashes.keys()].some((key) => !publishedKeys.has(key)) ||
    published.length !== rows.length ||
    published.some((row) => sourceRowHash(row) !== targetHashes.get(`${row.word_key}|${row.type}`))
  )
    throw new Error('Published sentence table did not match reviewed package');
  writeFileSync(
    join(outDir, 'publication-verified.json'),
    JSON.stringify({
      verifiedAt: new Date().toISOString(),
      rows: published.length,
      digest: summary.publicationDigest,
      verificationHashVersion: 2,
    }) + '\n',
  );
  return summary;
}

export async function publishSentenceReview(outDir) {
  const { summary, rows, original } = readReviewPackage(outDir);
  const current = await snapshotSentenceTable();
  const previousHashes = new Map(
    original.map((row) => [`${row.word_key}|${row.type}`, sourceRowHash(row)]),
  );
  const previousRows = new Map(original.map((row) => [`${row.word_key}|${row.type}`, row]));
  const targetHashes = new Map(
    rows.map((row) => [`${row.word_key}|${row.type}`, sourceRowHash(row)]),
  );
  const currentKeys = new Set(current.map((row) => `${row.word_key}|${row.type}`));
  for (const id of previousHashes.keys())
    if (!currentKeys.has(id))
      throw new Error(`Concurrent sentence deletion; refusing resurrection: ${id}`);
  for (const row of current) {
    const id = `${row.word_key}|${row.type}`;
    if (
      sourceRowHash(row) !== previousHashes.get(id) &&
      sourceRowHash(row) !== targetHashes.get(id)
    )
      throw new Error(`Concurrent sentence edit; refusing overwrite: ${id}`);
  }
  const words = new Map(loadSentenceWords().map((word) => [wordKey(word), word]));
  for (const row of rows) {
    const review = JSON.parse(row.model).review;
    if (review.status === 'accepted' && !verifiedReview(words.get(row.word_key), row.type, row))
      throw new Error(`Stale approval before publication: ${row.word_key}|${row.type}`);
  }
  for (let offset = 0; offset < rows.length; offset += 500) {
    // Deliberately omit created_at/updated_at so retries retain stable evidence.
    const batch = rows.slice(offset, offset + 500).map((row) => ({
      row,
      expected: previousRows.has(`${row.word_key}|${row.type}`)
        ? sourceRowSignature(previousRows.get(`${row.word_key}|${row.type}`))
        : null,
      target: sourceRowSignature(row),
    }));
    const publishedCount = await serviceRequest('rpc/publish_reviewed_sentences', {
      method: 'POST',
      body: JSON.stringify({ batch }),
    });
    if (publishedCount !== batch.length)
      throw new Error('Atomic sentence publication count mismatch');
    writeFileSync(
      join(outDir, 'publication-progress.json'),
      JSON.stringify({
        rows: Math.min(offset + 500, rows.length),
        digest: summary.publicationDigest,
      }) + '\n',
    );
    if (offset % 10000 === 0)
      console.log(`Published ${Math.min(offset + 500, rows.length)}/${rows.length} rows.`);
  }
  return verifySentencePublication(outDir);
}

async function main() {
  const outFlag = process.argv.indexOf('--out');
  const outDir = resolve(
    outFlag >= 0 ? process.argv[outFlag + 1] : join('tmp', 'sentence-trust-review'),
  );
  if (process.argv.includes('--verify')) {
    const summary = await verifySentencePublication(outDir);
    console.log(
      JSON.stringify({
        verified: summary.counts.sourceRows,
        accepted: summary.counts.accepted,
        outDir,
      }),
    );
    return;
  }
  if (process.argv.includes('--publish')) {
    console.log(JSON.stringify(await publishSentenceReview(outDir), null, 2));
    return;
  }
  const inputFlag = process.argv.indexOf('--from');
  const rows =
    inputFlag >= 0
      ? JSON.parse(gunzipSync(readFileSync(process.argv[inputFlag + 1])).toString('utf8'))
      : await snapshotSentenceTable();
  console.log(JSON.stringify(await prepareSentenceReview(rows, outDir), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
