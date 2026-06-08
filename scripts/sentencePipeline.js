// @ts-check
// Pure logic shared by the sentence-library generation scripts:
//   - build-sentence-batches.js  (emits work for Codex)
//   - import-sentence-library.js (validates Codex output, upserts to Supabase)
//
// No file/network/DB access lives here so it can be unit-tested directly. The
// conjugation engine is the source of truth: expected surface/kana forms are
// always recomputed here and validated against the generated sentence, never
// trusted from the model.
import { conjugateItem, surfaceFormFor, wordKey } from '../src/utils/conjugator.js';
import { getTypeInfo } from '../src/data/conjugationTypes.js';
import { resolveTransitivity } from '../src/utils/clozeSentences.js';

// Hiragana (U+3040–309F), katakana (U+30A0–30FF, incl. the long-vowel mark),
// and ASCII whitespace.
const KANA_RE = /^[぀-ヿ\s]*$/;
// CJK ideographs (kanji), incl. the compatibility block.
const KANJI_RE = /[一-鿿豈-﫿]/;

export function isKana(value) {
  return KANA_RE.test(String(value ?? ''));
}

// Keep a ruby reading only when it adds information: the token has kanji, the
// reading is kana, and it isn't identical to the surface.
function rubyFor(surface, reading) {
  const r = String(reading ?? '');
  if (!r || !KANJI_RE.test(surface) || !isKana(r) || r === surface) return '';
  return r;
}

/**
 * Build per-token furigana segments from tokenizer output, collapsing the
 * contiguous run of tokens that spells `expectedSurface` into the single
 * { w: true } placeholder.
 *
 * `tokens` = [{ surface, reading }], reading in hiragana ('' when unknown).
 * Used by the importer to derive accurate readings via kuromoji rather than
 * trusting the model.
 *
 * @returns {{ ok: true, segments: Array<{t:string,r:string}|{w:true}> }
 *          | { ok: false, reason: string }}
 */
export function buildSegments(tokens, expectedSurface) {
  if (!Array.isArray(tokens) || tokens.length === 0) return fail('no-tokens');
  const surface = String(expectedSurface ?? '');
  if (!surface) return fail('no-surface');

  // Locate the contiguous token run whose surfaces concatenate to the form.
  let runStart = -1;
  let runEnd = -1;
  for (let i = 0; i < tokens.length && runStart < 0; i += 1) {
    let acc = '';
    for (let j = i; j < tokens.length; j += 1) {
      acc += String(tokens[j]?.surface ?? '');
      if (acc === surface) {
        runStart = i;
        runEnd = j;
        break;
      }
      if (acc.length >= surface.length) break;
    }
  }
  if (runStart < 0) return fail('surface-not-token-aligned');

  const segments = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (i === runStart) {
      segments.push({ w: /** @type {const} */ (true) });
      i = runEnd;
      continue;
    }
    const t = String(tokens[i]?.surface ?? '');
    segments.push({ t, r: rubyFor(t, tokens[i]?.reading) });
  }
  return { ok: true, segments };
}

function safeForm(fn) {
  try {
    return fn() || '';
  } catch {
    return '';
  }
}

/**
 * Build the per-pair work item the batch file hands to Codex. Returns null for
 * pairs the engine cannot produce (so the model is never asked to invent a form
 * that doesn't exist).
 */
export function buildPair(word, type) {
  const surface = safeForm(() => surfaceFormFor(word, type));
  const kana = safeForm(() => conjugateItem(word, type));
  if (!surface || !kana) return null;
  return {
    word_key: wordKey(word),
    dict: word.dict,
    reading: word.reading,
    group: word.group,
    jlpt: word.jlpt || '',
    type,
    type_label: getTypeInfo(type).label || type,
    transitive: resolveTransitivity(word),
    expected_surface: surface,
    expected_kana: kana,
  };
}

/**
 * @param {string} reason
 * @returns {{ ok: false, reason: string }}
 */
function fail(reason) {
  return { ok: false, reason };
}

/**
 * Validate a Codex-generated entry and build the DB row.
 *
 * `out` shape: { ja: string, en: string, segments: Array<{t,r}|{w:true}> }.
 * `segments` must tile the whole sentence in order; the conjugated word is a
 * single { w: true } sentinel. Validation re-derives the expected surface from
 * the engine and requires the reconstructed sentence to match `ja` exactly.
 *
 * @returns {{ ok: true, row: object } | { ok: false, reason: string }}
 */
export function validateGenerated(word, type, out) {
  if (!out || typeof out !== 'object') return fail('not-an-object');

  const surface = safeForm(() => surfaceFormFor(word, type));
  const kana = safeForm(() => conjugateItem(word, type));
  if (!surface || !kana) return fail('not-conjugatable');

  const { segments } = out;
  if (!Array.isArray(segments) || segments.length === 0) return fail('no-segments');
  if (segments.filter((seg) => seg && seg.w).length !== 1) return fail('placeholder-count');

  const ja = String(out.ja ?? '').trim();
  if (!ja) return fail('no-ja');
  const en = String(out.en ?? '').trim();
  if (!en) return fail('no-en');

  // Reconstruct the filled sentence from the segments and require an exact match
  // with the model's sentence. This proves the segments tile `ja` and that the
  // placeholder sits exactly where the conjugated surface form belongs.
  const filled = segments.map((seg) => (seg && seg.w ? surface : (seg?.t ?? ''))).join('');
  if (filled !== ja) return fail('segments-mismatch');

  for (const seg of segments) {
    if (seg && seg.w) continue;
    const ruby = seg?.r ?? '';
    if (ruby && !isKana(ruby)) return fail('non-kana-reading');
  }

  const cleanSegments = segments.map((seg) =>
    seg && seg.w ? { w: true } : { t: String(seg?.t ?? ''), r: String(seg?.r ?? '') },
  );
  const jaTemplate = cleanSegments.map((seg) => (seg.w ? '{w}' : seg.t)).join('');

  return {
    ok: true,
    row: {
      word_key: wordKey(word),
      dict: word.dict,
      reading: word.reading,
      group: word.group,
      type,
      ja_template: jaTemplate,
      surface,
      segments: cleanSegments,
      en,
    },
  };
}
