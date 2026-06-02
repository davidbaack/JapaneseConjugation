import { BASICS_TYPE_IDS, LEARNER_DEFAULT_TYPE_IDS } from '../data/conjugationTypes.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { buildTodayDrillPlan, practicePrefsForTodayDrill } from './todayDrill.js';
import { typeIdFromCardId } from './storage.js';

export const PRACTICAL_CORE_PATH_STAGES = [
  {
    id: 'foundations',
    label: 'Foundations',
    focus: 'Past, negative, polite, and te-form',
    targetCorrect: 12,
    typeIds: BASICS_TYPE_IDS,
  },
  {
    id: 'everyday',
    label: 'Everyday production',
    focus: 'Can, want to, if/when, ongoing',
    targetCorrect: 30,
    typeIds: LEARNER_DEFAULT_TYPE_IDS,
  },
  {
    id: 'fluency',
    label: 'Mixed fluency',
    focus: 'Due cards, weak forms, and Core review',
    targetCorrect: 60,
    typeIds: LEARNER_DEFAULT_TYPE_IDS,
  },
];

function stageStats(state = {}, stage) {
  const stageTypes = new Set(stage.typeIds);
  let correct = 0;
  let incorrect = 0;
  let due = 0;
  const now = Date.now();

  for (const [cardId, card] of Object.entries(state.cards || {})) {
    if (!card || !stageTypes.has(typeIdFromCardId(cardId))) continue;
    correct += Number(card.correct) || 0;
    incorrect += Number(card.incorrect) || 0;
    if ((Number(card.nextReview) || 0) <= now) due += 1;
  }

  const attempted = correct + incorrect;
  const accuracy = attempted ? Math.round((correct / attempted) * 100) : 0;
  const progressPct = Math.min(100, Math.round((correct / stage.targetCorrect) * 100));

  return {
    correct,
    incorrect,
    attempted,
    accuracy,
    due,
    progressPct,
    complete: progressPct >= 100,
  };
}

export function practicalCorePrefs(prefs = DEFAULT_PREFS) {
  return {
    ...DEFAULT_PREFS,
    ...(prefs || {}),
    answerMode: prefs?.answerMode || DEFAULT_PREFS.answerMode,
    kanaAssist: prefs?.kanaAssist || DEFAULT_PREFS.kanaAssist,
    reviewStyle: 'auto',
    sourceFormStrategy: 'auto',
    promptForm: 'dictionary',
    minimalPairSetId: '',
    minimalPairReturn: null,
    reviewLimit: 0,
    reviewLimitSource: '',
    practicePath: 'practical-core',
    wordListIds: [],
  };
}

export function practicePrefsForPracticalCorePath(prefs = DEFAULT_PREFS, plan) {
  return {
    ...practicePrefsForTodayDrill(practicalCorePrefs(prefs), plan),
    practicePath: 'practical-core',
  };
}

export function buildPracticalCorePath(
  state,
  words,
  prefs = DEFAULT_PREFS,
  wordLists = [],
  options = {},
) {
  const stages = PRACTICAL_CORE_PATH_STAGES.map((stage) => ({
    ...stage,
    stats: stageStats(state, stage),
  }));
  const activeStage = stages.find((stage) => !stage.stats.complete) || stages[stages.length - 1];
  const planState = { ...(state || {}), enabledTypes: activeStage.typeIds };
  const planPrefs = practicalCorePrefs(prefs);
  const plan = buildTodayDrillPlan(planState, words, planPrefs, wordLists, options);
  const completeStages = stages.filter((stage) => stage.stats.complete).length;
  const totalProgressPct = Math.round(
    stages.reduce((sum, stage) => sum + stage.stats.progressPct, 0) / stages.length,
  );

  return {
    available: plan.available,
    activeStageId: activeStage.id,
    activeStage,
    stages,
    completeStages,
    totalProgressPct,
    plan: {
      ...plan,
      title: 'Practical Core Path',
      summary: `${activeStage.label}: ${activeStage.focus}`,
    },
  };
}
