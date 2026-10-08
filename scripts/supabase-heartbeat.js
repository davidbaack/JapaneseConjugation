// Read-only public-data health check; no service-role credentials are needed.
import { pathToFileURL } from 'node:url';
import { loadSentenceWordMap } from './sentenceEnglish.js';
import { verifiedReview } from './sentenceReview.js';

export function validateHeartbeatRows(rows, words) {
  if (!Array.isArray(rows) || rows.length !== 1)
    throw new Error('Expected exactly one public sentence row.');
  const row = rows[0];
  if (
    !row ||
    typeof row.word_key !== 'string' ||
    !row.word_key.trim() ||
    typeof row.type !== 'string' ||
    !row.type.trim()
  )
    throw new Error('Public sentence identity is missing or malformed.');
  const word = words.get(row.word_key);
  if (
    !word ||
    !verifiedReview(word, row.type, {
      jaTemplate: row.ja_template,
      en: row.en,
      segments: row.segments,
      review: row.review,
    })
  )
    throw new Error('Public sentence does not have valid content-bound approval.');
  return `${row.word_key}|${row.type}`;
}

export async function runHeartbeat({
  url = process.env.SUPABASE_URL,
  anonKey = process.env.SUPABASE_ANON_KEY,
  fetchImpl = fetch,
  words = loadSentenceWordMap(),
  attempts = 3,
  retryDelayMs = 1000,
  timeoutMs = 15000,
  report = console.log,
} = {}) {
  if (!url || !anonKey) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required.');
  const seen = new Set();
  for (let offset = 0; offset < 3; offset += 1) {
    let failure = 'No approved row.';
    let identity;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const endpoint = new URL('/rest/v1/sentences', url);
        endpoint.search = new globalThis.URLSearchParams({
          select: 'word_key,type,ja_template,en,segments,review',
          order: 'word_key.asc,type.asc',
          limit: '1',
          offset: String(offset),
        }).toString();
        let response;
        try {
          response = await fetchImpl(endpoint, {
            headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
            signal: globalThis.AbortSignal.timeout(timeoutMs),
          });
        } catch {
          throw new Error('Public sentence request failed or timed out.');
        }
        if (!response.ok)
          throw new Error(`Public sentence request returned HTTP ${response.status}.`);
        let rows;
        try {
          rows = await response.json();
        } catch {
          throw new Error('Public sentence response was not readable JSON.');
        }
        identity = validateHeartbeatRows(rows, words);
        if (seen.has(identity))
          throw new Error('Public sentence requests returned duplicate rows.');
        break;
      } catch (error) {
        failure = error instanceof Error ? error.message : 'Public sentence validation failed.';
        if (attempt + 1 < attempts && retryDelayMs > 0)
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
    if (!identity || seen.has(identity))
      throw new Error(`Heartbeat request ${offset + 1} failed: ${failure}`);
    seen.add(identity);
    report(`Supabase heartbeat request ${offset + 1} verified one distinct, approved sentence.`);
  }
  return { verifiedRows: seen.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runHeartbeat().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
