import { DEFAULT_PREFS } from '../data/defaults.js';
import { EVERYDAY_TYPE_IDS, getTypeInfo } from '../data/conjugationTypes.js';
import { cardIdFor, bumpDaily, defaultState, gradeCard, recordMistake } from './storage.js';
import {
  conjugateItem,
  isAdjective,
  isTypeCompatible,
  practiceTypesForItem,
  surfaceFormFor,
  wordKey,
} from './conjugator.js';
import { normalizeJapaneseText } from './display.js';
import { groupDisplayLabel } from './groupDisplay.js';
import { recordReadinessAttempt } from './readiness.js';
import { toHiragana, kanaToRomaji } from './romaji.js';
import {
  rankedWeaknessLanes,
  recordWeaknessAttempt,
  weaknessScoreForCard,
} from './subcategoryWeakness.js';

export const GUIDE_SESSION_TARGET = 8;
export const GUIDE_STEP_IDS = ['base', 'group', 'answer'];

const GUIDE_STEP_LABELS = {
  base: 'plain form',
  group: 'word group',
  answer: 'final answer',
};

const GUIDE_GROUP_DIAGNOSTIC_LABELS = {
  godan: 'godan verbs',
  ichidan: 'ichidan verbs',
  suru: 'suru verbs',
  kuru: 'kuru verbs',
  irregular: 'irregular verbs',
  'i-adjective': 'i-adjectives',
  'na-adjective': 'na-adjectives',
  'irregular-adjective': 'irregular adjectives',
};

const VERB_SOURCE_TYPES = [
  'polite-present',
  'plain-past',
  'plain-negative',
  'plain-past-negative',
  'te-form',
];
const ADJECTIVE_SOURCE_TYPES = [
  'adj-polite-present',
  'adj-plain-past',
  'adj-plain-negative',
  'adj-plain-past-negative',
  'adj-te-form',
];

function cleanText(value) {
  return normalizeJapaneseText(String(value || '').trim());
}

function pct(correct, attempted) {
  return attempted ? correct / attempted : 0;
}

function stepRate(guide, stepId) {
  const row = guide?.byStep?.[stepId] || {};
  const attempted = Number(row.attempted) || 0;
  const correct = Number(row.correct) || 0;
  const assisted = Number(row.assisted) || 0;
  return {
    attempted,
    correct,
    assisted,
    misses: Math.max(0, attempted - correct),
    accuracy: pct(correct, attempted),
    unassistedCorrect: Math.max(0, correct - Math.min(correct, assisted)),
  };
}

function diagnosticGroupLabel(groupId) {
  if (!groupId) return 'word groups';
  return GUIDE_GROUP_DIAGNOSTIC_LABELS[groupId] || groupDisplayLabel(groupId).toLowerCase();
}

function recentRowsWithSteps(guide) {
  return (guide?.recent || []).filter(
    (row) => row?.steps && GUIDE_STEP_IDS.some((id) => row.steps[id]),
  );
}

function topMissedGroup(rows, stepId, options = {}) {
  const counts = new Map();
  for (const row of rows) {
    const step = row?.steps?.[stepId];
    if (!step || step.correct) continue;
    if (options.requireAnswerCorrect && !row?.steps?.answer?.correct) continue;
    const groupId = row.group || row.expectedGroup || '';
    if (!groupId) continue;
    counts.set(groupId, (counts.get(groupId) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

function answerMatches(value, targets = []) {
  const raw = String(value || '').trim();
  const compact = raw.toLowerCase().replace(/\s+/g, '');
  if (!raw) return false;
  return targets.filter(Boolean).some((target) => {
    const targetText = String(target || '');
    return (
      cleanText(raw) === cleanText(targetText) ||
      toHiragana(raw) === targetText ||
      compact === kanaToRomaji(targetText).toLowerCase()
    );
  });
}

function guideBaseForm(word) {
  return (
    surfaceFormFor(word, isAdjective(word) ? 'adj-plain-present' : 'plain-present') || word.dict
  );
}

export function guideGroupChoice(word) {
  if (word?.group === 'suru' || word?.group === 'kuru' || word?.group === 'irregular-adjective') {
    return 'irregular';
  }
  return word?.group || '';
}

export function guideGroupOptions(word) {
  if (isAdjective(word)) {
    const base = [
      { id: 'i-adjective', label: 'i-adjective' },
      { id: 'na-adjective', label: 'na-adjective' },
    ];
    return word?.group === 'irregular-adjective'
      ? [...base, { id: 'irregular', label: 'irregular' }]
      : base;
  }
  return [
    { id: 'godan', label: 'godan / u-verb' },
    { id: 'ichidan', label: 'ichidan / ru-verb' },
    { id: 'irregular', label: 'irregular' },
  ];
}

function sourceCandidatesFor(word, targetTypeId) {
  const ids = isAdjective(word) ? ADJECTIVE_SOURCE_TYPES : VERB_SOURCE_TYPES;
  const target = surfaceFormFor(word, targetTypeId) || conjugateItem(word, targetTypeId);
  return ids
    .filter((id) => id !== targetTypeId && isTypeCompatible(word, id))
    .map((id) => ({ id, form: surfaceFormFor(word, id) || conjugateItem(word, id) }))
    .filter((row) => row.form && row.form !== target);
}

export function selectGuideSourceType(word, targetTypeId, options = {}) {
  const candidates = sourceCandidatesFor(word, targetTypeId);
  if (!candidates.length) return isAdjective(word) ? 'adj-plain-present' : 'plain-present';
  const seed = Math.abs(Number(options.seed || 0));
  return candidates[seed % candidates.length].id;
}

function candidateRows(words, state = defaultState(), prefs = DEFAULT_PREFS, options = {}) {
  const enabled = state.enabledTypes?.length ? state.enabledTypes : EVERYDAY_TYPE_IDS;
  const blockedWordKey = options.previousWord ? wordKey(options.previousWord) : '';
  const targetWordKey = options.targetWord ? wordKey(options.targetWord) : '';
  const targetTypeId = options.targetTypeId || '';
  const rows = (words || [])
    .flatMap((word) => {
      const focusedWord = targetWordKey && wordKey(word) === targetWordKey;
      const types =
        focusedWord && targetTypeId && isTypeCompatible(word, targetTypeId)
          ? [{ id: targetTypeId }]
          : practiceTypesForItem(word, enabled, prefs);
      return types.map((type) => ({
        word,
        typeId: type.id,
        score: weaknessScoreForCard(state.weakness, word, type.id),
      }));
    })
    .filter((row) => row.word && row.typeId && conjugateItem(row.word, row.typeId))
    .sort((a, b) => {
      const repeatA = blockedWordKey && wordKey(a.word) === blockedWordKey ? 1 : 0;
      const repeatB = blockedWordKey && wordKey(b.word) === blockedWordKey ? 1 : 0;
      return (
        repeatA - repeatB || b.score - a.score || wordKey(a.word).localeCompare(wordKey(b.word))
      );
    });
  if (targetWordKey || targetTypeId) {
    const focusedRows = rows.filter(
      (row) =>
        (!targetWordKey || wordKey(row.word) === targetWordKey) &&
        (!targetTypeId || row.typeId === targetTypeId),
    );
    if (focusedRows.length) return focusedRows;
  }
  return rows;
}

export function buildGuideCard(words, state = defaultState(), prefs = DEFAULT_PREFS, options = {}) {
  const rows = candidateRows(words, state, prefs, options);
  if (!rows.length) return null;

  const weakLane = rankedWeaknessLanes(state.weakness)[0] || null;
  const weakMatch = weakLane
    ? rows.find((row) => row.typeId === weakLane.typeId && row.score > 0)
    : null;
  const row = weakMatch || rows[0];
  const seed = options.seed ?? Date.now();
  const sourceTypeId = selectGuideSourceType(row.word, row.typeId, { seed });
  const sourceForm =
    surfaceFormFor(row.word, sourceTypeId) || conjugateItem(row.word, sourceTypeId);
  const expectedAnswer =
    surfaceFormFor(row.word, row.typeId) || conjugateItem(row.word, row.typeId);
  return {
    id: `${wordKey(row.word)}|${row.typeId}|${sourceTypeId}`,
    word: row.word,
    typeId: row.typeId,
    sourceTypeId,
    sourceForm,
    expectedBase: guideBaseForm(row.word),
    expectedBaseVariants: [
      guideBaseForm(row.word),
      row.word.reading,
      row.word.dict,
      conjugateItem(row.word, isAdjective(row.word) ? 'adj-plain-present' : 'plain-present'),
    ],
    expectedGroup: guideGroupChoice(row.word),
    expectedAnswer,
    expectedAnswerVariants: [expectedAnswer, conjugateItem(row.word, row.typeId)],
    targetLabel: getTypeInfo(row.typeId).label || row.typeId,
    sourceLabel: getTypeInfo(sourceTypeId).label || sourceTypeId,
  };
}

export function gradeGuideSteps(card, answers = {}, assistedSteps = {}) {
  const baseOk = answerMatches(answers.base, card.expectedBaseVariants || [card.expectedBase]);
  const groupOk = String(answers.group || '') === card.expectedGroup;
  const answerOk = answerMatches(
    answers.answer,
    card.expectedAnswerVariants || [card.expectedAnswer],
  );
  const steps = {
    base: {
      id: 'base',
      label: 'Find plain form',
      correct: baseOk,
      expected: card.expectedBase,
      submitted: answers.base || '',
      assisted: !!assistedSteps.base,
    },
    group: {
      id: 'group',
      label: 'Choose the group',
      correct: groupOk,
      expected: card.expectedGroup,
      expectedLabel: groupDisplayLabel(card.word.group),
      submitted: answers.group || '',
      assisted: !!assistedSteps.group,
    },
    answer: {
      id: 'answer',
      label: 'Build the answer',
      correct: answerOk,
      expected: card.expectedAnswer,
      submitted: answers.answer || '',
      assisted: !!assistedSteps.answer,
    },
  };
  const assisted = Object.values(assistedSteps || {}).some(Boolean);
  const correct = GUIDE_STEP_IDS.every((id) => steps[id].correct);
  return { correct, assisted, steps };
}

export function defaultGuideState() {
  return {
    attempted: 0,
    correct: 0,
    assisted: 0,
    byStep: {
      base: { attempted: 0, correct: 0, assisted: 0 },
      group: { attempted: 0, correct: 0, assisted: 0 },
      answer: { attempted: 0, correct: 0, assisted: 0 },
    },
    recent: [],
  };
}

export function normalizeGuideState(guide = null) {
  const base = defaultGuideState();
  const source = guide && typeof guide === 'object' ? guide : {};
  const byStep = { ...base.byStep };
  for (const id of GUIDE_STEP_IDS) {
    const row = source.byStep?.[id] || {};
    byStep[id] = {
      attempted: Number(row.attempted) || 0,
      correct: Number(row.correct) || 0,
      assisted: Number(row.assisted) || 0,
    };
  }
  return {
    attempted: Number(source.attempted) || 0,
    correct: Number(source.correct) || 0,
    assisted: Number(source.assisted) || 0,
    byStep,
    recent: Array.isArray(source.recent) ? source.recent.slice(0, 20) : [],
  };
}

export function buildGuideDiagnosticInsight(guide = null, options = {}) {
  const current = normalizeGuideState(guide);
  const minAttempts = Math.max(1, Number(options.minAttempts) || 2);
  if (current.attempted < minAttempts) return null;

  const base = stepRate(current, 'base');
  const group = stepRate(current, 'group');
  const answer = stepRate(current, 'answer');
  const recent = recentRowsWithSteps(current);
  const recentAnswerKnown = recent.filter(
    (row) => row.steps?.answer?.correct && !row.steps.answer.assisted,
  ).length;
  const recentGroupMissWithAnswer = recent.filter(
    (row) => row.steps?.group && !row.steps.group.correct && row.steps?.answer?.correct,
  ).length;
  const answerLooksKnown =
    answer.unassistedCorrect >= 2 ||
    recentAnswerKnown >= 2 ||
    (answer.attempted >= minAttempts && answer.accuracy >= 0.7);
  const groupLooksWeak =
    group.misses >= 2 ||
    recentGroupMissWithAnswer >= 2 ||
    (group.attempted >= minAttempts && group.accuracy <= 0.55);

  if (answerLooksKnown && groupLooksWeak && group.accuracy + 0.2 < answer.accuracy) {
    const groupId =
      topMissedGroup(recent, 'group', { requireAnswerCorrect: true }) ||
      topMissedGroup(recent, 'group') ||
      '';
    return {
      id: 'guide-group-after-answer',
      stepId: 'group',
      message: `You know the ending but keep misclassifying ${diagnosticGroupLabel(groupId)}.`,
      detail: 'Guide is seeing the final-answer step land more often than the group choice.',
      actionLabel: 'Guide',
    };
  }

  if (
    base.misses >= 2 &&
    base.accuracy + 0.2 < Math.min(group.accuracy || 0, answer.accuracy || 0)
  ) {
    return {
      id: 'guide-base-gap',
      stepId: 'base',
      message:
        'You can choose the group and build the ending, but recovering the plain form is still shaky.',
      detail: 'Guide is catching misses before the final conjugation step.',
      actionLabel: 'Guide',
    };
  }

  if (
    answer.misses >= 2 &&
    answer.accuracy + 0.2 < Math.min(base.accuracy || 0, group.accuracy || 0)
  ) {
    return {
      id: 'guide-answer-gap',
      stepId: 'answer',
      message: 'You can recover the plain form and group, but the final ending still needs reps.',
      detail: 'Guide is seeing the setup work land before the final-answer step.',
      actionLabel: 'Guide',
    };
  }

  const weakest = [
    { stepId: 'base', row: base },
    { stepId: 'group', row: group },
    { stepId: 'answer', row: answer },
  ]
    .filter(({ row }) => row.attempted >= minAttempts && row.misses > 0)
    .sort((a, b) => a.row.accuracy - b.row.accuracy || b.row.misses - a.row.misses)[0];

  if (!weakest) return null;
  return {
    id: `guide-${weakest.stepId}-weak`,
    stepId: weakest.stepId,
    message: `Guide is seeing ${GUIDE_STEP_LABELS[weakest.stepId]} as the weak step.`,
    detail: 'Step-by-step practice can isolate that before it turns into a full-card miss.',
    actionLabel: 'Guide',
  };
}

export function recordGuideAttempt(guide, card, result, options = {}) {
  const current = normalizeGuideState(guide);
  const byStep = { ...current.byStep };
  for (const id of GUIDE_STEP_IDS) {
    const step = result.steps[id];
    const row = byStep[id] || { attempted: 0, correct: 0, assisted: 0 };
    byStep[id] = {
      attempted: row.attempted + 1,
      correct: row.correct + (step.correct ? 1 : 0),
      assisted: row.assisted + (step.assisted ? 1 : 0),
    };
  }
  return {
    attempted: current.attempted + 1,
    correct: current.correct + (result.correct ? 1 : 0),
    assisted: current.assisted + (result.assisted ? 1 : 0),
    byStep,
    recent: [
      {
        at: options.now || Date.now(),
        wordKey: wordKey(card.word),
        group: card.word?.group || '',
        expectedGroup: card.expectedGroup || '',
        typeId: card.typeId,
        sourceTypeId: card.sourceTypeId,
        correct: result.correct,
        assisted: result.assisted,
        steps: Object.fromEntries(
          GUIDE_STEP_IDS.map((id) => [
            id,
            {
              correct: !!result.steps[id]?.correct,
              assisted: !!result.steps[id]?.assisted,
            },
          ]),
        ),
      },
      ...current.recent,
    ].slice(0, 20),
  };
}

export function applyGuideAttemptToState(state, card, result, options = {}) {
  const rid = cardIdFor(card.word, card.typeId);
  const responseMs = Math.max(0, Number(options.responseMs) || 0);
  const dailyGoal = Number(options.dailyGoal || DEFAULT_PREFS.dailyGoal);
  const next = {
    ...state,
    cards: {
      ...(state.cards || {}),
      [rid]: gradeCard((state.cards || {})[rid], result.correct),
    },
    session: {
      ...(state.session || defaultState().session),
      reviewed: (state.session?.reviewed || 0) + 1,
      correct: (state.session?.correct || 0) + (result.correct ? 1 : 0),
    },
    daily: bumpDaily(state.daily, result.correct, dailyGoal),
    readiness: recordReadinessAttempt(state.readiness, rid, {
      correct: result.correct,
      responseMs,
      answerMode: result.assisted ? 'self-check' : 'input',
    }),
    weakness: recordWeaknessAttempt(state.weakness, {
      word: card.word,
      typeId: card.typeId,
      correct: result.correct,
      responseMs,
    }),
    guide: recordGuideAttempt(state.guide, card, result, { now: options.now }),
  };
  if (!result.correct) {
    next.mistakes = recordMistake(
      state.mistakes,
      card.word,
      card.typeId,
      card.sourceTypeId,
      result.steps.answer.submitted,
      card.expectedAnswer,
      {
        dimension: 'guide',
        sourceType: card.sourceTypeId,
        targetType: card.typeId,
        direction: 'guided',
      },
    );
  }
  return next;
}
