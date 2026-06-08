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
  return (words || [])
    .flatMap((word) =>
      practiceTypesForItem(word, enabled, prefs).map((type) => ({
        word,
        typeId: type.id,
        score: weaknessScoreForCard(state.weakness, word, type.id),
      })),
    )
    .filter((row) => row.word && row.typeId && conjugateItem(row.word, row.typeId))
    .sort((a, b) => {
      const repeatA = blockedWordKey && wordKey(a.word) === blockedWordKey ? 1 : 0;
      const repeatB = blockedWordKey && wordKey(b.word) === blockedWordKey ? 1 : 0;
      return (
        repeatA - repeatB || b.score - a.score || wordKey(a.word).localeCompare(wordKey(b.word))
      );
    });
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
        typeId: card.typeId,
        sourceTypeId: card.sourceTypeId,
        correct: result.correct,
        assisted: result.assisted,
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
