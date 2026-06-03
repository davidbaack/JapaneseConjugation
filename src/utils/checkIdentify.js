// Reverse-lookup: given a free-form string the learner believes is a
// conjugation, figure out which dictionary word + form it represents — either
// an exact hit or a near-miss typo — so the Check view can confirm it or
// explain how it differs.

import { conjugateItem, compatibleTypes, surfaceFormFor, surfaceStemPair } from './conjugator.js';
import { toHiragana } from './romaji.js';

// Forms that are real conjugations but make poor free-form answers: the
// masu-stem is just a fragment of longer forms (たべ for 食べる), so a learner
// who simply hasn't finished typing would otherwise be told they're "correct".
const IGNORED_TYPES = new Set(['masu-stem']);

// Convert any katakana in the string to hiragana so input typed with the IME
// in katakana mode (or loanword verbs) still matches. toHiragana handles
// romaji but passes katakana through unchanged.
export function katakanaToHiragana(s) {
  return String(s || '').replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
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
// Stem-anchored candidates (the input shares the verb's whole masu-stem, so the
// intended verb is almost certainly that one) get a little more slack, since
// the entire suffix may have been formed wrongly.
const ANCHORED_MAX_DISTANCE = 3;
const MAX_NEAR_RESULTS = 5;
const MAX_NEAR_WHEN_EXACT = 3;
const MIN_EXACT_NEAR_PREFIX = 2;

// Which form does a て/た ending suggest the learner was aiming for? Used only
// to break ties between equally-close candidates of the intended verb.
function suffixPreference(normalized) {
  if (/[てで]$/.test(normalized)) return 'te-form';
  if (/[ただ]$/.test(normalized)) return 'plain-past';
  return null;
}

function sharedSuffixScore(normalized, candidate) {
  const suffixes = ['ませんでした', 'ません', 'ました', 'ます'];
  const suffix = suffixes.find((s) => normalized.endsWith(s));
  if (!suffix) return 0;
  return candidate.endsWith(suffix) ? 0 : 1;
}

function commonPrefixLength(a, b) {
  const left = Array.from(a || '');
  const right = Array.from(b || '');
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i++) {
    if (left[i] !== right[i]) return i;
  }
  return length;
}

// identifyConjugation(input, words, options)
//   input:   raw user string (kana, romaji, or kanji)
//   words:   active/enabled word set (array of { dict, reading, meaning, group })
//   options: { typesFor } — (item) => array of type objects ({ id, label, ... })
//            or type-id strings. Defaults to every form compatible with the
//            word so the analyzer recognises any valid conjugation.
//            { includeNearWhenExact } keeps close wrong candidates even when
//            the input is also a correct conjugation.
//
// Returns { input, normalized, exact: [...], near: [...] }
//   exact: [{ word, type, kana, kanji }]
//   near:  [{ word, type, kana, kanji, distance, diff }] sorted best-first
export function identifyConjugation(input, words = [], options = {}) {
  const raw = String(input ?? '').trim();
  const normalized = normalizeInput(raw);
  const typesFor = options.typesFor || ((item) => compatibleTypes(item));
  const includeNearWhenExact = !!options.includeNearWhenExact;

  const exact = [];
  const near = [];

  if (!raw) {
    return { input: raw, normalized, exact, near };
  }

  const typeIdOf = (t) => (typeof t === 'string' ? t : t.id);
  const wantSuffix = suffixPreference(normalized);

  // An input that is exactly some word's masu-stem (たべ for 食べる) is an
  // incomplete fragment, not a conjugation — report it as unidentified rather
  // than offering near-miss guesses toward the fuller forms.
  let isBareStem = false;

  for (const word of words) {
    // The reading-stem is the unchanging head a verb keeps across its
    // conjugations (の for 飲む, たべ for 食べる, し for 死ぬ). If the input begins
    // with it, the learner almost certainly meant THIS verb and got the ending
    // wrong — the classic onbin (sound-change) mistake (のみて for 飲んで). We
    // anchor on it so the right verb wins over a coincidentally-closer string.
    const { readingStem } = surfaceStemPair(word);
    const anchored = !!readingStem && normalized.startsWith(readingStem);

    // A bare masu-stem (たべ for 食べる) is an incomplete fragment, not a
    // conjugation — flag it so we can report "couldn't identify" rather than
    // guessing at the fuller forms.
    const masuStem = conjugateItem(word, 'masu-stem');
    if (masuStem && (normalized === masuStem || raw === masuStem)) isBareStem = true;

    // The classic over-regularization error: forming a past/te by tacking the
    // regular ending straight onto the masu-stem (のみ+た = のみた instead of
    // のんだ, のみ+て = のみて instead of のんで). When the input is exactly that,
    // we know precisely which form the learner intended, so we promote it above
    // a coincidentally-closer form like the potential-past (のめた).
    let regularizedType = null;
    if (masuStem && normalized.startsWith(masuStem)) {
      const tail = normalized.slice(masuStem.length);
      if (tail === 'て' || tail === 'で') regularizedType = 'te-form';
      else if (tail === 'た' || tail === 'だ') regularizedType = 'plain-past';
    }

    for (const t of typesFor(word)) {
      const type = typeIdOf(t);
      if (IGNORED_TYPES.has(type)) continue;
      const kana = conjugateItem(word, type);
      if (!kana) continue;
      const kanji = surfaceFormFor(word, type) || kana;

      const isExact = normalized === kana || raw === kanji || raw === kana;
      if (isExact) {
        exact.push({ word, type, kana, kanji });
        continue;
      }
      if (normalized.length < 2) continue;

      const distance = levenshtein(normalized, kana);
      const shared = Math.max(normalized.length, kana.length) - distance;
      // Stem-anchored candidates get more distance slack (a whole wrong suffix
      // can be 2-3 edits). The shared-character floor — which stops a 1-kana
      // overlap from matching everything — is waived only for a clear sound-
      // change attempt (a て/た-family ending on an anchored verb, e.g. のみて
      // for 飲んで); otherwise even anchored inputs need real overlap so a noun
      // like ねこ doesn't get read as a botched 寝る.
      const limit = anchored ? ANCHORED_MAX_DISTANCE : MAX_NEAR_DISTANCE;
      const onbinAttempt = anchored && /[てでただ]$/.test(normalized);
      const floorOk = onbinAttempt || shared >= 2;
      if (distance > 0 && distance <= limit && floorOk) {
        const regularized = type === regularizedType;
        near.push({ word, type, kana, kanji, distance, anchored, regularized });
      }
    }
  }

  // Most callers only need near-misses when nothing matched exactly. CheckView
  // opts in to keeping them so learners can see every plausible interpretation.
  if (exact.length > 0 && !includeNearWhenExact) {
    return { input: raw, normalized, exact, near: [] };
  }

  // A bare masu-stem is treated as unidentified (no near-miss suggestions).
  if (isBareStem) {
    return { input: raw, normalized, exact, near: [] };
  }

  // If any candidate is stem-anchored, the intended verb is known — drop the
  // coincidental unanchored guesses entirely so the lead suggestion is right.
  const anchoredNear = near.filter((c) => c.anchored);
  const pool = anchoredNear.length > 0 ? anchoredNear : near;

  pool.sort((a, b) => {
    // An exact over-regularization (のみた→のんだ) names the intended form
    // outright, so it wins even over a closer-by-distance coincidence.
    if (a.regularized !== b.regularized) return a.regularized ? -1 : 1;
    if (a.distance !== b.distance) return a.distance - b.distance;
    const aSuffix = sharedSuffixScore(normalized, a.kana);
    const bSuffix = sharedSuffixScore(normalized, b.kana);
    if (aSuffix !== bSuffix) return aSuffix - bSuffix;
    const prefixDelta =
      commonPrefixLength(normalized, b.kana) - commonPrefixLength(normalized, a.kana);
    if (prefixDelta !== 0) return prefixDelta;
    // Prefer the form the learner's ending was reaching for (て→te, た→past).
    const aWanted = wantSuffix && a.type === wantSuffix ? 0 : 1;
    const bWanted = wantSuffix && b.type === wantSuffix ? 0 : 1;
    if (aWanted !== bWanted) return aWanted - bWanted;
    return a.kana.length - b.kana.length;
  });

  // When there is already a correct answer, keep only a small set of the best
  // wrong interpretations with a real shared head. The correct hit is the
  // point; near matches are just a backup comparison if the learner wants to
  // inspect them, not a list of every one-kana-stem coincidence.
  const exactNearPool =
    exact.length > 0 && includeNearWhenExact
      ? pool.filter((cand) => commonPrefixLength(normalized, cand.kana) >= MIN_EXACT_NEAR_PREFIX)
      : pool;
  const bestExactNearDistance = exactNearPool[0]?.distance;
  const matchedPool =
    exact.length > 0 && includeNearWhenExact
      ? exactNearPool.length > 0
        ? exactNearPool
            .filter((cand) => cand.distance === bestExactNearDistance)
            .slice(0, MAX_NEAR_WHEN_EXACT)
        : []
      : pool.slice(0, MAX_NEAR_RESULTS);

  for (const cand of matchedPool) {
    cand.diff = describeDiff(normalized, cand.kana);
  }

  return { input: raw, normalized, exact, near: matchedPool };
}
