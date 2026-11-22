// Public sentence rows and cached rows share the same content-bound acceptance
// gate as bundled content. Unreviewed legacy rows remain unavailable.
import { getSupabaseConfig } from './supabase.js';
import { wordKey } from './conjugator.js';
import { readAICacheEntry, setAICache } from './storage.js';
import { retryWithBackoff } from './retry.js';
import { hydrateSentenceValue } from './sentencePrompt.js';
import { getSentenceCorpusRevision } from './sentenceCorpus.js';
import { withSentenceDeadline } from './sentenceDeadline.js';
import {
  SENTENCE_REVIEW_VERSION,
  parseSentenceReview,
  verifySentenceValue,
} from './sentenceTrust.js';

const CACHE_STORE = 'katachiya_ai_sentence_cache';
export const SHARED_SENTENCE_MAX_AGE_MS = 60_000;

function cacheKey(word, type, revision) {
  return `review-v${SENTENCE_REVIEW_VERSION}|${revision}|${wordKey(word)}|${type}`;
}

export async function fetchTailoredSentence(word, type) {
  if (!word?.dict || !type) return null;

  const revision = await getSentenceCorpusRevision();
  const key = revision ? cacheKey(word, type, revision) : '';
  const cached = key ? readAICacheEntry(CACHE_STORE, key, SHARED_SENTENCE_MAX_AGE_MS) : null;
  if (cached && (await verifySentenceValue(word, type, cached.v))) {
    const revalidateAfter = cached.ts + SHARED_SENTENCE_MAX_AGE_MS;
    if (Date.now() < revalidateAfter) {
      return { ...hydrateSentenceValue(cached.v, word, type, 'db'), revalidateAfter };
    }
  }

  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey || typeof fetch !== 'function') return null;

  let row;
  try {
    row = await withSentenceDeadline((signal) =>
      retryWithBackoff(
        async () => {
          const query = new globalThis.URLSearchParams({
            select: 'ja_template,segments,en,model,review',
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
            cache: 'no-store',
            signal,
          });
          if (!response.ok) {
            throw Object.assign(new Error(`Sentence library HTTP ${response.status}`), {
              status: response.status,
            });
          }
          const rows = await response.json();
          return Array.isArray(rows) ? rows[0] || null : null;
        },
        { signal },
      ),
    );
  } catch {
    // Network, RLS, and missing-table errors do not create negative cache hits.
    return null;
  }

  const value = {
    jaTemplate: row?.ja_template,
    segments: row?.segments,
    en: row?.en,
    review: parseSentenceReview(row?.review || row?.model),
  };
  const checkedAt = Date.now();
  if (!(await verifySentenceValue(word, type, value))) return null;

  if (key) setAICache(CACHE_STORE, key, value, checkedAt);
  return {
    ...hydrateSentenceValue(value, word, type, 'db'),
    revalidateAfter: checkedAt + SHARED_SENTENCE_MAX_AGE_MS,
  };
}
