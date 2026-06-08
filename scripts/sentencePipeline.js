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

export function isKana(value) {
  return KANA_RE.test(String(value ?? ''));
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
