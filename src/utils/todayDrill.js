import { ALL_CARD_TYPES, TYPE_PACKS } from '../data/conjugationTypes.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import {
  RULES,
  enabledTypeIdsFor,
  filterWordsForPrefs,
  isRedundantPracticeType,
  wordKey,
} from './conjugator.js';
import { minimalPairSetMatchesWord, recommendMinimalPairSets } from './minimalPairs.js';
import { localDateKey, ruleWeakScore, weakTypeIdsForState } from './storage.js';

export const TODAY_DRILL_LIST_ID = 'list-today-drill';
export const TODAY_DRILL_LIST_NAME = "Today's Drill";
export const TODAY_DRILL_LIMIT = 10;

const MAX_TYPES = 8;
const MAX_WORDS = 18;

function pushUnique(target, values, limit = Infinity) {
  for (const value of values || []) {
    if (!value || target.includes(value)) continue;
    target.push(value);
    if (target.length >= limit) break;
  }
  return target;
}

function dailyGoalReviewLimit(state = {}, prefs = DEFAULT_PREFS) {
  const rawGoal = Number(prefs?.dailyGoal || DEFAULT_PREFS.dailyGoal);
  const goal = Number.isFinite(rawGoal) && rawGoal > 0 ? Math.round(rawGoal) : TODAY_DRILL_LIMIT;
  const daily = state?.daily || {};
  if (daily.date !== localDateKey() || daily.goalHit) return goal;
  return Math.max(1, goal - (Number(daily.count) || 0));
}

function selectableWords(words, prefs, wordLists) {
  const scopedPrefs = { ...DEFAULT_PREFS, ...prefs, wordListIds: [] };
  const filtered = filterWordsForPrefs(words || [], scopedPrefs, wordLists || []);
  return filtered.length ? filtered : words || [];
}

function candidatesForRule(rule, words, activeTypes, prefs) {
  return rule
    .verbFilter(words)
    .filter((item) => !isRedundantPracticeType(item, rule.type, activeTypes, prefs));
}

function wordWeakScore(state, word) {
  const stats = state?.verbStats?.[word.dict] || {};
  const statScore = Object.values(stats).reduce(
    (sum, entry) => sum + (entry?.incorrect || 0) * 2,
    0,
  );
  const mistakeScore = (state?.mistakes || [])
    .filter(
      (mistake) => !mistake.resolved && mistake.dict === word.dict && mistake.group === word.group,
    )
    .reduce((sum, mistake) => sum + (mistake.count || 1) * 4, 0);
  return statScore + mistakeScore;
}

function rankedWords(words, state) {
  return [...words].sort(
    (a, b) => wordWeakScore(state, b) - wordWeakScore(state, a) || a.dict.localeCompare(b.dict),
  );
}

function typeHasCandidates(typeId, rules, words, activeTypes, prefs) {
  return rules.some(
    (rule) => rule.type === typeId && candidatesForRule(rule, words, activeTypes, prefs).length > 0,
  );
}

export function buildTodayDrillPlan(
  state,
  words,
  prefs = DEFAULT_PREFS,
  wordLists = [],
  options = {},
) {
  const now = options.now || Date.now();
  const availableWords = selectableWords(words, prefs, wordLists);
  const activeTypes = enabledTypeIdsFor(state?.enabledTypes);
  const rulesWithCandidates = RULES.map((rule) => ({
    rule,
    candidates: candidatesForRule(rule, availableWords, activeTypes, prefs),
  })).filter((entry) => activeTypes.includes(entry.rule.type) && entry.candidates.length > 0);

  const dueRules = rulesWithCandidates
    .filter(({ rule }) => {
      const card = state?.cards?.[rule.id];
      return card && card.nextReview <= now;
    })
    .sort(
      (a, b) =>
        (state.cards[a.rule.id]?.nextReview || 0) - (state.cards[b.rule.id]?.nextReview || 0),
    );

  const weakRuleEntries = rulesWithCandidates
    .map((entry) => ({ ...entry, score: ruleWeakScore(state || {}, entry.rule.id) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const weakTypeIds = weakTypeIdsForState(state || {}, activeTypes).filter((typeId) =>
    typeHasCandidates(typeId, RULES, availableWords, activeTypes, prefs),
  );

  const minimalPairRecommendations = recommendMinimalPairSets(state || {}, availableWords, 2);
  const minimalPairTypeIds = minimalPairRecommendations.flatMap((result) => result.set.typeIds);
  const minimalPairWordKeys = minimalPairRecommendations.flatMap((result) =>
    rankedWords(
      availableWords.filter((word) => minimalPairSetMatchesWord(result.set, word)),
      state || {},
    )
      .slice(0, 8)
      .map(wordKey),
  );

  const dueWordKeys = dueRules.flatMap(({ candidates }) =>
    rankedWords(candidates, state || {})
      .slice(0, 2)
      .map(wordKey),
  );
  const weakWordKeys = rankedWords(availableWords, state || {})
    .filter((word) => wordWeakScore(state || {}, word) > 0)
    .slice(0, 10)
    .map(wordKey);

  const typeIds = [];
  pushUnique(
    typeIds,
    dueRules.map(({ rule }) => rule.type),
    MAX_TYPES,
  );
  pushUnique(typeIds, weakTypeIds, MAX_TYPES);
  pushUnique(typeIds, minimalPairTypeIds, MAX_TYPES);
  pushUnique(typeIds, activeTypes, MAX_TYPES);
  pushUnique(typeIds, TYPE_PACKS[0].typeIds, MAX_TYPES);

  const usableTypeIds = typeIds
    .filter((typeId) => ALL_CARD_TYPES.some((type) => type.id === typeId))
    .filter((typeId) => typeHasCandidates(typeId, RULES, availableWords, activeTypes, prefs))
    .slice(0, MAX_TYPES);

  const wordKeys = [];
  pushUnique(wordKeys, dueWordKeys, MAX_WORDS);
  pushUnique(wordKeys, weakWordKeys, MAX_WORDS);
  pushUnique(wordKeys, minimalPairWordKeys, MAX_WORDS);
  pushUnique(wordKeys, availableWords.slice(0, MAX_WORDS).map(wordKey), MAX_WORDS);

  const sourceCounts = {
    due: dueRules.length,
    weak: weakRuleEntries.length,
    minimalPairs: minimalPairRecommendations.length,
  };

  const sourceLabels = [
    sourceCounts.due ? `${sourceCounts.due} due` : '',
    sourceCounts.weak ? `${sourceCounts.weak} weak` : '',
    sourceCounts.minimalPairs ? `${sourceCounts.minimalPairs} contrast` : '',
  ].filter(Boolean);

  return {
    available: usableTypeIds.length > 0 && availableWords.length > 0,
    reviewLimit: options.reviewLimit || dailyGoalReviewLimit(state, prefs),
    typeIds: usableTypeIds,
    wordKeys,
    dueRuleIds: dueRules.map(({ rule }) => rule.id),
    minimalPairSetIds: minimalPairRecommendations.map((result) => result.set.id),
    sourceCounts,
    sourceLabels,
    title: sourceLabels.length ? 'Today drill' : 'Core warmup',
    summary: sourceLabels.length
      ? sourceLabels.join(' / ')
      : 'Fresh core forms using your current filters',
  };
}

export function upsertTodayDrillList(wordLists = [], plan) {
  if (!plan?.wordKeys?.length) return wordLists || [];
  const todayList = {
    id: TODAY_DRILL_LIST_ID,
    name: TODAY_DRILL_LIST_NAME,
    wordKeys: plan.wordKeys,
  };
  return (wordLists || []).some((list) => list.id === TODAY_DRILL_LIST_ID)
    ? wordLists.map((list) => (list.id === TODAY_DRILL_LIST_ID ? todayList : list))
    : [...(wordLists || []), todayList];
}

export function practicePrefsForTodayDrill(prefs = DEFAULT_PREFS, plan) {
  return {
    ...prefs,
    drillMode: 'word',
    minimalPairSetId: '',
    reviewLimit: 0,
    reviewLimitSource: '',
    wordListIds: plan?.wordKeys?.length ? [TODAY_DRILL_LIST_ID] : [],
  };
}
