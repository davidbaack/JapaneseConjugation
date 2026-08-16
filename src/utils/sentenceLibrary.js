// Runtime access to the tailored cloze sentence library (the public Supabase
// `sentences` table). Returns null whenever a tailored sentence is unavailable
// — Supabase unconfigured, offline, table miss, or any query error — so callers
// fall back to the offline generator (getOfflineTemplateSentence).
//
// The conjugated surface form is NEVER trusted to the database: it is always
// recomputed locally from the engine so it stays aligned with what the learner
// is actually being asked to produce.
import { getSupabaseConfig } from './supabase.js';
import { wordKey } from './conjugator.js';
import { getAICache, setAICache } from './storage.js';
import { retryWithBackoff } from './retry.js';
import { hydrateSentenceValue } from './sentencePrompt.js';
import { sentenceRowQualityIssue } from './sentenceQuality.js';

const CACHE_STORE = 'katachiya_ai_sentence_cache';

function cacheKey(word, type) {
  return `${wordKey(word)}|${type}`;
}

export async function fetchTailoredSentence(word, type) {
  if (!word?.dict || !type) return null;

  const key = cacheKey(word, type);
  const cached = getAICache(CACHE_STORE, key);
  if (cached && typeof cached === 'object') {
    if (!sentenceRowQualityIssue({ en: cached.en, type, jaTemplate: cached.jaTemplate })) {
      return hydrateSentenceValue(cached, word, type, 'db');
    }
  }

  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey || typeof fetch !== 'function') return null;

  let row;
  try {
    row = await retryWithBackoff(async () => {
      const query = new globalThis.URLSearchParams({
        select: 'ja_template,segments,en',
        word_key: `eq.${wordKey(word)}`,
        type: `eq.${type}`,
        limit: '1',
      });
      const response = await fetch(`${url}/rest/v1/sentences?${query}`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        throw Object.assign(new Error(`Sentence library HTTP ${response.status}`), {
          status: response.status,
        });
      }
      const rows = await response.json();
      return Array.isArray(rows) ? rows[0] || null : null;
    });
  } catch {
    // Network / RLS / missing-table errors: fall back silently, do not cache a
    // miss (the failure may be transient).
    return null;
  }

  if (!row?.ja_template || !Array.isArray(row.segments)) {
    return null;
  }
  if (sentenceRowQualityIssue({ en: row.en, type, jaTemplate: row.ja_template })) {
    return null;
  }

  const value = { jaTemplate: row.ja_template, segments: row.segments, en: row.en || '' };
  setAICache(CACHE_STORE, key, value);
  return hydrateSentenceValue(value, word, type, 'db');
}
