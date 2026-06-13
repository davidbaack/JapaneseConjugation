import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconCheck, IconRefresh, IconSpark, IconX } from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import { getTypeInfo } from '../data/conjugationTypes.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { useApp } from '../state/AppStateContext.jsx';
import { filterWordsForStudyScope } from '../utils/vocabularyProgression.js';
import {
  GUIDE_SESSION_TARGET,
  applyGuideAttemptToState,
  buildGuideCard,
  gradeGuideSteps,
  guideGroupOptions,
} from '../utils/guidePractice.js';
import { formDisplay } from '../utils/display.js';
import { wordKey } from '../utils/conjugator.js';

function pct(correct, attempted) {
  return attempted ? Math.round((correct / attempted) * 100) : 0;
}

function StepResult({ step }) {
  const ok = step.correct;
  return (
    <div
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
          <div className="mt-0.5 text-xs opacity-85">
            {ok ? 'Correct' : `Expected ${step.expectedLabel || step.expected}`}
            {step.assisted ? ' · assisted' : ''}
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
  const [result, setResult] = useState(null);
  const [completed, setCompleted] = useState(0);
  const [correct, setCorrect] = useState(0);
  const startedAtRef = useRef(0);
  const completedFocusRef = useRef('');

  const guideCardOptions = useCallback(
    (options = {}) => {
      const focus = activeGuideFocus || guideFocus;
      if (!focus?.word || !focus?.type) return options;
      return {
        ...options,
        targetWord: focus.word,
        targetTypeId: focus.type,
      };
    },
    [activeGuideFocus, guideFocus],
  );

  function resetForCard(nextCard) {
    setCard(nextCard);
    setAnswers({ base: '', group: '', answer: '' });
    setAssistedSteps({});
    setHintedSteps({});
    setResult(null);
    startedAtRef.current = Date.now();
  }

  useEffect(() => {
    const focusKey =
      guideFocus?.word && guideFocus?.type ? `${wordKey(guideFocus.word)}|${guideFocus.type}` : '';
    if (focusKey && completedFocusRef.current !== focusKey && guideWords.length) {
      const focusedCard = buildGuideCard(guideWords, state, practicePrefs, {
        targetWord: guideFocus.word,
        targetTypeId: guideFocus.type,
        seed: Date.now(),
      });
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
  const allFilled = !!answers.base.trim() && !!answers.group && !!answers.answer.trim();
  const sessionDone = completed >= GUIDE_SESSION_TARGET;
  const hideEnglishMeaning =
    (practicePrefs.englishHints || DEFAULT_PREFS.englishHints) === 'hidden' && !result;
  const sourceView = card
    ? formDisplay(card.sourceForm, practicePrefs, card.word, card.sourceTypeId)
    : null;

  function markAssisted(stepId) {
    setAssistedSteps((prev) => ({ ...prev, [stepId]: true }));
  }

  function revealHint(stepId) {
    setHintedSteps((prev) => ({ ...prev, [stepId]: true }));
    markAssisted(stepId);
  }

  function skipStep(stepId) {
    if (!card || result) return;
    markAssisted(stepId);
    setAnswers((prev) => ({
      ...prev,
      [stepId]:
        stepId === 'base'
          ? card.expectedBase
          : stepId === 'group'
            ? card.expectedGroup
            : card.expectedAnswer,
    }));
  }

  function submit(e) {
    e.preventDefault();
    if (!card || result || !allFilled) return;
    const graded = gradeGuideSteps(card, answers, assistedSteps);
    const responseMs = Math.max(0, Date.now() - startedAtRef.current);
    setResult(graded);
    setCompleted((value) => value + 1);
    setCorrect((value) => value + (graded.correct ? 1 : 0));
    setState((prev) =>
      applyGuideAttemptToState(prev, card, graded, {
        responseMs,
        dailyGoal: practicePrefs.dailyGoal || DEFAULT_PREFS.dailyGoal,
      }),
    );
  }

  function nextCard() {
    if (!guideWords.length) return;
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
    resetForCard(buildGuideCard(filteredWords, state, practicePrefs, { seed: Date.now() }));
  }

  if (!guideWords.length) {
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-6 text-center text-stone-600 dark:border-stone-850 dark:bg-stone-900 dark:text-stone-300">
        No words or forms are active in the Practice map right now.
      </section>
    );
  }

  if (sessionDone) {
    return (
      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-850 dark:bg-stone-900">
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
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-850 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-700 dark:bg-indigo-700 dark:hover:bg-indigo-600"
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
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900/70 dark:bg-indigo-950/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                Focused Guide
              </div>
              <h2 className="mt-1 text-xl font-semibold text-stone-950 dark:text-stone-50">
                {activeGuideFocus.typeLabel ||
                  getTypeInfo(activeGuideFocus.type).label ||
                  'This form'}
              </h2>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                {activeGuideFocus.source === 'practice-result'
                  ? 'Step through the same form from your Practice answer.'
                  : 'Step through the same form from the Learn lesson.'}
                {activeGuideFocus.word?.dict ? (
                  <>
                    {' '}
                    Current word:{' '}
                    <span lang="ja" className="font-semibold text-stone-950 dark:text-stone-50">
                      {activeGuideFocus.word.dict}
                    </span>
                    .
                  </>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              onClick={exitGuideFocus}
              className="inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-white/80 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-white dark:border-indigo-800 dark:bg-stone-950/40 dark:text-indigo-300 dark:hover:bg-stone-900"
            >
              Exit focus
            </button>
          </div>
        </section>
      )}
      <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-850 dark:bg-stone-900 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Guide
            </div>
            <h2 className="mt-1 text-xl font-semibold text-stone-950 dark:text-stone-50">
              Build the conjugation step by step.
            </h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 font-semibold text-stone-600 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300">
              {completed + 1}/{GUIDE_SESSION_TARGET}
            </span>
            <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 font-semibold text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200">
              {card.targetLabel}
            </span>
          </div>
        </div>
      </section>

      <form
        onSubmit={submit}
        className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-850 dark:bg-stone-900 sm:p-5"
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
                {[card.word.dict, !hideEnglishMeaning && card.word.meaning, card.sourceLabel]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <div className="text-sm font-semibold text-stone-700 dark:text-stone-250">
              Make: {card.targetLabel}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <section className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <label className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  1. Find plain form
                </span>
                <input
                  value={answers.base}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, base: e.target.value }))}
                  disabled={!!result}
                  aria-label="Plain form"
                  placeholder="Dictionary/plain form"
                  className="mt-2 w-full rounded-xl border border-stone-250 bg-white px-3 py-2 text-lg text-stone-950 outline-none transition focus:border-indigo-400 dark:border-stone-750 dark:bg-stone-950 dark:text-stone-50"
                />
              </label>
              <div className="flex gap-2 sm:pt-7">
                <button
                  type="button"
                  onClick={() => revealHint('base')}
                  disabled={!!result}
                  className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-650 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-850"
                >
                  Hint
                </button>
                <button
                  type="button"
                  onClick={() => skipStep('base')}
                  disabled={!!result}
                  className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-650 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-850"
                >
                  Skip
                </button>
              </div>
            </div>
            {hintedSteps.base && (
              <div className="mt-2 text-xs text-stone-500">
                <HintText stepId="base" card={card} />
              </div>
            )}
          </section>

          <section className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              2. Choose the group
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3" role="group" aria-label="Word group">
              {groupOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setAnswers((prev) => ({ ...prev, group: option.id }))}
                  disabled={!!result}
                  className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    answers.group === option.id
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100'
                      : 'border-stone-200 text-stone-650 hover:bg-stone-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-850'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => revealHint('group')}
                disabled={!!result}
                className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-650 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-850"
              >
                Hint
              </button>
              <button
                type="button"
                onClick={() => skipStep('group')}
                disabled={!!result}
                className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-650 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-850"
              >
                Skip
              </button>
            </div>
            {hintedSteps.group && (
              <div className="mt-2 text-xs text-stone-500">
                <HintText stepId="group" card={card} />
              </div>
            )}
          </section>

          <section className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <label className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  3. Build the answer
                </span>
                <input
                  value={answers.answer}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, answer: e.target.value }))}
                  disabled={!!result}
                  aria-label="Final conjugation"
                  placeholder="Target conjugation"
                  className="mt-2 w-full rounded-xl border border-stone-250 bg-white px-3 py-2 text-lg text-stone-950 outline-none transition focus:border-indigo-400 dark:border-stone-750 dark:bg-stone-950 dark:text-stone-50"
                />
              </label>
              <div className="flex gap-2 sm:pt-7">
                <button
                  type="button"
                  onClick={() => revealHint('answer')}
                  disabled={!!result}
                  className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-650 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-850"
                >
                  Hint
                </button>
                <button
                  type="button"
                  onClick={() => skipStep('answer')}
                  disabled={!!result}
                  className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-650 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-850"
                >
                  Skip
                </button>
              </div>
            </div>
            {hintedSteps.answer && (
              <div className="mt-2 text-xs text-stone-500">
                <HintText stepId="answer" card={card} />
              </div>
            )}
          </section>
        </div>

        {result && (
          <div className="mt-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.values(result.steps).map((step) => (
                <StepResult key={step.id} step={step} />
              ))}
            </div>
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-950/40 dark:text-stone-250">
              <span className="font-semibold">Path:</span> {card.expectedBase} {' -> '}{' '}
              {result.steps.group.expectedLabel} {' -> '} {card.expectedAnswer}
              {result.assisted ? ' · assisted' : ''}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-stone-500 dark:text-stone-400">
            Submit checks all three steps together and updates Practice progress once.
          </div>
          {result ? (
            <button
              type="button"
              onClick={nextCard}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-850 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-700 dark:bg-indigo-700 dark:hover:bg-indigo-600"
            >
              <IconSpark className="h-4 w-4" />
              Next card
            </button>
          ) : (
            <button
              type="submit"
              disabled={!allFilled}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-850 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-indigo-700 dark:hover:bg-indigo-600"
            >
              <IconCheck className="h-4 w-4" />
              Submit guide card
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
