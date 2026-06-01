import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import {
  IconCheck,
  IconX,
  IconVolume,
  IconSpark,
  IconChat,
  IconPen,
  IconFlame,
  IconMic,
} from '../components/Icons.jsx';
import {
  getSpeechRecognitionConstructor,
  playPronunciation,
  speechRecognitionErrorMessage,
} from '../utils/speech.js';
import { useAISentence } from '../hooks/useAISentence.js';
import { useApp } from '../state/AppStateContext.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import KanaInputPad from '../components/KanaInputPad.jsx';
import { PitchAccentSection } from '../components/PitchAccent.jsx';
import { ContextExamplePanel } from '../components/ContextExamplePanel.jsx';
import { ConjugationBreakdown } from '../components/ConjugationBreakdown.jsx';
import { ChatPanel } from '../components/ChatPanel.jsx';
import { callGemini, aiSystemFromPrefs } from '../utils/gemini.js';
import { toHiragana, toHiraganaProgress } from '../utils/romaji.js';
import {
  conjugateItem,
  enabledTypeIdsFor,
  filterWordsForPrefs,
  pickPromptType,
  getTypeInfo,
  getWordMeta,
  isAdjective,
  isRedundantPracticeType,
  promptFormLabel,
  RULES,
  surfaceFormFor,
} from '../utils/conjugator.js';
import { explainItem, stepCoachHint, GROUP_NAMES } from '../utils/conjugatorExplain.js';
import { groupAliasText, groupDisplayLabel } from '../utils/groupDisplay.js';
import {
  selectNext,
  buildFocusCard,
  recordMistake,
  gradeCard,
  bumpDaily,
  gradeTransformationStats,
  localDateKey,
} from '../utils/storage.js';
import { recordReadinessAttempt } from '../utils/readiness.js';
import {
  formDisplay,
  promptDisplay,
  englishForForm,
  answerPhaseTaskDetails,
  drillDirectionFor,
  makeChoices,
  makeReverseChoices,
  dictionaryAnswerMatches,
  kanaMatchDisplayForPrefs,
  normalizeAnswerMode,
  resolveKanaAssist,
  typoGuardForAnswer,
  spokenAnswerResult,
} from '../utils/display.js';
import {
  buildRepairDrillPlan,
  bumpSessionMistakePattern,
  rankSessionMistakePatterns,
  repairPrefsForPlan,
  upsertRepairWordList,
} from '../utils/mistakeDiagnosis.js';
import {
  clearMinimalPairPrefs,
  getMinimalPairSet,
  minimalPairFeedbackForCard,
  minimalPairReturnEnabledTypes,
  minimalPairSetMatchesCard,
  recordMinimalPairResult,
} from '../utils/minimalPairs.js';
import {
  buildTodayDrillPlan,
  TODAY_DRILL_LIST_ID,
  practicePrefsForTodayDrill,
  upsertTodayDrillList,
} from '../utils/todayDrill.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import StickyAction from '../components/StickyAction.jsx';
import { kanaCoachCells, explainReversePrompt } from '../utils/kanaCoach.js';
export { kanaCoachCells, explainReversePrompt };

// Keep the active card across a page refresh so reloading Study resumes the
// same word/form rather than drawing a fresh one. Scoped to sessionStorage so
// it survives reloads but resets when the tab is closed.
const STUDY_CURRENT_KEY = 'jp-study-current';
const DICTIONARY_TYPE_ID = 'dictionary';
const DICTIONARY_TYPE_INFO = { label: 'Dictionary Form', sub: '辞書形', hint: 'dictionary form' };
const TRANSFORMATION_MODE_LABEL = 'Transform';
const STUDY_MODE_OPTIONS = [
  { id: 'word', label: 'Word' },
  { id: 'sentence', label: 'Sentence' },
  { id: 'transformation', label: TRANSFORMATION_MODE_LABEL },
];
const PRACTICE_DIRECTIONS = [
  { id: 'forward', label: 'Conjugate' },
  { id: 'reverse', label: 'Un-conjugate' },
  { id: 'mixed', label: 'Mixed' },
];
const REVIEW_LIMIT_SOURCES = new Set(['repair']);

function activeReviewLimitFromPrefs(prefs = DEFAULT_PREFS) {
  if (!REVIEW_LIMIT_SOURCES.has(prefs.reviewLimitSource)) return 0;
  const limit = Number(prefs.reviewLimit || 0);
  return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

function clearReviewLimitPrefs(prefs = DEFAULT_PREFS) {
  if (!prefs.reviewLimit && !prefs.reviewLimitSource) return prefs;
  return { ...prefs, reviewLimit: 0, reviewLimitSource: '' };
}

function isDailyGoalHitToday(daily) {
  return daily?.date === localDateKey() && !!daily.goalHit;
}

function transformationRouteText(sourceInfo, targetInfo) {
  return `${sourceInfo.label} -> ${targetInfo.label}`;
}

function transformationHintFromBase(baseHint, { reverseDrill, sourceInfo, targetInfo }) {
  const sourceLabel = sourceInfo?.label || 'source form';
  const targetLabel = targetInfo?.label || 'target form';
  const prefix = reverseDrill
    ? `Work backward from the ${sourceLabel}. Recover the dictionary form before thinking about any new ending.`
    : `Transform ${sourceLabel} into ${targetLabel}: keep the same word, then rebuild the requested form.`;
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

function cardMatchesPractice(card, words, enabledTypes, prefs = DEFAULT_PREFS) {
  if (!card?.verb || !card?.type) return false;
  if (!words.some((word) => sameStudyWord(word, card.verb))) return false;
  const minimalPairSet = getMinimalPairSet(prefs.minimalPairSetId);
  const activeTypes = minimalPairSet ? minimalPairSet.typeIds : enabledTypeIdsFor(enabledTypes);
  if (!activeTypes.includes(card.type)) return false;
  if (minimalPairSet && !minimalPairSetMatchesCard(minimalPairSet, card.verb, card.type)) {
    return false;
  }
  return !isRedundantPracticeType(card.verb, card.type, activeTypes, prefs);
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
    return card;
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

function hasPersistedCurrent() {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    return !!sessionStorage.getItem(STUDY_CURRENT_KEY);
  } catch {
    return false;
  }
}

export default function StudyView() {
  const {
    state,
    setState,
    setTab,
    allWords: verbs,
    activeGeminiKey: geminiKey,
    practicePrefs,
    setPracticePrefs,
    wordLists,
    setWordLists,
    studyFocus: focus,
    clearStudyFocus: onFocusConsumed,
    session,
    showAuth,
    hydrated,
  } = useApp();
  const [current, setCurrent] = useState(null);
  const [answer, setAnswer] = useState('');
  const [phase, setPhase] = useState('answering');
  const [wasCorrect, setWasCorrect] = useState(false);
  const [wasCorrected, setWasCorrected] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [showPromptText, setShowPromptText] = useState(false);
  const [showEnglishHint, setShowEnglishHint] = useState(false);
  const [aiHintText, setAiHintText] = useState('');
  const [aiHintLoading, setAiHintLoading] = useState(false);
  const [aiHintErr, setAiHintErr] = useState('');
  const [stepHint, setStepHint] = useState('');
  const [hintMasked, setHintMasked] = useState(false);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [coachChatOpen, setCoachChatOpen] = useState(false);
  const [coachSeedAnswer, setCoachSeedAnswer] = useState('');
  const [coachRevealed, setCoachRevealed] = useState(0);
  const [greenRevealed, setGreenRevealed] = useState(0);
  const [revealedMiss, setRevealedMiss] = useState(false);
  const [reviewChoiceLabel, setReviewChoiceLabel] = useState('');
  const [submittedAnswer, setSubmittedAnswer] = useState('');
  const [lastDiagnosis, setLastDiagnosis] = useState(null);
  const [selfCheckOpen, setSelfCheckOpen] = useState(false);
  const [typoGuard, setTypoGuard] = useState(null);
  const [kanaPadOpen, setKanaPadOpen] = useState(false);
  const [speechListening, setSpeechListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [reviewBase, setReviewBase] = useState(state.session.reviewed || 0);
  // SRS daily queue tracking
  const initialDueRuleIds = useRef(null);
  const [completedDueIds, setCompletedDueIds] = useState(() => new Set());
  const startedGoalHit = useRef(isDailyGoalHitToday(state.daily || {}));
  const seededInitialDailyGoalRef = useRef(false);
  const autoStartedTodayRef = useRef(false);
  const [bonusMode, setBonusMode] = useState(false);
  const [focusWordLock, setFocusWordLock] = useState(() => focus?.word || null);
  const [launchContext, setLaunchContext] = useState(() =>
    focus?.returnTo === 'reference' ? focus : null,
  );
  const [todayMinimalPairSetIds, setTodayMinimalPairSetIds] = useState([]);
  const inputRef = useRef(null);
  const nextButtonRef = useRef(null);
  const focusSeededRef = useRef(false);
  const autoAdvanceRef = useRef(null);
  const answerStartedAtRef = useRef(0);
  const hadKanaMistakeRef = useRef(false);
  const speechRecognitionRef = useRef(null);
  const speechSubmittedRef = useRef(false);
  const speechAutoStartKeyRef = useRef('');
  const minimalPairSetIdRef = useRef(practicePrefs.minimalPairSetId || '');
  // Snapshots the typed answer the moment a kana mistake first occurs, so the
  // review panel can show what was actually entered when it went wrong rather
  // than the live (possibly self-corrected) input.
  const wrongSnapshotRef = useRef(null);
  const typingHintRef = useRef(null);
  const aiHintAbortRef = useRef(null);

  const enabledTypes = useMemo(
    () => (state.enabledTypes?.length ? state.enabledTypes : ['plain-past']),
    [state.enabledTypes],
  );
  const practiceWords = useMemo(() => {
    const base = filterWordsForPrefs(verbs, practicePrefs, wordLists);
    // Keep a "Practice this verb" target from Check eligible even if it sits
    // outside the current Study filters, so the reset guard below doesn't
    // discard the focus card the moment it's seeded.
    const lockedWord = focus?.word || focusWordLock;
    if (
      lockedWord &&
      !base.some((w) => w.dict === lockedWord.dict && w.group === lockedWord.group)
    ) {
      return [...base, lockedWord];
    }
    return base;
  }, [verbs, practicePrefs, wordLists, focus, focusWordLock]);

  const activeDrillMode = practicePrefs.drillMode || DEFAULT_PREFS.drillMode;
  const answerMode = normalizeAnswerMode(practicePrefs.answerMode);
  const speechRecognitionAvailable = !!getSpeechRecognitionConstructor();
  const kanaAssist = resolveKanaAssist(practicePrefs);
  const typedAnswerMode = answerMode === 'input';
  const transformationMode = activeDrillMode === 'transformation';
  const listeningPrompt = !!practicePrefs.listeningPrompt;
  const drillDirection = current ? drillDirectionFor(current, practicePrefs) : 'forward';
  const reverseDrill = drillDirection === 'reverse';
  const sourceForm = current ? conjugateItem(current.verb, current.type) : '';
  const configuredPromptType =
    current && !reverseDrill ? pickPromptType(current.verb, current.type, practicePrefs) : null;
  const promptType =
    current && !reverseDrill && transformationMode
      ? configuredPromptType ||
        pickPromptType(current.verb, current.type, { ...practicePrefs, promptForm: 'random' })
      : configuredPromptType;
  const promptSourceForm = current
    ? reverseDrill
      ? sourceForm
      : promptType
        ? conjugateItem(current.verb, promptType)
        : current.verb.reading
    : '';
  const promptAudioText = current ? promptSourceForm : '';

  // Sentence-mode AI example sentence.
  const aiSentence = useAISentence({
    current,
    drillMode: practicePrefs.drillMode,
    geminiKey,
    reverseDrill,
    sourceForm,
    scriptMode: practicePrefs.scriptMode,
  });
  const sessionMistakePatterns = useMemo(
    () => rankSessionMistakePatterns(state.session?.mistakePatterns),
    [state.session?.mistakePatterns],
  );
  const todayPlan = useMemo(
    () => buildTodayDrillPlan(state, verbs, practicePrefs, wordLists),
    [state, verbs, practicePrefs, wordLists],
  );
  const daily = state.daily || {};
  const dailyGoalTarget = practicePrefs.dailyGoal || DEFAULT_PREFS.dailyGoal;
  const signedIn = !!session?.user;
  const todayGoalHit = isDailyGoalHitToday(daily);
  const activeMinimalPairSet = getMinimalPairSet(practicePrefs.minimalPairSetId);
  const repairDrillActive = practicePrefs.reviewLimitSource === 'repair';
  const todayDrillActive =
    activeDrillMode === 'word' &&
    !practicePrefs.minimalPairSetId &&
    !practicePrefs.reviewLimitSource &&
    (practicePrefs.wordListIds || []).includes(TODAY_DRILL_LIST_ID);
  const canResumePersistedCurrent = hasPersistedCurrent();
  const canResumeTodayDrill =
    todayDrillActive && daily.date === localDateKey() && canResumePersistedCurrent;
  const specialLaunchActive =
    !!focus?.word ||
    !!focusWordLock ||
    !!launchContext ||
    repairDrillActive ||
    !!activeMinimalPairSet;
  const todayMinimalPairSet = useMemo(() => {
    if (activeMinimalPairSet || !current) return null;
    return (
      todayMinimalPairSetIds
        .map((setId) => getMinimalPairSet(setId))
        .find((set) => minimalPairSetMatchesCard(set, current.verb, current.type)) || null
    );
  }, [activeMinimalPairSet, current, todayMinimalPairSetIds]);
  const minimalPairSetForCurrent = activeMinimalPairSet || todayMinimalPairSet;

  useLayoutEffect(() => {
    if (!hydrated) return;
    // When arriving from Check's "Practice this verb", seed that exact word/form
    // once. If no rule covers it, fall through to normal selection.
    if (focus?.word && !focusSeededRef.current) {
      focusSeededRef.current = true;
      setFocusWordLock(focus.word);
      if (focus.returnTo === 'reference') setLaunchContext(focus);
      const card = buildFocusCard(state, focus.word, focus.type);
      onFocusConsumed?.();
      if (card) {
        setAnswer('');
        setPhase('answering');
        setCurrent(card);
        return;
      }
    }
    if (current !== null) return;
    const persisted = focus?.word
      ? null
      : loadPersistedCurrent(state, practiceWords, enabledTypes, practicePrefs);
    if (persisted) {
      setCurrent(persisted);
      return;
    }
    const nextCard = selectNext(state, practiceWords, enabledTypes, null, practicePrefs);
    if (nextCard) {
      setCurrent((existing) => existing || nextCard);
    }
    // state intentionally omitted — this triggers on card change, not every state mutation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, current, practiceWords, enabledTypes, practicePrefs, focus]);

  useEffect(() => {
    if (!hydrated || seededInitialDailyGoalRef.current) return;
    seededInitialDailyGoalRef.current = true;
    if (todayGoalHit) startedGoalHit.current = true;
  }, [hydrated, todayGoalHit]);

  // Persist the active card so a refresh resumes it instead of drawing fresh.
  useEffect(() => {
    if (current) persistCurrent(current);
  }, [current]);

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
    setChatOpen(false);
    setStepHint('');
    setTypoGuard(null);
    setWasCorrect(false);
    setLastDiagnosis(null);
  }, [current, activeMinimalPairSet]);

  useEffect(() => {
    const nextSetId = practicePrefs.minimalPairSetId || '';
    if (minimalPairSetIdRef.current === nextSetId) return;
    minimalPairSetIdRef.current = nextSetId;
    setCurrent(null);
    setAnswer('');
    setPhase('answering');
    setChatOpen(false);
    setStepHint('');
    setTypoGuard(null);
    setWasCorrect(false);
    setLastDiagnosis(null);
  }, [practicePrefs.minimalPairSetId]);

  useEffect(() => {
    if (phase === 'answering' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [current, phase]);

  useEffect(() => {
    if (phase === 'answering') answerStartedAtRef.current = Date.now();
  }, [current?.id, phase]);

  useEffect(() => {
    setShowPromptText(!listeningPrompt);
  }, [current?.id, listeningPrompt]);

  useEffect(() => {
    setShowEnglishHint(false);
    setAiHintText('');
    setAiHintErr('');
    setAiHintLoading(false);
  }, [current?.id, practicePrefs.englishHints]);

  useEffect(() => {
    if (stepHint && typingHintRef.current) {
      typingHintRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [stepHint]);

  useEffect(() => {
    if (phase !== 'reviewing') return;
    const button = nextButtonRef.current;
    if (!button || typeof window === 'undefined') return;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    button.focus({ preventScroll: true });
    if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
      window.scrollTo(scrollX, scrollY);
    }
  }, [current?.id, phase]);

  // Handle TTS speech synthesis inside StudyView
  useEffect(() => {
    // Only import window object if running in browser
    if (typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    if (!synth) return;

    if (current && phase === 'answering' && listeningPrompt && promptAudioText) {
      speakJapaneseLocal(promptAudioText, 0.85);
    }
    // current?.id used intentionally instead of current to avoid re-triggering on unrelated state changes
    // speakJapaneseLocal is defined inline and omitted to avoid infinite re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, phase, listeningPrompt, promptAudioText, practicePrefs.voiceURI]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (current && phase === 'reviewing' && practicePrefs.autoSpeak) {
      speakJapaneseLocal(conjugateItem(current.verb, current.type), 0.9);
    }
    // speakJapaneseLocal is defined inline and omitted to avoid infinite re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, phase, practicePrefs.autoSpeak, practicePrefs.voiceURI]);

  useEffect(() => {
    setCoachRevealed(0);
    setGreenRevealed(0);
  }, [current?.id, answerMode, kanaAssist]);

  useEffect(() => {
    if (!current) return;
    if (phase !== 'answering') return;
    if (reverseDrill) return;
    if (!typedAnswerMode) return;
    const exp = reverseDrill ? current.verb.reading : sourceForm;
    const preview = toHiragana(answer);
    if (exp && preview === exp) {
      submit();
    }
  }, [answer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember how many leading kana have turned green so they stay green through
  // a backspace and reappear as green immediately when re-typed.
  useEffect(() => {
    if (!current) return;
    if (phase !== 'answering') return;
    if (reverseDrill) return;
    if (!typedAnswerMode) return;
    if (kanaAssist === 'off') return;
    const cells = kanaCoachCells(sourceForm, answer, 0, true, 0);
    let committed = 0;
    for (const c of cells) {
      if (c.state === 'correct') committed += 1;
      else break;
    }
    setGreenRevealed((prev) => (committed > prev ? committed : prev));
  }, [answer, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === 'answering') {
      setRevealedMiss(false);
      setReviewChoiceLabel('');
    }
  }, [current?.id, phase]);

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
    setTypoGuard(null);
  }, [current?.id, phase]);

  useEffect(() => {
    if (!typedAnswerMode) {
      setKanaPadOpen(false);
    }
  }, [typedAnswerMode]);

  useEffect(() => {
    setReviewBase(state.session.reviewed || 0);
    // state.session.reviewed intentionally omitted — only reset baseline when limit setting changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practicePrefs.reviewLimit, practicePrefs.reviewLimitSource]);

  useEffect(() => {
    if (!hydrated) return;
    if (!signedIn) return;
    if (autoStartedTodayRef.current) return;
    if (todayGoalHit) return;
    if (specialLaunchActive) return;
    if (canResumePersistedCurrent) return;
    if (canResumeTodayDrill) return;
    if (!todayPlan.available) return;
    launchTodayDrill();
    // launchTodayDrill intentionally omitted so the auto-start decision keys off
    // the entry conditions, not a freshly allocated function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hydrated,
    signedIn,
    todayGoalHit,
    specialLaunchActive,
    canResumePersistedCurrent,
    canResumeTodayDrill,
    todayPlan,
  ]);

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

  // Snapshot the set of SRS-due rule IDs at session start so the queue size is
  // fixed even as cards become due or get rescheduled during the session.
  useEffect(() => {
    const now = Date.now();
    initialDueRuleIds.current = new Set(
      RULES.filter((r) => enabledTypes.includes(r.type))
        .filter((r) => {
          const c = state.cards[r.id];
          return c && c.nextReview <= now;
        })
        .map((r) => r.id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally snapshot only at mount

  function speakJapaneseLocal(text, rateVal = 0.85) {
    // Prefer a recorded clip with TTS fallback (improvement #18).
    playPronunciation(text, rateVal, practicePrefs.voiceURI);
  }

  if (!hydrated) {
    return (
      <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-8 text-center text-sm text-stone-500 dark:text-stone-400">
        Loading daily drill...
      </div>
    );
  }

  if (!current) {
    return (
      <div className="space-y-4">
        {renderTodayEntry()}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-12 text-center">
          <p className="text-stone-600 dark:text-stone-300 mb-2">No cards available</p>
          <p className="text-xs text-stone-400 dark:text-stone-500 mb-4">
            Enable conjugation types in Settings.
          </p>
          <button
            onClick={() => setTab('settings')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition"
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  const expected = reverseDrill ? current.verb.reading : sourceForm;
  const promptView = reverseDrill
    ? formDisplay(sourceForm, practicePrefs, current.verb, current.type)
    : promptDisplay(current.verb, promptType, practicePrefs);
  const expectedView = reverseDrill
    ? promptDisplay(current.verb, null, practicePrefs)
    : formDisplay(expected, practicePrefs, current.verb, current.type);
  const promptEnglish = reverseDrill
    ? englishForForm(current.verb, current.type)
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
  const kanaMatchDisplay = kanaMatchDisplayForPrefs(practicePrefs);
  const typeInfo = getTypeInfo(current.type);
  const sourceTypeId = reverseDrill ? current.type : promptType || DICTIONARY_TYPE_ID;
  const targetTypeId = reverseDrill ? DICTIONARY_TYPE_ID : current.type;
  const sourceTypeInfo =
    sourceTypeId === DICTIONARY_TYPE_ID ? DICTIONARY_TYPE_INFO : getTypeInfo(sourceTypeId);
  const targetTypeInfo =
    targetTypeId === DICTIONARY_TYPE_ID ? DICTIONARY_TYPE_INFO : getTypeInfo(targetTypeId);
  const transformationRoute = transformationRouteText(sourceTypeInfo, targetTypeInfo);
  const transformationAttempt = transformationMode
    ? {
        dimension: 'transformation',
        sourceType: sourceTypeId,
        targetType: targetTypeId,
        direction: drillDirection,
      }
    : null;
  const transformationStats = state.transformation || {
    attempted: 0,
    correct: 0,
    byPair: {},
  };
  const transformationAccuracy = transformationStats.attempted
    ? Math.round((transformationStats.correct / transformationStats.attempted) * 100)
    : 0;
  const reviewExplanation =
    phase === 'reviewing'
      ? transformationMode
        ? transformationReviewExplanation({
            item: current.verb,
            type: current.type,
            reverseDrill,
            sourceInfo: sourceTypeInfo,
            targetInfo: targetTypeInfo,
            sourceForm: promptSourceForm,
            expected,
          })
        : reverseDrill
          ? explainReversePrompt(current.verb, current.type)
          : explainItem(current.verb, current.type)
      : null;
  const explanation = !wasCorrect ? reviewExplanation : null;
  const diagnostic =
    phase === 'reviewing' && !wasCorrect && !revealedMiss ? lastDiagnosis?.feedback || '' : '';
  const choices = reverseDrill
    ? makeReverseChoices(current, practiceWords)
    : makeChoices(current, practiceWords);
  const wordType = isAdjective(current.verb) ? 'Adjective' : 'Verb';
  const noChangePrompt = !reverseDrill && promptType === current.type;
  const taskLabel = transformationMode
    ? TRANSFORMATION_MODE_LABEL
    : reverseDrill
      ? `Un-conjugate ${typeInfo.label}`
      : typeInfo.label;
  const transformationActionLabel = reverseDrill ? 'Answer with' : 'Conjugate to';
  const taskHint = transformationMode
    ? reverseDrill
      ? 'recover the dictionary form'
      : targetTypeInfo.hint
    : reverseDrill
      ? 'answer with dictionary form'
      : noChangePrompt
        ? 'same form; answer may not change'
        : typeInfo.hint;
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
      ? `Transform: recover the dictionary form from ${typeInfo.label} (${sourceForm})`
      : `Un-conjugate: identify the dictionary form from ${typeInfo.label} (${sourceForm})`
    : noChangePrompt
      ? `Trick no-change drill: the prompt is already ${typeInfo.label}, so the correct answer is the same form.`
      : '';
  const minimalPairFeedback = minimalPairSetForCurrent
    ? minimalPairFeedbackForCard(minimalPairSetForCurrent, current.verb, current.type)
    : null;
  const reviewLimit = activeReviewLimitFromPrefs(practicePrefs);
  const reviewLimitSource = practicePrefs.reviewLimitSource || '';
  const reviewsDone = Math.max(0, (state.session.reviewed || 0) - reviewBase);
  const sessionSkipped = state.session?.skipped || 0;
  const reviewSetComplete = reviewLimit > 0 && reviewsDone >= reviewLimit;
  // Daily SRS queue completion flags
  const initialDue = initialDueRuleIds.current?.size ?? 0;
  const dueQueueDone = initialDue > 0 && completedDueIds.size >= initialDue && !bonusMode;
  const dailyGoalJustHit =
    todayGoalHit && !startedGoalHit.current && seededInitialDailyGoalRef.current && !bonusMode;
  const reviewComplete = dueQueueDone || dailyGoalJustHit;
  const hidePromptText = listeningPrompt && phase === 'answering' && !showPromptText;
  const hideEnglishHint = englishHintsHidden && phase === 'answering' && !showEnglishHint;
  const guidedKana = typedAnswerMode && kanaAssist === 'guided';
  const liveKana = typedAnswerMode && kanaAssist === 'live';
  const coachPreview = toHiragana(answer);
  const coachProgress = toHiraganaProgress(answer);
  const preview = coachPreview;
  const coachCells = guidedKana
    ? kanaCoachCells(expected, answer, coachRevealed, phase === 'answering', greenRevealed)
    : [];
  const coachWrongIndex = coachCells.findIndex((c) => c.state === 'wrong');
  const coachTypedCount = Array.from(coachProgress).length;
  const expectedKanaCount = Array.from(expected).length;
  const coachStatus =
    coachWrongIndex >= 0
      ? `Kana ${coachWrongIndex + 1} should be ${coachCells[coachWrongIndex].expected}.`
      : coachPreview === expected
        ? 'Complete match. Press Enter.'
        : coachTypedCount > expectedKanaCount
          ? 'Extra kana after the answer.'
          : '';
  const liveCells =
    liveKana && !reverseDrill
      ? kanaCoachCells(expected, answer, 0, phase === 'answering', greenRevealed)
      : [];
  const liveWrongIndex = liveCells.findIndex((c) => c.state === 'wrong' || c.state === 'extra');
  const liveStatus =
    liveWrongIndex >= 0
      ? liveCells[liveWrongIndex].state === 'extra'
        ? 'Extra kana after the answer.'
        : `Kana ${liveWrongIndex + 1} does not match yet.`
      : preview === expected
        ? 'Complete match. Press Enter.'
        : '';
  const reviewAnswerSource = phase === 'reviewing' && submittedAnswer ? submittedAnswer : answer;
  const reviewKanaCells =
    typedAnswerMode && kanaAssist !== 'off' && !reverseDrill
      ? kanaCoachCells(expected, reviewAnswerSource, guidedKana ? coachRevealed : 0)
      : [];

  function transformationStatsAfter(correct) {
    if (!transformationAttempt) return state.transformation;
    return gradeTransformationStats(state.transformation, {
      ...transformationAttempt,
      correct,
    });
  }

  function nextMinimalPairProgress(correct) {
    return recordMinimalPairResult(
      state.minimalPairs,
      minimalPairSetForCurrent?.id,
      current?.verb,
      current?.type,
      correct,
    );
  }

  function mistakeRecordOptions() {
    return {
      ...(transformationAttempt || {}),
      ...(minimalPairSetForCurrent?.id ? { minimalPairSetId: minimalPairSetForCurrent.id } : {}),
    };
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

  function resetActiveAttempt() {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    stopSpeechRecognition();
    setAnswer('');
    setPhase('answering');
    setChatOpen(false);
    setCoachRevealed(0);
    setGreenRevealed(0);
    setRevealedMiss(false);
    setReviewChoiceLabel('');
    setSelfCheckOpen(false);
    setTypoGuard(null);
    setStepHint('');
    setHintMasked(false);
    setHintRevealed(false);
    setCoachChatOpen(false);
    hadKanaMistakeRef.current = false;
    wrongSnapshotRef.current = null;
    setWasCorrected(false);
    setWasCorrect(false);
    setCurrent(null);
  }

  function switchStudyMode(mode) {
    const leavingMinimalPair = mode !== 'word' && activeMinimalPairSet;
    const basePrefs = leavingMinimalPair ? clearMinimalPairPrefs(practicePrefs) : practicePrefs;
    const nextPrefs = clearReviewLimitPrefs({
      ...basePrefs,
      drillMode: mode,
      minimalPairSetId: mode === 'word' ? basePrefs.minimalPairSetId || '' : '',
      minimalPairReturn: mode === 'word' ? basePrefs.minimalPairReturn || null : null,
    });
    if (mode === 'transformation' && (nextPrefs.promptForm || 'dictionary') === 'dictionary') {
      nextPrefs.promptForm = 'random';
    }
    if (mode !== 'transformation' && activeDrillMode === 'transformation') {
      nextPrefs.promptForm = 'dictionary';
    }
    setPracticePrefs(nextPrefs);
    if (leavingMinimalPair && setState) {
      const enabledTypes = minimalPairReturnEnabledTypes(practicePrefs);
      setState((prev) => ({ ...prev, enabledTypes: enabledTypes || [] }));
    }
    setTodayMinimalPairSetIds([]);
    resetActiveAttempt();
  }

  function switchPracticeDirection(direction) {
    const nextPrefs = clearReviewLimitPrefs({
      ...practicePrefs,
      drillDirection: direction,
    });
    if (transformationMode && (nextPrefs.promptForm || 'dictionary') === 'dictionary') {
      nextPrefs.promptForm = 'random';
    }
    setPracticePrefs(nextPrefs);
    setTodayMinimalPairSetIds([]);
    resetActiveAttempt();
  }

  function launchTodayDrill() {
    if (!todayPlan.available) return;
    autoStartedTodayRef.current = true;
    clearPersistedCurrent();
    if (setWordLists) setWordLists(upsertTodayDrillList(wordLists, todayPlan));
    if (setState) {
      setState((prev) => ({
        ...prev,
        enabledTypes: todayPlan.typeIds,
        session: { ...(prev.session || {}), mistakePatterns: {} },
      }));
    }
    if (setPracticePrefs) {
      setPracticePrefs(practicePrefsForTodayDrill(practicePrefs, todayPlan));
    }
    initialDueRuleIds.current = new Set(todayPlan.dueRuleIds);
    setCompletedDueIds(new Set());
    setBonusMode(false);
    setTodayMinimalPairSetIds(todayPlan.minimalPairSetIds);
    setFocusWordLock(null);
    setLaunchContext(null);
    setReviewBase(state.session?.reviewed || 0);
    resetActiveAttempt();
    setTab('study');
  }

  function renderTodayLauncher() {
    const dueCount = todayPlan.sourceCounts?.due || 0;
    const secondaryChips = [
      ...(todayPlan.sourceCounts?.weak ? [`${todayPlan.sourceCounts.weak} weak`] : []),
      ...(todayPlan.sourceCounts?.minimalPairs
        ? [`${todayPlan.sourceCounts.minimalPairs} contrast`]
        : []),
      ...(!todayPlan.sourceLabels.length ? ['Core forms'] : []),
    ];
    const fLabel = todayPlan.forecastLabel;
    return (
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-stone-900 px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-left">
            <div className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-semibold">
              Today
            </div>
            <div className="mt-1 text-sm font-semibold text-stone-900 dark:text-stone-100">
              {todayPlan.title}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {dueCount > 0 && (
                <span className="rounded-md border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                  {dueCount} due now
                </span>
              )}
              {secondaryChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-md border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 px-2 py-1 text-[11px] text-stone-600 dark:text-stone-300"
                >
                  {chip}
                </span>
              ))}
              {fLabel && (
                <span className="rounded-md border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 px-2 py-1 text-[11px] text-stone-500 dark:text-stone-400">
                  then: {fLabel}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={launchTodayDrill}
            disabled={!todayPlan.available}
            className="min-h-10 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600 dark:disabled:bg-stone-800 dark:disabled:text-stone-400"
          >
            Start review
          </button>
        </div>
      </div>
    );
  }

  function renderTodayStatus() {
    const dueCleared = completedDueIds.size;
    const dueTotal = initialDueRuleIds.current?.size ?? 0;
    const hasDue = dueTotal > 0;
    const progressPct = hasDue ? Math.min(100, Math.round((dueCleared / dueTotal) * 100)) : 0;
    const queueDone = hasDue && dueCleared >= dueTotal;
    const statusText = hasDue ? `${dueCleared}/${dueTotal} cleared` : todayPlan.summary;
    const fLabel = todayPlan.forecastLabel;

    return (
      <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              {queueDone ? 'Queue cleared' : 'SRS Queue'}
            </div>
            {fLabel && (
              <div className="truncate text-xs text-stone-500 dark:text-stone-400">
                up next: {fLabel}
              </div>
            )}
          </div>
          {hasDue && (
            <div className="flex items-center gap-2 text-xs font-medium text-stone-600 dark:text-stone-300">
              <span className="tabular-nums">{statusText}</span>
              <span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                <span
                  className={`block h-full ${queueDone ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                  style={{ width: progressPct + '%' }}
                />
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderSignInBar() {
    return (
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 shadow-sm dark:border-indigo-900/70 dark:bg-indigo-950/25">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              Sign in to save SRS progress
            </div>
            <div className="text-xs text-stone-600 dark:text-stone-300">
              Sync your review queue and daily goal across devices.
            </div>
          </div>
          <button
            type="button"
            onClick={showAuth}
            className="min-h-9 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  function renderTodayEntry() {
    if (specialLaunchActive) return null;
    if (!signedIn) return renderSignInBar();
    if (todayDrillActive || todayGoalHit) return renderTodayStatus();
    return renderTodayLauncher();
  }

  async function generateAIClue() {
    if (!current || !geminiKey) return;
    if (aiHintLoading) {
      aiHintAbortRef.current?.abort();
      aiHintAbortRef.current = null;
      setAiHintLoading(false);
      return;
    }
    const controller = new AbortController();
    aiHintAbortRef.current = controller;
    setAiHintLoading(true);
    setAiHintErr('');
    setAiHintText('');
    try {
      const prompt = `Give one concise non-answer clue for this Japanese conjugation drill. Do NOT reveal the exact answer "${expected}" and do not spell out the full transformed form.\n\nBase word: ${
        current.verb.dict
      } (${current.verb.reading})\nMeaning: ${current.verb.meaning}\nClass: ${
        GROUP_NAMES[current.verb.group] || current.verb.group
      }\nTask: ${
        reverseDrill
          ? `identify the dictionary form from ${typeInfo.label} ${sourceForm}`
          : transformationMode
            ? `transform ${sourceTypeInfo.label} to ${targetTypeInfo.label} without changing the word`
            : `transform ${promptFormLabel(current.verb, promptType)} to ${typeInfo.label}`
      }\n\nInclude one semantic hint and one rule cue. Keep it under 30 words.`;
      const reply = await callGemini(
        [{ role: 'user', parts: [{ text: prompt }] }],
        geminiKey,
        220,
        0.25,
        aiSystemFromPrefs(
          practicePrefs,
          'You give safe study hints for Japanese conjugation quizzes. Never reveal the exact answer.',
        ),
      );
      if (!controller.signal.aborted) setAiHintText(reply);
    } catch (e) {
      if (!controller.signal.aborted) setAiHintErr(e.message || 'AI clue failed.');
    }
    if (!controller.signal.aborted) setAiHintLoading(false);
    aiHintAbortRef.current = null;
  }

  // Deterministic, offline step coach — no API key required. Irregular forms
  // are masked on the first click; a second click reveals the spelled-out steps.
  function showStepHint() {
    if (!current) return;
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

  // Opens a continuous AI chat for deeper help, seeded with the current
  // attempt. Snapshot the typed answer so the chat doesn't re-init on keypress.
  function openCoachChat() {
    if (!current || !geminiKey) return;
    setCoachSeedAnswer(answer);
    setCoachChatOpen(true);
  }

  function launchRepairDrill(pattern) {
    const plan = buildRepairDrillPlan(pattern, verbs);
    if (setWordLists && plan.wordKeys.length) {
      setWordLists(upsertRepairWordList(wordLists, plan));
    }
    if (setState) {
      setState((prev) => ({
        ...prev,
        ...(plan.typeIds.length ? { enabledTypes: plan.typeIds } : {}),
        session: { ...(prev.session || {}), mistakePatterns: {} },
      }));
    }
    if (setPracticePrefs) {
      setPracticePrefs({
        ...repairPrefsForPlan(practicePrefs, plan),
        minimalPairSetId: '',
        minimalPairReturn: null,
      });
    }
    setReviewBase(state.session?.reviewed || 0);
    setChatOpen(false);
    setAnswer('');
    setCoachRevealed(0);
    setGreenRevealed(0);
    setRevealedMiss(false);
    setReviewChoiceLabel('');
    setSelfCheckOpen(false);
    setTypoGuard(null);
    setStepHint('');
    setHintMasked(false);
    setHintRevealed(false);
    setCoachChatOpen(false);
    setLastDiagnosis(null);
    hadKanaMistakeRef.current = false;
    wrongSnapshotRef.current = null;
    setWasCorrected(false);
    setWasCorrect(false);
    setPhase('answering');
    setCurrent(null);
    setTab('study');
  }

  function submit(choiceValue, options = {}) {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    if (options.spoken) stopSpeechRecognition();
    if (phase === 'reviewing') {
      setChatOpen(false);
      setAnswer('');
      setCoachRevealed(0);
      setRevealedMiss(false);
      setReviewChoiceLabel('');
      setSelfCheckOpen(false);
      setTypoGuard(null);
      setStepHint('');
      setHintMasked(false);
      setHintRevealed(false);
      setCoachChatOpen(false);
      setLastDiagnosis(null);
      hadKanaMistakeRef.current = false;
      wrongSnapshotRef.current = null;
      setWasCorrected(false);
      setPhase('answering');
      if (!reviewSetComplete && !reviewComplete) {
        setCurrent(selectNext(state, practiceWords, enabledTypes, current.id, practicePrefs));
      }
      return;
    }
    const raw = choiceValue !== undefined ? choiceValue : answer;
    if (!raw.trim()) return;
    const spoken = !!options.spoken;
    const normalized = choiceValue !== undefined && !spoken ? raw : toHiragana(raw);
    const finalOk = reverseDrill
      ? spoken
        ? spokenAnswerResult(spokenAnswerTargets, raw).ok
        : dictionaryAnswerMatches(raw, current.verb)
      : spoken
        ? spokenAnswerResult(spokenAnswerTargets, raw).ok
        : normalized === expected;
    const ok = finalOk && (spoken || !(kanaMatchDisplay !== 'none' && hadKanaMistakeRef.current));
    const nearMiss =
      choiceValue === undefined && !spoken && !ok
        ? typoGuardForAnswer(raw, normalized, expected, current.verb, reverseDrill)
        : null;
    if (nearMiss && typoGuard?.key !== nearMiss.key) {
      setTypoGuard(nearMiss);
      return;
    }
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
      ? state.mistakes
      : recordMistake(
          state.mistakes,
          current.verb,
          current.type,
          reverseDrill ? current.type : promptType,
          spoken || reverseDrill ? raw.trim() : normalized,
          expected,
          mistakeRecordOptions(),
        );
    const newDaily = bumpDaily(state.daily, ok, dailyGoalTarget);
    const mistakeDiagnosis = ok ? null : nextMistakes[0]?.diagnosis || null;
    const nextState = {
      ...state,
      cards: { ...state.cards, [rid]: gradeCard(state.cards[rid], ok) },
      verbStats: newVerbStats,
      mistakes: nextMistakes,
      readiness: recordReadinessAttempt(state.readiness, rid, {
        correct: ok,
        responseMs,
        answerMode,
        kanaAssist,
        drillMode: practicePrefs.drillMode,
        reverseDrill,
      }),
      ...(transformationAttempt ? { transformation: transformationStatsAfter(ok) } : {}),
      minimalPairs: nextMinimalPairProgress(ok),
      session: {
        ...bumpSessionMistakePattern(
          {
            ...(state.session || {}),
            reviewed: (state.session?.reviewed || 0) + 1,
            correct: (state.session?.correct || 0) + (ok ? 1 : 0),
          },
          mistakeDiagnosis,
        ),
      },
      daily: newDaily,
    };
    if (ok && initialDueRuleIds.current?.has(rid)) {
      setCompletedDueIds((prev) => new Set([...prev, rid]));
    }
    setState(nextState);
    setChatOpen(!ok && !!geminiKey && !!practicePrefs.autoAiExplainErrors);
    setLastDiagnosis(mistakeDiagnosis);
    setReviewChoiceLabel('');
    setRevealedMiss(false);
    setSelfCheckOpen(false);
    // When the final string matched but the card was still marked wrong (a kana
    // mistake was made and then corrected mid-typing), show the snapshot from
    // when it went wrong instead of the corrected text.
    setSubmittedAnswer(
      finalOk && !ok && wrongSnapshotRef.current != null ? wrongSnapshotRef.current : raw,
    );
    setWasCorrected(finalOk && !ok);
    setWasCorrect(ok);
    setPhase('reviewing');
    const willClearDue =
      initialDue > 0 &&
      ok &&
      initialDueRuleIds.current?.has(rid) &&
      completedDueIds.size + 1 >= initialDue;
    const willHitDailyGoal =
      !startedGoalHit.current && !bonusMode && newDaily.goalHit && !daily.goalHit;
    const reviewWillComplete =
      (reviewLimit > 0 && reviewsDone + 1 >= reviewLimit) || willClearDue || willHitDailyGoal;
    if (ok && practicePrefs.autoAdvanceCorrect && !reviewWillComplete) {
      autoAdvanceRef.current = setTimeout(() => {
        autoAdvanceRef.current = null;
        setChatOpen(false);
        setAnswer('');
        setCoachRevealed(0);
        setRevealedMiss(false);
        setReviewChoiceLabel('');
        setSelfCheckOpen(false);
        setTypoGuard(null);
        setStepHint('');
        setHintMasked(false);
        setHintRevealed(false);
        setCoachChatOpen(false);
        setLastDiagnosis(null);
        hadKanaMistakeRef.current = false;
        wrongSnapshotRef.current = null;
        setWasCorrected(false);
        setPhase('answering');
        setCurrent(selectNext(nextState, practiceWords, enabledTypes, current.id, practicePrefs));
      }, 850);
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
      session: { ...(state.session || {}), skipped: (state.session?.skipped || 0) + 1 },
    };
    setState(nextState);
    setChatOpen(false);
    setAnswer('');
    setCoachRevealed(0);
    setRevealedMiss(false);
    setReviewChoiceLabel('');
    setSelfCheckOpen(false);
    setTypoGuard(null);
    setStepHint('');
    setHintMasked(false);
    setHintRevealed(false);
    setCoachChatOpen(false);
    setLastDiagnosis(null);
    hadKanaMistakeRef.current = false;
    wrongSnapshotRef.current = null;
    setWasCorrected(false);
    setPhase('answering');
    setWasCorrect(false);
    setCurrent(selectNext(nextState, practiceWords, enabledTypes, current.id, practicePrefs));
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
      ? state.mistakes
      : recordMistake(
          state.mistakes,
          current.verb,
          current.type,
          reverseDrill ? current.type : promptType,
          `self-check: ${label}`,
          expected,
          mistakeRecordOptions(),
        );
    const newDaily = bumpDaily(state.daily, ok, dailyGoalTarget);
    const mistakeDiagnosis = ok ? null : nextMistakes[0]?.diagnosis || null;
    const nextState = {
      ...state,
      cards: { ...state.cards, [rid]: gradeCard(state.cards[rid], ok) },
      verbStats: newVerbStats,
      mistakes: nextMistakes,
      readiness: recordReadinessAttempt(state.readiness, rid, {
        correct: ok,
        responseMs,
        answerMode,
        kanaAssist,
        drillMode: practicePrefs.drillMode,
        reverseDrill,
      }),
      ...(transformationAttempt ? { transformation: transformationStatsAfter(ok) } : {}),
      minimalPairs: nextMinimalPairProgress(ok),
      session: {
        ...bumpSessionMistakePattern(
          {
            ...(state.session || {}),
            reviewed: (state.session?.reviewed || 0) + 1,
            correct: (state.session?.correct || 0) + (ok ? 1 : 0),
          },
          mistakeDiagnosis,
        ),
      },
      daily: newDaily,
    };
    if (ok && initialDueRuleIds.current?.has(rid)) {
      setCompletedDueIds((prev) => new Set([...prev, rid]));
    }
    setState(nextState);
    setAnswer('');
    setTypoGuard(null);
    setReviewChoiceLabel(label);
    setRevealedMiss(!ok);
    setSelfCheckOpen(false);
    setChatOpen(!ok && !!geminiKey && !!practicePrefs.autoAiExplainErrors);
    setLastDiagnosis(mistakeDiagnosis);
    setWasCorrect(ok);
    setPhase('reviewing');
    const willClearDue =
      initialDue > 0 &&
      ok &&
      initialDueRuleIds.current?.has(rid) &&
      completedDueIds.size + 1 >= initialDue;
    const willHitDailyGoal =
      !startedGoalHit.current && !bonusMode && newDaily.goalHit && !daily.goalHit;
    const reviewWillComplete =
      (reviewLimit > 0 && reviewsDone + 1 >= reviewLimit) || willClearDue || willHitDailyGoal;
    if (ok && practicePrefs.autoAdvanceCorrect && !reviewWillComplete) {
      autoAdvanceRef.current = setTimeout(() => {
        autoAdvanceRef.current = null;
        setChatOpen(false);
        setAnswer('');
        setCoachRevealed(0);
        setRevealedMiss(false);
        setReviewChoiceLabel('');
        setSelfCheckOpen(false);
        setTypoGuard(null);
        setStepHint('');
        setHintMasked(false);
        setHintRevealed(false);
        setCoachChatOpen(false);
        setLastDiagnosis(null);
        hadKanaMistakeRef.current = false;
        wrongSnapshotRef.current = null;
        setWasCorrected(false);
        setPhase('answering');
        setCurrent(selectNext(nextState, practiceWords, enabledTypes, current.id, practicePrefs));
      }, 850);
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
      reverseDrill ? current.type : promptType,
      '(revealed)',
      expected,
      mistakeRecordOptions(),
    );
    const mistakeDiagnosis = nextMistakes[0]?.diagnosis || null;
    const nextState = {
      ...state,
      cards: { ...state.cards, [rid]: gradeCard(state.cards[rid], false) },
      verbStats: newVerbStats,
      mistakes: nextMistakes,
      readiness: recordReadinessAttempt(state.readiness, rid, {
        correct: false,
        responseMs,
        answerMode,
        kanaAssist,
        drillMode: practicePrefs.drillMode,
        reverseDrill,
      }),
      ...(transformationAttempt ? { transformation: transformationStatsAfter(false) } : {}),
      minimalPairs: nextMinimalPairProgress(false),
      session: {
        ...bumpSessionMistakePattern(
          {
            ...(state.session || {}),
            reviewed: (state.session?.reviewed || 0) + 1,
            correct: state.session?.correct || 0,
          },
          mistakeDiagnosis,
        ),
      },
      daily: bumpDaily(state.daily, false, dailyGoalTarget),
    };
    setState(nextState);
    setAnswer('');
    setTypoGuard(null);
    setChatOpen(!!geminiKey && !!practicePrefs.autoAiExplainErrors);
    setLastDiagnosis(mistakeDiagnosis);
    setReviewChoiceLabel("I don't know");
    setSelfCheckOpen(false);
    setRevealedMiss(true);
    setWasCorrect(false);
    setPhase('reviewing');
  }

  function focusAnswerInput() {
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function insertAnswerText(text) {
    setTypoGuard(null);
    if (typedAnswerMode && kanaMatchDisplay !== 'none' && (guidedKana || !reverseDrill)) {
      const newVal = answer + text;
      const revealed = guidedKana ? coachRevealed : 0;
      const cells = kanaCoachCells(expected, newVal, revealed, true);
      if (cells.some((c) => c.state === 'wrong' || c.state === 'extra')) {
        hadKanaMistakeRef.current = true;
      }
    }
    setAnswer((prev) => `${prev}${text}`);
    focusAnswerInput();
  }

  function backspaceAnswerText() {
    setTypoGuard(null);
    setAnswer((prev) => Array.from(prev).slice(0, -1).join(''));
    focusAnswerInput();
  }

  function clearAnswerText() {
    setTypoGuard(null);
    setAnswer('');
    focusAnswerInput();
  }

  // SRS queue completion screen — shown once when the due queue is cleared
  // or the session limit is reached. Bonus mode lets the user keep practicing.
  if (reviewComplete && phase === 'answering') {
    const sessionCorrect = state.session.correct || 0;
    const sessionReviewed = state.session.reviewed || 0;
    const sessionWrong = sessionReviewed - sessionCorrect;
    const sessionAccuracy = sessionReviewed
      ? Math.round((sessionCorrect / sessionReviewed) * 100)
      : 0;
    const fLabel = todayPlan.forecastLabel;
    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-8 text-center">
        <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium mb-2">
          {dueQueueDone ? 'Queue cleared!' : 'Session complete'}
        </div>
        <div className="text-4xl font-semibold text-stone-900 dark:text-stone-100 mb-1">
          {dueQueueDone ? `${completedDueIds.size}/${initialDue}` : sessionReviewed}
        </div>
        <div className="text-sm text-stone-400 mb-3">
          {dueQueueDone ? 'due cards cleared' : 'cards reviewed'}
        </div>
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
        {fLabel && (
          <div className="mt-3 mb-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 px-4 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1">
              Coming up
            </div>
            <div className="text-xs text-stone-600 dark:text-stone-300">{fLabel}</div>
          </div>
        )}
        {!fLabel && <div className="mb-3" />}
        {(daily.bestAnswerStreak || 0) >= 5 && (
          <div className="text-xs text-stone-400 mb-1">
            Best streak: {daily.bestAnswerStreak} in a row
          </div>
        )}
        {!!daily.goalStreak && (
          <div className="text-amber-600 dark:text-amber-400 text-sm mt-1 mb-3">
            🔥 {daily.goalStreak}-day streak
          </div>
        )}
        {!daily.goalStreak && <div className="mb-3" />}
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
            <button
              onClick={() => launchRepairDrill(sessionMistakePatterns[0])}
              className="mt-3 w-full px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium transition"
            >
              Start 10-card repair drill
            </button>
          </div>
        ) : (
          sessionWrong === 0 &&
          sessionReviewed > 0 && (
            <div className="text-xs text-emerald-600 dark:text-emerald-400 mb-4">
              Perfect session — no missed answers!
            </div>
          )
        )}
        <button
          onClick={() => {
            setBonusMode(true);
            setCurrent(selectNext(state, practiceWords, enabledTypes, current?.id, practicePrefs));
            setPhase('answering');
          }}
          className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-medium"
        >
          Keep practicing
        </button>
      </div>
    );
  }

  if (reviewSetComplete && phase === 'answering') {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-8 text-center">
        <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium mb-2">
          {reviewSetComplete
            ? reviewLimitSource === 'repair'
              ? 'Repair drill complete'
              : 'Drill complete'
            : 'Drill complete'}
        </div>
        <div className="text-4xl font-semibold text-stone-900 dark:text-stone-100 mb-2">
          {state.session.correct}/{state.session.reviewed}
        </div>
        <div className="text-sm text-stone-500 mb-1">
          Session accuracy:{' '}
          {state.session.reviewed
            ? Math.round((state.session.correct / state.session.reviewed) * 100)
            : 0}
          %
        </div>
        {reviewLimit > 0 && (
          <div className="text-xs text-stone-400 mb-5">
            {Math.min(reviewsDone, reviewLimit)}/{reviewLimit} cards in this drill
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
            <button
              onClick={() => launchRepairDrill(sessionMistakePatterns[0])}
              className="mt-3 w-full px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium transition"
            >
              Start 10-card repair drill
            </button>
          </div>
        ) : (
          <div className="mb-5" />
        )}
        <button
          onClick={() => {
            setReviewBase(state.session.reviewed || 0);
            setCurrent(selectNext(state, practiceWords, enabledTypes, current.id, practicePrefs));
            setAnswer('');
            setPhase('answering');
          }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-medium"
        >
          Start another drill
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
              type={current.type}
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
    setFocusWordLock(null);
    onFocusConsumed?.();
    setTab('library');
  }

  return (
    <div className="space-y-4">
      {referenceLaunch && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-left">
            <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-300 font-semibold">
              Reference drill
            </div>
            <div className="text-sm text-stone-700 dark:text-stone-250">
              {referenceLaunch.referenceLabel || 'Focused reference practice'}
            </div>
          </div>
          <button
            type="button"
            onClick={returnToReference}
            className="px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white/70 dark:bg-stone-950/40 text-sm text-indigo-700 dark:text-indigo-250 hover:bg-white dark:hover:bg-stone-900 transition"
          >
            Back to reference
          </button>
        </div>
      )}
      {renderTodayEntry()}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="Study mode"
          className="grid grid-cols-3 gap-1 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-1"
        >
          {STUDY_MODE_OPTIONS.map((mode) => {
            const active = activeDrillMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => switchStudyMode(mode.id)}
                aria-pressed={active}
                className={`min-h-10 rounded-lg px-2 py-2 text-xs sm:text-sm font-medium leading-tight transition ${
                  active
                    ? 'bg-stone-800 text-white dark:bg-indigo-600'
                    : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          {transformationMode && (
            <div className="text-xs text-stone-500 dark:text-stone-400 tabular-nums sm:pr-1">
              {transformationStats.correct || 0}/{transformationStats.attempted || 0} transform
              {transformationStats.attempted ? ` · ${transformationAccuracy}%` : ''}
            </div>
          )}
          <div
            role="group"
            aria-label="Practice direction"
            className="grid grid-cols-3 gap-1 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-1"
          >
            {PRACTICE_DIRECTIONS.map((direction) => {
              const active =
                (practicePrefs.drillDirection || DEFAULT_PREFS.drillDirection) === direction.id;
              return (
                <button
                  key={direction.id}
                  type="button"
                  onClick={() => switchPracticeDirection(direction.id)}
                  aria-pressed={active}
                  title={
                    direction.id === 'forward'
                      ? 'Dictionary or source form to target form'
                      : direction.id === 'reverse'
                        ? 'Conjugated form to dictionary form'
                        : 'Alternate both directions'
                  }
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'bg-stone-800 text-white dark:bg-indigo-600'
                      : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                >
                  {direction.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800">
        <div className="px-4 py-4 sm:px-6 sm:py-8 text-center relative">
          <div className="absolute top-4 left-4 sm:top-8 sm:left-6 text-[9px] text-stone-400">
            JLPT {getWordMeta(current.verb).jlpt}
          </div>
          {reviewLimit > 0 ||
          !!sessionSkipped ||
          initialDue > 0 ||
          (!daily.goalHit && !bonusMode) ? (
            <div className="flex justify-end mb-3">
              <div className="text-xs text-stone-400 text-right shrink-0">
                {reviewLimit > 0 && (
                  <div className="text-indigo-600 dark:text-indigo-400 font-medium">
                    {Math.min(reviewsDone, reviewLimit)}/{reviewLimit}{' '}
                    {reviewLimitSource === 'repair' ? 'repair' : 'drill'}
                  </div>
                )}
                {initialDue > 0 && !bonusMode && (
                  <div className="text-indigo-600 dark:text-indigo-400 font-medium">
                    {completedDueIds.size}/{initialDue} due
                  </div>
                )}
                {bonusMode && (
                  <div className="text-emerald-600 dark:text-emerald-400 font-medium">✓ bonus</div>
                )}
                {!!sessionSkipped && <div className="text-stone-500">{sessionSkipped} skipped</div>}
                <div className="text-[9px]">
                  {[
                    getWordMeta(current.verb).lesson &&
                      `Genki L${getWordMeta(current.verb).lesson}`,
                    getWordMeta(current.verb).minnaLesson &&
                      `Minna L${getWordMeta(current.verb).minnaLesson}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </div>
          ) : (
            <div className="absolute top-4 right-4 sm:top-8 sm:right-6 text-right text-[9px] text-stone-400">
              {[
                getWordMeta(current.verb).lesson && `Genki L${getWordMeta(current.verb).lesson}`,
                getWordMeta(current.verb).minnaLesson &&
                  `Minna L${getWordMeta(current.verb).minnaLesson}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
          {hidePromptText ? (
            <div className="max-w-md mx-auto rounded-2xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-5">
              <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-semibold mb-3">
                Listening prompt
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
          ) : practicePrefs.drillMode === 'sentence' && aiSentence ? (
            aiSentence.loading ? (
              <div className="text-xl sm:text-2xl text-stone-400 italic py-6 animate-pulse">
                Generating sentence context...
              </div>
            ) : aiSentence.err ? (
              <div className="text-rose-500 py-6 text-sm">{aiSentence.err}</div>
            ) : (
              <div
                className="text-2xl sm:text-3xl font-medium mb-4 text-center leading-relaxed tracking-wide text-stone-850 dark:text-stone-150"
                lang="ja"
              >
                {aiSentence.sentence}
              </div>
            )
          ) : (
            <ScriptDisplay
              view={promptView}
              className="text-4xl sm:text-5xl font-medium mb-2 text-stone-900 dark:text-stone-100"
              subClassName="text-base text-stone-500"
            />
          )}
          {transformationMode && !hidePromptText && (
            <div className="mt-1 text-xs text-stone-400">Prompt form: {sourceTypeInfo.label}.</div>
          )}
          {noChangePrompt && !hidePromptText && (
            <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
              Trick: no change needed
            </div>
          )}
          {reverseDrill && !hidePromptText && (
            <div className="text-xs text-stone-400">Answer with the dictionary form.</div>
          )}

          {hideEnglishHint ? (
            <div className="mt-3 max-w-md mx-auto rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 px-3 py-2 text-xs text-stone-500">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span>English hint hidden until review.</span>
                <button
                  onClick={() => setShowEnglishHint(true)}
                  className="px-2 py-1 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-750 dark:text-stone-300"
                >
                  Show hint
                </button>
                <button
                  onClick={generateAIClue}
                  disabled={!geminiKey}
                  className="px-2 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 disabled:opacity-40 text-indigo-700 dark:bg-stone-900 dark:border-stone-800 dark:text-indigo-400 inline-flex items-center gap-1"
                >
                  <IconSpark className="w-3.5 h-3.5" />
                  {aiHintLoading ? 'Cancel' : 'AI clue'}
                </button>
              </div>
              {aiHintText && (
                <div className="mt-2 text-stone-705 dark:text-stone-300 leading-relaxed max-h-32 overflow-y-auto">
                  {aiHintText}
                </div>
              )}
              {aiHintErr && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-rose-600 text-sm">{aiHintErr}</span>
                  <button
                    onClick={generateAIClue}
                    className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          ) : practicePrefs.drillMode === 'sentence' && aiSentence && !aiSentence.loading ? (
            <div className="space-y-1 mt-2">
              <div className="text-sm text-stone-500 italic">Context: {aiSentence.translation}</div>
              {aiSentence.cue && (
                <div className="text-xs text-indigo-600 dark:text-indigo-400">{aiSentence.cue}</div>
              )}
            </div>
          ) : (
            <>
              <div className="text-sm text-stone-500 mt-2 italic">{promptEnglish}</div>
              {aiHintText && phase === 'answering' && (
                <div className="mt-2 text-xs text-stone-500 max-w-md mx-auto rounded-lg border border-indigo-100 bg-indigo-50 dark:bg-indigo-950/20 px-3 py-2 max-h-32 overflow-y-auto">
                  {aiHintText}
                </div>
              )}
            </>
          )}

          {phase === 'reviewing' && practicePrefs.showWordCategory && (
            <div className="text-xs text-stone-400 mt-1">
              {groupDisplayLabel(current.verb.group)} · {wordType}
              {groupAliasText(current.verb.group) ? ` · ${groupAliasText(current.verb.group)}` : ''}
            </div>
          )}
          <div className="mt-4 flex flex-col gap-1">
            {phase === 'answering' ? (
              <>
                <div className="flex justify-center mb-4">
                  {transformationMode ? (
                    <div className="max-w-full px-2 text-center">
                      <div className="text-[10px] font-semibold uppercase text-indigo-500 dark:text-indigo-300">
                        {transformationActionLabel}
                      </div>
                      <div className="mt-1 inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl bg-indigo-600 px-5 py-3 text-white shadow-lg shadow-indigo-950/20 dark:bg-indigo-500/95">
                        <span className="text-xl sm:text-2xl font-bold leading-tight">
                          {targetTypeInfo.label}
                        </span>
                        {answerTaskDetails.sub && (
                          <span
                            className="rounded-lg bg-white/15 px-2 py-1 text-base sm:text-lg font-semibold leading-tight"
                            lang="ja"
                          >
                            {answerTaskDetails.sub}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                        <span>From {sourceTypeInfo.label}</span>
                        <span aria-hidden="true" className="text-indigo-400">
                          -&gt;
                        </span>
                        <span>{transformationSupportText}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/60 shadow-sm">
                      <span className="text-sm font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                        {taskLabel}
                      </span>
                      {answerTaskDetails.sub && (
                        <span
                          className="text-sm text-indigo-500 dark:text-indigo-400 font-medium"
                          lang="ja"
                        >
                          {answerTaskDetails.sub}
                        </span>
                      )}
                      {answerTaskDetails.supportText ? (
                        <span className="text-xs text-indigo-400 dark:text-indigo-500">
                          · {answerTaskDetails.supportText}
                        </span>
                      ) : null}
                      {current.ruleLabel && practicePrefs.showWordCategory && (
                        <span className="text-xs text-indigo-400 dark:text-indigo-500">
                          · {current.ruleLabel}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="sr-only">
                    {transformationMode ? transformationRoute : taskLabel}
                  </div>
                </div>
                {minimalPairSetForCurrent && (
                  <div className="mb-3 flex items-center justify-between gap-2 rounded-full border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5 text-xs text-emerald-800 dark:text-emerald-250">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold uppercase tracking-wider">
                        {activeMinimalPairSet ? 'Minimal pair' : 'Today contrast'}
                      </span>
                      <span>{minimalPairSetForCurrent.label}</span>
                      {reviewsDone > 0 && (
                        <span className="tabular-nums opacity-70">{reviewsDone} this session</span>
                      )}
                    </div>
                    {activeMinimalPairSet && (
                      <button
                        onClick={() => {
                          if (setPracticePrefs)
                            setPracticePrefs(clearMinimalPairPrefs(practicePrefs));
                          if (setState) {
                            const enabledTypes = minimalPairReturnEnabledTypes(practicePrefs);
                            setState((prev) => ({ ...prev, enabledTypes: enabledTypes || [] }));
                          }
                        }}
                        className="ml-1 font-bold leading-none hover:text-emerald-950 dark:hover:text-emerald-100 transition"
                        aria-label="End minimal pair drill"
                        title="End drill"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}
                {typoGuard && (
                  <div className="mb-3 rounded-xl border border-amber-250 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                    <div className="font-medium">Almost - possible typo.</div>
                    <div className="text-xs mt-0.5">{typoGuard.detail}</div>
                  </div>
                )}

                {answerMode === 'self-check' ? (
                  <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-4">
                    <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-semibold mb-2">
                      Self-check deck
                    </div>
                    {!selfCheckOpen ? (
                      <>
                        <p className="text-sm text-stone-600 dark:text-stone-400 mb-3">
                          Say or write the answer on your own, then reveal it and grade honestly.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-2">
                          <button
                            onClick={() => setSelfCheckOpen(true)}
                            className="py-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-medium transition"
                          >
                            Reveal answer
                          </button>
                          <button
                            onClick={skipCurrent}
                            className="py-2.5 border border-stone-250 bg-white hover:bg-stone-50 text-stone-600 rounded-xl font-medium dark:bg-stone-900 dark:border-stone-800 dark:text-stone-300 transition"
                          >
                            Skip without penalty
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="rounded-xl bg-white dark:bg-stone-900 border border-stone-205 dark:border-stone-800 px-3 py-3">
                          <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1">
                            Answer
                          </div>
                          <ScriptDisplay
                            view={expectedView}
                            word={current.verb}
                            type={current.type}
                            colorHighlight={practicePrefs.colorCodeConjugations !== false}
                            className="text-2xl font-semibold text-stone-900 dark:text-stone-100"
                            subClassName="text-xs text-stone-500 mt-1"
                          />
                          <div className="text-xs text-stone-500 mt-2">{targetEnglish}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          <button
                            onClick={() => gradeSelfCheck(true, 'Remembered')}
                            className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition"
                          >
                            Remembered
                          </button>
                          <button
                            onClick={() => gradeSelfCheck(false, 'Missed')}
                            className="py-2.5 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-xl text-sm font-medium transition"
                          >
                            Missed
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : answerMode === 'speak' ? (
                  <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-4">
                    <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-semibold mb-2">
                      Speak answer
                    </div>
                    <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <input
                            ref={inputRef}
                            id="spoken-answer"
                            type="text"
                            value={answer}
                            onChange={(e) => {
                              setSpeechError('');
                              setAnswer(e.target.value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (answer.trim()) submit(answer, { spoken: true });
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                skipCurrent();
                              }
                            }}
                            placeholder="Heard Japanese answer..."
                            aria-label="Heard spoken answer"
                            className="w-full min-w-0 px-4 py-3 text-xl text-center border-2 border-stone-200 dark:border-stone-805 rounded-xl bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-150 focus:border-indigo-500 focus:outline-none transition"
                            lang="ja"
                            autoComplete="off"
                            autoCapitalize="none"
                            autoCorrect="off"
                            enterKeyHint="done"
                            spellCheck="false"
                          />
                        </div>
                        <div className="mt-2 min-h-5 text-xs">
                          {speechListening ? (
                            <span role="status" className="text-indigo-600 dark:text-indigo-400">
                              Listening for Japanese...
                            </span>
                          ) : speechMatch ? (
                            <span
                              className={
                                speechMatch.ok
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-stone-500 dark:text-stone-400'
                              }
                            >
                              {speechMatch.ok
                                ? 'Exact match heard.'
                                : speechMatch.score !== null
                                  ? `Closest match ${speechMatch.score}%.`
                                  : ''}
                            </span>
                          ) : speechRecognitionAvailable ? (
                            <span className="text-stone-500 dark:text-stone-400">
                              Microphone ready.
                            </span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">
                              Speech input is not available in this browser.
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => startSpeechAnswer()}
                        disabled={!speechRecognitionAvailable}
                        className={`min-h-12 px-4 py-3 rounded-xl font-medium transition inline-flex items-center justify-center gap-2 ${
                          speechListening
                            ? 'bg-rose-600 hover:bg-rose-700 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:hover:bg-indigo-600'
                        }`}
                      >
                        <IconMic className="w-4 h-4" />
                        {speechListening ? 'Stop listening' : 'Speak answer'}
                      </button>
                    </div>
                    {speechError && (
                      <div
                        role="alert"
                        className="mt-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
                      >
                        {speechError}
                      </div>
                    )}
                    <StickyAction className="mt-3">
                      <button
                        onClick={() => submit(answer, { spoken: true })}
                        disabled={!answer.trim()}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-lg transition disabled:opacity-40"
                      >
                        Check spoken answer
                      </button>
                    </StickyAction>
                    <div className="grid sm:grid-cols-2 gap-2 mt-3">
                      <button
                        onClick={revealAnswer}
                        className="py-2.5 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-medium transition"
                      >
                        Reveal
                      </button>
                      <button
                        onClick={skipCurrent}
                        className="py-2.5 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-xl font-medium transition"
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                ) : answerMode === 'choice' ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {reverseDrill
                        ? choices.map((w) => {
                            const cv = promptDisplay(w, null, practicePrefs);
                            return (
                              <button
                                key={w.dict + ':' + w.reading}
                                onClick={() => submit(w.dict)}
                                className="min-h-14 px-3 py-3 border-2 border-stone-200 dark:border-stone-800 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-xl text-xl text-stone-800 dark:text-stone-200 transition"
                              >
                                <ScriptDisplay
                                  view={cv}
                                  className="text-xl"
                                  subClassName="text-xs text-stone-400 mt-1"
                                />
                                {!hideEnglishHint && (
                                  <div className="mt-1 text-xs text-stone-500">{w.meaning}</div>
                                )}
                              </button>
                            );
                          })
                        : choices.map((c) => {
                            const cv = formDisplay(c, practicePrefs);
                            return (
                              <button
                                key={c}
                                onClick={() => submit(c)}
                                className="min-h-14 px-3 py-3 border-2 border-stone-200 dark:border-stone-800 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-xl text-xl text-stone-800 dark:text-stone-200 transition"
                              >
                                <ScriptDisplay
                                  view={cv}
                                  className="text-xl"
                                  subClassName="text-xs text-stone-400 mt-1"
                                />
                              </button>
                            );
                          })}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2 mt-3">
                      <button
                        onClick={revealAnswer}
                        className="py-2.5 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-medium transition"
                      >
                        I don't know
                      </button>
                      <button
                        onClick={skipCurrent}
                        className="py-2.5 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-xl font-medium transition"
                      >
                        Skip without penalty
                      </button>
                    </div>
                  </>
                ) : guidedKana ? (
                  <>
                    <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-3 mb-3">
                      <div className="flex flex-wrap justify-center gap-1.5" lang="ja">
                        {coachCells.map((cell, i) => {
                          const cls =
                            kanaMatchDisplay === 'none'
                              ? cell.state === 'empty'
                                ? 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-300'
                                : 'bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                              : cell.state === 'correct'
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300'
                                : cell.state === 'wrong' || cell.state === 'extra'
                                  ? 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300'
                                  : cell.state === 'pending'
                                    ? 'bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                                    : cell.state === 'hint'
                                      ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:border-amber-805 dark:text-amber-300'
                                      : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-300';
                          return (
                            <div
                              key={i}
                              className={`w-10 h-11 sm:w-11 sm:h-12 rounded-xl border flex items-center justify-center text-xl font-medium tabular-nums transition ${cls}`}
                            >
                              {cell.shown || '·'}
                            </div>
                          );
                        })}
                      </div>
                      {kanaMatchDisplay === 'color-count' && coachStatus && (
                        <div
                          className={`mt-2 text-xs text-center ${
                            coachWrongIndex >= 0
                              ? 'text-rose-700'
                              : coachPreview === expected
                                ? 'text-emerald-700'
                                : 'text-stone-500'
                          }`}
                        >
                          {coachStatus}
                        </div>
                      )}
                      {!reverseDrill && (
                        <div className="mt-2 flex flex-col items-center gap-1">
                          <button
                            onClick={showStepHint}
                            className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 inline-flex items-center gap-1 transition"
                          >
                            <IconSpark className="w-3 h-3" />
                            Hint
                          </button>
                          {hintDisclosure}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        ref={inputRef}
                        type="text"
                        value={answer}
                        onChange={(e) => {
                          setTypoGuard(null);
                          const newVal = e.target.value;
                          if (kanaMatchDisplay !== 'none') {
                            const cells = kanaCoachCells(expected, newVal, coachRevealed, true);
                            if (cells.some((c) => c.state === 'wrong' || c.state === 'extra')) {
                              if (!hadKanaMistakeRef.current) wrongSnapshotRef.current = newVal;
                              hadKanaMistakeRef.current = true;
                            }
                          }
                          setAnswer(newVal);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (answer.trim()) submit();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            skipCurrent();
                          }
                        }}
                        placeholder={
                          reverseDrill ? 'Type dictionary form...' : 'Type romaji or kana...'
                        }
                        aria-label={
                          reverseDrill
                            ? 'Type the dictionary form'
                            : 'Type your answer in romaji or kana'
                        }
                        className="flex-1 min-w-0 px-4 py-3 text-xl text-center border-2 border-stone-200 dark:border-stone-805 rounded-xl bg-white dark:bg-stone-950 text-transparent caret-stone-850 dark:caret-stone-150 focus:border-indigo-500 focus:outline-none transition"
                        lang="ja"
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        enterKeyHint="done"
                        spellCheck="false"
                      />
                      <button
                        type="button"
                        onClick={() => setKanaPadOpen((v) => !v)}
                        className={`shrink-0 p-2 rounded-lg border inline-flex items-center justify-center aspect-square transition ${
                          kanaPadOpen
                            ? 'bg-stone-800 border-stone-800 text-white dark:bg-indigo-600 dark:border-indigo-600 dark:text-white'
                            : 'bg-white border-stone-200 hover:bg-stone-50 text-stone-600 dark:bg-stone-900 dark:border-stone-800 dark:hover:bg-stone-800 dark:text-stone-300'
                        }`}
                        title="Kana pad"
                      >
                        <IconPen className="w-4 h-4" />
                      </button>
                    </div>
                    <KanaInputPad
                      open={kanaPadOpen}
                      onToggle={() => setKanaPadOpen((v) => !v)}
                      onInsert={insertAnswerText}
                      onBackspace={backspaceAnswerText}
                      onClear={clearAnswerText}
                      onSubmit={() => submit()}
                      canSubmit={!!answer.trim()}
                      noToggle
                    />
                    <StickyAction className="mt-3">
                      <button
                        onClick={() => submit()}
                        disabled={!answer.trim()}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-lg transition disabled:opacity-40"
                      >
                        Check (Enter)
                      </button>
                    </StickyAction>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <button
                        onClick={() =>
                          setCoachRevealed(
                            Math.min(
                              expectedKanaCount,
                              Math.max(coachRevealed, coachTypedCount) + 1,
                            ),
                          )
                        }
                        disabled={coachRevealed >= expectedKanaCount || phase !== 'answering'}
                        className="py-2.5 border border-stone-205 dark:border-stone-800 hover:bg-white dark:hover:bg-stone-800 text-stone-605 dark:text-stone-300 disabled:opacity-40 rounded-xl text-sm"
                      >
                        Hint
                      </button>
                      <button
                        onClick={revealAnswer}
                        className="py-2.5 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-xl text-sm text-amber-800"
                      >
                        Reveal
                      </button>
                      <button
                        onClick={skipCurrent}
                        className="py-2.5 border border-stone-205 dark:border-stone-800 hover:bg-white dark:hover:bg-stone-800 text-stone-605 dark:text-stone-300 rounded-xl text-sm"
                      >
                        Skip
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        ref={inputRef}
                        type="text"
                        value={answer}
                        onChange={(e) => {
                          setTypoGuard(null);
                          const newVal = e.target.value;
                          if (kanaMatchDisplay !== 'none' && !reverseDrill) {
                            const cells = kanaCoachCells(expected, newVal, 0, true);
                            if (cells.some((c) => c.state === 'wrong' || c.state === 'extra')) {
                              if (!hadKanaMistakeRef.current) wrongSnapshotRef.current = newVal;
                              hadKanaMistakeRef.current = true;
                            }
                          }
                          setAnswer(newVal);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (answer.trim()) submit();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            skipCurrent();
                          }
                        }}
                        placeholder={
                          reverseDrill ? 'Type dictionary form...' : 'Type romaji or kana...'
                        }
                        aria-label={
                          reverseDrill
                            ? 'Type the dictionary form'
                            : 'Type your answer in romaji or kana'
                        }
                        className="flex-1 min-w-0 px-4 py-3 text-xl text-center border-2 border-stone-200 dark:border-stone-805 rounded-xl bg-white dark:bg-stone-950 text-transparent caret-stone-850 dark:caret-stone-150 focus:border-indigo-500 focus:outline-none transition"
                        lang="ja"
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        enterKeyHint="done"
                        spellCheck="false"
                      />
                      <button
                        type="button"
                        onClick={() => setKanaPadOpen((v) => !v)}
                        className={`shrink-0 p-2 rounded-lg border inline-flex items-center justify-center aspect-square transition ${
                          kanaPadOpen
                            ? 'bg-stone-800 border-stone-800 text-white dark:bg-indigo-600 dark:border-indigo-600 dark:text-white'
                            : 'bg-white border-stone-200 hover:bg-stone-50 text-stone-600 dark:bg-stone-900 dark:border-stone-800 dark:hover:bg-stone-800 dark:text-stone-300'
                        }`}
                        title="Kana pad"
                      >
                        <IconPen className="w-4 h-4" />
                      </button>
                    </div>
                    <KanaInputPad
                      open={kanaPadOpen}
                      onToggle={() => setKanaPadOpen((v) => !v)}
                      onInsert={insertAnswerText}
                      onBackspace={backspaceAnswerText}
                      onClear={clearAnswerText}
                      onSubmit={() => submit()}
                      canSubmit={!!answer.trim()}
                      noToggle
                    />
                    {!!liveCells.length &&
                      kanaMatchDisplay !== 'none' &&
                      (kanaMatchDisplay === 'color-count' ||
                        liveCells.some((c) => c.state !== 'empty')) && (
                        <div className="mt-3 rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-3">
                          <div className="flex flex-wrap justify-center gap-1.5" lang="ja">
                            {(kanaMatchDisplay === 'color-count'
                              ? liveCells
                              : liveCells.filter((c) => c.state !== 'empty')
                            ).map((cell, i) => {
                              const cls =
                                cell.state === 'correct'
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-805 dark:text-emerald-300'
                                  : cell.state === 'wrong' || cell.state === 'extra'
                                    ? 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/30 dark:border-rose-805 dark:text-rose-300'
                                    : cell.state === 'pending'
                                      ? 'bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                                      : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-300';
                              return (
                                <div
                                  key={i}
                                  className={`w-9 h-10 sm:w-10 sm:h-11 rounded-xl border flex items-center justify-center text-lg font-medium tabular-nums transition ${cls}`}
                                >
                                  {cell.shown || '·'}
                                </div>
                              );
                            })}
                          </div>
                          {kanaMatchDisplay === 'color-count' && liveStatus && (
                            <div
                              className={`mt-2 text-xs text-center ${
                                liveWrongIndex >= 0
                                  ? 'text-rose-700'
                                  : preview === expected
                                    ? 'text-emerald-700'
                                    : 'text-stone-500'
                              }`}
                            >
                              {liveStatus}
                            </div>
                          )}
                        </div>
                      )}
                    <StickyAction className="mt-3">
                      <button
                        onClick={() => submit()}
                        disabled={!answer.trim()}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-lg transition disabled:opacity-40"
                      >
                        Check (Enter)
                      </button>
                    </StickyAction>
                    <div
                      className={`mt-2 grid gap-2 ${!reverseDrill ? 'grid-cols-3' : 'grid-cols-2'}`}
                    >
                      {!reverseDrill && (
                        <button
                          onClick={showStepHint}
                          className="py-2.5 border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-xl font-medium transition"
                        >
                          Hint
                        </button>
                      )}
                      <button
                        onClick={revealAnswer}
                        className="py-2.5 border border-amber-205 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-medium transition"
                      >
                        Reveal
                      </button>
                      <button
                        onClick={skipCurrent}
                        className="py-2.5 border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 hover:bg-stone-105 text-stone-600 dark:text-stone-300 rounded-xl font-medium transition"
                      >
                        Skip
                      </button>
                    </div>
                    {hintDisclosure}
                  </>
                )}
              </>
            ) : (
              <div
                className={`rounded-xl p-4 ${
                  wasCorrect
                    ? 'bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-200 dark:border-emerald-900/50'
                    : wasCorrected
                      ? 'bg-amber-50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/50'
                      : 'bg-rose-50 dark:bg-rose-950/10 border border-rose-200 dark:border-rose-900/50'
                }`}
              >
                {/* Scoped to the short verdict so screen readers announce the
                    result without re-reading the breakdown/chat below. */}
                <span role="status" aria-live="polite" className="sr-only">
                  {wasCorrect ? 'Correct!' : wasCorrected ? 'Self-corrected.' : 'Not quite.'}
                </span>
                <div className="flex items-start gap-3 text-left">
                  <div
                    className={`mt-0.5 flex-shrink-0 ${wasCorrect ? 'text-emerald-600' : wasCorrected ? 'text-amber-600' : 'text-rose-600'}`}
                  >
                    {wasCorrect ? <IconCheck className="w-5 h-5" /> : <IconX className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <div
                      className={`text-sm font-medium ${wasCorrect ? 'text-emerald-800 dark:text-emerald-300' : wasCorrected ? 'text-amber-800 dark:text-amber-300' : 'text-rose-800'}`}
                    >
                      {wasCorrect ? 'Correct!' : wasCorrected ? 'Self-corrected.' : 'Not quite.'}
                    </div>
                    {wasCorrected && (
                      <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                        You fixed it mid-type, but the mistake still counts.
                      </div>
                    )}
                    {wasCorrect ? (
                      /* Correct answer case */
                      <>
                        {reviewKanaCells.length > 0 && (
                          <div className="mt-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/50 p-2">
                            <div className="flex flex-wrap justify-center gap-1" lang="ja">
                              {reviewKanaCells.map((cell, i) => {
                                const cls =
                                  cell.state === 'correct'
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-805 dark:text-emerald-300'
                                    : cell.state === 'wrong' || cell.state === 'extra'
                                      ? 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/30 dark:border-rose-805 dark:text-rose-300'
                                      : cell.state === 'hint'
                                        ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:border-amber-300 dark:text-amber-300'
                                        : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-300';
                                return (
                                  <div
                                    key={i}
                                    className={`w-8 h-9 sm:w-9 sm:h-10 rounded-lg border flex items-center justify-center text-base font-medium tabular-nums ${cls}`}
                                  >
                                    {cell.shown || '·'}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      /* Incorrect answer case */
                      <>
                        {reviewKanaCells.length > 0 ? (
                          <>
                            {/* Correct Answer nice and clearly at the top */}
                            <div className="mt-3">
                              <div className="text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-455 font-semibold mb-1">
                                Correct Answer
                              </div>
                              <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/10 p-2">
                                <div className="flex flex-wrap justify-center gap-1.5" lang="ja">
                                  {Array.from(expected).map((char, i) => (
                                    <div
                                      key={i}
                                      className="w-9 h-10 sm:w-10 sm:h-11 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-850 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300 flex items-center justify-center text-lg font-semibold tabular-nums shadow-sm"
                                    >
                                      {char}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <ScriptDisplay
                                view={expectedView}
                                word={current.verb}
                                type={current.type}
                                colorHighlight={practicePrefs.colorCodeConjugations !== false}
                                className="text-xl mt-2 text-emerald-900 dark:text-emerald-100"
                                subClassName="text-xs text-stone-500 mt-1"
                              />
                              <div className="text-xs mt-1 text-emerald-700 dark:text-emerald-400">
                                {targetEnglish}
                              </div>
                            </div>

                            {/* Guessed answer below it */}
                            <div className="mt-3">
                              <div
                                className={`text-[11px] uppercase tracking-wider ${wasCorrected ? 'text-amber-700/80 dark:text-amber-400/80' : 'text-rose-700/80 dark:text-rose-400/80'} mb-1`}
                              >
                                {reviewChoiceLabel
                                  ? 'You chose'
                                  : revealedMiss
                                    ? "You chose: I don't know"
                                    : 'Your guess'}
                                {!revealedMiss && !reviewChoiceLabel && (
                                  <span lang="ja" className="ml-1 font-medium">
                                    (
                                    {reverseDrill
                                      ? submittedAnswer.trim() || 'empty'
                                      : toHiragana(submittedAnswer) || 'empty'}
                                    )
                                  </span>
                                )}
                              </div>
                              <div className="rounded-xl border border-stone-200/60 dark:border-stone-800/60 bg-stone-50/40 dark:bg-stone-900/20 p-2">
                                <div className="flex flex-wrap justify-center gap-1" lang="ja">
                                  {reviewKanaCells.map((cell, i) => {
                                    const cls =
                                      cell.state === 'correct'
                                        ? 'bg-emerald-50/50 border-emerald-350/40 text-emerald-800/80 dark:bg-emerald-950/20 dark:border-emerald-800/30 dark:text-emerald-300/80'
                                        : cell.state === 'wrong' || cell.state === 'extra'
                                          ? 'bg-rose-50/50 border-rose-350/40 text-rose-800/80 dark:bg-rose-950/20 dark:border-rose-800/30 dark:text-rose-300/80'
                                          : cell.state === 'hint'
                                            ? 'bg-amber-50/50 border-amber-350/40 text-amber-800/80 dark:bg-amber-950/20 dark:border-amber-300/30 dark:text-amber-300/80'
                                            : 'bg-white/50 dark:bg-stone-900/50 border-stone-200/40 dark:border-stone-800/40 text-stone-300/85';
                                    return (
                                      <div
                                        key={i}
                                        className={`w-7 h-8 sm:w-8 sm:h-9 rounded-lg border flex items-center justify-center text-sm font-medium tabular-nums ${cls}`}
                                      >
                                        {cell.shown || '·'}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-rose-700 mt-1">
                            {reviewChoiceLabel
                              ? `You chose: ${reviewChoiceLabel}`
                              : revealedMiss
                                ? "You chose: I don't know"
                                : 'You wrote:'}{' '}
                            {!revealedMiss && !reviewChoiceLabel && (
                              <span lang="ja" className="font-semibold">
                                {reverseDrill
                                  ? submittedAnswer.trim() || '(empty)'
                                  : toHiragana(submittedAnswer) || '(empty)'}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    {wasCorrect && (
                      <>
                        <ScriptDisplay
                          view={expectedView}
                          word={current.verb}
                          type={current.type}
                          colorHighlight={practicePrefs.colorCodeConjugations !== false}
                          className="text-xl mt-2 text-emerald-900 dark:text-emerald-100"
                          subClassName="text-xs text-stone-500 mt-1"
                        />
                        <div className="text-xs mt-1 text-emerald-700 dark:text-emerald-400">
                          {targetEnglish}
                        </div>
                      </>
                    )}
                    <PitchAccentSection
                      word={current.verb}
                      kanaText={expected}
                      geminiKey={geminiKey}
                      practicePrefs={practicePrefs}
                    />
                    {wasCorrect && practicePrefs.autoAdvanceCorrect && (
                      <div className="text-xs text-emerald-700 mt-2">Next card coming up...</div>
                    )}
                  </div>
                </div>

                <ContextExamplePanel
                  item={current.verb}
                  type={current.type}
                  geminiKey={geminiKey}
                  practicePrefs={practicePrefs}
                />

                {wasCorrect && reviewExplanation && (
                  <div className="mt-4 pt-4 border-t border-emerald-200 dark:border-emerald-900/50 space-y-2.5 text-left">
                    <div className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-450 font-medium">
                      Why this is right
                    </div>
                    <div className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                      {reviewExplanation.intro}
                    </div>
                    {reviewExplanation.reason && (
                      <div className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
                        {reviewExplanation.reason}
                      </div>
                    )}
                    {reviewExplanation.rule && (
                      <div className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                        {reviewExplanation.rule}
                      </div>
                    )}
                    {reviewExplanation.derivation && reviewExplanation.derivation !== expected && (
                      <div
                        className="text-base text-center bg-white/70 dark:bg-stone-900/70 rounded-lg px-3 py-2 text-stone-900 dark:text-stone-100"
                        lang="ja"
                      >
                        {reviewExplanation.derivation}
                      </div>
                    )}
                    {reviewExplanation.note && (
                      <div className="text-xs text-stone-605 dark:text-stone-400 italic bg-stone-50/80 dark:bg-stone-950/80 rounded-lg px-3 py-2 border border-stone-200 dark:border-stone-800">
                        {reviewExplanation.note}
                      </div>
                    )}
                    <ConjugationBreakdown
                      word={current.verb}
                      type={current.type}
                      geminiKey={geminiKey}
                      practicePrefs={practicePrefs}
                    />
                  </div>
                )}

                {!wasCorrect && explanation && (
                  <div className="mt-4 pt-4 border-t border-rose-200 dark:border-rose-900/50 space-y-2.5 text-left">
                    <div className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-400 font-medium">
                      Why it's{' '}
                      <span lang="ja" className="normal-case tracking-normal">
                        {expected}
                      </span>
                    </div>
                    {minimalPairFeedback && (
                      <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2">
                        <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                          Contrast check: {minimalPairFeedback.label}
                        </div>
                        <div className="mt-1 text-sm text-stone-700 dark:text-stone-300">
                          {minimalPairFeedback.intro}
                        </div>
                        {minimalPairFeedback.masuDiagnostic && (
                          <div className="mt-2 border-l-2 border-emerald-300 dark:border-emerald-700 pl-3 text-sm text-stone-700 dark:text-stone-300">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                              Masu check
                            </div>
                            <div className="mt-0.5">
                              <span
                                lang="ja"
                                className="font-semibold text-stone-900 dark:text-stone-100"
                              >
                                {minimalPairFeedback.masuDiagnostic.dict}
                                {' -> '}
                                {minimalPairFeedback.masuDiagnostic.politeSurface}
                              </span>
                              <span className="ml-2">
                                {minimalPairFeedback.masuDiagnostic.contrast}
                              </span>
                            </div>
                          </div>
                        )}
                        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          {minimalPairFeedback.contrasts.map((contrast) => (
                            <div
                              key={contrast.id}
                              className={`rounded-lg border px-2.5 py-2 text-xs ${
                                contrast.id === minimalPairFeedback.active.id
                                  ? 'border-emerald-300 bg-white/80 text-emerald-900 dark:border-emerald-800 dark:bg-stone-950/50 dark:text-emerald-200'
                                  : 'border-stone-200 bg-white/60 text-stone-600 dark:border-stone-800 dark:bg-stone-950/40 dark:text-stone-300'
                              }`}
                            >
                              <div className="font-semibold">{contrast.label}</div>
                              <div className="mt-0.5">{contrast.cue}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {diagnostic && (
                      <div className="text-sm text-rose-800 dark:text-rose-300 bg-white/70 dark:bg-stone-900/70 rounded-lg px-3 py-2">
                        <span className="font-medium text-rose-900 dark:text-rose-200">
                          Diagnosis:{' '}
                        </span>
                        {lastDiagnosis?.label ? `${lastDiagnosis.label}. ` : ''}
                        {diagnostic}
                      </div>
                    )}
                    <div className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                      {explanation.intro}
                    </div>
                    {explanation.reason && (
                      <div className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
                        {explanation.reason}
                      </div>
                    )}
                    {explanation.rule && (
                      <div className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                        {explanation.rule}
                      </div>
                    )}
                    {explanation.derivation && explanation.derivation !== expected && (
                      <div
                        className="text-base text-center bg-white/70 dark:bg-stone-900/70 rounded-lg px-3 py-2 text-stone-900 dark:text-stone-100"
                        lang="ja"
                      >
                        {explanation.derivation}
                      </div>
                    )}
                    {explanation.note && (
                      <div className="text-xs text-stone-600 dark:text-stone-400 italic bg-stone-50/80 dark:bg-stone-950/80 rounded-lg px-3 py-2 border border-stone-200 dark:border-stone-800">
                        {explanation.note}
                      </div>
                    )}
                    <ConjugationBreakdown
                      word={current.verb}
                      type={current.type}
                      userAnswer={revealedMiss ? '' : submittedAnswer}
                      geminiKey={geminiKey}
                      practicePrefs={practicePrefs}
                    />
                    {geminiKey ? (
                      !chatOpen ? (
                        <button
                          onClick={() => setChatOpen(true)}
                          aria-expanded={chatOpen}
                          className="w-full mt-1 py-2 border border-rose-200 dark:border-rose-900 hover:bg-rose-100/50 dark:hover:bg-rose-950/50 rounded-xl text-sm text-rose-700 dark:text-rose-450 flex items-center justify-center gap-1.5 transition"
                        >
                          <IconChat className="w-4 h-4" /> Ask Gemini why
                        </button>
                      ) : (
                        <ChatPanel
                          verb={current.verb}
                          type={current.type}
                          userAnswer={revealedMiss ? '(revealed)' : submittedAnswer}
                          expected={expected}
                          explanation={explanation}
                          geminiKey={geminiKey}
                          practicePrefs={practicePrefs}
                          taskOverride={taskOverride}
                          wasCorrected={wasCorrected}
                        />
                      )
                    ) : (
                      <div className="text-xs text-stone-400 text-center pt-1">
                        Gemini is not configured for AI chat.
                      </div>
                    )}
                  </div>
                )}

                <StickyAction className="mt-3">
                  <button
                    ref={nextButtonRef}
                    onClick={() => submit()}
                    className="w-full py-2.5 bg-stone-800 hover:bg-stone-900 dark:bg-stone-200 dark:hover:bg-stone-150 text-white dark:text-stone-900 rounded-xl font-medium shadow-lg transition"
                  >
                    Next (Enter)
                  </button>
                </StickyAction>
              </div>
            )}
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
  );
}
