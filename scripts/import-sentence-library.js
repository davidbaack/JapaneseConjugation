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
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { inflateVerbRows, mergeBuiltInWords } from '../src/data/verbLexicon.js';
import { STARTER_ADJECTIVES, STARTER_VERBS } from '../src/data/starterWords.js';
import { surfaceFormFor, wordKey } from '../src/utils/conjugator.js';
import { buildSegments, capTemplates, validateGenerated } from './sentencePipeline.js';

const LEXICON_PATH = join('public', 'data', 'verb-lexicon.json');
const DRY_RUN = process.env.SENTENCE_DRY_RUN === '1';
const UPSERT_CHUNK = 500;
const MODEL = process.env.SENTENCE_MODEL || 'codex';
// Max times any single sentence template may be reused across this run (0 = off).
// Enforced across all files passed to one invocation, so import outputs together.
const TEMPLATE_CAP = Number(process.env.SENTENCE_TEMPLATE_CAP || 100);
// Set SENTENCE_NO_KUROMOJI=1 to skip kuromoji and use the model's own segments.
const USE_KUROMOJI = process.env.SENTENCE_NO_KUROMOJI !== '1';

// Lazily build the kuromoji tokenizer once (the dictionary load is async).
let tokenizerPromise = null;
function getTokenizer() {
  if (!tokenizerPromise) {
    tokenizerPromise = (async () => {
      const require = createRequire(import.meta.url);
      const dicPath = join(dirname(require.resolve('kuromoji')), '..', 'dict');
      const kuromoji = /** @type {any} */ ((await import('kuromoji')).default);
      return new Promise((resolve, reject) => {
        kuromoji
          .builder({ dicPath })
          .build((err, tokenizer) => (err ? reject(err) : resolve(tokenizer)));
      });
    })();
  }
  return tokenizerPromise;
}

function katakanaToHiragana(value) {
  return String(value || '').replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

// Derive accurate per-token furigana segments from the sentence via kuromoji,
// collapsing the conjugated form into the {w:true} placeholder. Returns null on
// any failure so the caller can fall back to the model-provided segments.
async function deriveSegments(ja, expectedSurface) {
  if (!USE_KUROMOJI || !expectedSurface) return null;
  try {
    const tokenizer = await getTokenizer();
    const tokens = tokenizer.tokenize(ja).map((t) => ({
      surface: t.surface_form,
      reading: t.reading && t.reading !== '*' ? katakanaToHiragana(t.reading) : '',
    }));
    const result = buildSegments(tokens, expectedSurface);
    return result.ok ? result.segments : null;
  } catch {
    return null;
  }
}

function expectedSurfaceFor(word, type) {
  try {
    return surfaceFormFor(word, type) || '';
  } catch {
    return '';
  }
}

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
      // Prefer kuromoji-derived readings; fall back to the model's segments.
      const derived = await deriveSegments(out.ja, expectedSurfaceFor(word, out.type));
      const segments = derived || out.segments;
      const result = validateGenerated(word, out.type, { ...out, segments });
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

  // Reject over-reused sentence templates across the whole run.
  let toUpsert = accepted;
  if (TEMPLATE_CAP > 0 && accepted.length) {
    const { kept, rejected } = capTemplates(accepted, TEMPLATE_CAP);
    if (rejected.length) {
      const path = join(dirname(inputs[0]), 'template-overused.rejects.jsonl');
      writeFileSync(
        path,
        rejected
          .map((r) =>
            JSON.stringify({
              word_key: r.word_key,
              type: r.type,
              ja_template: r.ja_template,
              reason: 'template-overused',
            }),
          )
          .join('\n') + '\n',
      );
      console.log(
        `${rejected.length} row(s) exceeded the template cap (${TEMPLATE_CAP}) -> ${path}`,
      );
    }
    toUpsert = kept;
  }

  console.log(`${toUpsert.length} valid row(s)${DRY_RUN ? ' (dry run, not upserted)' : ''}`);
  if (!DRY_RUN && toUpsert.length) {
    await upsertRows(toUpsert);
    console.log(`Upserted ${toUpsert.length} row(s).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
