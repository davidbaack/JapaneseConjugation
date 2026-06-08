// @ts-check
// Validate Codex-generated sentence JSONL and upsert it into the Supabase
// `sentences` table. Makes NO LLM calls.
//
// Usage:   node scripts/import-sentence-library.js out-1.jsonl [out-2.jsonl ...]
//
// Each input line: { word_key, type, ja, en, segments }. Lines that fail
// validation are written to <input>.rejects.jsonl (with a reason) and never
// upserted, so they can be regenerated.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  Required unless SENTENCE_DRY_RUN=1.
//   SENTENCE_DRY_RUN=1                        Validate + report, do not upsert.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateVerbRows, mergeBuiltInWords } from '../src/data/verbLexicon.js';
import { STARTER_ADJECTIVES, STARTER_VERBS } from '../src/data/starterWords.js';
import { wordKey } from '../src/utils/conjugator.js';
import { validateGenerated } from './sentencePipeline.js';

const LEXICON_PATH = join('public', 'data', 'verb-lexicon.json');
const DRY_RUN = process.env.SENTENCE_DRY_RUN === '1';
const UPSERT_CHUNK = 500;
const MODEL = process.env.SENTENCE_MODEL || 'codex';

function loadWordMap() {
  const data = JSON.parse(readFileSync(LEXICON_PATH, 'utf8'));
  const verbs = mergeBuiltInWords(inflateVerbRows(data.verbs || []), STARTER_VERBS);
  const adjectives = mergeBuiltInWords(inflateVerbRows(data.adjectives || []), STARTER_ADJECTIVES);
  const map = new Map();
  for (const word of [...verbs, ...adjectives]) map.set(wordKey(word), word);
  return map;
}

function parseJsonl(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return { line: index + 1, value: JSON.parse(line) };
      } catch {
        return { line: index + 1, value: null, parseError: true };
      }
    });
}

async function upsertRows(rows) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows
      .slice(i, i + UPSERT_CHUNK)
      .map((row) => ({ ...row, model: MODEL, updated_at: now }));
    const { error } = await supabase
      .from('sentences')
      .upsert(chunk, { onConflict: 'word_key,type' });
    if (error) throw error;
  }
}

async function main() {
  const inputs = process.argv.slice(2);
  if (!inputs.length) {
    console.error('Usage: node scripts/import-sentence-library.js <output.jsonl> [...]');
    process.exit(1);
  }

  const words = loadWordMap();
  const accepted = [];

  for (const input of inputs) {
    const entries = parseJsonl(readFileSync(input, 'utf8'));
    const rejects = [];
    for (const entry of entries) {
      if (entry.parseError || !entry.value) {
        rejects.push({ line: entry.line, reason: 'invalid-json' });
        continue;
      }
      const out = entry.value;
      const word = words.get(out.word_key);
      if (!word) {
        rejects.push({ ...out, reason: 'unknown-word' });
        continue;
      }
      const result = validateGenerated(word, out.type, out);
      if (!result.ok) {
        rejects.push({ ...out, reason: result.reason });
        continue;
      }
      accepted.push(result.row);
    }

    if (rejects.length) {
      const rejectPath = input.replace(/\.jsonl$/, '') + '.rejects.jsonl';
      writeFileSync(rejectPath, rejects.map((r) => JSON.stringify(r)).join('\n') + '\n');
      console.log(`${input}: ${rejects.length} rejected -> ${rejectPath}`);
    } else {
      console.log(`${input}: all entries valid`);
    }
  }

  console.log(`${accepted.length} valid row(s)${DRY_RUN ? ' (dry run, not upserted)' : ''}`);
  if (!DRY_RUN && accepted.length) {
    await upsertRows(accepted);
    console.log(`Upserted ${accepted.length} row(s).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
