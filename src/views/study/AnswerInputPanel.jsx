import React from 'react';
import { IconMic, IconSpark } from '../../components/Icons.jsx';
import ScriptDisplay from '../../components/ScriptDisplay.jsx';
import StickyAction from '../../components/StickyAction.jsx';
import { formDisplay, promptDisplay } from '../../utils/display.js';
import { buildFormationKeysHash } from '../../utils/formationKeys.js';
import { clearMinimalPairPrefs, minimalPairReturnEnabledTypes } from '../../utils/minimalPairs.js';
import { RunAnswerReveal } from './StudyReviewPanels.jsx';

export function KanaCoachStrip({
  visibleCoachCells,
  kanaMatchDisplay,
  coachStatus,
  coachWrongIndex,
  coachPreview,
  expected,
  reverseDrill,
  showStepHint,
  hintDisclosure,
}) {
  return (
    <div className="mb-3 rounded-2xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
      <div className="flex flex-wrap justify-center gap-1.5" lang="ja">
        {visibleCoachCells.map((cell, i) => {
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
              className={`flex h-11 w-10 items-center justify-center rounded-xl border text-xl font-medium tabular-nums transition sm:h-12 sm:w-11 ${cls}`}
            >
              {cell.shown || '\u00b7'}
            </div>
          );
        })}
      </div>
      {kanaMatchDisplay === 'color-count' && coachStatus && (
        <div
          className={`mt-2 text-center text-xs ${
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
            className="inline-flex items-center gap-1 text-xs text-indigo-500 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            <IconSpark className="h-3 w-3" />
            Hint
          </button>
          {hintDisclosure}
        </div>
      )}
    </div>
  );
}

export function AnswerInputPanel({
  phase,
  transformationMode,
  transformationActionLabel,
  targetTypeInfo,
  answerTaskDetails,
  sourceTypeInfo,
  transformationSupportText,
  taskLabel,
  current,
  practicePrefs,
  transformationRoute,
  minimalPairSetForCurrent,
  activeMinimalPairSet,
  reviewsDone,
  setPracticePrefs,
  setState,
  answerMode,
  selfCheckOpen,
  setSelfCheckOpen,
  skipCurrent,
  expectedView,
  practicedType,
  targetEnglish,
  gradeSelfCheck,
  inputRef,
  answer,
  setAnswer,
  setSpeechError,
  submit,
  speechListening,
  speechMatch,
  speechRecognitionAvailable,
  startSpeechAnswer,
  speechError,
  revealAnswer,
  reverseDrill,
  choices,
  hideEnglishMeaning,
  guidedKana,
  visibleCoachCells,
  kanaMatchDisplay,
  coachStatus,
  coachWrongIndex,
  coachPreview,
  expected,
  showStepHint,
  hintDisclosure,
  answerComposingRef,
  updateAnswerFromInput,
  commitAnswerComposition,
  answerInputClassName,
  revealNextKana,
  coachRevealed,
  expectedKanaCount,
  liveKana,
  liveStatus,
  answerFeedbackClassName,
  revealKanaHint,
  liveKanaHelpEnabled,
  wasCorrect,
  wasCorrected,
  reviewRecord,
  geminiKey,
  nextButtonRef,
  wordSweep,
  openGuideForReviewRule,
  openLabForReviewRoute,
  setTab,
  openLearnForRuleRecord,
  autoAdvanceCorrect,
}) {
  return phase === 'answering' ? (
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
              <span className="text-sm text-indigo-500 dark:text-indigo-400 font-medium" lang="ja">
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
        <div className="sr-only">{transformationMode ? transformationRoute : taskLabel}</div>
      </div>
      {minimalPairSetForCurrent && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-full border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5 text-xs text-emerald-800 dark:text-emerald-250">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold uppercase tracking-wider">
              {activeMinimalPairSet ? 'Minimal pair' : 'Today contrast'}
            </span>
            <span>{minimalPairSetForCurrent.label}</span>
            {reviewsDone > 0 && (
              <span className="tabular-nums opacity-70">{reviewsDone} this run</span>
            )}
          </div>
          {activeMinimalPairSet && (
            <button
              onClick={() => {
                if (setPracticePrefs) setPracticePrefs(clearMinimalPairPrefs(practicePrefs));
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
                  type={practicedType}
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
                  <span className="text-stone-500 dark:text-stone-400">Microphone ready.</span>
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
                      {!hideEnglishMeaning && (
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
          <KanaCoachStrip
            visibleCoachCells={visibleCoachCells}
            kanaMatchDisplay={kanaMatchDisplay}
            coachStatus={coachStatus}
            coachWrongIndex={coachWrongIndex}
            coachPreview={coachPreview}
            expected={expected}
            reverseDrill={reverseDrill}
            showStepHint={showStepHint}
            hintDisclosure={hintDisclosure}
          />
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={answer}
              onCompositionStart={() => {
                answerComposingRef.current = true;
              }}
              onChange={(e) =>
                updateAnswerFromInput(e, {
                  trackKanaMistake: kanaMatchDisplay !== 'none',
                })
              }
              onCompositionEnd={(e) =>
                commitAnswerComposition(e, {
                  trackKanaMistake: kanaMatchDisplay !== 'none',
                })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (answer.trim()) submit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  skipCurrent();
                }
              }}
              placeholder={reverseDrill ? 'Type dictionary form...' : 'Type romaji or kana...'}
              aria-label={
                reverseDrill ? 'Type the dictionary form' : 'Type your answer in romaji or kana'
              }
              className={answerInputClassName}
              lang="ja"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="done"
              spellCheck="false"
            />
            {!reverseDrill && (
              <button
                type="button"
                onClick={revealNextKana}
                disabled={coachRevealed >= expectedKanaCount || phase !== 'answering'}
                aria-label="Reveal next kana"
                title="Reveal next kana"
                className="shrink-0 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-indigo-200 bg-white text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-40 dark:border-indigo-900 dark:bg-stone-900 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
              >
                <IconSpark className="w-4 h-4" />
              </button>
            )}
          </div>
          {liveKana && liveStatus && (
            <div
              role="status"
              aria-live="polite"
              className={`mt-2 min-h-5 text-center text-xs ${answerFeedbackClassName}`}
            >
              {liveStatus}
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
          <div className="mt-2 grid grid-cols-3 gap-2">
            <button
              onClick={revealKanaHint}
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
              onCompositionStart={() => {
                answerComposingRef.current = true;
              }}
              onChange={(e) =>
                updateAnswerFromInput(e, {
                  trackKanaMistake: liveKanaHelpEnabled,
                })
              }
              onCompositionEnd={(e) =>
                commitAnswerComposition(e, {
                  trackKanaMistake: liveKanaHelpEnabled,
                })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (answer.trim()) submit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  skipCurrent();
                }
              }}
              placeholder={reverseDrill ? 'Type dictionary form...' : 'Type romaji or kana...'}
              aria-label={
                reverseDrill ? 'Type the dictionary form' : 'Type your answer in romaji or kana'
              }
              className={answerInputClassName}
              lang="ja"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="done"
              spellCheck="false"
            />
            {!reverseDrill && (
              <button
                type="button"
                onClick={revealNextKana}
                disabled={coachRevealed >= expectedKanaCount || phase !== 'answering'}
                aria-label="Reveal next kana"
                title="Reveal next kana"
                className="shrink-0 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-indigo-200 bg-white text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-40 dark:border-indigo-900 dark:bg-stone-900 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
              >
                <IconSpark className="w-4 h-4" />
              </button>
            )}
          </div>
          {liveKana && liveStatus && (
            <div
              role="status"
              aria-live="polite"
              className={`mt-2 min-h-5 text-center text-xs ${answerFeedbackClassName}`}
            >
              {liveStatus}
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
          <div className={`mt-2 grid gap-2 ${!reverseDrill ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {wasCorrect ? 'Correct!' : wasCorrected ? 'Assisted correction.' : 'Not quite.'}
      </span>
      <RunAnswerReveal
        record={reviewRecord}
        geminiKey={geminiKey}
        actionButtonRef={nextButtonRef}
        onOpenGuide={wordSweep ? null : openGuideForReviewRule}
        onOpenLab={wordSweep ? null : openLabForReviewRoute}
        onOpenLearn={
          wordSweep
            ? null
            : (groupId, rowShiftVisual) => {
                window.location.hash = groupId
                  ? `lesson-${groupId}`
                  : buildFormationKeysHash(rowShiftVisual);
                setTab('learn');
              }
        }
        onOpenLearnFocus={wordSweep ? null : openLearnForRuleRecord}
        onTryAnother={() => submit()}
        autoAdvanceHint={wasCorrect && autoAdvanceCorrect}
      />
    </>
  );
}
