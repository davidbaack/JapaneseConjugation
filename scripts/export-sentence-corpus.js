#!/usr/bin/env node
// Export or verify the validated Supabase sentence table as chunked public JSON
// for offline Practice sentence prompts. Supabase access is read-only.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

import { inflateVerbRows, mergeBuiltInWords } from '../src/data/verbLexicon.js';
import { STARTER_ADJECTIVES, STARTER_VERBS } from '../src/data/starterWords.js';
import { ALL_CARD_TYPES } from '../src/data/conjugationTypes.js';
import { practiceTypesForItem } from '../src/utils/conjugator.js';
import { buildPair, englishQualityIssue } from './sentencePipeline.js';

export const CORPUS_SCHEMA_VERSION = 1;
export const DEFAULT_CORPUS_DIR = join('public', 'data', 'sentences');
const LEXICON_PATH = join('public', 'data', 'verb-lexicon.json');
const PAGE_SIZE = 1000;

function pairKey(pair) {
  return `${pair.word_key}|${pair.type}`;
}

function targetTypeIds() {
  return ALL_CARD_TYPES.map((type) => type.id);
}

function loadWords() {
  const data = JSON.parse(readFileSync(LEXICON_PATH, 'utf8'));
  const verbs = mergeBuiltInWords(inflateVerbRows(data.verbs || []), STARTER_VERBS);
  const adjectives = mergeBuiltInWords(inflateVerbRows(data.adjectives || []), STARTER_ADJECTIVES);
  return [...verbs, ...adjectives];
}

export function expectedSentencePairs(words, typeIds = targetTypeIds()) {
  const typeSet = new Set(typeIds);
  const pairs = [];
  for (const word of words) {
    const prefs = /** @type {any} */ ({ skipDuplicateForms: false });
    const applicable = practiceTypesForItem(word, typeIds, prefs)
      .map((type) => type.id)
      .filter((id) => typeSet.has(id));
    for (const type of applicable) {
      const pair = buildPair(word, type);
      if (pair) pairs.push({ word_key: pair.word_key, type: pair.type });
    }
  }
  return pairs.sort((a, b) => a.type.localeCompare(b.type) || a.word_key.localeCompare(b.word_key));
}

function normalizeDbRow(row) {
  if (!row || typeof row !== 'object') return null;
  const wordKey = String(row.word_key || '');
  const type = String(row.type || '');
  if (!wordKey || !type) return null;
  return {
    word_key: wordKey,
    type,
    ja_template: String(row.ja_template || ''),
    en: String(row.en || ''),
    segments: row.segments,
  };
}

export function buildCorpusChunks(expectedPairs, dbRows) {
  const expected = new Map(expectedPairs.map((pair) => [pairKey(pair), pair]));
  const seen = new Set();
  const stale = [];
  const invalid = [];
  const byType = new Map();

  for (const rawRow of dbRows) {
    const row = normalizeDbRow(rawRow);
    if (!row) {
      invalid.push({ key: '(unknown)', reason: 'missing-key' });
      continue;
    }
    const key = pairKey(row);
    if (!expected.has(key)) {
      stale.push(key);
      continue;
    }
    if (!row.ja_template || !Array.isArray(row.segments)) {
      invalid.push({ key, reason: !row.ja_template ? 'missing-template' : 'missing-segments' });
      continue;
    }
    const enIssue = englishQualityIssue(row.en, row.type);
    if (enIssue) {
      invalid.push({ key, reason: enIssue });
      continue;
    }
    if (!byType.has(row.type)) byType.set(row.type, []);
    byType.get(row.type).push([row.word_key, row.ja_template, row.en, row.segments]);
    seen.add(key);
  }

  const missing = [];
  for (const pair of expectedPairs) {
    const key = pairKey(pair);
    if (!seen.has(key)) missing.push(key);
  }

  const chunks = [...byType.entries()]
    .map(([type, rows]) => ({
      type,
      rows: rows.sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    }))
    .sort((a, b) => a.type.localeCompare(b.type));

  return { chunks, missing, stale, invalid };
}

function corpusChunkJson(chunk) {
  return `${JSON.stringify({ schema: CORPUS_SCHEMA_VERSION, type: chunk.type, rows: chunk.rows })}\n`;
}

function manifestJson(chunks, stats) {
  return `${JSON.stringify({
    schema: CORPUS_SCHEMA_VERSION,
    source: 'supabase.public.sentences',
    totalRows: stats.totalRows,
    rawBytes: stats.rawBytes,
    gzipBytes: stats.gzipBytes,
    types: chunks.map((chunk) => ({
      type: chunk.type,
      count: chunk.rows.length,
      path: `by-type/${chunk.type}.json`,
    })),
  })}\n`;
}

export function buildCorpusFileBodies(chunks) {
  const files = new Map();
  let rawBytes = 0;
  let gzipBytes = 0;
  for (const chunk of chunks) {
    const body = corpusChunkJson(chunk);
    rawBytes += Buffer.byteLength(body);
    gzipBytes += gzipSync(body).length;
    files.set(`by-type/${chunk.type}.json`, body);
  }

  const totalRows = chunks.reduce((sum, chunk) => sum + chunk.rows.length, 0);
  const manifest = manifestJson(chunks, { totalRows, rawBytes, gzipBytes });
  files.set('manifest.json', manifest);
  rawBytes += Buffer.byteLength(manifest);
  gzipBytes += gzipSync(manifest).length;

  return {
    files,
    stats: {
      totalRows,
      typeCount: chunks.length,
      rawBytes,
      gzipBytes,
    },
  };
}

export function resolveCorpusOutputDir(outDir = DEFAULT_CORPUS_DIR) {
  const resolved = resolve(outDir);
  const root = parse(resolved).root;
  const parent = dirname(resolved);
  if (resolved === root || parent === root || basename(resolved).toLowerCase() !== 'sentences') {
    throw new Error(
      `Unsafe sentence corpus output directory: ${outDir}. The output directory must end with a nested "sentences" folder.`,
    );
  }
  return resolved;
}

export function writeCorpusFiles(chunks, outDir = DEFAULT_CORPUS_DIR) {
  const safeOutDir = resolveCorpusOutputDir(outDir);
  const { files, stats } = buildCorpusFileBodies(chunks);
  rmSync(safeOutDir, { recursive: true, force: true });
  mkdirSync(safeOutDir, { recursive: true });

  for (const [relativePath, body] of files) {
    const filePath = join(safeOutDir, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, body);
  }

  return stats;
}

function listFilesRecursive(rootDir, relativeDir = '') {
  const dir = relativeDir ? join(rootDir, relativeDir) : rootDir;
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return listFilesRecursive(rootDir, relativePath);
    return entry.isFile() ? [relativePath] : [];
  });
}

export function checkCorpusFiles(chunks, outDir = DEFAULT_CORPUS_DIR) {
  const safeOutDir = resolveCorpusOutputDir(outDir);
  const { files, stats } = buildCorpusFileBodies(chunks);
  const expectedPaths = new Set(files.keys());
  const actualPaths = new Set(listFilesRecursive(safeOutDir));
  const missingFiles = [...expectedPaths].filter((path) => !actualPaths.has(path)).sort();
  const extraFiles = [...actualPaths].filter((path) => !expectedPaths.has(path)).sort();
  const changedFiles = [];

  for (const [relativePath, expectedBody] of files) {
    if (missingFiles.includes(relativePath)) continue;
    const actualBody = readFileSync(join(safeOutDir, relativePath), 'utf8');
    if (actualBody !== expectedBody) changedFiles.push(relativePath);
  }

  changedFiles.sort();
  return {
    ok: !missingFiles.length && !extraFiles.length && !changedFiles.length,
    ...stats,
    missingFiles,
    extraFiles,
    changedFiles,
    outDir,
  };
}

export async function fetchSentenceRowsFromSupabase({ url, key, typeIds = targetTypeIds() }) {
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const rows = [];
  for (const type of typeIds) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('sentences')
        .select('word_key, type, ja_template, segments, en')
        .eq('type', type)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

function sampleLines(values, limit = 8) {
  return values
    .slice(0, limit)
    .map((value) => `  - ${value}`)
    .join('\n');
}

export async function exportSentenceCorpus({
  outDir = process.env.SENTENCE_CORPUS_OUT_DIR || DEFAULT_CORPUS_DIR,
  url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY,
} = {}) {
  const typeIds = targetTypeIds();
  const expectedPairs = expectedSentencePairs(loadWords(), typeIds);
  const dbRows = await fetchSentenceRowsFromSupabase({ url, key, typeIds });
  const { chunks, missing, stale, invalid } = buildCorpusChunks(expectedPairs, dbRows);

  if (missing.length || invalid.length) {
    const details = [
      missing.length ? `${missing.length} missing expected pair(s):\n${sampleLines(missing)}` : '',
      invalid.length
        ? `${invalid.length} invalid expected row(s):\n${sampleLines(
            invalid.map((entry) => `${entry.key} (${entry.reason})`),
          )}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    throw new Error(`Cannot export complete offline sentence corpus.\n${details}`);
  }

  const stats = writeCorpusFiles(chunks, outDir);
  return {
    ...stats,
    expectedRows: expectedPairs.length,
    staleRowsIgnored: stale.length,
    outDir,
  };
}

export async function checkSentenceCorpus({
  outDir = process.env.SENTENCE_CORPUS_OUT_DIR || DEFAULT_CORPUS_DIR,
  url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY,
} = {}) {
  const typeIds = targetTypeIds();
  const expectedPairs = expectedSentencePairs(loadWords(), typeIds);
  const dbRows = await fetchSentenceRowsFromSupabase({ url, key, typeIds });
  const { chunks, missing, stale, invalid } = buildCorpusChunks(expectedPairs, dbRows);
  const result = checkCorpusFiles(chunks, outDir);
  return {
    ...result,
    ok: result.ok && !missing.length && !invalid.length,
    expectedRows: expectedPairs.length,
    staleRowsIgnored: stale.length,
    missingExpectedPairs: missing,
    invalidExpectedRows: invalid,
  };
}

function fmtBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function summaryLine(label, values) {
  if (!values?.length) return '';
  return `${label}: ${values.length}\n${sampleLines(values)}`;
}

export function formatCorpusCheckResult(result) {
  if (result.ok) {
    return [
      `Sentence corpus is fresh: ${result.totalRows} row(s) across ${result.typeCount} type file(s).`,
      `Corpus size: ${fmtBytes(result.rawBytes)} raw, ${fmtBytes(result.gzipBytes)} gzip.`,
      result.staleRowsIgnored ? `Ignored ${result.staleRowsIgnored} stale DB row(s).` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const invalidRows = (result.invalidExpectedRows || []).map(
    (entry) => `${entry.key} (${entry.reason})`,
  );
  return [
    'Sentence corpus is not fresh.',
    summaryLine('Missing expected DB pair(s)', result.missingExpectedPairs),
    summaryLine('Invalid expected DB row(s)', invalidRows),
    summaryLine('Missing exported file(s)', result.missingFiles),
    summaryLine('Extra exported file(s)', result.extraFiles),
    summaryLine('Changed exported file(s)', result.changedFiles),
    'Run `npm run sentences:export-corpus` after resolving any DB completeness issues.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function main() {
  if (process.argv.includes('--check')) {
    const result = await checkSentenceCorpus();
    const output = formatCorpusCheckResult(result);
    if (result.ok) {
      console.log(output);
    } else {
      console.error(output);
      process.exitCode = 1;
    }
    return;
  }

  const stats = await exportSentenceCorpus();
  console.log(
    `Exported ${stats.totalRows} sentence rows across ${stats.typeCount} type file(s) to ${stats.outDir}`,
  );
  console.log(`Ignored ${stats.staleRowsIgnored} stale DB row(s).`);
  console.log(`Corpus size: ${fmtBytes(stats.rawBytes)} raw, ${fmtBytes(stats.gzipBytes)} gzip.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
