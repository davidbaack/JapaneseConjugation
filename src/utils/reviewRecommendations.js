import { ALL_CARD_TYPES, getTypeInfo } from '../data/conjugationTypes.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import {
  classifyGroupId,
  conjugateItem,
  isAdjective,
  isTypeCompatible,
  onbinPatternForVerb,
  wordKey,
} from './conjugator.js';
import { filterWordsForStudyScope, wordProgressionScore } from './vocabularyProgression.js';

const VALID_TYPE_IDS = new Set(ALL_CARD_TYPES.map((type) => type.id));

const VERB_FOUNDATION_TYPE_IDS = [
  'plain-past',
  'plain-negative',
  'plain-past-negative',
  'polite-present',
  'polite-past',
  'polite-negative',
  'te-form',
];

const ADJECTIVE_FOUNDATION_TYPE_IDS = [
  'adj-plain-past',
  'adj-plain-negative',
  'adj-plain-past-negative',
  'adj-polite-present',
  'adj-polite-past',
  'adj-polite-negative',
  'adj-te-form',
];

const REGISTER_TYPES_BY_LABEL = {
  present: ['plain-present', 'polite-present'],
  past: ['plain-past', 'polite-past'],
  negative: ['plain-negative', 'polite-negative'],
  'past-negative': ['plain-past-negative', 'polite-past-negative'],
};

const RUSH_FALLBACK_TYPE_IDS = [
  'plain-past',
  'plain-negative',
  'polite-present',
  'te-form',
  'potential',
];

function isVerbWord(word) {
  return !!word && word.group !== 'noun' && !isAdjective(word);
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function safeId(value) {
  return String(value || 'review-set')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function rankedUniqueWords(words = []) {
  const byKey = new Map();
  for (const word of words || []) {
    const key = wordKey(word);
    if (key && !byKey.has(key)) byKey.set(key, word);
  }
  return [...byKey.values()].sort(
    (a, b) =>
      wordProgressionScore(a) - wordProgressionScore(b) || wordKey(a).localeCompare(wordKey(b)),
  );
}

function studyScopeWords(
  state = {},
  words = [],
  prefs = DEFAULT_PREFS,
  wordLists = [],
  options = {},
) {
  return rankedUniqueWords(
    filterWordsForStudyScope(words, state, prefs, wordLists, {
      builtInWords: options.builtInWords,
      ignoreReviewScope: true,
    }),
  );
}

function typeIdsForWords(typeIds = [], words = []) {
  const ids = uniqueStrings(typeIds).filter((id) => VALID_TYPE_IDS.has(id));
  if (!words.length) return ids;
  return ids.filter((typeId) =>
    words.some((word) => isTypeCompatible(word, typeId) && conjugateItem(word, typeId)),
  );
}

function wordsForTypes(words = [], typeIds = [], limit = 12) {
  const ids = uniqueStrings(typeIds);
  return rankedUniqueWords(
    words.filter((word) =>
      ids.some((typeId) => isTypeCompatible(word, typeId) && conjugateItem(word, typeId)),
    ),
  ).slice(0, limit);
}

function weakRows(map = {}, threshold = 0.85) {
  return Object.entries(map || {})
    .map(([key, row]) => {
      const attempted = Number(row?.attempted || 0);
      const correct = Number(row?.correct || 0);
      const incorrect = Number(row?.incorrect ?? Math.max(0, attempted - correct));
      const accuracy = attempted ? correct / attempted : 1;
      return {
        key,
        attempted,
        correct,
        incorrect,
        accuracy,
        lastAt: Number(row?.lastAt || 0),
        score: incorrect * 3 + (attempted ? Math.max(0, threshold - accuracy) * 8 : 0),
      };
    })
    .filter((row) => row.attempted > 0 && (row.incorrect > 0 || row.accuracy < threshold))
    .sort((a, b) => b.score - a.score || b.lastAt - a.lastAt || a.key.localeCompare(b.key));
}

function makeRecommendation({
  id,
  source,
  label,
  detail,
  wordKeys = [],
  typeIds = [],
  suggestedCount = 12,
}) {
  const cleanTypeIds = uniqueStrings(typeIds).filter((typeId) => VALID_TYPE_IDS.has(typeId));
  if (!cleanTypeIds.length) return null;
  return {
    id,
    source,
    label,
    detail,
    wordKeys: uniqueStrings(wordKeys),
    typeIds: cleanTypeIds,
    suggestedCount: Math.max(1, Number(suggestedCount) || 12),
  };
}

function suggestedCount(words, typeIds, fallback) {
  const possible = (words?.length || 0) * Math.max(1, typeIds?.length || 1);
  if (!possible) return fallback;
  return Math.max(6, Math.min(fallback, possible));
}

function onbinRecommendation(state, words, activeTool) {
  const weak = weakRows(state.onbin?.byPattern, 0.88);
  if (!weak.length && activeTool !== 'endings') return null;
  const weakPatternLabels = new Set(weak.map((row) => row.key));
  const selected = rankedUniqueWords(
    words.filter((word) => {
      if (!isVerbWord(word)) return false;
      return !weakPatternLabels.size || weakPatternLabels.has(onbinPatternForVerb(word).label);
    }),
  ).slice(0, 12);
  const typeIds = typeIdsForWords(['te-form', 'plain-past'], selected);
  return makeRecommendation({
    id: 'lab-onbin-review',
    source: 'lab',
    label: weak.length ? 'Practice weak te/ta sound changes' : 'Practice te/ta sound changes',
    detail: weak.length
      ? `${weak
          .slice(0, 2)
          .map((row) => row.key)
          .join(', ')} need full recall in Practice.`
      : 'Full recall for the sound-change patterns from Ending Lab.',
    wordKeys: selected.map(wordKey),
    typeIds,
    suggestedCount: suggestedCount(selected, typeIds, 12),
  });
}

function registerRecommendation(state, words, activeTool) {
  const weak = weakRows(state.register?.byPattern, 0.88).filter(
    (row) => REGISTER_TYPES_BY_LABEL[row.key],
  );
  if (!weak.length && activeTool !== 'endings') return null;
  const typeIds = typeIdsForWords(
    weak.length
      ? weak.flatMap((row) => REGISTER_TYPES_BY_LABEL[row.key] || [])
      : [
          'plain-present',
          'plain-past',
          'plain-negative',
          'polite-present',
          'polite-past',
          'polite-negative',
        ],
    words,
  );
  const selected = wordsForTypes(words.filter(isVerbWord), typeIds, 10);
  return makeRecommendation({
    id: 'lab-register-review',
    source: 'lab',
    label: weak.length ? 'Practice weak plain/polite switches' : 'Practice plain/polite switches',
    detail: weak.length
      ? `${weak
          .slice(0, 2)
          .map((row) => row.key)
          .join(', ')} switches need full recall.`
      : 'Move register-switch practice into full word-form Practice.',
    wordKeys: selected.map(wordKey),
    typeIds,
    suggestedCount: suggestedCount(selected, typeIds, 10),
  });
}

function foundationTypesForGroups(groups) {
  const typeIds = [];
  for (const group of groups) {
    if (group === 'i-adjective' || group === 'na-adjective' || group === 'irregular-adjective') {
      typeIds.push(...ADJECTIVE_FOUNDATION_TYPE_IDS);
    } else {
      typeIds.push(...VERB_FOUNDATION_TYPE_IDS);
    }
  }
  return uniqueStrings(typeIds);
}

function classifyRecommendation(state, words, activeTool) {
  const weak = weakRows(state.classify?.byGroup, 0.85);
  if (!weak.length && activeTool !== 'classify') return null;
  const groupIds = weak.length
    ? weak.map((row) => row.key)
    : ['ichidan', 'godan', 'suru', 'kuru', 'i-adjective', 'na-adjective'];
  const groupSet = new Set(groupIds);
  const selected = rankedUniqueWords(
    words.filter((word) => groupSet.has(classifyGroupId(word))),
  ).slice(0, 12);
  const typeIds = typeIdsForWords(foundationTypesForGroups(groupIds), selected);
  return makeRecommendation({
    id: 'lab-classify-review',
    source: 'lab',
    label: weak.length ? 'Practice weak conjugation groups' : 'Practice group-aware foundations',
    detail: weak.length
      ? `${weak
          .slice(0, 3)
          .map((row) => row.key)
          .join(', ')} need full recall practice.`
      : 'Full recall for forms that prove the group rules you just practiced.',
    wordKeys: selected.map(wordKey),
    typeIds,
    suggestedCount: suggestedCount(selected, typeIds, 14),
  });
}

function rushRecommendation(state, words, activeTool) {
  const weakTypes = weakRows(state.game?.byType, 0.85)
    .map((row) => row.key)
    .filter((typeId) => VALID_TYPE_IDS.has(typeId));
  const weakWordKeys = new Set(weakRows(state.game?.byWord, 0.85).map((row) => row.key));
  if (!weakTypes.length && !weakWordKeys.size && activeTool !== 'games') return null;
  const typeIds = typeIdsForWords(weakTypes.length ? weakTypes : RUSH_FALLBACK_TYPE_IDS, words);
  const selected = rankedUniqueWords(
    weakWordKeys.size
      ? words.filter((word) => weakWordKeys.has(wordKey(word)))
      : wordsForTypes(words, typeIds, 12),
  ).slice(0, 12);
  const filled = selected.length ? selected : wordsForTypes(words, typeIds, 12);
  return makeRecommendation({
    id: 'lab-rush-review',
    source: 'lab',
    label:
      weakTypes.length || weakWordKeys.size ? 'Practice Rush misses' : 'Rush follow-up Practice',
    detail:
      weakTypes.length || weakWordKeys.size
        ? 'Turn fast-drill misses into full recall scheduling.'
        : 'A short Practice set for forms that appear in Rush.',
    wordKeys: filled.map(wordKey),
    typeIds,
    suggestedCount: suggestedCount(filled, typeIds, 10),
  });
}

export function buildLabReviewRecommendations(
  state = {},
  words = [],
  prefs = DEFAULT_PREFS,
  wordLists = [],
  options = {},
) {
  const activeTool = options.activeTool || '';
  const scopedWords = studyScopeWords(state, words, prefs, wordLists, options);
  if (!scopedWords.length) return [];
  const candidates =
    activeTool === 'endings'
      ? [
          onbinRecommendation(state, scopedWords, activeTool),
          registerRecommendation(state, scopedWords, activeTool),
        ]
      : activeTool === 'classify'
        ? [classifyRecommendation(state, scopedWords, activeTool)]
        : activeTool === 'games'
          ? [rushRecommendation(state, scopedWords, activeTool)]
          : [
              onbinRecommendation(state, scopedWords, activeTool),
              registerRecommendation(state, scopedWords, activeTool),
              classifyRecommendation(state, scopedWords, activeTool),
              rushRecommendation(state, scopedWords, activeTool),
            ];
  return candidates.filter(Boolean).slice(0, options.maxRecommendations || 4);
}

export function buildLessonReviewRecommendation(lesson, words = [], options = {}) {
  const typeIds = typeIdsForWords(lesson?.typeIds || [], words);
  const selected = wordsForTypes(words, typeIds, options.wordLimit || 14);
  const labels = typeIds.slice(0, 3).map((typeId) => getTypeInfo(typeId).label);
  const suffix = typeIds.length > labels.length ? ` + ${typeIds.length - labels.length} more` : '';
  return makeRecommendation({
    id: `lesson-${safeId(lesson?.groupId || lesson?.title || 'forms')}`,
    source: 'lesson',
    label: `${lesson?.title || 'Lesson'} Practice`,
    detail: labels.length
      ? `Full recall for ${labels.join(', ')}${suffix}.`
      : 'Full recall for the forms in this lesson.',
    wordKeys: selected.map(wordKey),
    typeIds,
    suggestedCount: options.suggestedCount || suggestedCount(selected, typeIds, 16),
  });
}
