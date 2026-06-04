import { STARTER_ADJECTIVES, STARTER_VERBS } from '../data/starterWords.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { getWordMeta, wordKey, wordKind } from './conjugator.js';
import { isWordExcludedFromReview } from './reviewScope.js';

const JLPT_RANK = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };
const STARTER_WORD_KEYS = new Set([...STARTER_VERBS, ...STARTER_ADJECTIVES].map(wordKey));

function cleanWords(words) {
  return (words || []).filter((word) => wordKey(word));
}

function uniqueWords(words) {
  const seen = new Set();
  const result = [];
  for (const word of words || []) {
    const key = wordKey(word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(word);
  }
  return result;
}

function lessonRank(meta) {
  const genki = Number(meta.lesson || meta.lessons?.[0] || Infinity);
  const minna = Number(meta.minnaLesson || meta.minnaLessons?.[0] || Infinity);
  return Math.min(genki, minna);
}

function isTextbookBacked(meta) {
  return Boolean(
    meta.lesson || meta.lessons?.length || meta.minnaLesson || meta.minnaLessons?.length,
  );
}

function isN5EarlyTextbook(word) {
  const meta = getWordMeta(word);
  if (meta.jlpt !== 'N5') return false;
  const lessons = meta.lessons?.length ? meta.lessons : meta.lesson ? [meta.lesson] : [];
  const minnaLessons = meta.minnaLessons?.length
    ? meta.minnaLessons
    : meta.minnaLesson
      ? [meta.minnaLesson]
      : [];
  return lessons.some((lesson) => lesson <= 12) || minnaLessons.some((lesson) => lesson <= 25);
}

function isCommonOrTextbookLevel(word, maxJlptRank) {
  const meta = getWordMeta(word);
  const rank = JLPT_RANK[meta.jlpt] ?? 9;
  return rank <= maxJlptRank && (meta.common || isTextbookBacked(meta));
}

function wordSrsKey(word) {
  if (!word) return '';
  return `${wordKind(word)}:${word.group}:${word.dict}:${word.reading}`;
}

function cardWordSrsKey(cardId) {
  const id = String(cardId || '');
  const marker = id.lastIndexOf('|');
  return marker >= 0 ? id.slice(0, marker) : '';
}

function selectedListWordKeys(prefs = DEFAULT_PREFS, wordLists = []) {
  const selectedIds = Array.isArray(prefs.wordListIds) ? prefs.wordListIds.filter(Boolean) : [];
  if (!selectedIds.length) return null;
  const selected = new Set(selectedIds);
  return new Set(
    (wordLists || [])
      .filter((list) => selected.has(list.id))
      .flatMap((list) => list.wordKeys || []),
  );
}

function rankedProgressionWords(words) {
  return uniqueWords(cleanWords(words)).sort(
    (a, b) =>
      wordProgressionScore(a) - wordProgressionScore(b) || wordKey(a).localeCompare(wordKey(b)),
  );
}

function withRankedFallback(matches, ranked, minimum) {
  const keys = new Set(matches.map(wordKey));
  for (const word of ranked) {
    if (keys.size >= minimum) break;
    keys.add(wordKey(word));
  }
  return ranked.filter((word) => keys.has(wordKey(word)));
}

export function wordProgressionScore(word) {
  const meta = getWordMeta(word);
  const lesson = lessonRank(meta);
  const rank = JLPT_RANK[meta.jlpt] ?? 9;
  const starterBoost = STARTER_WORD_KEYS.has(wordKey(word)) ? -10000 : 0;
  const lessonPenalty = Number.isFinite(lesson) ? lesson * 10 : 700;
  const commonPenalty = meta.common || isTextbookBacked(meta) ? 0 : 80;
  const readingLength = String(word?.reading || word?.dict || '').length;
  const groupPenalty = word?.group?.includes('adjective') ? 15 : 0;
  return starterBoost + rank * 220 + lessonPenalty + commonPenalty + groupPenalty + readingLength;
}

export function introducedBuiltInWordCount(state = {}, words = []) {
  const validSrsKeys = new Set(cleanWords(words).map(wordSrsKey));
  if (!validSrsKeys.size) return 0;
  const introduced = new Set();
  for (const cardId of Object.keys(state?.cards || {})) {
    const key = cardWordSrsKey(cardId);
    if (validSrsKeys.has(key)) introduced.add(key);
  }
  return introduced.size;
}

export function filterWordsForStudyScope(
  words,
  state = {},
  prefs = DEFAULT_PREFS,
  wordLists = [],
  options = {},
) {
  const listKeys = selectedListWordKeys(prefs, wordLists);
  if (listKeys) {
    return cleanWords(words).filter(
      (word) =>
        listKeys.has(wordKey(word)) &&
        (options.ignoreReviewScope || !isWordExcludedFromReview(state, word)),
    );
  }

  const sourceWords = cleanWords(words).filter(
    (word) => options.ignoreReviewScope || !isWordExcludedFromReview(state, word),
  );
  const builtInKeys = options.builtInWords?.length
    ? new Set(cleanWords(options.builtInWords).map(wordKey))
    : null;
  const automaticWords = builtInKeys
    ? sourceWords.filter((word) => builtInKeys.has(wordKey(word)))
    : sourceWords;
  // Custom (non-built-in) words are user-chosen, so they are always in scope:
  // they bypass the built-in progression ladder the same way enabled lists do.
  // Without this, custom words would be counted by Settings' pool summary but
  // never surface in automatic Reviews, leaving "No cards available."
  const customWords = builtInKeys
    ? sourceWords.filter((word) => !builtInKeys.has(wordKey(word)))
    : [];
  const scopedWords = automaticWords;
  const ranked = rankedProgressionWords(scopedWords);
  const introduced = introducedBuiltInWordCount(state, ranked);
  // customWords and scopedWords are disjoint (built-in vs not), so a plain
  // concat adds no duplicates and leaves behavior unchanged when there are none.
  const withCustom = (unlocked) => (customWords.length ? [...unlocked, ...customWords] : unlocked);
  const wordsForUnlockedKeys = (unlocked) => {
    const unlockedKeys = new Set(unlocked.map(wordKey));
    return withCustom(scopedWords.filter((word) => unlockedKeys.has(wordKey(word))));
  };

  if (introduced < 12) return wordsForUnlockedKeys(ranked.slice(0, 24));
  if (introduced < 36) return wordsForUnlockedKeys(ranked.slice(0, 55));
  if (introduced < 80) {
    return wordsForUnlockedKeys(withRankedFallback(ranked.filter(isN5EarlyTextbook), ranked, 90));
  }
  if (introduced < 160) {
    return wordsForUnlockedKeys(
      withRankedFallback(
        ranked.filter((word) => isCommonOrTextbookLevel(word, JLPT_RANK.N4)),
        ranked,
        160,
      ),
    );
  }
  if (introduced < 300) {
    return wordsForUnlockedKeys(
      withRankedFallback(
        ranked.filter((word) => isCommonOrTextbookLevel(word, JLPT_RANK.N3)),
        ranked,
        240,
      ),
    );
  }
  return withCustom(scopedWords);
}

export function buildVocabularyProgressionSummary(
  state = {},
  words = [],
  prefs = DEFAULT_PREFS,
  wordLists = [],
  options = {},
) {
  const unlockedWords = filterWordsForStudyScope(words, state, prefs, wordLists, options);
  const builtInWords = options.builtInWords?.length ? options.builtInWords : words;
  const introducedWords = introducedBuiltInWordCount(state, builtInWords);
  const listScoped = Boolean(selectedListWordKeys(prefs, wordLists));
  return {
    introducedWords,
    unlockedWords: unlockedWords.length,
    listScoped,
  };
}
