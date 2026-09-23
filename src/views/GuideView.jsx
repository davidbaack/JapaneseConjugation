import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconCheck, IconRefresh, IconSpark, IconX } from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import { ALL_CARD_TYPES, EVERYDAY_TYPE_IDS, getTypeInfo } from '../data/conjugationTypes.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { useApp } from '../state/AppStateContext.jsx';
import { filterWordsForStudyScope } from '../utils/vocabularyProgression.js';
import {
  GUIDE_STEP_IDS,
  GUIDE_SESSION_TARGET,
  applyGuideAttemptToState,
  buildGuideCard,
  gradeGuideStep,
  guideResultFromSteps,
  guideGroupOptions,
} from '../utils/guidePractice.js';
import { exerciseMeaningForWord, formDisplay } from '../utils/display.js';
import { conjugateItem, isTypeCompatible, wordKey } from '../utils/conjugator.js';
import { ANSWER_OUTCOME, answerOutcomeCopy } from '../utils/answerFeedbackCopy.js';
import { groupDisplayLabel } from '../utils/groupDisplay.js';

function pct(correct, attempted) {
  return attempted ? Math.round((correct / attempted) * 100) : 0;
}

const GUIDE_STEP_META = {
  base: { number: '1', shortLabel: 'Plain form', nextLabel: 'Continue to group' },
  group: { number: '2', shortLabel: 'Group', nextLabel: 'Continue to answer' },
  answer: { number: '3', shortLabel: 'Answer', nextLabel: 'Finish card' },
};

export function StepResult({ step, announce = false, resolved = true }) {
  const ok = step.correct;
  const submitted =
    step.id === 'group'
      ? groupDisplayLabel(step.submitted)
      : String(step.submitted || '').trim() || 'No answer';
  const expected = step.expectedLabel || step.expected;
  return (
    <div
      role={announce ? 'status' : undefined}
      aria-live={announce ? 'polite' : undefined}
      className={`rounded-lg border px-3 py-2 ${
        ok
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200'
          : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200'
      }`}
    >
      <div className="flex items-start gap-2">
        {ok ? <IconCheck className="mt-0.5 h-4 w-4" /> : <IconX className="mt-0.5 h-4 w-4" />}
        <div className="min-w-0">
          <div className="text-sm font-semibold">{step.label}</div>
          <div className="mt-0.5 space-y-0.5 text-xs opacity-85">
            {ok && !step.assisted && <div>{answerOutcomeCopy(ANSWER_OUTCOME.correct)}</div>}
            {ok && step.assisted && step.revealed && !resolved && (
              <div>Answer revealed. Correct it to continue.</div>
            )}
            {ok && step.assisted && (!step.revealed || resolved) && <div>Completed with help.</div>}
            {ok && step.revealed && <div>Correct answer: {expected}</div>}
            {!ok && (
              <>
                <div>Your answer: {submitted}</div>
                <div>Correct answer: {expected}</div>
                {step.assisted && <div>Hint used.</div>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HintText({ stepId, card }) {
  if (stepId === 'base') {
    return `Base starts with ${Array.from(card.expectedBase || '')[0] || 'the same word'}.`;
  }
  if (stepId === 'group') {
    return `Look at the word family: ${card.word.group === 'godan' ? 'the final kana shifts rows' : 'the pattern decides the ending'}.`;
  }
  return `Answer starts with ${Array.from(card.expectedAnswer || '')[0] || 'the target form'}.`;
}

export function FocusedGuideBanner({ focus, card, onExit }) {
  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900/70 dark:bg-indigo-950/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            Focused Guide
          </div>
          <h2 className="mt-1 text-xl font-semibold text-stone-950 dark:text-stone-50">
            {focus.typeLabel || getTypeInfo(focus.type).label || 'This form'}
          </h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
            {focus.source === 'practice-result'
              ? focus.formToForm
                ? `Form-to-form repair: ${card.sourceLabel} to ${card.targetLabel}.`
                : 'Step through the same form from your Practice answer. Source: Dictionary Form.'
              : 'Step through the same form from the Learn lesson.'}
            {focus.word?.dict ? (
              <>
                {' '}
                Current word:{' '}
                <span lang="ja" className="font-semibold text-stone-950 dark:text-stone-50">
                  {focus.word.dict}
                </span>
                .
              </>
            ) : null}
          </p>
          {focus.missed && focus.expectedAnswer ? (
            <div
              className="mt-3 grid gap-2 text-sm sm:grid-cols-2"
              aria-label="Practice miss comparison"
            >
              <div className="rounded-lg border border-rose-200 bg-white/75 px-3 py-2 dark:border-rose-900/70 dark:bg-stone-950/35">
                <div className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                  Your answer
                </div>
                <div className="mt-0.5 font-semibold text-stone-950 dark:text-stone-50">
                  {focus.submittedAnswer || '(empty)'}
                </div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-white/75 px-3 py-2 dark:border-emerald-900/70 dark:bg-stone-950/35">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Correct answer
                </div>
                <div lang="ja" className="mt-0.5 font-semibold text-stone-950 dark:text-stone-50">
                  {card.expectedAnswer || focus.expectedAnswer}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-white/80 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-white dark:border-indigo-800 dark:bg-stone-950/40 dark:text-indigo-300 dark:hover:bg-stone-900"
        >
          Exit focus
        </button>
      </div>
    </section>
  );
}

export default function GuideView() {
  const {
    allWords,
    builtInWords,
    clearGuideFocus,
    guideFocus,
    practicePrefs,
    setState,
    state,
    wordLists,
  } = useApp();
  const filteredWords = useMemo(
    () =>
      filterWordsForStudyScope(allWords, { cards: state.cards }, practicePrefs, wordLists, {
        builtInWords,
      }),
    [allWords, builtInWords, practicePrefs, state.cards, wordLists],
  );
  const [activeGuideFocus, setActiveGuideFocus] = useState(null);
  const [guideTargetType, setGuideTargetType] = useState('');
  const guideWords = useMemo(() => {
    const focusedWord = activeGuideFocus?.word || guideFocus?.word;
    if (!focusedWord || filteredWords.some((word) => wordKey(word) === wordKey(focusedWord))) {
      return filteredWords;
    }
    return [...filteredWords, focusedWord];
  }, [activeGuideFocus, filteredWords, guideFocus]);
  const [card, setCard] = useState(null);
  const [answers, setAnswers] = useState({ base: '', group: '', answer: '' });
  const [assistedSteps, setAssistedSteps] = useState({});
  const [hintedSteps, setHintedSteps] = useState({});
  const [stepResults, setStepResults] = useState({});
  const [resolvedSteps, setResolvedSteps] = useState({});
  const [correctionErrors, setCorrectionErrors] = useState({});
  const [result, setResult] = useState(null);
  const [activeStep, setActiveStep] = useState('base');
  const [unlockedStepIndex, setUnlockedStepIndex] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [correct, setCorrect] = useState(0);
  const startedAtRef = useRef(0);
  const completedFocusRef = useRef('');
  const textInputRefs = useRef({});
  const groupChoicesRef = useRef(null);
  const continueButtonRef = useRef(null);
  const recapRef = useRef(null);

  const guideTypeOptions = useMemo(() => {
    const enabledTypes = state.enabledTypes?.length ? state.enabledTypes : EVERYDAY_TYPE_IDS;
    const enabled = new Set(enabledTypes);
    return ALL_CARD_TYPES.filter(
      (type) =>
        enabled.has(type.id) &&
        guideWords.some((word) => isTypeCompatible(word, type.id) && conjugateItem(word, type.id)),
    );
  }, [guideWords, state.enabledTypes]);

  const guideCardOptions = useCallback(
    (options = {}) => {
      const focus = activeGuideFocus || guideFocus;
      if (!focus?.word || !focus?.type) {
        return guideTargetType ? { ...options, targetTypeId: guideTargetType } : options;
      }
      return {
        ...options,
        targetWord: focus.word,
        targetTypeId: focus.type,
        sourceTypeId: focus.sourceTypeId,
        sourceForm: focus.sourceForm,
      };
    },
    [activeGuideFocus, guideFocus, guideTargetType],
  );

  function resetForCard(nextCard) {
    setCard(nextCard);
    setAnswers({ base: '', group: '', answer: '' });
    setAssistedSteps({});
    setHintedSteps({});
    setStepResults({});
    setResolvedSteps({});
    setCorrectionErrors({});
    setResult(null);
    setActiveStep('base');
    setUnlockedStepIndex(0);
    startedAtRef.current = Date.now();
  }

  useEffect(() => {
    const focusKey =
      guideFocus?.word && guideFocus?.type
        ? [
            wordKey(guideFocus.word),
            guideFocus.type,
            guideFocus.sourceTypeId || '',
            guideFocus.sourceForm || '',
          ].join('|')
        : '';
    if (focusKey && completedFocusRef.current !== focusKey && guideWords.length) {
      const focusedCard = buildGuideCard(
        guideWords,
        state,
        practicePrefs,
        guideCardOptions({ seed: Date.now() }),
      );
      if (focusedCard) {
        completedFocusRef.current = focusKey;
        setActiveGuideFocus({ ...guideFocus });
        setCompleted(0);
        setCorrect(0);
        resetForCard(focusedCard);
        clearGuideFocus?.();
        return;
      }
    }
    if (!card && guideWords.length && completed < GUIDE_SESSION_TARGET) {
      resetForCard(
        buildGuideCard(guideWords, state, practicePrefs, guideCardOptions({ seed: Date.now() })),
      );
    }
  }, [
    activeGuideFocus,
    card,
    clearGuideFocus,
    completed,
    guideCardOptions,
    guideFocus,
    guideWords,
    practicePrefs,
    state,
  ]);

  const guideStats = state.guide || {};
  const groupOptions = card ? guideGroupOptions(card.word) : [];
  const activeStepResult = stepResults[activeStep] || null;
  const activeStepResolved = !!resolvedSteps[activeStep];
  const activeStepMeta = GUIDE_STEP_META[activeStep];
  const activeAnswer = answers[activeStep] || '';
  const activeAnswerFilled =
    activeStep === 'group' ? !!activeAnswer : !!String(activeAnswer).trim();
  const sessionDone = completed >= GUIDE_SESSION_TARGET && !result;
  const hideEnglishMeaning =
    (practicePrefs.englishHints || DEFAULT_PREFS.englishHints) === 'hidden' && !result;
  const sourceView = card
    ? formDisplay(card.sourceForm, practicePrefs, card.word, card.sourceTypeId)
    : null;
  const currentCardNumber = Math.min(GUIDE_SESSION_TARGET, result ? completed : completed + 1);

  useEffect(() => {
    if (!card) return;
    if (result) {
      recapRef.current?.focus();
      return;
    }
    if (activeStepResult && activeStepResolved) {
      continueButtonRef.current?.focus();
      return;
    }
    if (activeStep === 'group') {
      groupChoicesRef.current?.querySelector('button')?.focus();
      return;
    }
    textInputRefs.current[activeStep]?.focus();
  }, [activeStep, activeStepResolved, activeStepResult, card, result]);

  function markAssisted(stepId) {
    setAssistedSteps((prev) => ({ ...prev, [stepId]: true }));
  }

  function revealHint(stepId) {
    setHintedSteps((prev) => ({ ...prev, [stepId]: true }));
    markAssisted(stepId);
  }

  function skipStep(stepId) {
    if (!card || result || stepResults[stepId]) return;
    const expected =
      stepId === 'base'
        ? card.expectedBase
        : stepId === 'group'
          ? card.expectedGroup
          : card.expectedAnswer;
    const revealedResult = {
      ...gradeGuideStep(card, stepId, expected, true),
      submitted: '',
      revealed: true,
    };
    markAssisted(stepId);
    setStepResults((prev) => ({ ...prev, [stepId]: revealedResult }));
    setAnswers((prev) => ({ ...prev, [stepId]: '' }));
    setCorrectionErrors((prev) => ({ ...prev, [stepId]: false }));
  }

  function checkActiveStep(e) {
    e.preventDefault();
    if (!card || result || !activeAnswerFilled || activeStepResolved) return;
    const existingResult = stepResults[activeStep];
    if (!existingResult) {
      const gradedStep = gradeGuideStep(card, activeStep, activeAnswer, assistedSteps[activeStep]);
      setStepResults((prev) => ({ ...prev, [activeStep]: gradedStep }));
      setCorrectionErrors((prev) => ({ ...prev, [activeStep]: false }));
      if (gradedStep.correct) {
        setResolvedSteps((prev) => ({ ...prev, [activeStep]: true }));
      } else {
        setAnswers((prev) => ({ ...prev, [activeStep]: '' }));
      }
      return;
    }

    const correctionMatches = gradeGuideStep(card, activeStep, activeAnswer).correct;
    if (correctionMatches) {
      setResolvedSteps((prev) => ({ ...prev, [activeStep]: true }));
      setCorrectionErrors((prev) => ({ ...prev, [activeStep]: false }));
    } else {
      setCorrectionErrors((prev) => ({ ...prev, [activeStep]: true }));
    }
  }

  function completeCard() {
    if (!card || result || !GUIDE_STEP_IDS.every((id) => stepResults[id])) return;
    const graded = guideResultFromSteps(stepResults);
    const responseMs = Math.max(0, Date.now() - startedAtRef.current);
    setResult(graded);
    setCompleted((value) => value + 1);
    setCorrect((value) => value + (graded.correct ? 1 : 0));
    setState((prev) =>
      applyGuideAttemptToState(prev, card, graded, {
        responseMs,
      }),
    );
  }

  function continueFromStep(stepId) {
    if (!resolvedSteps[stepId]) return;
    const currentIndex = GUIDE_STEP_IDS.indexOf(stepId);
    if (currentIndex === GUIDE_STEP_IDS.length - 1) {
      completeCard();
      return;
    }
    const nextIndex = currentIndex + 1;
    setUnlockedStepIndex((value) => Math.max(value, nextIndex));
    setActiveStep(GUIDE_STEP_IDS[nextIndex]);
  }

  function nextCard() {
    if (!guideWords.length) return;
    if (completed >= GUIDE_SESSION_TARGET) {
      setResult(null);
      return;
    }
    resetForCard(
      buildGuideCard(
        guideWords,
        state,
        practicePrefs,
        guideCardOptions({
          previousWord: card?.word,
          seed: Date.now(),
        }),
      ),
    );
  }

  function startNewSession() {
    setCompleted(0);
    setCorrect(0);
    resetForCard(
      buildGuideCard(
        guideWords,
        state,
        practicePrefs,
        guideCardOptions({
          previousWord: card?.word,
          seed: Date.now(),
        }),
      ),
    );
  }

  function exitGuideFocus() {
    setActiveGuideFocus(null);
    completedFocusRef.current = '';
    setCompleted(0);
    setCorrect(0);
    resetForCard(
      buildGuideCard(filteredWords, state, practicePrefs, {
        seed: Date.now(),
        ...(guideTargetType ? { targetTypeId: guideTargetType } : {}),
      }),
    );
  }

  function chooseGuideTarget(typeId) {
    setGuideTargetType(typeId);
    setCompleted(0);
    setCorrect(0);
    resetForCard(
      buildGuideCard(guideWords, state, practicePrefs, {
        seed: Date.now(),
        ...(typeId ? { targetTypeId: typeId } : {}),
      }),
    );
  }

  if (!guideWords.length) {
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-6 text-center text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
        No words or forms are active in the Practice map right now.
      </section>
    );
  }

  if (sessionDone) {
    return (
      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <div>
          <div className="text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Guide
          </div>
          <h2 className="mt-1 text-xl font-semibold text-stone-950 dark:text-stone-50">
            Guided set complete.
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950/40">
            <div className="text-xs text-stone-500">Cards</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{completed}</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950/40">
            <div className="text-xs text-stone-500">Accuracy</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {pct(correct, completed)}%
            </div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950/40">
            <div className="text-xs text-stone-500">All-time Guide</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {pct(guideStats.correct || 0, guideStats.attempted || 0)}%
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={startNewSession}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-700 dark:bg-indigo-700 dark:hover:bg-indigo-600"
        >
          <IconRefresh className="h-4 w-4" />
          Start new guided set
        </button>
      </section>
    );
  }

  if (!card) return null;

  return (
    <div className="space-y-4">
      {activeGuideFocus && (
        <FocusedGuideBanner focus={activeGuideFocus} card={card} onExit={exitGuideFocus} />
      )}
      <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Guide
            </div>
            <h2 className="mt-1 text-xl font-semibold text-stone-950 dark:text-stone-50">
              Build the conjugation step by step.
            </h2>
          </div>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            {!activeGuideFocus && (
              <label className="flex flex-col gap-1 font-semibold text-stone-600 dark:text-stone-300">
                <span>Practice form</span>
                <select
                  aria-label="Practice form"
                  value={guideTargetType}
                  onChange={(event) => chooseGuideTarget(event.target.value)}
                  className="min-h-9 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-sm font-semibold text-stone-800 outline-none transition focus:border-indigo-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                >
                  <option value="">Mixed from Practice</option>
                  {guideTypeOptions.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <span
              aria-label={`Card ${currentCardNumber} of ${GUIDE_SESSION_TARGET}`}
              role="status"
              className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 font-semibold text-stone-600 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300"
            >
              <span aria-hidden="true">
                {currentCardNumber}/{GUIDE_SESSION_TARGET}
              </span>
            </span>
            <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 font-semibold text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200">
              {card.targetLabel}
            </span>
          </div>
        </div>
      </section>

      <form
        onSubmit={checkActiveStep}
        className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-5"
      >
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
          <div className="text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Prompt
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-3xl font-semibold text-stone-950 dark:text-stone-50">
                <ScriptDisplay view={sourceView} word={card.word} type={card.sourceTypeId} />
              </div>
              <div className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                {[
                  card.word.dict,
                  !hideEnglishMeaning && exerciseMeaningForWord(card.word),
                  card.sourceLabel,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <div className="text-sm font-semibold text-stone-700 dark:text-stone-200">
              Make: {card.targetLabel}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Guide steps">
          {GUIDE_STEP_IDS.map((id, index) => {
            const meta = GUIDE_STEP_META[id];
            const enabled = index <= unlockedStepIndex;
            const stepResult = stepResults[id];
            const stepResolved = !!resolvedSteps[id];
            const status = stepResult
              ? !stepResolved
                ? 'Needs correction'
                : stepResult.revealed
                  ? 'With help'
                  : stepResult.correct
                    ? 'Correct'
                    : 'Corrected'
              : '';
            return (
              <button
                key={id}
                type="button"
                disabled={!enabled || !!result}
                aria-current={activeStep === id ? 'step' : undefined}
                onClick={() => setActiveStep(id)}
                className={`rounded-lg border px-2 py-2 text-left text-xs transition ${
                  activeStep === id
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100'
                    : enabled
                      ? 'border-stone-200 text-stone-700 hover:bg-stone-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-800'
                      : 'border-stone-200 text-stone-400 opacity-60 dark:border-stone-800 dark:text-stone-600'
                }`}
              >
                <span className="block font-semibold">
                  {meta.number}. {meta.shortLabel}
                </span>
                {status ? (
                  <span className="mt-0.5 block truncate">{status}</span>
                ) : id === 'group' && answers.group ? (
                  <span className="mt-0.5 block truncate">
                    {groupOptions.find((option) => option.id === answers.group)?.label}
                  </span>
                ) : answers[id] ? (
                  <span className="mt-0.5 block truncate">{answers[id]}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {!result ? (
          <section
            className="mt-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800"
            aria-labelledby={`guide-${activeStep}-heading`}
          >
            <h3
              id={`guide-${activeStep}-heading`}
              className="text-sm font-semibold text-stone-900 dark:text-stone-100"
            >
              {activeStepMeta.number}.{' '}
              {activeStep === 'base'
                ? 'Find plain form'
                : activeStep === 'group'
                  ? 'Choose the group'
                  : 'Build the answer'}
            </h3>

            {activeStepResult && (
              <div className="mt-3">
                <StepResult step={activeStepResult} announce resolved={activeStepResolved} />
              </div>
            )}

            {!activeStepResolved && (
              <>
                {activeStepResult && (
                  <p
                    id={`guide-${activeStep}-correction-guidance`}
                    className="mt-3 text-sm font-medium text-stone-700 dark:text-stone-200"
                  >
                    {activeStep === 'group'
                      ? 'Choose the correct group shown above to continue.'
                      : 'Type the correct answer shown above to continue.'}
                  </p>
                )}

                {activeStep === 'group' ? (
                  <div
                    ref={groupChoicesRef}
                    className="mt-3 grid gap-2 sm:grid-cols-3"
                    role="group"
                    aria-label={activeStepResult ? 'Correct the word group' : 'Word group'}
                    aria-describedby={
                      activeStepResult ? `guide-${activeStep}-correction-guidance` : undefined
                    }
                  >
                    {groupOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={answers.group === option.id}
                        onClick={() => setAnswers((prev) => ({ ...prev, group: option.id }))}
                        className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                          answers.group === option.id
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100'
                            : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-800'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <label className="mt-3 block">
                    <span className="sr-only">
                      {activeStep === 'base' ? 'Plain form' : 'Final conjugation'}
                    </span>
                    <input
                      ref={(node) => {
                        textInputRefs.current[activeStep] = node;
                      }}
                      value={answers[activeStep]}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [activeStep]: e.target.value }))
                      }
                      aria-label={activeStep === 'base' ? 'Plain form' : 'Final conjugation'}
                      aria-describedby={
                        activeStepResult ? `guide-${activeStep}-correction-guidance` : undefined
                      }
                      placeholder={
                        activeStepResult
                          ? 'Type the correct answer'
                          : activeStep === 'base'
                            ? 'Dictionary/plain form'
                            : 'Target conjugation'
                      }
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-lg text-stone-950 outline-none transition focus:border-indigo-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-50"
                    />
                  </label>
                )}

                {!activeStepResult && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => revealHint(activeStep)}
                      aria-label={`Hint for ${
                        activeStep === 'group'
                          ? 'word group'
                          : activeStep === 'answer'
                            ? 'final answer'
                            : 'plain form'
                      } step`}
                      className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-600 transition hover:bg-stone-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-800"
                    >
                      Hint
                    </button>
                    <button
                      type="button"
                      onClick={() => skipStep(activeStep)}
                      aria-label={`Skip ${
                        activeStep === 'group'
                          ? 'word group'
                          : activeStep === 'answer'
                            ? 'final answer'
                            : 'plain form'
                      } step`}
                      className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-600 transition hover:bg-stone-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-800"
                    >
                      Skip
                    </button>
                  </div>
                )}

                {hintedSteps[activeStep] && !activeStepResult && (
                  <div className="mt-2 text-xs text-stone-500">
                    <HintText stepId={activeStep} card={card} />
                  </div>
                )}

                {correctionErrors[activeStep] && (
                  <div
                    role="alert"
                    className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-300"
                  >
                    That does not match the correct answer yet. Try it again.
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!activeAnswerFilled}
                  className="mt-3 w-full rounded-lg bg-stone-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-indigo-700 dark:hover:bg-indigo-600"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <IconCheck className="h-4 w-4" />
                    {activeStepResult
                      ? 'Check correction'
                      : `Check ${activeStepMeta.shortLabel.toLowerCase()}`}
                  </span>
                </button>
              </>
            )}

            {activeStepResolved && (
              <div className="mt-3 space-y-2">
                {!activeStepResult.correct && (
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    Correction complete. The original miss stays in your Guide history.
                  </p>
                )}
                {activeStepResult.revealed && (
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    Answer copied. This step is recorded as completed with help.
                  </p>
                )}
                <button
                  ref={continueButtonRef}
                  type="button"
                  onClick={() => continueFromStep(activeStep)}
                  className="w-full rounded-lg bg-stone-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-stone-700 dark:bg-indigo-700 dark:hover:bg-indigo-600"
                >
                  {activeStepMeta.nextLabel}
                </button>
              </div>
            )}
          </section>
        ) : (
          <section
            ref={recapRef}
            tabIndex={-1}
            aria-labelledby="guide-card-complete-heading"
            className="mt-4 space-y-3 outline-none"
          >
            <div>
              <h3
                id="guide-card-complete-heading"
                className="text-lg font-semibold text-stone-950 dark:text-stone-50"
              >
                Path complete.
              </h3>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                This guided card updated Practice progress once.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3" aria-label="Guide card recap">
              {GUIDE_STEP_IDS.map((id) => (
                <StepResult key={id} step={result.steps[id]} />
              ))}
            </div>
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-950/40 dark:text-stone-200">
              <span className="font-semibold">Path:</span> {card.expectedBase} {' -> '}{' '}
              {result.steps.group.expectedLabel} {' -> '} {card.expectedAnswer}
              {result.assisted ? ' · assisted' : ''}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={nextCard}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-700 dark:bg-indigo-700 dark:hover:bg-indigo-600"
              >
                <IconSpark className="h-4 w-4" />
                Next card
              </button>
            </div>
          </section>
        )}

        {!result && (
          <p className="mt-4 text-xs text-stone-500 dark:text-stone-400">
            Each step is checked before the next one unlocks. Practice progress updates after Step
            3.
          </p>
        )}
      </form>
    </div>
  );
}
