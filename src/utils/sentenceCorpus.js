import { wordKey } from './conjugator.js';
import { hydrateSentenceValue } from './sentencePrompt.js';
import { parseSentenceReview, sha256Hex, verifySentenceValue } from './sentenceTrust.js';

const BASE_URL = /** @type {any} */ (import.meta).env?.BASE_URL || '/';
const SENTENCE_CORPUS_BASE_URL = `${BASE_URL}data/sentences/`;
const SENTENCE_CORPUS_BY_TYPE_URL = `${SENTENCE_CORPUS_BASE_URL}by-type/`;
const SCHEMA_VERSION = 2;
const MANIFEST_RECHECK_MS = 60_000;
const REVISION_RE = /^[a-f0-9]{64}$/;

const typeCache = new Map();
let manifestPromise = null;
let manifestLoadedAt = 0;
let manifestRevision = null;

function validTypeId(type) {
  return /^[a-z0-9-]+$/.test(String(type || ''));
}

function rowValue(row) {
  if (!Array.isArray(row) || row.length !== 5) return null;
  const [key, jaTemplate, en, segments, rawReview] = row;
  if (typeof key !== 'string' || !key || typeof jaTemplate !== 'string') return null;
  const review = parseSentenceReview(rawReview);
  return { key, value: { jaTemplate, en, segments, review } };
}

function validManifest(manifest) {
  if (
    manifest?.schema !== SCHEMA_VERSION ||
    !REVISION_RE.test(String(manifest.revision || '')) ||
    !Number.isFinite(manifest.totalRows) ||
    !Number.isFinite(manifest.rawBytes) ||
    !Number.isFinite(manifest.gzipBytes) ||
    !Array.isArray(manifest.types)
  ) {
    return false;
  }
  const seen = new Set();
  return manifest.types.every((entry) => {
    if (
      !validTypeId(entry?.type) ||
      seen.has(entry.type) ||
      entry.path !== `by-type/${entry.type}.json` ||
      !REVISION_RE.test(String(entry.revision || '')) ||
      !Number.isInteger(entry.count) ||
      entry.count < 0
    ) {
      return false;
    }
    seen.add(entry.type);
    return true;
  });
}

async function loadManifest() {
  if (typeof fetch !== 'function') return null;
  if (manifestPromise && Date.now() - manifestLoadedAt < MANIFEST_RECHECK_MS) {
    return manifestPromise;
  }
  manifestLoadedAt = Date.now();
  manifestPromise = fetch(`${SENTENCE_CORPUS_BASE_URL}manifest.json`, { cache: 'no-cache' })
    .then(async (response) => {
      if (!response.ok) return null;
      const manifest = await response.json();
      if (!validManifest(manifest)) return null;
      const revisions = [...manifest.types]
        .sort((a, b) => a.type.localeCompare(b.type))
        .map((entry) => [entry.type, entry.revision]);
      if ((await sha256Hex(JSON.stringify(revisions))) !== manifest.revision) return null;
      if (manifestRevision !== manifest.revision) {
        typeCache.clear();
        manifestRevision = manifest.revision;
      }
      return manifest;
    })
    .catch(() => null);

  const manifest = await manifestPromise;
  if (!manifest) manifestPromise = null;
  return manifest;
}

export async function getSentenceCorpusRevision() {
  return (await loadManifest())?.revision || null;
}

async function loadTypeCorpus(type) {
  if (!validTypeId(type)) return null;
  const manifest = await loadManifest();
  const typeEntry = manifest?.types.find((entry) => entry.type === type);
  if (!typeEntry) return null;
  const cacheKey = `${type}|${manifest.revision}|${typeEntry.revision}`;
  if (typeCache.has(cacheKey)) return typeCache.get(cacheKey);

  const promise = fetch(
    `${SENTENCE_CORPUS_BY_TYPE_URL}${type}.json?v=${encodeURIComponent(typeEntry.revision)}`,
    { cache: 'force-cache' },
  )
    .then(async (response) => {
      if (!response.ok) return null;
      const data = await response.json();
      if (
        data?.schema !== SCHEMA_VERSION ||
        data?.type !== type ||
        data?.revision !== typeEntry.revision ||
        !Array.isArray(data.rows) ||
        data.rows.length !== typeEntry.count ||
        (await sha256Hex(JSON.stringify(data.rows))) !== typeEntry.revision
      ) {
        return null;
      }
      const rows = new Map();
      for (const rawRow of data.rows) {
        const parsed = rowValue(rawRow);
        if (parsed) rows.set(parsed.key, parsed.value);
      }
      return rows;
    })
    .catch(() => null);

  typeCache.set(cacheKey, promise);
  const rows = await promise;
  if (!rows) typeCache.delete(cacheKey);
  return rows;
}

export async function fetchBundledSentence(word, type) {
  if (!word?.dict || !type) return null;
  const rows = await loadTypeCorpus(type);
  const value = rows?.get(wordKey(word));
  return value && (await verifySentenceValue(word, type, value))
    ? hydrateSentenceValue(value, word, type, 'bundled')
    : null;
}

export function clearSentenceCorpusCache() {
  typeCache.clear();
  manifestPromise = null;
  manifestLoadedAt = 0;
  manifestRevision = null;
}
