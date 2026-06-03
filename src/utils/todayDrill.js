import { ALL_CARD_TYPES, TYPE_PACKS } from '../data/conjugationTypes.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { enabledTypeIdsFor, wordKey } from './conjugator.js';
import { minimalPairSetMatchesWord, recommendMinimalPairSets } from './minimalPairs.js';
import { cardIdFor, cardWeakScore, localDateKey, weakTypeIdsForState } from './storage.js';
import { buildRuleCandidates, ruleCandidateTypeSet } from './ruleCandidates.js';
import { filterWordsForStudyScope } from './vocabularyProgression.js';
import { reviewTypeIdsForState } from './reviewScope.js';

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

function selectableWords(state, words, prefs, wordLists, options = {}) {
  const scopedPrefs = { ...DEFAULT_PREFS, ...prefs, wordListIds: [] };
  const filtered = filterWordsForStudyScope(
    words || [],
    state || {},
    scopedPrefs,
    wordLists || [],
    options,
  );
  return filtered;
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

function buildForecast(state, rulesWithCandidates) {
  const now = Date.now();
  const HOUR = 3600000;
  const DAY = 86400000;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const endOfTodayMs = endOfToday.getTime();
  const endOfTomorrow = endOfTodayMs + DAY;

  const future = rulesWithCandidates
    .flatMap(({ rule, candidates }) =>
      candidates.map((word) => state?.cards?.[cardIdFor(word, rule.type)]),
    )
    .filter((c) => c && c.nextReview > now)
    .map((c) => c.nextReview)
    .sort((a, b) => a - b);

  return {
    in1h: future.filter((t) => t <= now + HOUR).length,
    in4h: future.filter((t) => t > now + HOUR && t <= now + 4 * HOUR).length,
    today: future.filter((t) => t > now + 4 * HOUR && t <= endOfTodayMs).length,
    tomorrow: future.filter((t) => t > endOfTodayMs && t <= endOfTomorrow).length,
    week: future.filter((t) => t > endOfTomorrow && t <= now + 7 * DAY).length,
    nextDueAt: future[0] || null,
  };
}

export function forecastLabel(forecast) {
  if (!forecast) return '';
  const parts = [
    forecast.in1h && `${forecast.in1h} in 1h`,
    forecast.in4h && `${forecast.in4h} in 4h`,
    forecast.today && `${forecast.today} later today`,
    forecast.tomorrow && `${forecast.tomorrow} tomorrow`,
    forecast.week && `${forecast.week} this week`,
  ].filter(Boolean);
  return parts.join(' · ');
}

function rankedWords(words, state) {
  return [...words].sort(
    (a, b) => wordWeakScore(state, b) - wordWeakScore(state, a) || a.dict.localeCompare(b.dict),
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
  const availableWords = selectableWords(state, words, prefs, wordLists, options);
  const activeTypes = reviewTypeIdsForState(state, enabledTypeIdsFor(state?.enabledTypes));
  const rulesWithCandidates = buildRuleCandidates(availableWords, activeTypes, prefs, {
    activeTypes,
  });
  const candidateTypeIds = ruleCandidateTypeSet(rulesWithCandidates);

  const dueRules = rulesWithCandidates
    .map((entry) => ({
      ...entry,
      dueCandidates: entry.candidates.filter((word) => {
        const card = state?.cards?.[cardIdFor(word, entry.rule.type)];
        return card && card.nextReview <= now;
      }),
    }))
    .filter((entry) => entry.dueCandidates.length)
    .sort((a, b) => {
      const aNext = Math.min(
        ...a.dueCandidates.map(
          (word) => state.cards[cardIdFor(word, a.rule.type)]?.nextReview || 0,
        ),
      );
      const bNext = Math.min(
        ...b.dueCandidates.map(
          (word) => state.cards[cardIdFor(word, b.rule.type)]?.nextReview || 0,
        ),
      );
      return aNext - bNext;
    })
    .map(({ dueCandidates, ...entry }) => ({ ...entry, candidates: dueCandidates }));

  const weakRuleEntries = rulesWithCandidates
    .map((entry) => ({
      ...entry,
      score: entry.candidates.reduce(
        (sum, word) =>
          sum + cardWeakScore(state || {}, cardIdFor(word, entry.rule.type), word, entry.rule.type),
        0,
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const weakTypeIds = weakTypeIdsForState(state || {}, activeTypes).filter((typeId) =>
    candidateTypeIds.has(typeId),
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
    .filter((typeId) => candidateTypeIds.has(typeId))
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

  const upcomingForecast = buildForecast(state, rulesWithCandidates);

  return {
    available: usableTypeIds.length > 0 && availableWords.length > 0,
    reviewLimit: options.reviewLimit || dailyGoalReviewLimit(state, prefs),
    typeIds: usableTypeIds,
    wordKeys,
    dueRuleIds: dueRules.flatMap(({ rule, candidates }) =>
      candidates.map((word) => cardIdFor(word, rule.type)),
    ),
    minimalPairSetIds: minimalPairRecommendations.map((result) => result.set.id),
    sourceCounts,
    sourceLabels,
    upcomingForecast,
    forecastLabel: forecastLabel(upcomingForecast),
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
  const basePrefs = { ...(prefs || DEFAULT_PREFS) };
  delete basePrefs.drillMode;
  delete basePrefs.drillDirection;
  const sourceFormStrategy = basePrefs.sourceFormStrategy || DEFAULT_PREFS.sourceFormStrategy;
  return {
    ...basePrefs,
    reviewStyle: basePrefs.reviewStyle || DEFAULT_PREFS.reviewStyle,
    sourceFormStrategy,
    promptForm:
      sourceFormStrategy === 'mixed'
        ? 'random'
        : sourceFormStrategy === 'masu'
          ? 'polite-present'
          : 'dictionary',
    minimalPairSetId: '',
    minimalPairReturn: null,
    reviewLimit: 0,
    reviewLimitSource: '',
    practicePath: '',
    wordListIds: plan?.wordKeys?.length ? [TODAY_DRILL_LIST_ID] : [],
  };
}
