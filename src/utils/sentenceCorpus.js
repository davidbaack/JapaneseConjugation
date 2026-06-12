import { wordKey } from './conjugator.js';
import { hydrateSentenceValue } from './sentencePrompt.js';

const BASE_URL = /** @type {any} */ (import.meta).env?.BASE_URL || '/';
const SENTENCE_CORPUS_BASE_URL = `${BASE_URL}data/sentences/by-type/`;
const SCHEMA_VERSION = 1;

const typeCache = new Map();

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

async function loadTypeCorpus(type) {
  if (!validTypeId(type) || typeof fetch !== 'function') return null;
  if (typeCache.has(type)) return typeCache.get(type);

  const promise = fetch(`${SENTENCE_CORPUS_BASE_URL}${type}.json`, { cache: 'force-cache' })
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

  typeCache.set(type, promise);
  const rows = await promise;
  if (!rows) typeCache.delete(type);
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
}
