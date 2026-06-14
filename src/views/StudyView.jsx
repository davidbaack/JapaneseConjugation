import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import {
  IconVolume,
  IconChat,
  IconEye,
  IconEyeOff,
  IconFlame,
  IconList,
  IconRefresh,
  IconSettings,
  IconBook,
} from '../components/Icons.jsx';
import { ALL_CARD_TYPES, FORM_GROUPS } from '../data/conjugationTypes.js';
import {
  getSpeechRecognitionConstructor,
  playPronunciation,
  speechRecognitionErrorMessage,
} from '../utils/speech.js';
import { useApp } from '../state/AppStateContext.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import PitchAccentDisplay from '../components/PitchAccentDisplay.jsx';
import { lessonForType } from '../data/lessonContent.js';
import { ChatPanel } from '../components/ChatPanel.jsx';
import { toHiragana, toHiraganaProgress, toKanaInputValue } from '../utils/romaji.js';
import {
  conjugateItem,
  enabledTypeIdsFor,
  pickPromptType,
  getTypeInfo,
  getWordMeta,
  isAdjective,
  isRedundantPracticeType,
  practiceTypesForItem,
  surfaceFormFor,
} from '../utils/conjugator.js';
import { filterWordsForStudyScope } from '../utils/vocabularyProgression.js';
import { explainItem, stepCoachHint } from '../utils/conjugatorExplain.js';
import { groupAliasText, groupDisplayLabel } from '../utils/groupDisplay.js';
import {
  selectNext,
  buildFocusCard,
  recordMistake,
  markMistakeResolved,
  gradeCard,
  gradeTransformationStats,
  bumpDaily,
  cardIdFor,
} from '../utils/storage.js';
import { recordReadinessAttempt } from '../utils/readiness.js';
import {
  formDisplay,
  promptDisplay,
  englishForForm,
  answerPhaseTaskDetails,
  makeChoices,
  makeReverseChoices,
  dictionaryAnswerMatches,
  normalizeAnswerMode,
  resolveKanaAssist,
  autoAdvanceAnswerFormKey,
  resolveAutoAdvanceCorrect,
  kanaMatchDisplayForPrefs,
  spokenAnswerResult,
} from '../utils/display.js';
import { accentForForm } from '../utils/pitchAccent.js';
import { sentenceDisplay } from '../utils/sentenceDisplay.js';
import { fetchBundledSentence } from '../utils/sentenceCorpus.js';
import { fetchTailoredSentence } from '../utils/sentenceLibrary.js';
import { buildOfflineSentenceEntry, buildSentencePromptModel } from '../utils/sentencePrompt.js';
import {
  bumpSessionMistakePattern,
  labRouteForMistakePattern,
  rankSessionMistakePatterns,
} from '../utils/mistakeDiagnosis.js';
import {
  clearMinimalPairPrefs,
  getMinimalPairSet,
  minimalPairFeedbackForCard,
  minimalPairReturnEnabledTypes,
  minimalPairSetMatchesCard,
  recordMinimalPairResult,
} from '../utils/minimalPairs.js';
import { buildRuleCandidates } from '../utils/ruleCandidates.js';
import { buildWeaknessFamilyRows, recordWeaknessAttempt } from '../utils/subcategoryWeakness.js';
import {
  excludeWordFromReviewState,
  includeFormFamilyInReviewState,
  includeWordInReviewState,
  reviewTypeIdsForState,
} from '../utils/reviewScope.js';
import { buildGuideDiagnosticInsight } from '../utils/guidePractice.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { kanaCoachCells, explainReversePrompt } from '../utils/kanaCoach.js';
import {
  PracticeRunReviewPage,
  cardOriginForStudyCard,
  cardOriginMeta,
  reviewFeedbackActionForRecord,
  snapshotPracticePrefs,
  withCardOrigin,
} from './study/StudyReviewPanels.jsx';
import { StudyFocusBar } from './study/StudyFocusBar.jsx';
import {
  CARD_TYPE_BY_ID,
  FAMILY_INTRO_REVIEW_LIMIT_SOURCE,
  FocusCategoryMap,
  LESSON_BY_GROUP_ID,
  PracticeScopeSidebar,
  familyIntroFocusFromLaunch,
  familyIntroTypeIds,
} from './study/PracticeMaps.jsx';
import { MistakeRouteHint, ReviewsDashboard } from './study/ReviewsDashboard.jsx';
import { AnswerInputPanel } from './study/AnswerInputPanel.jsx';
export { kanaCoachCells, explainReversePrompt };
export { reviewFeedbackActionForRecord, ReviewsDashboard };

// Keep the active card across a page refresh so reloading Study resumes the
// same word/form rather than drawing a fresh one. Scoped to sessionStorage so
// it survives reloads but resets when the tab is closed.
const STUDY_CURRENT_KEY = 'jp-study-current';
const DICTIONARY_TYPE_ID = 'dictionary';
const DICTIONARY_TYPE_INFO = { label: 'Dictionary Form', sub: '辞書形', hint: 'dictionary form' };
const REVIEW_LIMIT_SOURCES = new Set(['lab', 'recommendation', FAMILY_INTRO_REVIEW_LIMIT_SOURCE]);
const REVIEW_SESSION_HISTORY_SIZE = 4;
const CORRECT_AUTO_ADVANCE_MS = 850;
const SESSION_RECENT_OUTCOME_LIMIT = 6;
const ANSWER_STYLE_OPTIONS = [
  { id: 'input', label: 'Type' },
  { id: 'choice', label: 'Choose' },
  { id: 'self-check', label: 'Self-check' },
  { id: 'speak', label: 'Speak' },
];

function focusWithoutScroll(element) {
  if (!element || typeof window === 'undefined') return;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  element.focus({ preventScroll: true });
  if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
    window.scrollTo(scrollX, scrollY);
  }
}

function activeReviewLimitFromPrefs(prefs = DEFAULT_PREFS) {
  if (!REVIEW_LIMIT_SOURCES.has(prefs.reviewLimitSource)) return 0;
  const limit = Number(prefs.reviewLimit || 0);
  return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

function transformationRouteText(sourceInfo, targetInfo) {
  return `${sourceInfo.label} -> ${targetInfo.label}`;
}

function transformationHintFromBase(baseHint, { reverseDrill, sourceInfo, targetInfo }) {
  const sourceLabel = sourceInfo?.label || 'source form';
  const targetLabel = targetInfo?.label || 'target form';
  const prefix = reverseDrill
    ? `Work backward from the ${sourceLabel}. Recover the dictionary form before thinking about any new ending.`
    : `Change ${sourceLabel} into ${targetLabel}: keep the same word, then rebuild the requested form.`;
  return {
    ...baseHint,
    text: `${prefix} ${baseHint.text}`,
  };
}

function transformationReviewExplanation({
  item,
  type,
  reverseDrill,
  sourceInfo,
  targetInfo,
  sourceForm,
  expected,
}) {
  const base = reverseDrill ? explainReversePrompt(item, type) : explainItem(item, type);
  const route = transformationRouteText(sourceInfo, targetInfo);
  const derivation =
    sourceForm && expected && sourceForm !== expected
      ? `${sourceForm} -> ${expected}`
      : base.derivation;
  if (reverseDrill) {
    return {
      ...base,
      intro: `${item.dict} (${item.reading}) was a ${route} transformation.`,
      rule: `Recognize the prompt as ${sourceInfo.label}, then recover the dictionary form. ${
        base.rule || ''
      }`.trim(),
      derivation,
    };
  }
  return {
    ...base,
    intro: `${item.dict} (${item.reading}) was a ${route} transformation.`,
    rule:
      sourceInfo.label === DICTIONARY_TYPE_INFO.label
        ? base.rule
        : `Recognize the prompt as ${sourceInfo.label}, keep the same word, then build ${
            targetInfo.label
          }. ${base.rule || ''}`.trim(),
    derivation,
    note: base.note
      ? `${base.note} The starting form is only the prompt; the answer is the target form.`
      : 'The starting form is only the prompt; the answer is the target form.',
  };
}

function sameStudyWord(a, b) {
  return !!a && !!b && a.dict === b.dict && a.group === b.group;
}

function orderedFormTypeIds() {
  return ALL_CARD_TYPES.map((type) => type.id);
}

function wordSweepTypeIdsFor(state, word, enabledTypes, prefs) {
  if (!word) return [];
  const available = new Set(practiceTypesForItem(word, enabledTypes, prefs).map((type) => type.id));
  return orderedFormTypeIds().filter(
    (typeId) => available.has(typeId) && !!buildFocusCard(state, word, typeId),
  );
}

function cardMatchesPractice(card, words, enabledTypes, prefs = DEFAULT_PREFS) {
  if (!card?.verb || !card?.type) return false;
  if (!words.some((word) => sameStudyWord(word, card.verb))) return false;
  const minimalPairSet = getMinimalPairSet(prefs.minimalPairSetId);
  const activeTypes = minimalPairSet ? minimalPairSet.typeIds : enabledTypeIdsFor(enabledTypes);
  if (card.type === DICTIONARY_TYPE_ID) {
    return (prefs.reviewStyle || DEFAULT_PREFS.reviewStyle) === 'reading' || !!card.sourceType;
  }
  if (!activeTypes.includes(card.type)) return false;
  if (minimalPairSet && !minimalPairSetMatchesCard(minimalPairSet, card.verb, card.type)) {
    return false;
  }
  return !isRedundantPracticeType(card.verb, card.type, activeTypes, prefs);
}

function isReadingPracticeCard(card) {
  return card?.type === DICTIONARY_TYPE_ID || card?.sourceType === DICTIONARY_TYPE_ID;
}

function sessionBaseFrom(session = {}) {
  return {
    reviewed: session.reviewed || 0,
    correct: session.correct || 0,
    skipped: session.skipped || 0,
  };
}

function sessionRunStats(session = {}, base = {}) {
  const reviewed = Math.max(0, (session.reviewed || 0) - (base.reviewed || 0));
  const correct = Math.max(0, (session.correct || 0) - (base.correct || 0));
  const skipped = Math.max(0, (session.skipped || 0) - (base.skipped || 0));
  return {
    reviewed,
    correct,
    missed: Math.max(0, reviewed - correct),
    skipped,
    streak: session.currentStreak || 0,
  };
}

function sessionOutcomeLabel(card) {
  if (!card) return 'Practice card';
  if (isReadingPracticeCard(card)) return 'Reading';
  return getTypeInfo(card.type).label || 'Practice card';
}

function withReadingSourceTypeStat(card = {}, typeId, correct, now = Date.now()) {
  if (!typeId || typeId === DICTIONARY_TYPE_ID) return card;
  const current = card.sourceTypeStats?.[typeId] || {};
  return {
    ...card,
    sourceTypeStats: {
      ...(card.sourceTypeStats || {}),
      [typeId]: {
        correct: (Number(current.correct) || 0) + (correct ? 1 : 0),
        incorrect: (Number(current.incorrect) || 0) + (correct ? 0 : 1),
        lastAt: now,
      },
    },
  };
}

function appendSessionOutcome(session = {}, outcome) {
  const recentOutcomes = Array.isArray(session.recentOutcomes) ? session.recentOutcomes : [];
  const nextOutcome = {
    at: Date.now(),
    cardId: outcome.cardId || '',
    kind: outcome.kind,
    label: outcome.label || 'Practice card',
  };
  return {
    ...session,
    recentOutcomes: [nextOutcome, ...recentOutcomes].slice(0, SESSION_RECENT_OUTCOME_LIMIT),
  };
}

function sessionAfterAnswer(session = {}, { card, correct, mistakeDiagnosis }) {
  const currentStreak = correct ? (session.currentStreak || 0) + 1 : 0;
  const nextSession = bumpSessionMistakePattern(
    {
      ...session,
      reviewed: (session.reviewed || 0) + 1,
      correct: (session.correct || 0) + (correct ? 1 : 0),
      currentStreak,
      bestStreak: Math.max(session.bestStreak || 0, currentStreak),
    },
    mistakeDiagnosis,
  );
  return appendSessionOutcome(nextSession, {
    cardId: card?.id,
    kind: correct ? 'correct' : 'missed',
    label: sessionOutcomeLabel(card),
  });
}

function sessionAfterSkip(session = {}, card) {
  return appendSessionOutcome(
    {
      ...session,
      skipped: (session.skipped || 0) + 1,
    },
    {
      cardId: card?.id,
      kind: 'skipped',
      label: sessionOutcomeLabel(card),
    },
  );
}

function loadPersistedCurrent(state, words, enabledTypes, prefs) {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(STUDY_CURRENT_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved?.dict || !saved?.type) {
      clearPersistedCurrent();
      return null;
    }
    const snapshotWord =
      saved.word?.dict === saved.dict && saved.word?.group === saved.group ? saved.word : null;
    const resolvedWord = words.find(
      (w) =>
        w.dict === saved.dict &&
        w.group === saved.group &&
        (!saved.reading || w.reading === saved.reading) &&
        (snapshotWord || !saved.meaning || w.meaning === saved.meaning),
    );
    if (!snapshotWord && !resolvedWord) {
      clearPersistedCurrent();
      return null;
    }
    const word = snapshotWord || resolvedWord;
    const card = buildFocusCard(state, word, saved.type);
    if (!card || !cardMatchesPractice(card, words, enabledTypes, prefs)) {
      clearPersistedCurrent();
      return null;
    }
    return {
      ...card,
      ...(saved.sourceType ? { sourceType: saved.sourceType } : {}),
      ...(saved.selectionBucket ? { selectionBucket: saved.selectionBucket } : {}),
      ...(saved.selectionOrigin ? { selectionOrigin: saved.selectionOrigin } : {}),
      ...(saved.selectionReason ? { selectionReason: saved.selectionReason } : {}),
    };
  } catch {
    clearPersistedCurrent();
    return null;
  }
}

function snapshotStudyWord(word) {
  return {
    dict: word.dict,
    reading: word.reading,
    meaning: word.meaning,
    group: word.group,
    ...(word.jlpt ? { jlpt: word.jlpt } : {}),
    ...(word.lesson ? { lesson: word.lesson } : {}),
    ...(word.lessons ? { lessons: word.lessons } : {}),
    ...(word.minnaLesson ? { minnaLesson: word.minnaLesson } : {}),
    ...(word.minnaLessons ? { minnaLessons: word.minnaLessons } : {}),
    ...(word.pitchAccent ? { pitchAccent: word.pitchAccent } : {}),
  };
}

function persistCurrent(card) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (!card?.verb?.dict) return;
    sessionStorage.setItem(
      STUDY_CURRENT_KEY,
      JSON.stringify({
        dict: card.verb.dict,
        reading: card.verb.reading,
        meaning: card.verb.meaning,
        group: card.verb.group,
        type: card.type,
        sourceType: card.sourceType || null,
        selectionBucket: card.selectionBucket || null,
        selectionOrigin: cardOriginForStudyCard(card),
        selectionReason: card.selectionReason || null,
        word: snapshotStudyWord(card.verb),
      }),
    );
  } catch {}
}

function speechAlternativesFromEvent(event) {
  const transcripts = [];
  let isFinal = false;
  const results = event?.results;
  if (!results) return { transcripts, isFinal };
  for (let i = event.resultIndex || 0; i < results.length; i += 1) {
    const result = results[i];
    if (!result) continue;
    isFinal = isFinal || !!result.isFinal;
    for (let j = 0; j < result.length; j += 1) {
      const transcript = result[j]?.transcript?.trim();
      if (transcript) transcripts.push(transcript);
    }
  }
  return { transcripts, isFinal };
}

function bestSpeechAlternative(transcripts, targets) {
  let best = '';
  let bestScore = -1;
  for (const transcript of transcripts) {
    const result = spokenAnswerResult(targets, transcript);
    if (result.ok) return transcript;
    const score = result.score ?? 0;
    if (score > bestScore) {
      best = transcript;
      bestScore = score;
    }
  }
  return best || transcripts[0] || '';
}

function clearPersistedCurrent() {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(STUDY_CURRENT_KEY);
  } catch {}
}

export default function StudyView({ mode = 'practice' }) {
  const {
    state,
    setState,
    setTab,
    allWords: verbs,
    builtInWords,
    activeGeminiKey: geminiKey,
    practicePrefs,
    setPracticePrefs,
    wordLists,
    studyFocus: focus,
    clearStudyFocus: onFocusConsumed,
    learnFocus,
    openLearnFocus,
    clearLearnFocus,
    openGuideForRule,
    openLabTool,
    hydrated,
  } = useApp();
  const [current, setCurrent] = useState(null);
  const [answer, setAnswer] = useState('');
  const [phase, setPhase] = useState('answering');
  const [wasCorrect, setWasCorrect] = useState(false);
  const [wasCorrected, setWasCorrected] = useState(false);
  const [showPromptText, setShowPromptText] = useState(false);
  const [stepHint, setStepHint] = useState('');
  const [hintMasked, setHintMasked] = useState(false);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [coachChatOpen, setCoachChatOpen] = useState(false);
  const [coachSeedAnswer, setCoachSeedAnswer] = useState('');
  const [coachRevealed, setCoachRevealed] = useState(0);
  const [greenRevealed, setGreenRevealed] = useState(0);
  // Snapshot of the just-graded answer for the in-session review panel, set by
  // the submit handlers (the only entries into the reviewing phase) so the
  // shared RunAnswerReveal renders from a stable reference instead of rebuilding
  // a record every render.
  const [reviewRecord, setReviewRecord] = useState(null);
  const [selfCheckOpen, setSelfCheckOpen] = useState(false);
  const [speechListening, setSpeechListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [reviewBase, setReviewBase] = useState(state.session.reviewed || 0);
  const [runBase, setRunBase] = useState(() => sessionBaseFrom(state.session));
  const [bonusMode, setBonusMode] = useState(false);
  const [undoReviewScopeAction, setUndoReviewScopeAction] = useState(null);
  const [focusWordLock, setFocusWordLock] = useState(() => focus?.word || null);
  const [wordSweep, setWordSweep] = useState(() =>
    focus?.launchMode === 'word-sweep' && focus?.word
      ? {
          word: focus.word,
          allTypeIds: [],
          pendingTypeIds: [],
          missedTypeIds: [],
          completedTypeIds: [],
          repeatPass: false,
          nextTypeId: null,
          complete: false,
        }
      : null,
  );
  const [sessionFilterWord, setSessionFilterWord] = useState(null);
  const [sessionFilterFormGroupId, setSessionFilterFormGroupId] = useState(
    () => focus?.formGroupId || null,
  );
  const [familyIntroFocus, setFamilyIntroFocus] = useState(() => familyIntroFocusFromLaunch(focus));
  const [launchContext, setLaunchContext] = useState(() =>
    focus?.returnTo === 'reference' ? focus : null,
  );
  const [recommendationFocus, setRecommendationFocus] = useState(
    () => focus?.recommendation || null,
  );
  const [openPracticeMapFamilyIds, setOpenPracticeMapFamilyIds] = useState(() => new Set());
  const [runAnswerHistory, setRunAnswerHistory] = useState([]);
  const [runReviewOpen, setRunReviewOpen] = useState(false);
  const [practiceSettingsOpen, setPracticeSettingsOpen] = useState(false);
  const inputRef = useRef(null);
  const nextButtonRef = useRef(null);
  const focusSeededRef = useRef(false);
  const autoAdvanceRef = useRef(null);
  const refocusAfterAutoAdvanceRef = useRef(false);
  const answerStartedAtRef = useRef(0);
  const hadKanaMistakeRef = useRef(false);
  const speechRecognitionRef = useRef(null);
  const speechSubmittedRef = useRef(false);
  const speechAutoStartKeyRef = useRef('');
  const listeningPromptSpokenKeyRef = useRef('');
  const answerComposingRef = useRef(false);
  const minimalPairSetIdRef = useRef(practicePrefs.minimalPairSetId || '');
  const recentCardIdsRef = useRef([]);
  // Snapshots the typed answer the moment a kana mistake first occurs, so the
  // review panel can show what was actually entered when it went wrong rather
  // than the live (possibly self-corrected) input.
  const wrongSnapshotRef = useRef(null);
  // Learner-requested hint help keeps a later exact answer in the assisted
  // bucket instead of counting it fully correct.
  const usedHintRef = useRef(false);
  const typingHintRef = useRef(null);

  const enabledTypes = useMemo(() => {
    if (sessionFilterFormGroupId) {
      if (
        familyIntroFocus?.familyId === sessionFilterFormGroupId &&
        familyIntroFocus.typeIds?.length
      ) {
        return familyIntroFocus.typeIds;
      }
      const group = FORM_GROUPS.find((g) => g.id === sessionFilterFormGroupId);
      if (group?.typeIds?.length) return group.typeIds;
    }
    const baseTypes = state.enabledTypes?.length ? state.enabledTypes : ['plain-past'];
    return reviewTypeIdsForState(state, baseTypes);
  }, [state, sessionFilterFormGroupId, familyIntroFocus]);
  const practiceWords = useMemo(() => {
    const base = filterWordsForStudyScope(
      verbs,
      { cards: state.cards, reviewScope: state.reviewScope },
      practicePrefs,
      wordLists,
      {
        builtInWords,
      },
    );
    // Apply session word filter if set
    let words = base;
    if (sessionFilterWord) {
      words = base.filter(
        (w) => w.dict === sessionFilterWord.dict && w.group === sessionFilterWord.group,
      );
      // Always include the target word even if it falls outside the current scope
      if (!words.length) words = [sessionFilterWord];
    }
    // Keep a "Practice this verb" target from Check eligible even if it sits
    // outside the current Study filters, so the reset guard below doesn't
    // discard the focus card the moment it's seeded.
    const lockedWord = focus?.word || focusWordLock;
    if (
      lockedWord &&
      !words.some((w) => w.dict === lockedWord.dict && w.group === lockedWord.group)
    ) {
      return [...words, lockedWord];
    }
    return words;
  }, [
    verbs,
    state.cards,
    state.reviewScope,
    practicePrefs,
    wordLists,
    builtInWords,
    focus,
    focusWordLock,
    sessionFilterWord,
  ]);

  const answerMode = normalizeAnswerMode(practicePrefs.answerMode);
  const autoAdvanceFormKey = autoAdvanceAnswerFormKey(practicePrefs);
  const autoAdvanceCorrect = resolveAutoAdvanceCorrect(practicePrefs);
  const speechRecognitionAvailable = !!getSpeechRecognitionConstructor();
  const typedAnswerMode = answerMode === 'input';
  const transformationMode = mode === 'transform';
  const listeningPrompt = !!practicePrefs.listeningPrompt;
  const sentenceMode = !transformationMode && !!practicePrefs.sentenceMode;
  const activeMinimalPairSet = transformationMode
    ? null
    : getMinimalPairSet(practicePrefs.minimalPairSetId);
  const practiceRuleCandidates = useMemo(
    () =>
      buildRuleCandidates(practiceWords, enabledTypes, practicePrefs, {
        minimalPairSet: activeMinimalPairSet,
      }),
    [practiceWords, enabledTypes, practicePrefs, activeMinimalPairSet],
  );
  const reverseDrill = current?.type === DICTIONARY_TYPE_ID;
  const sourceTypeForReading = current?.sourceType || 'plain-past';
  const sourceForm = current
    ? reverseDrill
      ? conjugateItem(current.verb, sourceTypeForReading)
      : conjugateItem(current.verb, current.type)
    : '';
  const sourceStrategyPrefs = useMemo(() => {
    // Main Practice is dictionary -> target only; form-to-form work lives in Drills > Transform.
    if (!transformationMode) return { ...practicePrefs, promptForm: 'dictionary' };
    return { ...practicePrefs, promptForm: 'random' };
  }, [practicePrefs, transformationMode]);
  const configuredPromptType =
    current && !reverseDrill
      ? pickPromptType(current.verb, current.type, sourceStrategyPrefs)
      : null;
  const promptType = current && !reverseDrill ? configuredPromptType : null;
  const promptSourceForm = current
    ? reverseDrill
      ? sourceForm
      : promptType
        ? conjugateItem(current.verb, promptType)
        : current.verb.reading
    : '';
  const basePromptAudioText = current ? promptSourceForm : '';

  const sessionMistakePatterns = useMemo(
    () => rankSessionMistakePatterns(state.session?.mistakePatterns),
    [state.session?.mistakePatterns],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weaknessFamilies = useMemo(() => buildWeaknessFamilyRows(state), [state.weakness]);
  const daily = state.daily || {};
  const dailyGoalTarget = practicePrefs.dailyGoal || DEFAULT_PREFS.dailyGoal;
  const boundedReviewLaunchActive = activeReviewLimitFromPrefs(practicePrefs) > 0;
  const specialLaunchActive =
    !!focus?.word ||
    !!focus?.formGroupId ||
    !!focus?.recommendation ||
    !!focusWordLock ||
    !!wordSweep ||
    !!sessionFilterWord ||
    !!sessionFilterFormGroupId ||
    !!recommendationFocus ||
    !!launchContext ||
    boundedReviewLaunchActive ||
    !!activeMinimalPairSet;
  const reviewSelectionOptions = useMemo(
    () => ({
      bonusMode,
      wordLists,
      beginnerLadder: !specialLaunchActive,
    }),
    [bonusMode, wordLists, specialLaunchActive],
  );
  const minimalPairSetForCurrent = activeMinimalPairSet;
  const sentenceType = current ? (reverseDrill ? sourceTypeForReading : current.type) : '';
  const sentencePromptEligible =
    !!current && sentenceMode && !transformationMode && !minimalPairSetForCurrent;
  // Sentence mode renders immediately from deterministic local templates, then
  // upgrades to the bundled offline corpus or Supabase row when available.
  const offlineSentencePrompt = useMemo(() => {
    if (!sentencePromptEligible) return null;
    try {
      const entry = buildOfflineSentenceEntry(current.verb, sentenceType);
      return buildSentencePromptModel({
        entry,
        word: current.verb,
        type: sentenceType,
        reverseDrill,
        listeningPrompt,
      });
    } catch {
      return null;
    }
  }, [current, sentencePromptEligible, sentenceType, reverseDrill, listeningPrompt]);
  const [resolvedSentencePrompt, setResolvedSentencePrompt] = useState(null);
  useEffect(() => {
    setResolvedSentencePrompt(null);
    if (!sentencePromptEligible) return undefined;
    let ignore = false;
    const word = current.verb;
    const type = sentenceType;
    fetchBundledSentence(word, type)
      .then((res) => res || fetchTailoredSentence(word, type))
      .then((entry) => {
        if (ignore || !entry?.jaTemplate) return;
        setResolvedSentencePrompt(
          buildSentencePromptModel({
            entry,
            word,
            type,
            reverseDrill,
            listeningPrompt,
          }),
        );
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [current, sentencePromptEligible, sentenceType, reverseDrill, listeningPrompt]);
  const sentencePrompt = resolvedSentencePrompt || offlineSentencePrompt;
  const sentencePromptView = useMemo(
    () =>
      sentencePrompt
        ? sentenceDisplay(sentencePrompt.sentence, practicePrefs, sentencePrompt.parts)
        : null,
    [sentencePrompt, practicePrefs],
  );
  const promptAudioText =
    listeningPrompt && sentencePrompt?.audioText ? sentencePrompt.audioText : basePromptAudioText;

  useLayoutEffect(() => {
    if (!hydrated) return;
    if (learnFocus?.source === 'practice-result' && learnFocus.reviewRecord) {
      const record = learnFocus.reviewRecord;
      const card = buildFocusCard(
        state,
        record.word,
        record.cardType || learnFocus.typeId || record.practicedType,
      );
      if (card) {
        focusSeededRef.current = true;
        setRecommendationFocus(null);
        setWordSweep(null);
        setSessionFilterWord(null);
        setSessionFilterFormGroupId(null);
        setLaunchContext(null);
        setCurrent({
          ...card,
          selectionOrigin: record.cardOrigin || cardOriginForStudyCard(card),
          selectionReason: record.selectionReason || card.selectionReason || null,
        });
        setReviewRecord(record);
        setAnswer(record.submittedAnswer || '');
        setWasCorrect(!!record.correct);
        setWasCorrected(!!record.wasCorrected);
        setCoachRevealed(record.coachRevealed || 0);
        setSelfCheckOpen(false);
        setStepHint('');
        setHintMasked(false);
        setHintRevealed(false);
        setCoachChatOpen(false);
        setPhase('reviewing');
        clearLearnFocus?.();
        return;
      }
      clearLearnFocus?.();
    }
    // When arriving from Check's "Practice this verb", seed that exact word/form
    // once. If no rule covers it, fall through to normal selection.
    if (focus?.word && !focusSeededRef.current) {
      focusSeededRef.current = true;
      setFocusWordLock(focus.word);
      setFamilyIntroFocus(null);
      setRecommendationFocus(null);
      // Lock Practice to this word so every follow-up card stays on it until
      // the learner exits the focus banner (rather than mixing back into the
      // general queue after the first seeded card).
      setSessionFilterWord(focus.word);
      if (focus.returnTo === 'reference') setLaunchContext(focus);
      if (focus.launchMode === 'word-sweep') {
        const allTypeIds = wordSweepTypeIdsFor(state, focus.word, enabledTypes, practicePrefs);
        const nextTypeId = allTypeIds[0] || null;
        setWordSweep({
          word: focus.word,
          allTypeIds,
          pendingTypeIds: allTypeIds.slice(1),
          missedTypeIds: [],
          completedTypeIds: [],
          repeatPass: false,
          nextTypeId,
          complete: !nextTypeId,
        });
        onFocusConsumed?.();
        clearPersistedCurrent();
        setAnswer('');
        setPhase('answering');
        setCurrent(nextTypeId ? buildFocusCard(state, focus.word, nextTypeId) : null);
        return;
      }
      const card = buildFocusCard(state, focus.word, focus.type);
      onFocusConsumed?.();
      if (card) {
        setAnswer('');
        setPhase('answering');
        setCurrent(card);
        return;
      }
    }
    if (focus?.formGroupId && !focusSeededRef.current) {
      focusSeededRef.current = true;
      setFamilyIntroFocus(familyIntroFocusFromLaunch(focus));
      setSessionFilterFormGroupId(focus.formGroupId);
      setFocusWordLock(null);
      setWordSweep(null);
      setRecommendationFocus(null);
      onFocusConsumed?.();
    }
    if (focus?.recommendation && !focusSeededRef.current) {
      focusSeededRef.current = true;
      setRecommendationFocus(focus.recommendation);
      setFamilyIntroFocus(null);
      setFocusWordLock(null);
      setWordSweep(null);
      setSessionFilterWord(null);
      setSessionFilterFormGroupId(null);
      setLaunchContext(null);
      onFocusConsumed?.();
      resetActiveAttempt();
    }
    if (current !== null) return;
    const persisted =
      transformationMode || focus?.word || focus?.formGroupId || focus?.recommendation
        ? null
        : loadPersistedCurrent(state, practiceWords, enabledTypes, practicePrefs);
    if (persisted) {
      setCurrent(persisted);
      return;
    }
    const nextCard = selectNext(
      state,
      practiceWords,
      enabledTypes,
      null,
      practicePrefs,
      practiceRuleCandidates,
      reviewSelectionOptions,
    );
    if (nextCard) {
      setCurrent((existing) => existing || nextCard);
    }
    // state intentionally omitted — this triggers on card change, not every state mutation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hydrated,
    current,
    practiceWords,
    enabledTypes,
    practicePrefs,
    practiceRuleCandidates,
    reviewSelectionOptions,
    focus,
    learnFocus,
    clearLearnFocus,
    specialLaunchActive,
    transformationMode,
  ]);

  // Persist the active card so a refresh resumes it instead of drawing fresh.
  useEffect(() => {
    if (current && !transformationMode) persistCurrent(current);
  }, [current, transformationMode]);

  useEffect(() => {
    if (current && !cardMatchesPractice(current, practiceWords, enabledTypes, practicePrefs)) {
      clearPersistedCurrent();
      setCurrent(null);
      setAnswer('');
      setPhase('answering');
    }
  }, [practiceWords, enabledTypes, practicePrefs, current]);

  useEffect(() => {
    if (!current || !activeMinimalPairSet) return;
    if (minimalPairSetMatchesCard(activeMinimalPairSet, current.verb, current.type)) return;
    setCurrent(null);
    setAnswer('');
    setPhase('answering');
    setStepHint('');
    setWasCorrect(false);
  }, [current, activeMinimalPairSet]);

  useEffect(() => {
    const nextSetId = practicePrefs.minimalPairSetId || '';
    if (minimalPairSetIdRef.current === nextSetId) return;
    minimalPairSetIdRef.current = nextSetId;
    setCurrent(null);
    setAnswer('');
    setPhase('answering');
    setStepHint('');
    setWasCorrect(false);
  }, [practicePrefs.minimalPairSetId]);

  useLayoutEffect(() => {
    if (phase === 'answering' && inputRef.current) {
      focusWithoutScroll(inputRef.current);
      refocusAfterAutoAdvanceRef.current = false;
    }
  }, [current, phase]);

  useEffect(() => {
    if (phase === 'answering') answerStartedAtRef.current = Date.now();
  }, [current?.id, phase]);

  useEffect(() => {
    answerComposingRef.current = false;
  }, [current?.id, phase]);

  useEffect(() => {
    setShowPromptText(!listeningPrompt);
  }, [current?.id, listeningPrompt]);

  useEffect(() => {
    if (stepHint && typingHintRef.current) {
      typingHintRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [stepHint]);

  useEffect(() => {
    if (phase !== 'reviewing') return;
    if (wasCorrect && autoAdvanceCorrect && autoAdvanceRef.current) return;
    const button = nextButtonRef.current;
    if (!button || typeof window === 'undefined') return;
    focusWithoutScroll(button);
  }, [autoAdvanceCorrect, current?.id, phase, wasCorrect]);

  // Handle TTS speech synthesis inside StudyView
  useEffect(() => {
    // Only import window object if running in browser
    if (typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    if (!synth) return;

    if (current && phase === 'answering' && listeningPrompt && promptAudioText) {
      const promptKey =
        current.id ||
        `${current.verb?.dict || ''}|${current.verb?.group || ''}|${current.type || ''}|${
          current.sourceType || ''
        }`;
      if (listeningPromptSpokenKeyRef.current === promptKey) return;
      listeningPromptSpokenKeyRef.current = promptKey;
      speakJapaneseLocal(promptAudioText, 0.85);
    }
    // current?.id used intentionally instead of current to avoid re-triggering on unrelated state changes
    // speakJapaneseLocal is defined inline and omitted to avoid infinite re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, phase, listeningPrompt, promptAudioText, practicePrefs.voiceURI]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (current && phase === 'reviewing' && practicePrefs.autoSpeak) {
      speakJapaneseLocal(expected, 0.9);
    }
    // speakJapaneseLocal is defined inline and omitted to avoid infinite re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, phase, practicePrefs.autoSpeak, practicePrefs.voiceURI]);

  useEffect(() => {
    setCoachRevealed(0);
    setGreenRevealed(0);
  }, [current?.id, answerMode]);

  useEffect(() => {
    usedHintRef.current = false;
  }, [current?.id]);

  // Remember how many leading kana have turned green so they stay green through
  // a backspace and reappear as green immediately when re-typed.
  useEffect(() => {
    if (!current) return;
    if (phase !== 'answering') return;
    if (reverseDrill) return;
    if (!typedAnswerMode) return;
    const cells = kanaCoachCells(sourceForm, answer, 0, true, 0);
    let committed = 0;
    for (const c of cells) {
      if (c.state === 'correct') committed += 1;
      else break;
    }
    setGreenRevealed((prev) => (committed > prev ? committed : prev));
  }, [answer, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelfCheckOpen(false);
  }, [current?.id, phase, answerMode]);

  useEffect(() => {
    speechSubmittedRef.current = false;
    speechAutoStartKeyRef.current = '';
    setSpeechError('');
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort?.();
      } catch {}
      speechRecognitionRef.current = null;
    }
    setSpeechListening(false);
  }, [current?.id, phase, answerMode]);

  useEffect(() => {
    if (!current || phase !== 'answering') return;
    if (answerMode !== 'speak') return;
    if (!speechRecognitionAvailable) return;
    if (speechListening || speechRecognitionRef.current) return;
    const autoStartKey = `${current.id}:speak`;
    if (speechAutoStartKeyRef.current === autoStartKey) return;
    speechAutoStartKeyRef.current = autoStartKey;
    startSpeechAnswer({ auto: true });
    // startSpeechAnswer closes over the current spoken-answer targets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, phase, answerMode, speechRecognitionAvailable, speechListening]);

  useEffect(() => {
    setReviewBase(state.session.reviewed || 0);
    setRunBase(sessionBaseFrom(state.session));
    setRunAnswerHistory([]);
    setRunReviewOpen(false);
    // state.session.reviewed intentionally omitted — only reset baseline when limit setting changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, practicePrefs.reviewLimit, practicePrefs.reviewLimitSource]);

  useEffect(() => {
    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.abort?.();
        } catch {}
        speechRecognitionRef.current = null;
      }
    };
  }, []);

  function speakJapaneseLocal(text, rateVal = 0.85) {
    // Prefer a recorded clip with TTS fallback (improvement #18).
    playPronunciation(text, rateVal, practicePrefs.voiceURI);
  }

  if (!hydrated) {
    return (
      <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-8 text-center text-sm text-stone-500 dark:text-stone-400">
        Loading Practice...
      </div>
    );
  }

  if (!current) {
    const hasSessionFilter = !!(sessionFilterWord || sessionFilterFormGroupId);
    return (
      <div className="space-y-4">
        {hasSessionFilter && (
          <StudyFocusBar
            allWords={verbs}
            sessionFilterWord={sessionFilterWord}
            onWordChange={chooseFocusWord}
            sessionFilterFormGroupId={sessionFilterFormGroupId}
            onFormGroupChange={chooseFocusFormGroup}
          />
        )}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-12 text-center">
          {hasSessionFilter ? (
            <>
              <p className="text-stone-600 dark:text-stone-300 mb-2">No cards for this focus</p>
              <p className="text-xs text-stone-400 dark:text-stone-500 mb-4">
                Try a different word or form type.
              </p>
              <button
                onClick={() => {
                  setSessionFilterWord(null);
                  setSessionFilterFormGroupId(null);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition"
              >
                Clear focus
              </button>
            </>
          ) : (
            <>
              <p className="text-stone-600 dark:text-stone-300 mb-2">No cards available</p>
              <p className="text-xs text-stone-400 dark:text-stone-500 mb-4">
                No words or forms are active in the Practice map right now. Turn on forms in the
                map, or restore words from Tools.
              </p>
              <button
                onClick={() => setTab('tools')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition"
              >
                Open Tools
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const expected = reverseDrill ? current.verb.reading : sourceForm;
  const practicedType = reverseDrill ? sourceTypeForReading : current.type;
  const promptView = reverseDrill
    ? formDisplay(sourceForm, practicePrefs, current.verb, practicedType)
    : promptDisplay(current.verb, promptType, practicePrefs);
  const expectedView = reverseDrill
    ? promptDisplay(current.verb, null, practicePrefs)
    : formDisplay(expected, practicePrefs, current.verb, current.type);
  const promptEnglish = reverseDrill
    ? englishForForm(current.verb, practicedType)
    : englishForForm(current.verb, promptType);
  const targetEnglish = reverseDrill
    ? englishForForm(current.verb, null)
    : englishForForm(current.verb, current.type);
  const spokenAnswerTargets = reverseDrill
    ? [current.verb.reading, current.verb.dict]
    : [expected, surfaceFormFor(current.verb, current.type)];
  const speechMatch =
    answerMode === 'speak' && answer.trim()
      ? spokenAnswerResult(spokenAnswerTargets, answer)
      : null;
  const englishHintsHidden =
    (practicePrefs.englishHints || DEFAULT_PREFS.englishHints) === 'hidden';
  const resolvedKanaAssist = resolveKanaAssist(practicePrefs);
  const kanaMatchDisplay =
    typedAnswerMode && !reverseDrill ? kanaMatchDisplayForPrefs(practicePrefs) : 'none';
  const liveKanaHelpEnabled = kanaMatchDisplay !== 'none';
  const readinessKanaAssist = liveKanaHelpEnabled ? resolvedKanaAssist : 'off';
  const typeInfo = reverseDrill ? DICTIONARY_TYPE_INFO : getTypeInfo(current.type);
  const sourceTypeId = reverseDrill ? sourceTypeForReading : promptType || DICTIONARY_TYPE_ID;
  const targetTypeId = current.type;
  const sourceTypeInfo =
    sourceTypeId === DICTIONARY_TYPE_ID ? DICTIONARY_TYPE_INFO : getTypeInfo(sourceTypeId);
  const targetTypeInfo =
    targetTypeId === DICTIONARY_TYPE_ID ? DICTIONARY_TYPE_INFO : getTypeInfo(targetTypeId);
  const transformationRoute = transformationRouteText(sourceTypeInfo, targetTypeInfo);
  const choices = reverseDrill
    ? makeReverseChoices(current, practiceWords)
    : makeChoices(current, practiceWords);
  const wordType = isAdjective(current.verb) ? 'Adjective' : 'Verb';
  const currentWordMeta = getWordMeta(current.verb);
  const lessonMetaText = [
    currentWordMeta.lesson && `Genki L${currentWordMeta.lesson}`,
    currentWordMeta.minnaLesson && `Minna L${currentWordMeta.minnaLesson}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const noChangePrompt = !reverseDrill && promptType === current.type;
  const taskLabel = reverseDrill ? `Recover dictionary form` : typeInfo.label;
  const transformationActionLabel = reverseDrill ? 'Answer with' : 'Conjugate to';
  const taskHint = reverseDrill
    ? 'answer with dictionary form'
    : noChangePrompt
      ? 'same form; answer may not change'
      : targetTypeInfo.hint || typeInfo.hint;
  const taskSub = transformationMode ? targetTypeInfo.sub : reverseDrill ? '辞書形' : typeInfo.sub;
  const answerTaskDetails = answerPhaseTaskDetails({
    reverseDrill,
    noChangePrompt,
    taskHint,
    taskSub,
  });
  const transformationSupportText = answerTaskDetails.supportText;
  const taskOverride = reverseDrill
    ? transformationMode
      ? `Reading: recover the dictionary form from ${typeInfo.label} (${sourceForm})`
      : `Un-conjugate: identify the dictionary form from ${typeInfo.label} (${sourceForm})`
    : noChangePrompt
      ? `Trick no-change drill: the prompt is already ${typeInfo.label}, so the correct answer is the same form.`
      : '';
  const minimalPairFeedback = minimalPairSetForCurrent
    ? minimalPairFeedbackForCard(minimalPairSetForCurrent, current.verb, current.type)
    : null;
  const reviewLimit = activeReviewLimitFromPrefs(practicePrefs);
  const reviewLimitSource = practicePrefs.reviewLimitSource || '';
  const introReviewActive = reviewLimitSource === FAMILY_INTRO_REVIEW_LIMIT_SOURCE;
  const reviewsDone = Math.max(0, (state.session.reviewed || 0) - reviewBase);
  const runStats = sessionRunStats(state.session, runBase);
  const runAccuracy = runStats.reviewed
    ? Math.round((runStats.correct / runStats.reviewed) * 100)
    : 0;
  const runStatsLabel = `${runStats.reviewed} ${runStats.reviewed === 1 ? 'card' : 'cards'} · ${
    runStats.correct
  } right / ${runStats.missed} wrong · ${runStats.streak} streak`;
  const reviewSetComplete = reviewLimit > 0 && reviewsDone >= reviewLimit && !recommendationFocus;
  const wordSweepComplete = !!wordSweep?.complete;
  const reviewComplete = wordSweepComplete;
  const workoutProgress = wordSweep
    ? {
        now: Math.min(wordSweep.completedTypeIds?.length || 0, wordSweep.allTypeIds?.length || 1),
        max: Math.max(1, wordSweep.allTypeIds?.length || 0),
        label: wordSweep.repeatPass ? 'Repeating missed forms' : 'Enabled forms progress',
      }
    : reviewLimit > 0
      ? {
          now: Math.min(reviewsDone, reviewLimit),
          max: reviewLimit,
          label:
            reviewLimitSource === 'recommendation'
              ? 'Recommended progress'
              : introReviewActive
                ? 'Intro progress'
                : 'Drill progress',
        }
      : {
          now: reviewsDone,
          max: 0,
          label: bonusMode ? 'Bonus practice' : 'Continuous practice',
          continuous: true,
        };
  const workoutProgressPct =
    workoutProgress.max && !workoutProgress.continuous
      ? Math.min(100, Math.round((workoutProgress.now / workoutProgress.max) * 100))
      : 0;
  const hidePromptText = listeningPrompt && phase === 'answering' && !showPromptText;
  const hideEnglishMeaning = englishHintsHidden && phase === 'answering';
  const promptPitchAccent =
    phase === 'answering' && !hidePromptText
      ? accentForForm(current.verb, sourceTypeId, promptSourceForm)
      : null;
  // Guided kana is now an in-box "reveal next" action, not a separate mode.
  const guidedKana = false;
  const liveKana = typedAnswerMode && !reverseDrill && liveKanaHelpEnabled;
  const coachPreview = toHiragana(answer);
  const coachProgress = toHiraganaProgress(answer);
  const preview = coachPreview;
  const holdKanaFeedback = phase === 'answering' && !hadKanaMistakeRef.current;
  const coachCells = guidedKana
    ? kanaCoachCells(expected, answer, coachRevealed, holdKanaFeedback, greenRevealed)
    : [];
  const visibleCoachCells = coachCells.filter((cell) => cell.state !== 'empty' || cell.shown);
  const coachWrongIndex = coachCells.findIndex((c) => c.state === 'wrong');
  const coachTypedCount = Array.from(coachProgress).length;
  const expectedKanaCount = Array.from(expected).length;
  const coachStatus =
    coachWrongIndex >= 0
      ? `Kana ${coachWrongIndex + 1} should be ${coachCells[coachWrongIndex].expected}.`
      : coachPreview === expected
        ? ''
        : coachTypedCount > expectedKanaCount
          ? 'Extra kana after the answer.'
          : '';
  const liveCells = liveKana
    ? kanaCoachCells(expected, answer, coachRevealed, holdKanaFeedback, greenRevealed)
    : [];
  const liveWrongIndex = liveCells.findIndex((c) => c.state === 'wrong' || c.state === 'extra');
  const liveStatus =
    liveWrongIndex >= 0
      ? liveCells[liveWrongIndex].state === 'extra'
        ? 'Extra kana after the answer.'
        : `Expected ${liveCells[liveWrongIndex].expected} at kana ${liveWrongIndex + 1}.`
      : preview === expected
        ? ''
        : '';
  const liveAnswerTone =
    liveKana && phase === 'answering'
      ? liveWrongIndex >= 0
        ? 'wrong'
        : preview === expected
          ? 'correct'
          : ''
      : '';
  const answerInputBorderClass =
    liveAnswerTone === 'wrong'
      ? 'border-rose-400 dark:border-rose-700 focus:border-rose-500 dark:focus:border-rose-600'
      : liveAnswerTone === 'correct'
        ? 'border-emerald-400 dark:border-emerald-700 focus:border-emerald-500 dark:focus:border-emerald-600'
        : 'border-stone-200 dark:border-stone-805 focus:border-indigo-500';
  const answerInputClassName = `flex-1 min-w-0 px-4 py-3 text-xl text-center border-2 ${answerInputBorderClass} rounded-xl bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-150 caret-stone-850 dark:caret-stone-150 focus:outline-none transition`;
  const answerFeedbackClassName =
    liveAnswerTone === 'wrong'
      ? 'text-rose-700 dark:text-rose-400'
      : liveAnswerTone === 'correct'
        ? 'text-emerald-700 dark:text-emerald-400'
        : 'text-stone-500 dark:text-stone-400';

  function nextMinimalPairProgress(correct) {
    return recordMinimalPairResult(
      state.minimalPairs,
      minimalPairSetForCurrent?.id,
      current?.verb,
      current?.type,
      correct,
    );
  }

  function nextTransformationStats(correct) {
    if (!transformationMode) return state.transformation;
    return gradeTransformationStats(state.transformation, {
      correct,
      sourceType: sourceTypeId,
      targetType: targetTypeId,
      direction: reverseDrill ? 'reverse' : 'forward',
    });
  }

  function mistakeRecordOptions() {
    return {
      ...(minimalPairSetForCurrent?.id ? { minimalPairSetId: minimalPairSetForCurrent.id } : {}),
      ...(transformationMode
        ? {
            dimension: 'transformation',
            sourceType: sourceTypeId,
            targetType: targetTypeId,
            direction: reverseDrill ? 'reverse' : 'forward',
          }
        : {}),
    };
  }

  function nextGradedState({
    correct,
    rid,
    responseMs,
    nextMistakes,
    mistakeDiagnosis,
    verbStats,
    daily,
  }) {
    const progressTypeId = reverseDrill ? sourceTypeForReading : current.type;
    const readinessRuleId = reverseDrill ? cardIdFor(current.verb, progressTypeId) : rid;
    const gradedAt = Date.now();
    const gradedCard = gradeCard(state.cards[rid], correct, gradedAt);
    const storedCard = reverseDrill
      ? withReadingSourceTypeStat(gradedCard, progressTypeId, correct, gradedAt)
      : gradedCard;
    const graded = {
      ...state,
      mistakes: nextMistakes,
      minimalPairs: nextMinimalPairProgress(correct),
      transformation: nextTransformationStats(correct),
      session: sessionAfterAnswer(state.session, {
        card: current,
        correct,
        mistakeDiagnosis,
      }),
    };
    if (transformationMode) return graded;
    return {
      ...graded,
      cards: { ...state.cards, [rid]: storedCard },
      retryQueue: correct
        ? (state.retryQueue || []).filter((id) => id !== rid)
        : [...new Set([...(state.retryQueue || []), rid])].slice(-20),
      verbStats,
      readiness: recordReadinessAttempt(state.readiness, readinessRuleId, {
        correct,
        responseMs,
        answerMode,
        kanaAssist: readinessKanaAssist,
        reverseDrill,
        now: gradedAt,
      }),
      weakness: recordWeaknessAttempt(state.weakness, {
        word: current.verb,
        typeId: progressTypeId,
        correct,
        responseMs,
        now: gradedAt,
      }),
      daily,
    };
  }

  function buildRunAnswerRecord({
    correct,
    submittedAnswer: answerSnapshot = '',
    reviewChoiceLabel: choiceLabel = '',
    revealedMiss: wasRevealed = false,
    wasCorrected: corrected = false,
    mistakeDiagnosis = null,
  }) {
    if (!current) return null;
    const explanationSnapshot = transformationReviewExplanation({
      item: current.verb,
      type: practicedType,
      reverseDrill,
      sourceInfo: sourceTypeInfo,
      targetInfo: targetTypeInfo,
      sourceForm: promptSourceForm,
      expected,
    });
    return {
      answeredAt: Date.now(),
      cardId: current.id,
      word: { ...current.verb },
      cardType: current.type,
      practicedType,
      promptType: sourceTypeId,
      promptForm: promptSourceForm,
      typeLabel: typeInfo.label || sessionOutcomeLabel(current),
      reverseDrill,
      expected,
      answerMode,
      cardOrigin: cardOriginForStudyCard(current),
      selectionReason: current.selectionReason || null,
      submittedAnswer: answerSnapshot,
      reviewChoiceLabel: choiceLabel,
      revealedMiss: wasRevealed,
      correct,
      wasCorrected: corrected,
      diagnosis: mistakeDiagnosis ? { ...mistakeDiagnosis } : null,
      explanation: explanationSnapshot,
      minimalPairFeedback,
      taskOverride,
      practicePrefs: snapshotPracticePrefs(practicePrefs),
      coachRevealed,
    };
  }

  function appendRunAnswerRecord(record) {
    if (!record) return;
    setRunAnswerHistory((previous) => [
      ...previous,
      {
        ...record,
        id: `${record.cardId || 'card'}-${record.answeredAt}-${previous.length}`,
        number: previous.length + 1,
      },
    ]);
  }

  function resolveMistakesForCurrentCard(mistakes = []) {
    const matches = (mistakes || []).filter(
      (mistake) =>
        !mistake.resolved &&
        mistake.dict === current?.verb?.dict &&
        mistake.group === current?.verb?.group &&
        mistake.type === current?.type,
    );
    if (!matches.length) return mistakes;
    return matches.reduce((next, mistake) => markMistakeResolved(next, mistake.key), mistakes);
  }

  function stopSpeechRecognition() {
    const recognition = speechRecognitionRef.current;
    if (!recognition) {
      setSpeechListening(false);
      return;
    }
    try {
      recognition.stop?.();
    } catch {
      try {
        recognition.abort?.();
      } catch {}
    }
    speechRecognitionRef.current = null;
    setSpeechListening(false);
  }

  function startSpeechAnswer(options = {}) {
    const auto = options.auto === true;
    if (!current || phase !== 'answering') return;
    if (speechListening || speechRecognitionRef.current) {
      if (auto) return;
      stopSpeechRecognition();
      return;
    }
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setSpeechError('Speech input is not available in this browser.');
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      speechRecognitionRef.current = recognition;
      speechSubmittedRef.current = false;
      recognition.lang = 'ja-JP';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 5;
      recognition.onstart = () => {
        setSpeechError('');
        setSpeechListening(true);
      };
      recognition.onerror = (event) => {
        setSpeechError(speechRecognitionErrorMessage(event?.error));
        setSpeechListening(false);
      };
      recognition.onend = () => {
        if (speechRecognitionRef.current === recognition) speechRecognitionRef.current = null;
        setSpeechListening(false);
      };
      recognition.onresult = (event) => {
        const { transcripts, isFinal } = speechAlternativesFromEvent(event);
        const transcript = bestSpeechAlternative(transcripts, spokenAnswerTargets);
        if (!transcript) return;
        setAnswer(transcript);
        setSpeechError('');
        if (isFinal && !speechSubmittedRef.current) {
          speechSubmittedRef.current = true;
          submit(transcript, { spoken: true });
        }
      };
      recognition.start();
    } catch {
      speechRecognitionRef.current = null;
      setSpeechListening(false);
      setSpeechError('Speech input could not start in this browser.');
    }
  }

  function rememberSessionCard(cardId) {
    if (!cardId) return;
    recentCardIdsRef.current = [
      cardId,
      ...recentCardIdsRef.current.filter((id) => id !== cardId),
    ].slice(0, REVIEW_SESSION_HISTORY_SIZE);
  }

  function selectNextReviewCard(nextState, lastCardId, optionOverrides = {}) {
    rememberSessionCard(lastCardId);
    return selectNext(
      nextState,
      practiceWords,
      enabledTypes,
      lastCardId,
      practicePrefs,
      practiceRuleCandidates,
      {
        ...reviewSelectionOptions,
        ...optionOverrides,
        recentCardIds: recentCardIdsRef.current,
      },
    );
  }

  function nextWordSweepStep(sweep, nextState, typeId, correct, { holdNext = false } = {}) {
    if (!sweep?.word || !typeId) return { sweep, nextCard: null };
    const completed = new Set(sweep.completedTypeIds || []);
    const missed = new Set(sweep.missedTypeIds || []);
    if (correct) {
      completed.add(typeId);
      missed.delete(typeId);
    } else {
      missed.add(typeId);
    }

    let queue = (sweep.pendingTypeIds || []).filter((id) => id !== typeId);
    let repeatPass = !!sweep.repeatPass;
    if (!queue.length && missed.size) {
      queue = [...missed].filter((id) => !completed.has(id));
      repeatPass = true;
    }

    const nextTypeId = queue[0] || null;
    const remainingTypeIds = nextTypeId ? queue.slice(1) : [];
    const nextSweep = {
      ...sweep,
      pendingTypeIds: remainingTypeIds,
      missedTypeIds: [...missed],
      completedTypeIds: [...completed],
      repeatPass,
      nextTypeId: holdNext ? nextTypeId : null,
      complete: !nextTypeId && missed.size === 0,
    };
    const nextCard = nextTypeId
      ? withCardOrigin(
          buildFocusCard(nextState, sweep.word, nextTypeId),
          repeatPass ? 'missed' : null,
        )
      : null;
    return { sweep: nextSweep, nextCard };
  }

  function consumeHeldWordSweepCard(nextState = state) {
    if (!wordSweep?.word || !wordSweep.nextTypeId) return null;
    const card = withCardOrigin(
      buildFocusCard(nextState, wordSweep.word, wordSweep.nextTypeId),
      wordSweep.repeatPass ? 'missed' : null,
    );
    setWordSweep((currentSweep) =>
      currentSweep?.nextTypeId === wordSweep.nextTypeId
        ? { ...currentSweep, nextTypeId: null }
        : currentSweep,
    );
    return card;
  }

  function resetActiveAttempt() {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    stopSpeechRecognition();
    recentCardIdsRef.current = [];
    setAnswer('');
    setPhase('answering');
    setCoachRevealed(0);
    setGreenRevealed(0);
    setSelfCheckOpen(false);
    setStepHint('');
    setHintMasked(false);
    setHintRevealed(false);
    setCoachChatOpen(false);
    hadKanaMistakeRef.current = false;
    wrongSnapshotRef.current = null;
    usedHintRef.current = false;
    setWasCorrected(false);
    setWasCorrect(false);
    setCurrent(null);
  }

  function chooseFocusWord(word) {
    if (word) {
      setState((prev) => includeWordInReviewState(prev, word));
    }
    setFamilyIntroFocus(null);
    setRecommendationFocus(null);
    setWordSweep(null);
    setSessionFilterWord(word);
    setCurrent(null);
  }

  function chooseFocusFormGroup(groupId) {
    const group = FORM_GROUPS.find((item) => item.id === groupId);
    setState((prev) => {
      const restored = groupId ? includeFormFamilyInReviewState(prev, groupId) : prev;
      if (!group?.typeIds?.length) return restored;
      return {
        ...restored,
        enabledTypes: [...new Set([...(restored.enabledTypes || []), ...group.typeIds])],
      };
    });
    setFamilyIntroFocus(null);
    setRecommendationFocus(null);
    setWordSweep(null);
    setSessionFilterFormGroupId(groupId);
    setCurrent(null);
  }

  function togglePracticeType(typeId) {
    if (!typeId) return;
    setState((prev) => {
      const currentTypes = new Set(prev.enabledTypes || []);
      if (currentTypes.has(typeId)) {
        if (currentTypes.size <= 1) return prev;
        currentTypes.delete(typeId);
      } else {
        currentTypes.add(typeId);
      }
      return { ...prev, enabledTypes: [...currentTypes] };
    });
    setCurrent(null);
  }

  function togglePracticeFamily(family) {
    if (!family?.typeIds?.length) return;
    setState((prev) => {
      const currentTypes = new Set(prev.enabledTypes || []);
      const allEnabled = family.typeIds.every((typeId) => currentTypes.has(typeId));
      if (allEnabled) {
        for (const typeId of family.typeIds) currentTypes.delete(typeId);
        if (!currentTypes.size) return prev;
      } else {
        for (const typeId of family.typeIds) currentTypes.add(typeId);
      }
      return { ...prev, enabledTypes: [...currentTypes] };
    });
    setCurrent(null);
  }

  function togglePracticeMapFamilyOpen(familyId) {
    setOpenPracticeMapFamilyIds((current) => {
      const next = new Set(current);
      if (next.has(familyId)) next.delete(familyId);
      else next.add(familyId);
      return next;
    });
  }

  // Deterministic, offline step coach — no API key required. Irregular forms
  // are masked on the first click; a second click reveals the spelled-out steps.
  function showStepHint() {
    if (!current) return;
    usedHintRef.current = true;
    const reveal = hintRevealed || (!!stepHint && hintMasked);
    const baseHint = stepCoachHint(current.verb, current.type, answer, reveal);
    const nextHint = transformationMode
      ? transformationHintFromBase(baseHint, {
          reverseDrill,
          sourceInfo: sourceTypeInfo,
          targetInfo: targetTypeInfo,
        })
      : baseHint;
    setStepHint(nextHint.text);
    setHintMasked(nextHint.masked);
    if (reveal) setHintRevealed(true);
  }

  function revealNextKana() {
    if (!current || reverseDrill || phase !== 'answering') return;
    const expectedChars = Array.from(expected);
    if (!expectedChars.length) return;
    usedHintRef.current = true;
    const typedCount = Array.from(toHiraganaProgress(answer)).length;
    const nextCount = Math.min(expectedChars.length, Math.max(coachRevealed, typedCount) + 1);
    setCoachRevealed(nextCount);
    setGreenRevealed((prev) => Math.max(prev, nextCount));
    updateTypedAnswer(expectedChars.slice(0, nextCount).join(''));
    focusAnswerInput();
  }

  function revealKanaHint() {
    if (!current || reverseDrill || phase !== 'answering') return;
    usedHintRef.current = true;
    setCoachRevealed(Math.min(expectedKanaCount, Math.max(coachRevealed, coachTypedCount) + 1));
  }

  // Opens a continuous AI chat for deeper help, seeded with the current
  // attempt. Snapshot the typed answer so the chat doesn't re-init on keypress.
  function openCoachChat() {
    if (!current || !geminiKey) return;
    setCoachSeedAnswer(answer);
    setCoachChatOpen(true);
  }

  function submit(choiceValue, options = {}) {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    if (options.spoken) stopSpeechRecognition();
    if (phase === 'reviewing') {
      setAnswer('');
      setCoachRevealed(0);
      setSelfCheckOpen(false);
      setStepHint('');
      setHintMasked(false);
      setHintRevealed(false);
      setCoachChatOpen(false);
      hadKanaMistakeRef.current = false;
      wrongSnapshotRef.current = null;
      usedHintRef.current = false;
      setWasCorrected(false);
      setPhase('answering');
      if (!reviewSetComplete && !reviewComplete) {
        const sweepCard = consumeHeldWordSweepCard(state);
        setCurrent(sweepCard || selectNextReviewCard(state, current.id));
      }
      return;
    }
    const raw = choiceValue !== undefined ? choiceValue : answer;
    if (!raw.trim()) return;
    const spoken = !!options.spoken;
    const fromTypedInput = !!options.fromTypedInput || (choiceValue === undefined && !spoken);
    const normalized = !spoken && fromTypedInput ? toHiragana(raw) : raw;
    const finalOk = reverseDrill
      ? spoken
        ? spokenAnswerResult(spokenAnswerTargets, raw).ok
        : dictionaryAnswerMatches(raw, current.verb)
      : spoken
        ? spokenAnswerResult(spokenAnswerTargets, raw).ok
        : normalized === expected;
    const ok = finalOk && (spoken || (!hadKanaMistakeRef.current && !usedHintRef.current));
    if (choiceValue !== undefined) setAnswer(raw);
    const dict = current.verb.dict,
      rid = current.id;
    const responseMs = Math.max(0, Date.now() - answerStartedAtRef.current);
    const prevVS = state.verbStats?.[dict]?.[rid] || { seen: 0, incorrect: 0 };
    const newVerbStats = {
      ...state.verbStats,
      [dict]: {
        ...(state.verbStats?.[dict] || {}),
        [rid]: { seen: prevVS.seen + 1, incorrect: prevVS.incorrect + (ok ? 0 : 1) },
      },
    };
    const nextMistakes = ok
      ? resolveMistakesForCurrentCard(state.mistakes)
      : recordMistake(
          state.mistakes,
          current.verb,
          current.type,
          reverseDrill ? sourceTypeForReading : promptType,
          spoken || reverseDrill ? raw.trim() : normalized,
          expected,
          mistakeRecordOptions(),
        );
    const newDaily = bumpDaily(state.daily, ok, dailyGoalTarget);
    const mistakeDiagnosis = ok ? null : nextMistakes[0]?.diagnosis || null;
    const submittedForReview =
      finalOk && !ok && wrongSnapshotRef.current != null ? wrongSnapshotRef.current : raw;
    const nextState = nextGradedState({
      correct: ok,
      rid,
      responseMs,
      nextMistakes,
      mistakeDiagnosis,
      verbStats: newVerbStats,
      daily: newDaily,
    });
    const sweepStep = wordSweep
      ? nextWordSweepStep(wordSweep, nextState, current.type, ok, { holdNext: true })
      : null;
    if (sweepStep) setWordSweep(sweepStep.sweep);
    const runRecord = buildRunAnswerRecord({
      correct: ok,
      submittedAnswer: submittedForReview,
      mistakeDiagnosis,
      wasCorrected: finalOk && !ok,
    });
    appendRunAnswerRecord(runRecord);
    setReviewRecord(runRecord);
    setState(nextState);
    setSelfCheckOpen(false);
    setWasCorrected(finalOk && !ok);
    setWasCorrect(ok);
    setPhase('reviewing');
    const reviewWillComplete =
      sweepStep?.sweep?.complete ||
      (reviewLimit > 0 && !recommendationFocus && reviewsDone + 1 >= reviewLimit);
    if (ok && autoAdvanceCorrect && !reviewWillComplete) {
      autoAdvanceRef.current = setTimeout(() => {
        autoAdvanceRef.current = null;
        setAnswer('');
        setCoachRevealed(0);
        setSelfCheckOpen(false);
        setStepHint('');
        setHintMasked(false);
        setHintRevealed(false);
        setCoachChatOpen(false);
        hadKanaMistakeRef.current = false;
        wrongSnapshotRef.current = null;
        usedHintRef.current = false;
        refocusAfterAutoAdvanceRef.current = true;
        setWasCorrected(false);
        setPhase('answering');
        if (sweepStep?.nextCard) {
          setWordSweep((currentSweep) =>
            currentSweep?.nextTypeId === sweepStep.sweep.nextTypeId
              ? { ...currentSweep, nextTypeId: null }
              : currentSweep,
          );
        }
        setCurrent(sweepStep?.nextCard || selectNextReviewCard(nextState, current.id));
      }, CORRECT_AUTO_ADVANCE_MS);
    }
  }

  function skipCurrent() {
    if (!current) return;
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    stopSpeechRecognition();
    const nextState = {
      ...state,
      session: sessionAfterSkip(state.session, current),
    };
    const sweepStep = wordSweep
      ? nextWordSweepStep(wordSweep, nextState, current.type, false)
      : null;
    if (sweepStep) setWordSweep(sweepStep.sweep);
    setState(nextState);
    setAnswer('');
    setCoachRevealed(0);
    setSelfCheckOpen(false);
    setStepHint('');
    setHintMasked(false);
    setHintRevealed(false);
    setCoachChatOpen(false);
    hadKanaMistakeRef.current = false;
    wrongSnapshotRef.current = null;
    usedHintRef.current = false;
    setWasCorrected(false);
    setPhase('answering');
    setWasCorrect(false);
    setCurrent(sweepStep?.nextCard || selectNextReviewCard(nextState, current.id));
  }

  function removeCurrentWordFromReviews() {
    if (!current) return;
    const removedWord = current.verb;
    setState((prev) => excludeWordFromReviewState(prev, removedWord));
    setUndoReviewScopeAction({
      kind: 'word',
      label: removedWord.dict,
      restore: () => setState((prev) => includeWordInReviewState(prev, removedWord)),
    });
    resetActiveAttempt();
  }

  function restoreLastReviewScopeAction() {
    undoReviewScopeAction?.restore?.();
    setUndoReviewScopeAction(null);
    setCurrent(null);
  }

  function gradeSelfCheck(ok, label) {
    if (!current || phase !== 'answering') return;
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    const dict = current.verb.dict,
      rid = current.id;
    const responseMs = Math.max(0, Date.now() - answerStartedAtRef.current);
    const prevVS = state.verbStats?.[dict]?.[rid] || { seen: 0, incorrect: 0 };
    const newVerbStats = {
      ...state.verbStats,
      [dict]: {
        ...(state.verbStats?.[dict] || {}),
        [rid]: { seen: prevVS.seen + 1, incorrect: prevVS.incorrect + (ok ? 0 : 1) },
      },
    };
    const nextMistakes = ok
      ? resolveMistakesForCurrentCard(state.mistakes)
      : recordMistake(
          state.mistakes,
          current.verb,
          current.type,
          reverseDrill ? sourceTypeForReading : promptType,
          `self-check: ${label}`,
          expected,
          mistakeRecordOptions(),
        );
    const newDaily = bumpDaily(state.daily, ok, dailyGoalTarget);
    const mistakeDiagnosis = ok ? null : nextMistakes[0]?.diagnosis || null;
    const nextState = nextGradedState({
      correct: ok,
      rid,
      responseMs,
      nextMistakes,
      mistakeDiagnosis,
      verbStats: newVerbStats,
      daily: newDaily,
    });
    const sweepStep = wordSweep
      ? nextWordSweepStep(wordSweep, nextState, current.type, ok, { holdNext: true })
      : null;
    if (sweepStep) setWordSweep(sweepStep.sweep);
    const runRecord = buildRunAnswerRecord({
      correct: ok,
      submittedAnswer: '',
      reviewChoiceLabel: label,
      revealedMiss: !ok,
      mistakeDiagnosis,
    });
    appendRunAnswerRecord(runRecord);
    setReviewRecord(runRecord);
    setState(nextState);
    setAnswer('');
    setSelfCheckOpen(false);
    setWasCorrect(ok);
    setPhase('reviewing');
    const reviewWillComplete =
      sweepStep?.sweep?.complete ||
      (reviewLimit > 0 && !recommendationFocus && reviewsDone + 1 >= reviewLimit);
    if (ok && autoAdvanceCorrect && !reviewWillComplete) {
      autoAdvanceRef.current = setTimeout(() => {
        autoAdvanceRef.current = null;
        setAnswer('');
        setCoachRevealed(0);
        setSelfCheckOpen(false);
        setStepHint('');
        setHintMasked(false);
        setHintRevealed(false);
        setCoachChatOpen(false);
        hadKanaMistakeRef.current = false;
        wrongSnapshotRef.current = null;
        usedHintRef.current = false;
        refocusAfterAutoAdvanceRef.current = true;
        setWasCorrected(false);
        setPhase('answering');
        if (sweepStep?.nextCard) {
          setWordSweep((currentSweep) =>
            currentSweep?.nextTypeId === sweepStep.sweep.nextTypeId
              ? { ...currentSweep, nextTypeId: null }
              : currentSweep,
          );
        }
        setCurrent(sweepStep?.nextCard || selectNextReviewCard(nextState, current.id));
      }, CORRECT_AUTO_ADVANCE_MS);
    }
  }

  function revealAnswer() {
    if (!current || phase !== 'answering') return;
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    stopSpeechRecognition();
    const dict = current.verb.dict,
      rid = current.id;
    const responseMs = Math.max(0, Date.now() - answerStartedAtRef.current);
    const prevVS = state.verbStats?.[dict]?.[rid] || { seen: 0, incorrect: 0 };
    const newVerbStats = {
      ...state.verbStats,
      [dict]: {
        ...(state.verbStats?.[dict] || {}),
        [rid]: { seen: prevVS.seen + 1, incorrect: prevVS.incorrect + 1 },
      },
    };
    const nextMistakes = recordMistake(
      state.mistakes,
      current.verb,
      current.type,
      reverseDrill ? sourceTypeForReading : promptType,
      '(revealed)',
      expected,
      mistakeRecordOptions(),
    );
    const mistakeDiagnosis = nextMistakes[0]?.diagnosis || null;
    const nextState = nextGradedState({
      correct: false,
      rid,
      responseMs,
      nextMistakes,
      mistakeDiagnosis,
      verbStats: newVerbStats,
      daily: bumpDaily(state.daily, false, dailyGoalTarget),
    });
    const sweepStep = wordSweep
      ? nextWordSweepStep(wordSweep, nextState, current.type, false, { holdNext: true })
      : null;
    if (sweepStep) setWordSweep(sweepStep.sweep);
    const runRecord = buildRunAnswerRecord({
      correct: false,
      submittedAnswer: '',
      reviewChoiceLabel: "I don't know",
      revealedMiss: true,
      mistakeDiagnosis,
    });
    appendRunAnswerRecord(runRecord);
    setReviewRecord(runRecord);
    setState(nextState);
    setAnswer('');
    setSelfCheckOpen(false);
    setWasCorrect(false);
    setPhase('reviewing');
  }

  function focusAnswerInput() {
    setTimeout(() => focusWithoutScroll(inputRef.current), 0);
  }

  function setAnswerStyle(nextMode) {
    if (nextMode === answerMode) return;
    setPracticePrefs((prev) => ({ ...prev, answerMode: nextMode }));
  }

  function toggleKanaHelp() {
    setPracticePrefs((prev) => ({
      ...prev,
      kanaAssist: resolveKanaAssist(prev) === 'off' ? 'live' : 'off',
    }));
    hadKanaMistakeRef.current = false;
    wrongSnapshotRef.current = null;
  }

  function toggleAutoNext() {
    setPracticePrefs((prev) => {
      const key = autoAdvanceAnswerFormKey(prev);
      const current = resolveAutoAdvanceCorrect(prev);
      return {
        ...prev,
        autoAdvanceCorrect: !current,
        autoAdvanceCorrectUserSet: true,
        autoAdvanceCorrectByAnswerForm: {
          ...(prev.autoAdvanceCorrectByAnswerForm || {}),
          [key]: !current,
        },
      };
    });
  }

  function rememberKanaMistake(nextAnswer, enabled) {
    if (!enabled) return;
    const cells = kanaCoachCells(expected, nextAnswer, coachRevealed, true);
    if (cells.some((c) => c.state === 'wrong' || c.state === 'extra')) {
      if (!hadKanaMistakeRef.current) wrongSnapshotRef.current = nextAnswer;
      hadKanaMistakeRef.current = true;
    }
  }

  function updateTypedAnswer(nextAnswer, options = {}) {
    rememberKanaMistake(nextAnswer, options.trackKanaMistake !== false);
    setAnswer(nextAnswer);
    if (
      !answerComposingRef.current &&
      liveKana &&
      phase === 'answering' &&
      !!expected &&
      toHiragana(nextAnswer) === expected
    ) {
      submit(nextAnswer, { fromTypedInput: true });
    }
  }

  function updateAnswerFromInput(event, options = {}) {
    const nextAnswer = event.nativeEvent?.isComposing
      ? event.target.value
      : toKanaInputValue(event.target.value);
    updateTypedAnswer(nextAnswer, options);
  }

  function commitAnswerComposition(event, options = {}) {
    const nextAnswer = toKanaInputValue(event.currentTarget.value);
    answerComposingRef.current = false;
    updateTypedAnswer(nextAnswer, options);
  }

  function openLearnForRuleRecord(record) {
    if (!record) return false;
    const typeId = record?.practicedType || record?.cardType;
    const lesson = lessonForType(typeId);
    if (!lesson) return false;
    if (typeof window !== 'undefined') {
      window.location.hash = `lesson-${lesson.groupId}`;
    }
    const typeLabel = record?.typeLabel || getTypeInfo(typeId).label || '';
    return openLearnFocus?.({
      source: 'practice-result',
      lessonGroupId: lesson.groupId,
      lessonTitle: lesson.title,
      typeId,
      typeLabel,
      word: record.word ? { ...record.word } : null,
      reviewRecord: record,
      answeredAt: record.answeredAt || Date.now(),
    });
  }

  function openGuideForReviewRule(word, type) {
    if (openGuideForRule) {
      openGuideForRule(word, type, { source: 'practice-result' });
      return;
    }
    setTab('guide');
  }

  function openLabForReviewRoute(tool) {
    if (!tool) return;
    openLabTool?.(tool);
  }

  if (runReviewOpen) {
    return (
      <PracticeRunReviewPage
        answers={runAnswerHistory}
        runStatsLabel={runStatsLabel}
        onBack={() => setRunReviewOpen(false)}
        geminiKey={geminiKey}
        onOpenGuide={openGuideForReviewRule}
        onOpenLab={openLabForReviewRoute}
        onOpenLearn={(groupId) => {
          window.location.hash = groupId ? `lesson-${groupId}` : 'formation-keys';
          setTab('learn');
        }}
        onOpenLearnFocus={openLearnForRuleRecord}
      />
    );
  }

  // Focused word-form sweeps can complete; default Practice keeps going.
  if (reviewComplete && phase === 'answering') {
    const sessionCorrect = runStats.correct;
    const sessionReviewed = runStats.reviewed;
    const sessionWrong = runStats.missed;
    const sessionSkipped = runStats.skipped;
    const sessionAccuracy = sessionReviewed
      ? Math.round((sessionCorrect / sessionReviewed) * 100)
      : 0;
    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-8 text-center">
        <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium mb-2">
          Drill complete
        </div>
        <div className="text-4xl font-semibold text-stone-900 dark:text-stone-100 mb-1">
          {sessionReviewed}
        </div>
        <div className="text-sm text-stone-400 mb-3">cards practiced</div>
        <div className="flex justify-center gap-2 mb-2">
          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            {sessionCorrect} correct
          </span>
          <span className="text-stone-300 dark:text-stone-600">·</span>
          <span className="text-sm font-medium text-rose-600 dark:text-rose-400">
            {sessionWrong} missed
          </span>
          {sessionSkipped > 0 && (
            <>
              <span className="text-stone-300 dark:text-stone-600">·</span>
              <span className="text-sm text-stone-500">{sessionSkipped} skipped</span>
            </>
          )}
        </div>
        <div className="text-sm text-stone-500 mb-1">{sessionAccuracy}% accuracy</div>
        {(daily.bestAnswerStreak || 0) >= 5 && (
          <div className="text-xs text-stone-400 mb-1">
            Best streak: {daily.bestAnswerStreak} in a row
          </div>
        )}
        <div className="mb-3" />
        {sessionMistakePatterns.length > 0 ? (
          <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/10 px-4 py-3 text-left">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-400 font-semibold flex items-center gap-1.5">
                  <IconFlame className="w-3.5 h-3.5" />
                  Top mistake pattern
                </div>
                <div className="mt-1 text-sm font-medium text-stone-900 dark:text-stone-100">
                  {sessionMistakePatterns[0].label}
                </div>
                <div className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                  {sessionMistakePatterns[0].feedback}
                </div>
                <MistakeRouteHint route={labRouteForMistakePattern(sessionMistakePatterns[0])} />
              </div>
              <div className="text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                {sessionMistakePatterns[0].count}x
              </div>
            </div>
            {sessionMistakePatterns.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sessionMistakePatterns.slice(1, 4).map((pattern) => (
                  <span
                    key={pattern.patternId}
                    className="px-2 py-1 rounded-full border border-rose-200/70 dark:border-rose-900/60 bg-white/70 dark:bg-stone-900/50 text-[11px] text-stone-600 dark:text-stone-300"
                  >
                    {pattern.label} ({pattern.count}x)
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          sessionWrong === 0 &&
          sessionReviewed > 0 && (
            <div className="text-xs text-emerald-600 dark:text-emerald-400 mb-4">
              No missed answers in this drill.
            </div>
          )
        )}
        <button
          onClick={() => {
            setWordSweep(null);
            setBonusMode(true);
            setRunAnswerHistory([]);
            setRunReviewOpen(false);
            setCurrent(selectNextReviewCard(state, current?.id, { bonusMode: true, wordLists }));
            setPhase('answering');
          }}
          className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-medium"
        >
          Continue Practice
        </button>
      </div>
    );
  }

  if (reviewSetComplete && phase === 'answering') {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-8 text-center">
        <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium mb-2">
          {reviewLimitSource === 'recommendation'
            ? 'Recommended practice complete'
            : introReviewActive
              ? 'Family intro complete'
              : 'Drill complete'}
        </div>
        <div className="text-4xl font-semibold text-stone-900 dark:text-stone-100 mb-2">
          {state.session.correct}/{state.session.reviewed}
        </div>
        <div className="text-sm text-stone-500 mb-1">
          {introReviewActive ? 'Intro accuracy:' : 'Drill accuracy:'}{' '}
          {state.session.reviewed
            ? Math.round((state.session.correct / state.session.reviewed) * 100)
            : 0}
          %
        </div>
        {reviewLimit > 0 && (
          <div className="text-xs text-stone-400 mb-5">
            {Math.min(reviewsDone, reviewLimit)}/{reviewLimit} cards in this{' '}
            {introReviewActive ? 'intro' : 'drill'}
          </div>
        )}
        {sessionMistakePatterns.length > 0 ? (
          <div className="mb-5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/10 px-4 py-3 text-left">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-400 font-semibold flex items-center gap-1.5">
                  <IconFlame className="w-3.5 h-3.5" />
                  Top mistake pattern
                </div>
                <div className="mt-1 text-sm font-medium text-stone-900 dark:text-stone-100">
                  {sessionMistakePatterns[0].label}
                </div>
                <div className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                  {sessionMistakePatterns[0].feedback}
                </div>
                <MistakeRouteHint route={labRouteForMistakePattern(sessionMistakePatterns[0])} />
              </div>
              <div className="text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                {sessionMistakePatterns[0].count}x
              </div>
            </div>
            {sessionMistakePatterns.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sessionMistakePatterns.slice(1, 4).map((pattern) => (
                  <span
                    key={pattern.patternId}
                    className="px-2 py-1 rounded-full border border-rose-200/70 dark:border-rose-900/60 bg-white/70 dark:bg-stone-900/50 text-[11px] text-stone-600 dark:text-stone-300"
                  >
                    {pattern.label} ({pattern.count}x)
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-5" />
        )}
        <button
          onClick={() => {
            setReviewBase(state.session.reviewed || 0);
            setRunBase(sessionBaseFrom(state.session));
            setRunAnswerHistory([]);
            setRunReviewOpen(false);
            if (introReviewActive) {
              setPracticePrefs((prev) => clearBoundedReviewPrefs(prev));
              setFamilyIntroFocus(null);
              setSessionFilterFormGroupId(null);
              setCurrent(null);
            } else {
              setCurrent(selectNextReviewCard(state, current.id));
            }
            setAnswer('');
            setPhase('answering');
          }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-medium"
        >
          Continue Practice
        </button>
      </div>
    );
  }

  // Shared hint disclosure for both answer modes: the deterministic step-coach
  // text, an optional "Discuss further" AI chat trigger, and the chat itself.
  // Each mode supplies its own "Hint" button (styled to fit its layout) that
  // calls showStepHint().
  const hintDisclosure =
    !reverseDrill && (stepHint || (geminiKey && (stepHint || coachChatOpen))) ? (
      <div className="mt-2 flex flex-col items-center gap-1">
        {stepHint && (
          <div
            ref={typingHintRef}
            style={{ whiteSpace: 'pre-wrap' }}
            className="w-full rounded-lg border border-indigo-100 dark:border-indigo-800/40 bg-indigo-50 dark:bg-indigo-950/20 px-3 py-2 text-xs text-stone-700 dark:text-stone-300 text-left max-h-40 overflow-y-auto"
          >
            {stepHint}
          </div>
        )}
        {geminiKey && stepHint && !coachChatOpen && (
          <button
            onClick={openCoachChat}
            aria-expanded={coachChatOpen}
            className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 inline-flex items-center gap-1 transition"
          >
            <IconChat className="w-3 h-3" />
            Discuss further
          </button>
        )}
        {coachChatOpen && geminiKey && (
          <div className="w-full text-left">
            <ChatPanel
              mode="coach"
              verb={current.verb}
              type={practicedType}
              userAnswer={coachSeedAnswer}
              geminiKey={geminiKey}
              practicePrefs={practicePrefs}
              taskOverride={taskOverride}
            />
          </div>
        )}
      </div>
    ) : null;
  const referenceLaunch = launchContext;

  function returnToReference() {
    setLaunchContext(null);
    setFamilyIntroFocus(null);
    setFocusWordLock(null);
    setWordSweep(null);
    setRecommendationFocus(null);
    onFocusConsumed?.();
    setTab('tools');
  }

  function clearBoundedReviewPrefs(prefs = {}) {
    const next = /** @type {Record<string, any>} */ ({
      ...prefs,
      reviewLimitSource: '',
      reviewLimit: 0,
    });
    if (Array.isArray(next.wordListIds)) {
      next.wordListIds = next.wordListIds.filter(
        (id) => id !== 'repair-drill' && !String(id || '').startsWith('list-review-rec-'),
      );
    }
    return next;
  }

  function restoreRecommendationEnabledTypes() {
    const returnEnabledTypes = Array.isArray(recommendationFocus?.returnEnabledTypes)
      ? recommendationFocus.returnEnabledTypes.filter(Boolean)
      : null;
    if (!returnEnabledTypes) return;
    setState((prev) => ({ ...prev, enabledTypes: returnEnabledTypes }));
  }

  // Universal escape hatch back to Stats. Exits whatever focused practice is
  // active (minimal-pair contrast, bounded drill, or a focus-word lock).
  function returnToOverview() {
    if (activeMinimalPairSet) {
      const restoreTypes = minimalPairReturnEnabledTypes(practicePrefs) || [];
      setPracticePrefs((prev) => {
        const cleared = clearMinimalPairPrefs(prev);
        return clearBoundedReviewPrefs(cleared);
      });
      if (restoreTypes.length) setState((prev) => ({ ...prev, enabledTypes: restoreTypes }));
    } else {
      setPracticePrefs((prev) => clearBoundedReviewPrefs(prev));
      restoreRecommendationEnabledTypes();
    }
    setLaunchContext(null);
    setFamilyIntroFocus(null);
    setFocusWordLock(null);
    setWordSweep(null);
    setRecommendationFocus(null);
    setSessionFilterWord(null);
    setSessionFilterFormGroupId(null);
    onFocusConsumed?.();
    resetActiveAttempt();
    setCurrent(null);
    setTab('stats');
  }

  function introducePracticeFamily(family) {
    const typeIds = familyIntroTypeIds(family);
    if (!family?.id || !typeIds.length) return;
    setState((prev) => {
      const restored = includeFormFamilyInReviewState(prev, family.id);
      return {
        ...restored,
        enabledTypes: [...new Set([...(restored.enabledTypes || []), ...typeIds])],
        session: { ...(restored.session || {}), mistakePatterns: {} },
      };
    });
    setPracticePrefs((prev) => ({
      ...clearBoundedReviewPrefs(prev),
      minimalPairSetId: '',
      minimalPairReturn: null,
      practicePath: '',
      wordListIds: [],
      reviewLimit: typeIds.length,
      reviewLimitSource: FAMILY_INTRO_REVIEW_LIMIT_SOURCE,
    }));
    setSessionFilterFormGroupId(family.id);
    setFamilyIntroFocus({ familyId: family.id, typeIds });
    setSessionFilterWord(null);
    setFocusWordLock(null);
    setWordSweep(null);
    setRecommendationFocus(null);
    setLaunchContext(null);
    onFocusConsumed?.();
    clearPersistedCurrent();
    resetActiveAttempt();
    setCurrent(null);
    setAnswer('');
    setPhase('answering');
  }

  // Title banner for a focused "Practice this" launch. Generalizes the older
  // reference-drill banner so every targeted entry (a Check/Library word, a
  // reference drill, or a form family) leads the active practice with a clear
  // title of what is being studied plus a single exit affordance.
  const focusBannerGroup = sessionFilterFormGroupId
    ? FORM_GROUPS.find((g) => g.id === sessionFilterFormGroupId)
    : null;
  const familyIntroActive =
    !!familyIntroFocus && familyIntroFocus.familyId === focusBannerGroup?.id;
  const familyIntroLesson = familyIntroActive
    ? LESSON_BY_GROUP_ID.get(familyIntroFocus.familyId)
    : null;
  const familyIntroTypes = familyIntroActive
    ? (familyIntroFocus.typeIds || []).map((typeId) => CARD_TYPE_BY_ID.get(typeId)).filter(Boolean)
    : [];
  const focusBannerWord = sessionFilterWord || focusWordLock;
  const recommendationCountParts = recommendationFocus
    ? [
        recommendationFocus.suggestedCount
          ? `${recommendationFocus.suggestedCount}-card target`
          : '',
        recommendationFocus.wordCount ? `${recommendationFocus.wordCount} words` : '',
        recommendationFocus.typeCount ? `${recommendationFocus.typeCount} form types` : '',
      ].filter(Boolean)
    : [];
  const recommendationSubtitle = recommendationFocus
    ? [recommendationFocus.detail, recommendationCountParts.join(' - '), 'Locked Practice set']
        .filter(Boolean)
        .join(' - ')
    : '';
  const focusBanner = recommendationFocus
    ? {
        kicker:
          recommendationFocus.source === 'lesson'
            ? 'Learn focus'
            : recommendationFocus.source === 'lab'
              ? 'Drills focus'
              : 'Tools focus',
        title: recommendationFocus.label || 'Recommended practice',
        reading: '',
        subtitle: recommendationSubtitle,
        exitLabel: 'Exit focus',
        onExit: returnToOverview,
      }
    : focusBannerGroup
      ? {
          kicker: familyIntroActive ? 'Family primer' : 'Form family practice',
          title: focusBannerGroup.label,
          reading: '',
          subtitle: familyIntroActive
            ? `${familyIntroTypes.length || familyIntroFocus?.typeIds?.length || 0}-card guided set`
            : focusBannerGroup.typeIds?.length
              ? `${focusBannerGroup.typeIds.length} forms in this family`
              : 'Focused form practice',
          exitLabel: 'Exit focus',
          onExit: returnToOverview,
        }
      : focusBannerWord
        ? {
            kicker: wordSweep
              ? 'Word form sweep'
              : referenceLaunch
                ? 'Reference drill'
                : 'Focused practice',
            title: focusBannerWord.dict,
            lang: 'ja',
            reading: focusBannerWord.reading || '',
            subtitle: [
              focusBannerWord.meaning,
              wordSweep
                ? `${wordSweep.allTypeIds?.length || 0} enabled forms`
                : referenceLaunch?.referenceLabel || typeInfo.label,
            ]
              .filter(Boolean)
              .join(' · '),
            exitLabel: referenceLaunch ? 'Back to reference' : 'Exit focus',
            onExit: referenceLaunch ? returnToReference : returnToOverview,
          }
        : null;
  const topSessionMistake = sessionMistakePatterns[0] || null;
  const guideInsight =
    mode === 'practice' ? buildGuideDiagnosticInsight(state.guide, { minAttempts: 2 }) : null;
  const currentSelectionReason = wordSweep?.repeatPass
    ? 'Repeating missed forms'
    : focusBanner
      ? `${focusBanner.kicker}: ${focusBanner.title}`
      : current.selectionReason || 'Varied practice from enabled categories';
  const currentOrigin = cardOriginForStudyCard(current);
  const currentOriginMeta = cardOriginMeta(currentOrigin);
  const currentOriginBadgeLabel =
    currentOrigin === 'missed' && currentSelectionReason
      ? currentSelectionReason
      : currentOriginMeta.label;
  const currentOriginDetail =
    currentOrigin === 'missed' ? currentOriginMeta.detail : currentSelectionReason;
  const recentOutcomes = Array.isArray(state.session?.recentOutcomes)
    ? state.session.recentOutcomes
    : [];
  const coachSentence = topSessionMistake
    ? `${currentSelectionReason}. Watch ${topSessionMistake.label}.`
    : runStats.reviewed > 0 && runStats.missed === 0
      ? `${currentSelectionReason}. Clean run so far.`
      : `${currentSelectionReason}.`;
  return (
    <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] xl:justify-center xl:grid-cols-[minmax(0,17rem)_minmax(0,42rem)_minmax(0,17rem)]">
      <div className="order-1 min-w-0 space-y-4 lg:order-2 xl:w-full">
        {focusBanner && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 px-5 py-4 dark:border-indigo-800 dark:bg-indigo-950/20">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                  {focusBanner.kicker}
                </div>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h2
                    lang={focusBanner.lang || undefined}
                    className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50"
                  >
                    {focusBanner.title}
                  </h2>
                  {focusBanner.reading && focusBanner.reading !== focusBanner.title && (
                    <span lang="ja" className="text-sm text-indigo-600 dark:text-indigo-300">
                      {focusBanner.reading}
                    </span>
                  )}
                </div>
                {focusBanner.subtitle && (
                  <div className="mt-0.5 text-sm text-stone-600 dark:text-stone-300">
                    {focusBanner.subtitle}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={focusBanner.onExit}
                className="shrink-0 rounded-lg border border-indigo-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-white dark:border-indigo-800 dark:bg-stone-950/40 dark:text-indigo-300 dark:hover:bg-stone-900"
              >
                {focusBanner.exitLabel}
              </button>
            </div>
          </div>
        )}
        {familyIntroActive && (
          <section
            aria-label={`${focusBannerGroup.label} primer`}
            className="rounded-2xl border border-sky-200 bg-sky-50/70 px-5 py-4 dark:border-sky-900/60 dark:bg-sky-950/20"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 rounded-lg bg-sky-600 p-2 text-white dark:bg-sky-400 dark:text-stone-950">
                <IconBook className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                  Primer
                </div>
                <h3 className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-50">
                  {familyIntroLesson?.title || focusBannerGroup.label}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-stone-650 dark:text-stone-300">
                  {familyIntroLesson?.summary || 'Start with the core forms in this family.'}
                </p>
                {familyIntroLesson?.build && (
                  <p className="mt-2 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
                    {familyIntroLesson.build}
                  </p>
                )}
                {familyIntroTypes.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {familyIntroTypes.map((type) => (
                      <span
                        key={type.id}
                        className="rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-800 dark:border-sky-900 dark:bg-stone-950/60 dark:text-sky-200"
                      >
                        {type.label}
                      </span>
                    ))}
                  </div>
                )}
                {familyIntroLesson?.watch && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/20 dark:text-amber-200">
                    <span className="font-semibold">Watch: </span>
                    {familyIntroLesson.watch}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
        {undoReviewScopeAction && (
          <div
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Removed word: <strong>{undoReviewScopeAction.label}</strong>
              </span>
              <button
                type="button"
                onClick={restoreLastReviewScopeAction}
                className="self-start rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-stone-950 dark:text-amber-200 dark:hover:bg-amber-950/40 sm:self-auto"
              >
                Undo
              </button>
            </div>
          </div>
        )}
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                Practice run
              </div>
              <div
                role="status"
                aria-live="polite"
                className="mt-1 text-sm leading-snug text-stone-600 dark:text-stone-300"
              >
                {coachSentence}
              </div>
              {guideInsight && (
                <button
                  type="button"
                  onClick={() => setTab('guide')}
                  className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900 transition hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200 dark:hover:bg-amber-950/40"
                >
                  <span>
                    <span className="font-semibold">{guideInsight.message}</span>
                    {guideInsight.detail && (
                      <span className="mt-0.5 block font-normal">{guideInsight.detail}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-semibold">{guideInsight.actionLabel} -&gt;</span>
                </button>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <details className="relative" open={practiceSettingsOpen}>
                <summary
                  role="button"
                  aria-label="Practice run settings"
                  aria-expanded={practiceSettingsOpen}
                  title="Practice run settings"
                  onClick={(event) => {
                    event.preventDefault();
                    setPracticeSettingsOpen((open) => !open);
                  }}
                  className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-stone-200 text-stone-500 transition hover:bg-stone-50 hover:text-stone-800 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                >
                  <IconSettings className="h-3.5 w-3.5" />
                </summary>
                {practiceSettingsOpen && (
                  <div
                    role="group"
                    aria-label="Practice run settings"
                    className="absolute left-0 right-auto z-20 mt-2 w-72 max-w-[calc(100vw-3rem)] rounded-xl border border-stone-200 bg-white p-3 text-left shadow-xl dark:border-stone-800 dark:bg-stone-900 sm:left-auto sm:right-0 sm:max-w-[calc(100vw-2rem)]"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                        Practice settings
                      </div>
                      <div className="text-[11px] font-medium text-stone-400">
                        {reverseDrill ? 'Reading' : 'Form'}
                      </div>
                    </div>
                    <div
                      role="group"
                      aria-label="Answer style"
                      className="mb-3 inline-flex w-full flex-wrap items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1 dark:border-stone-800 dark:bg-stone-950"
                    >
                      <span className="px-1.5 text-xs font-medium text-stone-400">Answer</span>
                      {ANSWER_STYLE_OPTIONS.map((option) => {
                        const active = answerMode === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setAnswerStyle(option.id)}
                            aria-pressed={active}
                            className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                              active
                                ? 'bg-stone-800 text-white dark:bg-indigo-600'
                                : 'text-stone-500 hover:bg-white hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="space-y-2">
                      {typedAnswerMode && !reverseDrill && (
                        <button
                          type="button"
                          onClick={toggleKanaHelp}
                          aria-pressed={liveKanaHelpEnabled}
                          aria-label={`Kana help ${liveKanaHelpEnabled ? 'on' : 'off'}`}
                          title={liveKanaHelpEnabled ? 'Turn kana help off' : 'Turn kana help on'}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-xs font-medium transition ${
                            liveKanaHelpEnabled
                              ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                              : 'border-stone-200 text-stone-500 hover:bg-stone-50 dark:border-stone-800 dark:text-stone-400 dark:hover:bg-stone-800'
                          }`}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {liveKanaHelpEnabled ? (
                              <IconEye className="h-3.5 w-3.5" />
                            ) : (
                              <IconEyeOff className="h-3.5 w-3.5" />
                            )}
                            Kana help
                          </span>
                          <span>{liveKanaHelpEnabled ? 'on' : 'off'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={toggleAutoNext}
                        aria-pressed={autoAdvanceCorrect}
                        aria-label={`Auto next ${autoAdvanceCorrect ? 'on' : 'off'}`}
                        title={`Auto next for ${autoAdvanceFormKey}`}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-xs font-medium transition ${
                          autoAdvanceCorrect
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                            : 'border-stone-200 text-stone-500 hover:bg-stone-50 dark:border-stone-800 dark:text-stone-400 dark:hover:bg-stone-800'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <IconRefresh className="h-3.5 w-3.5" />
                          Auto next
                        </span>
                        <span>{autoAdvanceCorrect ? 'on' : 'off'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPracticePrefs((prev) => ({
                            ...prev,
                            sentenceMode: !prev.sentenceMode,
                          }))
                        }
                        aria-pressed={sentenceMode}
                        aria-label={`Sentence ${sentenceMode ? 'on' : 'off'}`}
                        title="Show each prompt inside an example sentence (stays on until you turn it off)"
                        className={`flex w-full items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-xs font-medium transition ${
                          sentenceMode
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                            : 'border-stone-200 text-stone-500 hover:bg-stone-50 dark:border-stone-800 dark:text-stone-400 dark:hover:bg-stone-800'
                        }`}
                      >
                        <span>Sentence</span>
                        <span>{sentenceMode ? 'on' : 'off'}</span>
                      </button>
                    </div>
                    <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-800">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                        Adjust scope
                      </div>
                      <p className="mb-2 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                        Removes this word from automatic Practice. Restore words from Tools. To move
                        on without changing scope, use Skip.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          removeCurrentWordFromReviews();
                          setPracticeSettingsOpen(false);
                        }}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-stone-700 transition hover:bg-rose-50 hover:text-rose-700 dark:text-stone-200 dark:hover:bg-rose-950/20 dark:hover:text-rose-300"
                      >
                        Remove this word from Practice
                      </button>
                    </div>
                  </div>
                )}
              </details>
              <button
                type="button"
                onClick={() => setRunReviewOpen(true)}
                disabled={!runAnswerHistory.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-600 transition hover:bg-stone-50 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
              >
                <IconList className="h-3.5 w-3.5" />
                Review answers
              </button>
              {runStats.reviewed > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold tabular-nums text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300">
                  {runAccuracy}% right
                </div>
              )}
              <div className="text-xs font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">
                {runStatsLabel}
              </div>
            </div>
          </div>
          {!workoutProgress.continuous && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs text-stone-500 dark:text-stone-400">
                <span className="font-semibold">{workoutProgress.label}</span>
                <span className="tabular-nums">
                  {workoutProgress.now}/{workoutProgress.max}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={workoutProgress.label}
                aria-valuemin={0}
                aria-valuemax={workoutProgress.max}
                aria-valuenow={workoutProgress.now}
                className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800"
              >
                <span
                  className="block h-full rounded-full bg-indigo-600 dark:bg-indigo-400"
                  style={{ width: `${workoutProgressPct}%` }}
                />
              </div>
            </div>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer list-none text-xs font-semibold text-stone-500 transition hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
              Run details
            </summary>
            <div className="mt-2 grid gap-2 text-xs text-stone-500 dark:text-stone-400 sm:grid-cols-3">
              <div className="rounded-lg bg-stone-50 px-3 py-2 dark:bg-stone-950">
                <div className="font-semibold text-stone-700 dark:text-stone-200">
                  Why this card
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 leading-snug">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${currentOriginMeta.chipClass}`}
                  >
                    {currentOriginBadgeLabel}
                  </span>
                  {currentOriginDetail && currentOriginDetail !== currentOriginBadgeLabel && (
                    <span>{currentOriginDetail}</span>
                  )}
                </div>
              </div>
              <div className="rounded-lg bg-stone-50 px-3 py-2 dark:bg-stone-950">
                <div className="font-semibold text-stone-700 dark:text-stone-200">Top miss</div>
                <div className="mt-1 leading-snug">
                  {topSessionMistake
                    ? `${topSessionMistake.label} (${topSessionMistake.count}x)`
                    : 'No pattern yet'}
                </div>
              </div>
              <div className="rounded-lg bg-stone-50 px-3 py-2 dark:bg-stone-950">
                <div className="font-semibold text-stone-700 dark:text-stone-200">
                  Recent answers
                </div>
                {recentOutcomes.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {recentOutcomes.map((outcome, index) => (
                      <span
                        key={`${outcome.at || 0}-${outcome.cardId || outcome.label}-${index}`}
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          outcome.kind === 'correct'
                            ? 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                            : outcome.kind === 'skipped'
                              ? 'border-stone-200 text-stone-500 dark:border-stone-800 dark:text-stone-400'
                              : 'border-rose-200 text-rose-700 dark:border-rose-900 dark:text-rose-300'
                        }`}
                      >
                        {outcome.kind}: {outcome.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 leading-snug">No answers yet</div>
                )}
                {runStats.skipped > 0 && (
                  <div className="mt-1 text-[11px] text-stone-400">{runStats.skipped} skipped</div>
                )}
              </div>
            </div>
          </details>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800">
          <div className="px-4 py-4 sm:px-6 sm:py-8 text-center relative">
            <div className="absolute top-4 left-4 rounded-full bg-white/85 px-1.5 py-0.5 text-[9px] text-stone-500 ring-1 ring-stone-200/70 dark:bg-stone-900/85 dark:text-stone-400 dark:ring-stone-700/70 sm:top-8 sm:left-6">
              JLPT {currentWordMeta.jlpt}
            </div>
            {lessonMetaText && (
              <div className="absolute top-4 right-4 rounded-full bg-white/85 px-1.5 py-0.5 text-right text-[9px] text-stone-500 ring-1 ring-stone-200/70 dark:bg-stone-900/85 dark:text-stone-400 dark:ring-stone-700/70 sm:top-8 sm:right-6">
                {lessonMetaText}
              </div>
            )}
            <div
              aria-label="Current card source"
              className="mx-auto mb-3 flex max-w-full flex-wrap items-center justify-center gap-1.5 pt-9 sm:pt-6"
            >
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${currentOriginMeta.chipClass}`}
              >
                {currentOriginBadgeLabel}
              </span>
              {currentOriginDetail && currentOriginDetail !== currentOriginBadgeLabel && (
                <span className={`text-[11px] font-medium ${currentOriginMeta.detailClass}`}>
                  {currentOriginDetail}
                </span>
              )}
            </div>
            {sentencePrompt && !hidePromptText && (
              <div
                className="mx-auto mb-4 max-w-md rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-left dark:border-indigo-900/50 dark:bg-indigo-950/20"
                data-sentence-mode={sentencePrompt.mode}
              >
                <ScriptDisplay
                  view={sentencePromptView}
                  className="text-lg leading-relaxed text-stone-900 dark:text-stone-100"
                  subClassName="mt-1 text-[11px] leading-snug text-stone-500 dark:text-stone-400"
                  colorHighlight={false}
                />
                {sentencePrompt.cue && (
                  <div className="mt-1.5 text-[11px] leading-snug text-indigo-700 dark:text-indigo-300">
                    {sentencePrompt.cue}
                  </div>
                )}
                {!hideEnglishMeaning && sentencePrompt.note && (
                  <div className="mt-1.5 text-[11px] italic leading-snug text-stone-500 dark:text-stone-400">
                    {sentencePrompt.note}
                  </div>
                )}
              </div>
            )}
            {hidePromptText ? (
              <div className="max-w-md mx-auto rounded-2xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-5">
                <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-semibold mb-3">
                  {sentencePrompt?.mode === 'listening-recognition'
                    ? 'Sentence listening prompt'
                    : 'Listening prompt'}
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => speakJapaneseLocal(promptAudioText, 0.85)}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm flex items-center gap-1.5"
                  >
                    <IconVolume className="w-4 h-4" />
                    Replay
                  </button>
                  <button
                    onClick={() => setShowPromptText(true)}
                    className="px-3 py-2 border border-indigo-250 bg-white/70 hover:bg-white text-indigo-700 rounded-lg text-sm dark:bg-stone-800 dark:border-stone-700 dark:text-stone-300"
                  >
                    Show text
                  </button>
                </div>
              </div>
            ) : (
              <>
                <ScriptDisplay
                  view={promptView}
                  className="text-4xl sm:text-5xl font-medium mb-2 text-stone-900 dark:text-stone-100"
                  subClassName="text-base text-stone-500"
                />
                {promptPitchAccent && (
                  <PitchAccentDisplay accent={promptPitchAccent} className="mb-2" />
                )}
              </>
            )}
            {noChangePrompt && !hidePromptText && (
              <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
                Trick: no change needed
              </div>
            )}
            {reverseDrill && !hidePromptText && (
              <div className="text-xs text-stone-400">Answer with the dictionary form.</div>
            )}

            {!hideEnglishMeaning && (
              <div className="text-sm text-stone-500 mt-2 italic">{promptEnglish}</div>
            )}

            {phase === 'reviewing' && practicePrefs.showWordCategory && (
              <div className="text-xs text-stone-400 mt-1">
                {groupDisplayLabel(current.verb.group)} · {wordType}
                {groupAliasText(current.verb.group)
                  ? ` · ${groupAliasText(current.verb.group)}`
                  : ''}
              </div>
            )}
            <div className="mt-4 flex flex-col gap-1">
              <AnswerInputPanel
                phase={phase}
                transformationMode={transformationMode}
                transformationActionLabel={transformationActionLabel}
                targetTypeInfo={targetTypeInfo}
                answerTaskDetails={answerTaskDetails}
                sourceTypeInfo={sourceTypeInfo}
                transformationSupportText={transformationSupportText}
                taskLabel={taskLabel}
                current={current}
                practicePrefs={practicePrefs}
                transformationRoute={transformationRoute}
                minimalPairSetForCurrent={minimalPairSetForCurrent}
                activeMinimalPairSet={activeMinimalPairSet}
                reviewsDone={reviewsDone}
                setPracticePrefs={setPracticePrefs}
                setState={setState}
                answerMode={answerMode}
                selfCheckOpen={selfCheckOpen}
                setSelfCheckOpen={setSelfCheckOpen}
                skipCurrent={skipCurrent}
                expectedView={expectedView}
                practicedType={practicedType}
                targetEnglish={targetEnglish}
                gradeSelfCheck={gradeSelfCheck}
                inputRef={inputRef}
                answer={answer}
                setAnswer={setAnswer}
                setSpeechError={setSpeechError}
                submit={submit}
                speechListening={speechListening}
                speechMatch={speechMatch}
                speechRecognitionAvailable={speechRecognitionAvailable}
                startSpeechAnswer={startSpeechAnswer}
                speechError={speechError}
                revealAnswer={revealAnswer}
                reverseDrill={reverseDrill}
                choices={choices}
                hideEnglishMeaning={hideEnglishMeaning}
                guidedKana={guidedKana}
                visibleCoachCells={visibleCoachCells}
                kanaMatchDisplay={kanaMatchDisplay}
                coachStatus={coachStatus}
                coachWrongIndex={coachWrongIndex}
                coachPreview={coachPreview}
                expected={expected}
                showStepHint={showStepHint}
                hintDisclosure={hintDisclosure}
                answerComposingRef={answerComposingRef}
                updateAnswerFromInput={updateAnswerFromInput}
                commitAnswerComposition={commitAnswerComposition}
                answerInputClassName={answerInputClassName}
                revealNextKana={revealNextKana}
                coachRevealed={coachRevealed}
                expectedKanaCount={expectedKanaCount}
                liveKana={liveKana}
                liveStatus={liveStatus}
                answerFeedbackClassName={answerFeedbackClassName}
                revealKanaHint={revealKanaHint}
                liveKanaHelpEnabled={liveKanaHelpEnabled}
                wasCorrect={wasCorrect}
                wasCorrected={wasCorrected}
                reviewRecord={reviewRecord}
                geminiKey={geminiKey}
                nextButtonRef={nextButtonRef}
                wordSweep={wordSweep}
                openGuideForReviewRule={openGuideForReviewRule}
                openLabForReviewRoute={openLabForReviewRoute}
                setTab={setTab}
                openLearnForRuleRecord={openLearnForRuleRecord}
                autoAdvanceCorrect={autoAdvanceCorrect}
              />
            </div>
          </div>
        </div>
        <div className="text-center text-xs text-stone-400">
          Tip: type romaji like <span className="font-mono text-stone-500">tabeta</span>, use kana{' '}
          <span lang="ja" className="text-stone-550 dark:text-stone-450">
            たべた
          </span>
          , or press Esc to skip without penalty.
        </div>
      </div>
      <PracticeScopeSidebar
        className="order-2 lg:order-1"
        state={state}
        weaknessFamilies={weaknessFamilies}
        openFamilyIds={openPracticeMapFamilyIds}
        onToggleFamilyOpen={togglePracticeMapFamilyOpen}
        onToggleFamily={togglePracticeFamily}
        onIntroduceFamily={introducePracticeFamily}
        onToggleType={togglePracticeType}
      />
      <FocusCategoryMap
        className="order-3 lg:col-span-2 xl:col-span-1"
        state={state}
        onToggleFamily={togglePracticeFamily}
      />
    </div>
  );
}
