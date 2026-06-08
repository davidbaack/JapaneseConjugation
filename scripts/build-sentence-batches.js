// @ts-check
// Emit batch files of pending (word, conjugation) pairs for the tailored
// sentence library. Codex (run manually on the user's ChatGPT Pro plan) fills
// each batch; import-sentence-library.js then validates and upserts the output.
// This script makes NO LLM calls.
//
// Env:
//   SENTENCE_JLPT        Comma list of JLPT levels to include (default: all).
//   SENTENCE_TYPES       Comma list of type ids, or "all" (default: the 28
//                        LEARNER_DEFAULT_TYPE_IDS).
//   SENTENCE_BATCH_SIZE  Pairs per batch file (default 200).
//   SENTENCE_LIMIT       Cap total pairs emitted (0 = no cap).
//   SENTENCE_OUT_DIR     Output directory (default tmp/sentence-batches).
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  Optional — when set, already-seeded
//                        (word_key, type) pairs are skipped (resumable).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateVerbRows, mergeBuiltInWords } from '../src/data/verbLexicon.js';
import { STARTER_ADJECTIVES, STARTER_VERBS } from '../src/data/starterWords.js';
import { practiceTypesForItem } from '../src/utils/conjugator.js';
import { ALL_CARD_TYPES, LEARNER_DEFAULT_TYPE_IDS } from '../src/data/conjugationTypes.js';
import { buildPair } from './sentencePipeline.js';

const LEXICON_PATH = join('public', 'data', 'verb-lexicon.json');
const OUT_DIR = process.env.SENTENCE_OUT_DIR || join('tmp', 'sentence-batches');
const BATCH_SIZE = Math.max(1, Number(process.env.SENTENCE_BATCH_SIZE || 200));
const LIMIT = Math.max(0, Number(process.env.SENTENCE_LIMIT || 0));
const JLPT = csv(process.env.SENTENCE_JLPT);

function csv(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function targetTypeIds() {
  const raw = (process.env.SENTENCE_TYPES || '').trim();
  if (!raw || raw === 'default') return [...LEARNER_DEFAULT_TYPE_IDS];
  if (raw === 'all') return ALL_CARD_TYPES.map((t) => t.id);
  return csv(raw);
}

function loadWords() {
  const data = JSON.parse(readFileSync(LEXICON_PATH, 'utf8'));
  const verbs = mergeBuiltInWords(inflateVerbRows(data.verbs || []), STARTER_VERBS);
  const adjectives = mergeBuiltInWords(inflateVerbRows(data.adjectives || []), STARTER_ADJECTIVES);
  let words = [...verbs, ...adjectives];
  if (JLPT.length) words = words.filter((w) => JLPT.includes(w.jlpt));
  return words;
}

async function fetchExistingPairs() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const seen = new Set();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('sentences')
      .select('word_key, type')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) seen.add(`${row.word_key}|${row.type}`);
    if (data.length < pageSize) break;
  }
  return seen;
}

const PROMPT = `# Tailored sentence generation

Each line of a batch .jsonl file is one request:
  { word_key, dict, reading, group, jlpt, type, type_label, transitive,
    expected_surface, expected_kana }

For each line, write ONE natural, level-appropriate Japanese sentence that uses
the verb/adjective in the requested form, then return ONE JSON line:

  { "word_key": <same>, "type": <same>,
    "ja": "<sentence containing expected_surface verbatim>",
    "en": "<natural English translation>" }

Rules:
- "ja" MUST contain expected_surface exactly once, written verbatim.
- Keep it simple and beginner-friendly; output JSONL only, one object per line.

Per-token furigana is derived automatically by the importer (kuromoji), so you
do NOT need to provide readings. (You may optionally include a "segments" array
that tiles the sentence with {"t","r"} tokens and a single {"w":true} sentinel
for the conjugated word; it is used only as a fallback if automatic derivation
fails.)
`;

async function main() {
  const words = loadWords();
  const types = targetTypeIds();
  const typeSet = new Set(types);
  const existing = await fetchExistingPairs();

  const pending = [];
  outer: for (const word of words) {
    const prefs = /** @type {any} */ ({ skipDuplicateForms: false });
    const applicable = practiceTypesForItem(word, types, prefs)
      .map((t) => t.id)
      .filter((id) => typeSet.has(id));
    for (const type of applicable) {
      const pair = buildPair(word, type);
      if (!pair) continue;
      if (existing && existing.has(`${pair.word_key}|${pair.type}`)) continue;
      pending.push(pair);
      if (LIMIT && pending.length >= LIMIT) break outer;
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'PROMPT.md'), PROMPT);

  let batchCount = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    batchCount += 1;
    const slice = pending.slice(i, i + BATCH_SIZE);
    const name = `batch-${String(batchCount).padStart(4, '0')}.jsonl`;
    writeFileSync(join(OUT_DIR, name), slice.map((p) => JSON.stringify(p)).join('\n') + '\n');
  }

  console.log(
    `Wrote ${pending.length} pending pairs across ${batchCount} batch file(s) to ${OUT_DIR}` +
      (existing
        ? ` (skipped ${existing.size} already in DB)`
        : ' (no DB skip; set SUPABASE_* to dedupe)'),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
