// Runtime access to the tailored cloze sentence library (the public Supabase
// `sentences` table). Returns null whenever a tailored sentence is unavailable
// — Supabase unconfigured, offline, table miss, or any query error — so callers
// fall back to the offline generator (getOfflineTemplateSentence).
//
// The conjugated surface form is NEVER trusted to the database: it is always
// recomputed locally from the engine so it stays aligned with what the learner
// is actually being asked to produce.
import { supabase } from './supabase.js';
import { wordKey } from './conjugator.js';
import { getAICache, setAICache } from './storage.js';
import { retryWithBackoff } from './retry.js';
import { hydrateSentenceValue } from './sentencePrompt.js';

const CACHE_STORE = 'katachiya_ai_sentence_cache';

function cacheKey(word, type) {
  return `${wordKey(word)}|${type}`;
}

export async function fetchTailoredSentence(word, type) {
  if (!supabase || !word?.dict || !type) return null;

  const key = cacheKey(word, type);
  const cached = getAICache(CACHE_STORE, key);
  if (cached && typeof cached === 'object') return hydrateSentenceValue(cached, word, type, 'db');

  let row;
  try {
    row = await retryWithBackoff(async () => {
      const { data, error } = await supabase
        .from('sentences')
        .select('ja_template, segments, en')
        .eq('word_key', wordKey(word))
        .eq('type', type)
        .maybeSingle();
      if (error) throw error;
      return data;
    });
  } catch {
    // Network / RLS / missing-table errors: fall back silently, do not cache a
    // miss (the failure may be transient).
    return null;
  }

  if (!row?.ja_template || !Array.isArray(row.segments)) {
    return null;
  }

  const value = { jaTemplate: row.ja_template, segments: row.segments, en: row.en || '' };
  setAICache(CACHE_STORE, key, value);
  return hydrateSentenceValue(value, word, type, 'db');
}
