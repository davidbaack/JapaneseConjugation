#!/usr/bin/env node
// Publish only the exact reviewed corpus identities, with current-row CAS.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import {
  checkTeachingRepair,
  TEACHING_LEDGER_PATH,
  TEACHING_REPAIR_DIR,
} from './repair-teaching-corpus.js';
import { sourceRowSignature } from './review-sentence-corpus.js';
import { sha256, reviewProvenance } from './sentenceReview.js';
import { parseSentenceReview } from '../src/utils/sentenceTrust.js';

const PACKAGE_PATH = join(TEACHING_REPAIR_DIR, 'live-publication.json.gz');
const HISTORICAL_PACKAGE = 'tmp/sentence-trust-reviewed-2026-10-07-04/publication.json.gz';
const idFor = (row) => `${row.word_key}|${row.type}`;
const canonical = (value) =>
  JSON.stringify(value, (_key, part) =>
    part && typeof part === 'object' && !Array.isArray(part)
      ? Object.fromEntries(Object.entries(part).sort(([a], [b]) => a.localeCompare(b)))
      : part,
  );
const same = (a, b) => canonical(a) === canonical(b);

async function request(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Sentence publication credentials are unavailable');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    signal: globalThis.AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Sentence publication request HTTP ${response.status}`);
  return response.json();
}

async function readSelectedRows(records) {
  const byType = new Map();
  for (const record of records) {
    const [key, type] = record.id.split('|');
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(key);
  }
  const result = [];
  const requests = [];
  // Keep URLs bounded and never scan unrelated sentence or learner tables.
  for (const [type, keys] of byType)
    for (let start = 0; start < keys.length; start += 100) {
      const query = new globalThis.URLSearchParams({
        select: '*',
        type: `eq.${type}`,
        word_key: `in.(${keys
          .slice(start, start + 100)
          .map((key) => JSON.stringify(key))
          .join(',')})`,
        order: 'word_key.asc',
        limit: '1000',
      });
      requests.push(`sentences?${query}`);
    }
  for (let start = 0; start < requests.length; start += 4) {
    const pages = await Promise.all(
      requests.slice(start, start + 4).map((query) => request(query)),
    );
    for (const rows of pages) {
      if (!Array.isArray(rows)) throw new Error('Invalid selected sentence response');
      result.push(...rows);
    }
  }
  const map = new Map(result.map((row) => [idFor(row), row]));
  if (
    map.size !== records.length ||
    result.length !== records.length ||
    records.some((record) => !map.has(record.id))
  )
    throw new Error('Selected live rows are missing or duplicated; refusing resurrection');
  return map;
}

export function bindTeachingPublication(
  records,
  liveRows,
  corpusRows,
  historicalBaselines = new Map(),
) {
  return records.map((record) => {
    const source = liveRows.get(record.id);
    if (!source) throw new Error(`Concurrent sentence deletion: ${record.id}`);
    const review = parseSentenceReview(source.review || source.model);
    const baseline = [
      record.baseline.jaTemplate,
      record.baseline.en,
      record.baseline.segments,
      record.sourceReview,
      record.baseline.word.dict,
      record.baseline.word.reading,
      record.baseline.word.group,
      record.baseline.surface,
    ];
    const current = [
      source.ja_template,
      source.en,
      source.segments,
      review,
      source.dict,
      source.reading,
      source.group,
      source.surface,
    ];
    const published = corpusRows.get(record.id);
    const target =
      record.disposition === 'withheld'
        ? {
            ...source,
            dict: record.baseline.word.dict,
            reading: record.baseline.word.reading,
            group: record.baseline.word.group,
            surface: record.baseline.surface,
            ja_template: record.baseline.jaTemplate,
            en: record.baseline.en,
            segments: record.baseline.segments,
            review: {
              ...record.sourceReview,
              status: 'quarantined',
              basis: 'withheld-by-independent-editorial-review-2026-10-17',
            },
          }
        : {
            ...source,
            dict: record.target.word.dict,
            reading: record.target.word.reading,
            group: record.target.word.group,
            surface: record.target.surface,
            ja_template: published?.[1],
            en: published?.[2],
            segments: published?.[3],
            review: published?.[4],
          };
    if (record.disposition !== 'withheld' && !published)
      throw new Error(`Missing reviewed target: ${record.id}`);
    target.model = reviewProvenance(target.review);
    const expected = sourceRowSignature(source);
    const signature = sourceRowSignature(target);
    const provenanceReview = parseSentenceReview(source.model);
    const historical = historicalBaselines.get(record.id);
    const matchesHistorical =
      historical &&
      same(sourceRowSignature(historical), expected) &&
      same(parseSentenceReview(historical.review || historical.model), review) &&
      historical.model === source.model;
    if (
      (!same(current, baseline) || !same(provenanceReview, record.sourceReview)) &&
      !same(expected, signature) &&
      !matchesHistorical
    )
      throw new Error(`Concurrent sentence edit: ${record.id}`);
    // Timestamps/other server fields are not part of the mutation contract.
    const row = Object.fromEntries(
      [
        'word_key',
        'type',
        'dict',
        'reading',
        'group',
        'surface',
        'ja_template',
        'en',
        'segments',
        'review',
        'model',
      ].map((key) => [key, target[key]]),
    );
    return { row, expected, target: signature };
  });
}

function loadRecords() {
  return gunzipSync(readFileSync(TEACHING_LEDGER_PATH))
    .toString('utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

function loadCorpusRows() {
  const rows = new Map();
  const manifest = JSON.parse(readFileSync('public/data/sentences/manifest.json', 'utf8'));
  for (const entry of manifest.types) {
    const chunk = JSON.parse(readFileSync(join('public/data/sentences', entry.path), 'utf8'));
    for (const row of chunk.rows) rows.set(row[0] + '|' + chunk.type, row);
  }
  return rows;
}

function historicalSourceBaselines(records, liveRows, corpusRows) {
  const mismatches = [];
  for (const record of records) {
    try {
      bindTeachingPublication([record], liveRows, corpusRows);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('Concurrent sentence edit:'))
        throw error;
      mismatches.push(record);
    }
  }
  const baselines = new Map();
  if (!mismatches.length) return { baselines, publicationDigest: null };
  const verification = JSON.parse(
    readFileSync('data/sentence-reviews/2026-10-07-publication.json', 'utf8'),
  );
  const text = gunzipSync(readFileSync(HISTORICAL_PACKAGE)).toString('utf8');
  if (sha256(text) !== verification.publicationDigest)
    throw new Error('Historical publication archive digest mismatch');
  const archived = new Map(JSON.parse(text).map((row) => [idFor(row), row]));
  for (const record of mismatches) {
    const previous = archived.get(record.id);
    const current = liveRows.get(record.id);
    if (
      parseSentenceReview(previous?.review || previous?.model)?.status !== 'accepted' ||
      !same(sourceRowSignature(previous), sourceRowSignature(current)) ||
      !same(
        parseSentenceReview(previous.review || previous.model),
        parseSentenceReview(current.review || current.model),
      ) ||
      previous.model !== current.model
    )
      throw new Error(`Live row differs from every verified baseline: ${record.id}`);
    baselines.set(record.id, previous);
  }
  return { baselines, publicationDigest: verification.publicationDigest };
}

export function validateTeachingPublicationPackage(
  records,
  liveRows,
  corpusRows,
  items,
  historicalBaselines = new Map(),
) {
  const expected = new Map(
    bindTeachingPublication(records, liveRows, corpusRows, historicalBaselines).map((item) => [
      idFor(item.row),
      item,
    ]),
  );
  if (
    items.length !== records.length ||
    new Set(items.map((item) => idFor(item.row))).size !== records.length
  )
    throw new Error('Publication package does not cover the exact reviewed IDs');
  for (const item of items) {
    const fresh = expected.get(idFor(item.row));
    if (!fresh || !same(item.row, fresh.row) || !same(item.target, fresh.target))
      throw new Error(`Publication package differs from the editorial target: ${idFor(item.row)}`);
    const current = sourceRowSignature(liveRows.get(idFor(item.row)));
    if (!same(current, item.expected) && !same(current, fresh.target))
      throw new Error(`Concurrent sentence edit: ${idFor(item.row)}`);
  }
  return true;
}

export async function prepareTeachingPublication() {
  const verification = checkTeachingRepair();
  const records = loadRecords();
  const current = await readSelectedRows(records);
  const corpusRows = loadCorpusRows();
  const history = historicalSourceBaselines(records, current, corpusRows);
  const batch = bindTeachingPublication(records, current, corpusRows, history.baselines);
  const historicalEvidence = {
    sourcePublicationDigest: history.publicationDigest,
    baselines: [...history.baselines].map(([id, row]) => ({
      id,
      signature: sourceRowSignature(row),
      review: parseSentenceReview(row.review || row.model),
    })),
  };
  writeFileSync(
    join(TEACHING_REPAIR_DIR, 'historical-live-baselines.json'),
    JSON.stringify(historicalEvidence, null, 2) + '\n',
  );
  const payload = {
    schema: 1,
    preparedAtUtc: new Date().toISOString(),
    corpusRevision: verification.corpusRevision,
    ledgerGzipSha256: sha256(readFileSync(TEACHING_LEDGER_PATH)),
    rows: batch,
  };
  writeFileSync(PACKAGE_PATH, gzipSync(JSON.stringify(payload)));
  return {
    selectedRows: batch.length,
    accepted: records.filter((record) => record.disposition !== 'withheld').length,
    quarantined: records.filter((record) => record.disposition === 'withheld').length,
    historicalSourceRows: history.baselines.size,
    liveWrites: 0,
    corpusRevision: verification.corpusRevision,
  };
}

export async function publishTeachingPublication() {
  const verification = checkTeachingRepair();
  const payload = JSON.parse(gunzipSync(readFileSync(PACKAGE_PATH)).toString('utf8'));
  if (
    payload.corpusRevision !== verification.corpusRevision ||
    payload.ledgerGzipSha256 !== sha256(readFileSync(TEACHING_LEDGER_PATH))
  )
    throw new Error('Publication package is stale');
  const records = loadRecords();
  const before = await readSelectedRows(records);
  const corpusRows = loadCorpusRows();
  const history = historicalSourceBaselines(records, before, corpusRows);
  validateTeachingPublicationPackage(records, before, corpusRows, payload.rows, history.baselines);
  for (let start = 0; start < payload.rows.length; start += 250) {
    const batch = payload.rows.slice(start, start + 250);
    const count = await request('rpc/publish_reviewed_sentences', {
      method: 'POST',
      body: JSON.stringify({ batch }),
    });
    if (count !== batch.length) throw new Error('Atomic publication row count mismatch');
    writeFileSync(
      join(TEACHING_REPAIR_DIR, 'live-publication-progress.json'),
      JSON.stringify({
        corpusRevision: payload.corpusRevision,
        rows: Math.min(start + 250, payload.rows.length),
        total: payload.rows.length,
      }) + '\n',
    );
  }
  const after = await readSelectedRows(records);
  for (const item of payload.rows)
    if (!same(sourceRowSignature(after.get(idFor(item.row))), item.target))
      throw new Error(`Published sentence differs from reviewed target: ${idFor(item.row)}`);
  const result = {
    verifiedAtUtc: new Date().toISOString(),
    corpusRevision: payload.corpusRevision,
    selectedRows: payload.rows.length,
    packageSha256: sha256(readFileSync(PACKAGE_PATH)),
    unrelatedRowsWritten: 0,
  };
  writeFileSync(
    join(TEACHING_REPAIR_DIR, 'live-publication-verified.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--prepare', '--publish'].includes(args[0]))
    throw new Error('Usage: node scripts/publish-teaching-repair.js --prepare|--publish');
  console.log(
    JSON.stringify(
      args[0] === '--prepare'
        ? await prepareTeachingPublication()
        : await publishTeachingPublication(),
      null,
      2,
    ),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
