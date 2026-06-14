import { wordKey } from './conjugator.js';
import { hydrateSentenceValue } from './sentencePrompt.js';

const BASE_URL = /** @type {any} */ (import.meta).env?.BASE_URL || '/';
const SENTENCE_CORPUS_BASE_URL = `${BASE_URL}data/sentences/`;
const SENTENCE_CORPUS_BY_TYPE_URL = `${SENTENCE_CORPUS_BASE_URL}by-type/`;
const SCHEMA_VERSION = 1;
const FALLBACK_VERSION = 'unversioned';

const typeCache = new Map();
let manifestPromise = null;

function validTypeId(type) {
  return /^[a-z0-9-]+$/.test(String(type || ''));
}

function rowValue(row) {
  if (!Array.isArray(row) || row.length < 4) return null;
  const [key, jaTemplate, en, segments] = row;
  if (!key || !jaTemplate || !Array.isArray(segments)) return null;
  return {
    key: String(key),
    value: {
      jaTemplate: String(jaTemplate),
      en: String(en || ''),
      segments,
    },
  };
}

function validManifest(manifest) {
  return (
    manifest?.schema === SCHEMA_VERSION &&
    Number.isFinite(manifest.totalRows) &&
    Number.isFinite(manifest.rawBytes) &&
    Number.isFinite(manifest.gzipBytes) &&
    Array.isArray(manifest.types)
  );
}

function manifestVersion(manifest) {
  if (!validManifest(manifest)) return FALLBACK_VERSION;
  return [
    manifest.schema,
    manifest.totalRows,
    manifest.rawBytes,
    manifest.gzipBytes,
    manifest.types.length,
  ].join('-');
}

async function loadManifest() {
  if (manifestPromise) return manifestPromise;

  manifestPromise = fetch(`${SENTENCE_CORPUS_BASE_URL}manifest.json`, { cache: 'no-cache' })
    .then(async (response) => {
      if (!response.ok) return null;
      const manifest = await response.json();
      return validManifest(manifest) ? manifest : null;
    })
    .catch(() => null);

  const manifest = await manifestPromise;
  if (!manifest) manifestPromise = null;
  return manifest;
}

function chunkUrl(type, version) {
  const suffix = version && version !== FALLBACK_VERSION ? `?v=${encodeURIComponent(version)}` : '';
  return `${SENTENCE_CORPUS_BY_TYPE_URL}${type}.json${suffix}`;
}

async function loadTypeCorpus(type) {
  if (!validTypeId(type) || typeof fetch !== 'function') return null;
  const version = manifestVersion(await loadManifest());
  const cacheKey = `${type}|${version}`;
  if (typeCache.has(cacheKey)) return typeCache.get(cacheKey);

  const promise = fetch(chunkUrl(type, version), { cache: 'force-cache' })
    .then(async (response) => {
      if (!response.ok) return null;
      const data = await response.json();
      if (data?.schema !== SCHEMA_VERSION || data?.type !== type || !Array.isArray(data.rows)) {
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
  return value ? hydrateSentenceValue(value, word, type, 'bundled') : null;
}

export function clearSentenceCorpusCache() {
  typeCache.clear();
  manifestPromise = null;
}
