// Reverse-lookup: given a free-form string the learner believes is a
// conjugation, figure out which dictionary word + form it represents — either
// an exact hit or a near-miss typo — so the Check view can confirm it or
// explain how it differs.

import { conjugateItem, compatibleTypes, surfaceFormFor } from './conjugator.js';
import { toHiragana } from './romaji.js';

// Forms that are real conjugations but make poor free-form answers: the
// masu-stem is just a fragment of longer forms (たべ for 食べる), so a learner
// who simply hasn't finished typing would otherwise be told they're "correct".
const IGNORED_TYPES = new Set(['masu-stem']);

// Convert any katakana in the string to hiragana so input typed with the IME
// in katakana mode (or loanword verbs) still matches. toHiragana handles
// romaji but passes katakana through unchanged.
export function katakanaToHiragana(s) {
  return String(s || '').replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

// Normalize free-form input to hiragana for matching: katakana is folded to
// hiragana first, then any romaji is converted (toHiragana leaves kana as-is).
export function normalizeInput(s) {
  return toHiragana(katakanaToHiragana(s));
}

// Small Levenshtein edit distance between two strings (by character).
export function levenshtein(a, b) {
  const s = Array.from(a || '');
  const t = Array.from(b || '');
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

// Describe how `given` differs from `expected`, pointing at the first
// divergence so the UI can highlight it.
export function describeDiff(given, expected) {
  const g = Array.from(given || '');
  const e = Array.from(expected || '');
  const notes = [];
  if (g.length < e.length) {
    notes.push(`missing ${e.length - g.length} character(s)`);
  } else if (g.length > e.length) {
    notes.push(`${g.length - e.length} extra character(s)`);
  }
  const min = Math.min(g.length, e.length);
  let firstDiff = -1;
  for (let i = 0; i < min; i++) {
    if (g[i] !== e[i]) {
      firstDiff = i;
      break;
    }
  }
  if (firstDiff === -1 && g.length !== e.length) firstDiff = min;
  if (firstDiff >= 0) {
    const gotCh = g[firstDiff] ?? '∅';
    const wantCh = e[firstDiff] ?? '∅';
    notes.push(`at position ${firstDiff + 1}: expected 「${wantCh}」 but got 「${gotCh}」`);
  }
  return {
    firstDiff,
    summary: notes.length ? notes.join('; ') : 'characters differ',
  };
}

const MAX_NEAR_DISTANCE = 2;
const MAX_NEAR_RESULTS = 5;

// identifyConjugation(input, words, options)
//   input:   raw user string (kana, romaji, or kanji)
//   words:   active/enabled word set (array of { dict, reading, meaning, group })
//   options: { typesFor } — (item) => array of type objects ({ id, label, ... })
//            or type-id strings. Defaults to every form compatible with the
//            word so the analyzer recognises any valid conjugation.
//
// Returns { input, normalized, exact: [...], near: [...] }
//   exact: [{ word, type, kana, kanji }]
//   near:  [{ word, type, kana, kanji, distance, diff }] sorted best-first
export function identifyConjugation(input, words = [], options = {}) {
  const raw = String(input ?? '').trim();
  const normalized = normalizeInput(raw);
  const typesFor = options.typesFor || ((item) => compatibleTypes(item));

  const exact = [];
  const near = [];

  if (!raw) {
    return { input: raw, normalized, exact, near };
  }

  const typeIdOf = (t) => (typeof t === 'string' ? t : t.id);

  for (const word of words) {
    for (const t of typesFor(word)) {
      const type = typeIdOf(t);
      if (IGNORED_TYPES.has(type)) continue;
      const kana = conjugateItem(word, type);
      if (!kana) continue;
      const kanji = surfaceFormFor(word, type) || kana;

      const isExact =
        normalized === kana || raw === kanji || raw === kana;
      if (isExact) {
        exact.push({ word, type, kana, kanji });
      } else if (normalized.length >= 2) {
        // Near-miss typo. Require the input to keep at least 2 characters in
        // common with the form so tiny inputs (1-2 kana) don't "almost match"
        // every short conjugation in the set.
        const distance = levenshtein(normalized, kana);
        const shared = Math.max(normalized.length, kana.length) - distance;
        if (distance > 0 && distance <= MAX_NEAR_DISTANCE && shared >= 2) {
          near.push({ word, type, kana, kanji, distance });
        }
      }
    }
  }

  // Near-misses only matter when nothing matched exactly.
  if (exact.length > 0) {
    return { input: raw, normalized, exact, near: [] };
  }

  near.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.kana.length - b.kana.length;
  });
  near.splice(MAX_NEAR_RESULTS);
  for (const cand of near) {
    cand.diff = describeDiff(normalized, cand.kana);
  }

  return { input: raw, normalized, exact, near };
}
