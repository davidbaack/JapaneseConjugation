import React, { useState } from 'react';
import {
  IconArrowRight,
  IconBook,
  IconChat,
  IconCheck,
  IconList,
  IconSpark,
  IconX,
} from '../../components/Icons.jsx';
import ScriptDisplay from '../../components/ScriptDisplay.jsx';
import { ConjugationBreakdown } from '../../components/ConjugationBreakdown.jsx';
import { ChatPanel } from '../../components/ChatPanel.jsx';
import { lessonForType } from '../../data/lessonContent.js';
import { DEFAULT_PREFS } from '../../data/defaults.js';
import { englishForForm, formDisplay, promptDisplay } from '../../utils/display.js';
import { toHiragana } from '../../utils/romaji.js';
import { getConjugationDebugInfo } from '../../utils/conjugatorExplain.js';
import { labRouteForMistakePattern } from '../../utils/mistakeDiagnosis.js';
import { kanaCoachCells } from '../../utils/kanaCoach.js';

function ReviewDisclosure({
  tone = 'stone',
  summary,
  children,
  alwaysOpen = false,
  hintLabel = 'More',
}) {
  const toneClass =
    tone === 'rose'
      ? 'border-rose-200 dark:border-rose-900/60 bg-white/70 dark:bg-stone-950/50'
      : tone === 'emerald'
        ? 'border-emerald-200 dark:border-emerald-900/60 bg-white/70 dark:bg-stone-950/50'
        : 'border-stone-200 dark:border-stone-800 bg-white/70 dark:bg-stone-950/50';

  if (alwaysOpen) {
    return (
      <section className={`rounded-xl border ${toneClass} px-3 py-2`}>
        <div className="text-sm font-semibold text-stone-800 dark:text-stone-100">{summary}</div>
        <div className="mt-3 space-y-2.5">{children}</div>
      </section>
    );
  }

  return (
    <details className={`rounded-xl border ${toneClass} px-3 py-2`}>
      <summary className="cursor-pointer list-none text-sm font-semibold text-stone-800 dark:text-stone-100">
        <span className="inline-flex items-center gap-2">
          <span>{summary}</span>
          {hintLabel && (
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
              {hintLabel}
            </span>
          )}
        </span>
      </summary>
      <div className="mt-3 space-y-2.5">{children}</div>
    </details>
  );
}

function ReviewChatSection({ tone = 'stone', chatOpen, onOpen, children }) {
  const toneClass =
    tone === 'rose'
      ? 'border-rose-200 dark:border-rose-900/60 bg-white/70 dark:bg-stone-950/50'
      : tone === 'emerald'
        ? 'border-emerald-200 dark:border-emerald-900/60 bg-white/70 dark:bg-stone-950/50'
        : 'border-stone-200 dark:border-stone-800 bg-white/70 dark:bg-stone-950/50';
  const buttonClass =
    tone === 'rose'
      ? 'border-rose-200 text-rose-700 hover:bg-rose-100/50 dark:border-rose-900 dark:text-rose-450 dark:hover:bg-rose-950/50'
      : tone === 'emerald'
        ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-100/50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/50'
        : 'border-stone-200 text-stone-700 hover:bg-stone-100/50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900/60';

  return (
    <section className={`rounded-xl border ${toneClass} px-3 py-2`}>
      <div className="text-sm font-semibold text-stone-800 dark:text-stone-100">
        3. Follow-up chat with AI
      </div>
      {!chatOpen ? (
        <button
          onClick={onOpen}
          aria-expanded={chatOpen}
          className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border py-2 text-sm transition ${buttonClass}`}
        >
          <IconChat className="h-4 w-4" /> Chat about this
        </button>
      ) : (
        <div className="mt-3">{children}</div>
      )}
    </section>
  );
}

function snapshotPracticePrefs(prefs = DEFAULT_PREFS) {
  return {
    ...prefs,
    wordGroups: Array.isArray(prefs.wordGroups) ? [...prefs.wordGroups] : prefs.wordGroups,
    wordListIds: Array.isArray(prefs.wordListIds) ? [...prefs.wordListIds] : prefs.wordListIds,
    wordTypes: Array.isArray(prefs.wordTypes) ? [...prefs.wordTypes] : prefs.wordTypes,
    autoAdvanceCorrectByAnswerForm: prefs.autoAdvanceCorrectByAnswerForm
      ? { ...prefs.autoAdvanceCorrectByAnswerForm }
      : prefs.autoAdvanceCorrectByAnswerForm,
  };
}

const CARD_ORIGIN_META = {
  new: {
    label: 'New',
    detail: 'First time for this word-form',
    chipClass:
      'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-300',
    detailClass: 'text-sky-700 dark:text-sky-300',
  },
  missed: {
    label: 'Previously missed',
    detail: 'Returning after a miss',
    chipClass:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300',
    detailClass: 'text-amber-700 dark:text-amber-300',
  },
  review: {
    label: 'Review',
    detail: 'Seen before',
    chipClass:
      'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/70 dark:bg-indigo-950/30 dark:text-indigo-300',
    detailClass: 'text-indigo-700 dark:text-indigo-300',
  },
};

function cardOriginForStudyCard(card) {
  if (card?.selectionOrigin === 'missed') return 'missed';
  if (card?.selectionOrigin === 'new') return 'new';
  if (card?.selectionOrigin === 'review') return 'review';
  return card?.card ? 'review' : 'new';
}

function cardOriginMeta(origin) {
  return CARD_ORIGIN_META[origin] || CARD_ORIGIN_META.review;
}

function withCardOrigin(card, origin) {
  if (!card) return card;
  return { ...card, selectionOrigin: origin || cardOriginForStudyCard(card) };
}

function buildMissedContrast({
  record,
  minimalPairFeedback,
  diagnostic,
  reviewSubmittedAnswer,
  missedComparisonValue,
}) {
  if (!record || record.correct) return null;

  if (minimalPairFeedback) {
    const masu = minimalPairFeedback.masuDiagnostic;
    return {
      title: 'Contrast check',
      body: masu
        ? `${minimalPairFeedback.label}. ${masu.dict} -> ${masu.politeSurface}. ${masu.contrast}`
        : `${minimalPairFeedback.label}. ${minimalPairFeedback.intro}`,
    };
  }

  if (diagnostic) {
    return {
      title: 'Contrast',
      body: `${record.diagnosis?.label ? `${record.diagnosis.label}. ` : ''}${diagnostic}`,
    };
  }

  if (!record.revealedMiss) {
    try {
      const mistake = getConjugationDebugInfo(
        record.word,
        record.practicedType,
        reviewSubmittedAnswer,
      ).mistake;
      if (mistake) {
        return {
          title: 'Contrast',
          body: `${mistake.userRule} vs ${mistake.expectedRule}. ${mistake.detail}`,
        };
      }
    } catch {}
  }

  return {
    title: 'Contrast',
    body: `${record.expected} is the target; ${missedComparisonValue} does not match the requested ${
      record.typeLabel || 'form'
    }.`,
  };
}

function debugInfoForReviewRecord(record, reviewSubmittedAnswer) {
  if (!record || record.reverseDrill || !record.word || !record.practicedType) return null;
  try {
    return getConjugationDebugInfo(record.word, record.practicedType, reviewSubmittedAnswer);
  } catch {
    return null;
  }
}

function labRouteFromDebugMistake(mistake) {
  if (mistake?.kind === 'group') {
    return { tool: 'classify', toolLabel: 'Groups' };
  }
  if (mistake?.kind === 'onbin') {
    return { tool: 'endings', toolLabel: 'Ending Lab' };
  }
  return null;
}

export function reviewFeedbackActionForRecord(
  record,
  {
    canOpenGuide = true,
    canOpenLab = true,
    canOpenLearn = true,
    preferTryAnother = false,
    relatedLesson = null,
    reviewSubmittedAnswer = '',
  } = {},
) {
  if (!record || record.correct || record.wasCorrected || preferTryAnother) {
    return { kind: 'try', label: 'Next card' };
  }

  const debug = debugInfoForReviewRecord(record, reviewSubmittedAnswer);
  const labRoute =
    labRouteForMistakePattern(record.diagnosis) || labRouteFromDebugMistake(debug?.mistake);
  if (canOpenLab && labRoute) {
    return { kind: 'drill', label: 'Drill the trap', route: labRoute };
  }

  if (canOpenGuide && (debug?.rowShiftVisual || debug?.mistake)) {
    return { kind: 'guide', label: 'Open Guide for this rule' };
  }

  if (canOpenLearn && relatedLesson) {
    return { kind: 'lesson', label: 'Review lesson', lesson: relatedLesson };
  }

  return { kind: 'try', label: 'Next card' };
}

function ReviewFeedbackAction({ action, buttonRef, onClick }) {
  if (!action?.label || !onClick) return null;
  const Icon =
    action.kind === 'lesson'
      ? IconBook
      : action.kind === 'drill'
        ? IconSpark
        : action.kind === 'guide'
          ? IconList
          : IconArrowRight;
  const toneClass =
    action.kind === 'try'
      ? 'border-stone-800 bg-stone-850 text-white hover:bg-stone-700 dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-150'
      : 'border-indigo-200 bg-white text-indigo-750 hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-900 dark:bg-stone-950 dark:text-indigo-200 dark:hover:bg-indigo-950/30';

  return (
    <div className="mt-4 border-t border-stone-200/70 pt-3 text-left dark:border-stone-800/70">
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition ${toneClass}`}
      >
        <Icon className="h-4 w-4" />
        {action.label}
      </button>
    </div>
  );
}

function GuideReviewPrompt({ buttonRef = null, onClick }) {
  if (!onClick) return null;

  return (
    <div className="mt-4 border-t border-stone-200/60 pt-3 text-left dark:border-stone-800/60">
      <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
        Walk through this form in Guide
      </div>
      <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        Drills this same word and target form: plain form, word group, final answer.
      </div>
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-900 dark:bg-stone-950 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
      >
        <IconList className="h-4 w-4" />
        Open Guide for this rule
      </button>
    </div>
  );
}

function RunAnswerReveal({
  record,
  geminiKey,
  onOpenLearn,
  onOpenLearnFocus = null,
  onOpenGuide,
  onOpenLab,
  onTryAnother,
  actionButtonRef = null,
  autoAdvanceHint = null,
  preferTryAnother = false,
}) {
  const [chatOpen, setChatOpen] = useState(false);
  if (!record) return null;

  const prefs = record.practicePrefs || DEFAULT_PREFS;
  const reviewSubmittedDisplay = record.submittedAnswer ? record.submittedAnswer.trim() : '';
  const reviewSubmittedAnswer = record.reverseDrill
    ? reviewSubmittedDisplay
    : toHiragana(reviewSubmittedDisplay) || reviewSubmittedDisplay;
  const reviewSubmittedComparison = reviewSubmittedAnswer || '(empty)';
  const missedComparisonLabel =
    record.reviewChoiceLabel || record.revealedMiss ? 'You chose' : 'Your answer';
  const missedComparisonValue =
    record.reviewChoiceLabel || (record.revealedMiss ? "I don't know" : reviewSubmittedComparison);
  const reviewKanaCells =
    record.answerMode === 'input' && !record.reverseDrill
      ? kanaCoachCells(record.expected, reviewSubmittedDisplay, record.coachRevealed || 0)
      : [];
  // Cells for the correct answer itself, so a missed card can show the target
  // kana in the same little boxes used when the answer is correct.
  const correctKanaCells =
    record.answerMode === 'input' && !record.reverseDrill
      ? kanaCoachCells(record.expected, record.expected)
      : [];
  const expectedView = record.reverseDrill
    ? promptDisplay(record.word, null, prefs)
    : formDisplay(record.expected, prefs, record.word, record.cardType);
  const reviewTypeId = record.practicedType || record.cardType;
  const targetEnglish = record.reverseDrill
    ? englishForForm(record.word, null)
    : englishForForm(record.word, record.cardType);
  const explanation = record.explanation;
  const relatedLesson = lessonForType(reviewTypeId);
  const minimalPairFeedback = record.minimalPairFeedback;
  const diagnostic =
    !record.correct && !record.revealedMiss ? record.diagnosis?.feedback || '' : '';
  const missedContrast = buildMissedContrast({
    record,
    minimalPairFeedback,
    diagnostic,
    reviewSubmittedAnswer,
    missedComparisonValue,
  });
  const reviewAction = reviewFeedbackActionForRecord(record, {
    canOpenGuide: !!onOpenGuide,
    canOpenLab: !!onOpenLab,
    canOpenLearn: false,
    preferTryAnother,
    relatedLesson,
    reviewSubmittedAnswer,
  });
  const canOpenGuidePrompt =
    !!onOpenGuide && !!record.word && !!reviewTypeId && !record.reverseDrill;
  const canOpenRuleLesson = !!relatedLesson && !!(onOpenLearn || onOpenLearnFocus);
  const ruleLessonLabel = record.correct ? 'Teach me this rule' : 'I forgot this';
  const openFormationKeys = onOpenLearn
    ? (visual) => {
        onOpenLearn(null, visual);
      }
    : undefined;
  const openRuleLesson = () => {
    const handled = onOpenLearnFocus?.(record);
    if (!handled) onOpenLearn?.(relatedLesson.groupId);
  };
  const runReviewAction = () => {
    if (reviewAction.kind === 'guide') {
      onOpenGuide?.(record.word, reviewTypeId);
      return;
    }
    if (reviewAction.kind === 'drill') {
      onOpenLab?.(reviewAction.route?.tool);
      return;
    }
    if (reviewAction.kind === 'lesson') {
      const handled = onOpenLearnFocus?.(record);
      if (!handled) onOpenLearn?.(reviewAction.lesson?.groupId);
      return;
    }
    onTryAnother?.();
  };
  const openGuidePrompt = () => {
    onOpenGuide?.(record.word, reviewTypeId);
  };
  const panelClass = record.correct
    ? 'bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-200 dark:border-emerald-900/50'
    : record.wasCorrected
      ? 'bg-amber-50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/50'
      : 'bg-rose-50 dark:bg-rose-950/10 border border-rose-200 dark:border-rose-900/50';
  const missedAnswerLabel = record.reviewChoiceLabel
    ? 'You chose'
    : record.revealedMiss
      ? "You chose: I don't know"
      : 'Your Answer';
  const missedAnswerValue = record.reviewChoiceLabel
    ? record.reviewChoiceLabel
    : record.revealedMiss
      ? "I don't know"
      : reviewSubmittedComparison;
  const missedAnswerPanelClass = record.wasCorrected
    ? 'border-amber-300/70 bg-amber-50/85 dark:border-amber-700/60 dark:bg-amber-950/30'
    : 'border-rose-300/70 bg-rose-50/85 dark:border-rose-700/60 dark:bg-rose-950/30';
  const missedAnswerLabelClass = record.wasCorrected
    ? 'text-amber-800 dark:text-amber-200'
    : 'text-rose-800 dark:text-rose-200';
  const missedAnswerValueClass = record.wasCorrected
    ? 'text-amber-950 dark:text-amber-50'
    : 'text-rose-950 dark:text-rose-50';

  return (
    <div className={`rounded-xl p-4 ${panelClass}`}>
      <div className="flex items-start gap-3 text-left">
        <div
          className={`mt-0.5 flex-shrink-0 ${
            record.correct
              ? 'text-emerald-600'
              : record.wasCorrected
                ? 'text-amber-600'
                : 'text-rose-600'
          }`}
        >
          {record.correct ? <IconCheck className="h-5 w-5" /> : <IconX className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          <h3
            className={`text-sm font-semibold ${
              record.correct
                ? 'text-emerald-800 dark:text-emerald-300'
                : record.wasCorrected
                  ? 'text-amber-800 dark:text-amber-300'
                  : 'text-rose-800 dark:text-rose-300'
            }`}
          >
            {record.correct
              ? 'Correct!'
              : record.wasCorrected
                ? 'Assisted correction.'
                : 'Review this form.'}
          </h3>
          {record.wasCorrected && (
            <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
              You reached the right answer after self-correction or a hint, so this still counts for
              review.
            </div>
          )}

          {record.correct ? (
            <>
              {reviewKanaCells.length > 0 && (
                <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50 p-2 dark:border-stone-700 dark:bg-stone-900/50">
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
                          className={`flex h-9 w-8 items-center justify-center rounded-lg border text-base font-medium tabular-nums sm:h-10 sm:w-9 ${cls}`}
                        >
                          {cell.shown || '\u00b7'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <ScriptDisplay
                view={expectedView}
                word={record.word}
                type={record.practicedType}
                colorHighlight={prefs.colorCodeConjugations !== false}
                className="mt-2 text-xl text-emerald-900 dark:text-emerald-100"
                subClassName="mt-1 text-xs text-stone-500"
              />
              <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                {targetEnglish}
              </div>
              {autoAdvanceHint && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-100/80 px-3 py-2 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <span className="relative flex h-5 w-5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <IconCheck className="h-3 w-3" />
                    </span>
                  </span>
                  Next card coming up...
                </div>
              )}
            </>
          ) : (
            <>
              {reviewKanaCells.length > 0 ? (
                <div className="mt-4 grid gap-3">
                  <section className="rounded-xl border border-emerald-300/70 bg-emerald-50/85 p-3 shadow-sm dark:border-emerald-700/60 dark:bg-emerald-950/30">
                    <div className="text-[11px] font-semibold uppercase text-emerald-800 dark:text-emerald-200">
                      Correct Answer
                    </div>
                    {correctKanaCells.length > 0 && (
                      <div className="mt-3 rounded-lg bg-white/75 p-2 ring-1 ring-inset ring-emerald-200/80 dark:bg-stone-950/35 dark:ring-emerald-800/60">
                        <div
                          className="flex flex-wrap justify-start gap-1.5 sm:justify-center"
                          lang="ja"
                        >
                          {correctKanaCells.map((cell, i) => (
                            <div
                              key={i}
                              className="flex h-10 w-9 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 text-lg font-semibold tabular-nums text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-100"
                            >
                              {cell.shown || '·'}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <ScriptDisplay
                      view={expectedView}
                      word={record.word}
                      type={record.practicedType}
                      colorHighlight={prefs.colorCodeConjugations !== false}
                      className="mt-2 text-2xl font-semibold leading-snug text-emerald-950 dark:text-emerald-50"
                      subClassName="mt-1 text-xs text-emerald-700 dark:text-emerald-300"
                    />
                    <div className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
                      {targetEnglish}
                    </div>
                  </section>

                  <section className={`rounded-xl border p-3 shadow-sm ${missedAnswerPanelClass}`}>
                    <div
                      className={`text-[11px] font-semibold uppercase ${missedAnswerLabelClass}`}
                    >
                      {missedAnswerLabel}
                    </div>
                    <div
                      className={`mt-2 break-words text-2xl font-semibold leading-snug ${missedAnswerValueClass}`}
                      lang={record.reviewChoiceLabel || record.revealedMiss ? undefined : 'ja'}
                    >
                      {missedAnswerValue}
                    </div>
                    <div className="mt-3 rounded-lg bg-white/70 p-2 ring-1 ring-inset ring-stone-200/80 dark:bg-stone-950/35 dark:ring-stone-700/70">
                      <div
                        className="flex flex-wrap justify-start gap-1.5 sm:justify-center"
                        lang="ja"
                      >
                        {reviewKanaCells.map((cell, i) => {
                          const cls =
                            cell.state === 'correct'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-100'
                              : cell.state === 'wrong' || cell.state === 'extra'
                                ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-600 dark:bg-rose-950/40 dark:text-rose-100'
                                : cell.state === 'hint'
                                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100'
                                  : 'border-stone-300 bg-stone-100 text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400';
                          return (
                            <div
                              key={i}
                              className={`flex h-10 w-9 items-center justify-center rounded-lg border text-lg font-semibold tabular-nums ${cls}`}
                            >
                              {cell.shown || '\u00b7'}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="mt-1 text-xs text-rose-700">
                  {record.reviewChoiceLabel
                    ? `You chose: ${record.reviewChoiceLabel}`
                    : record.revealedMiss
                      ? "You chose: I don't know"
                      : 'You wrote:'}{' '}
                  {!record.revealedMiss && !record.reviewChoiceLabel && (
                    <span lang="ja" className="font-semibold">
                      {record.reverseDrill
                        ? reviewSubmittedDisplay || '(empty)'
                        : toHiragana(record.submittedAnswer) || reviewSubmittedDisplay || '(empty)'}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {record.correct && explanation && (
        <div className="mt-4 space-y-2.5 border-t border-emerald-200 pt-4 text-left dark:border-emerald-900/50">
          <ReviewDisclosure tone="emerald" summary="Answer breakdown" alwaysOpen>
            <ConjugationBreakdown
              word={record.word}
              type={record.practicedType}
              practicePrefs={prefs}
              onOpenFormationKeys={openFormationKeys}
              onOpenLearn={onOpenLearn}
            />
          </ReviewDisclosure>
          {geminiKey && (
            <ReviewChatSection tone="emerald" chatOpen={chatOpen} onOpen={() => setChatOpen(true)}>
              {chatOpen && (
                <ChatPanel
                  verb={record.word}
                  type={record.practicedType}
                  userAnswer={record.expected}
                  expected={record.expected}
                  explanation={explanation}
                  geminiKey={geminiKey}
                  practicePrefs={prefs}
                  taskOverride={record.taskOverride}
                  wasCorrect
                  reviewTone="emerald"
                />
              )}
            </ReviewChatSection>
          )}
        </div>
      )}

      {!record.correct && explanation && (
        <div className="mt-4 space-y-2.5 border-t border-rose-200 pt-4 text-left dark:border-rose-900/50">
          {reviewKanaCells.length === 0 && (
            <>
              <div className="text-xs font-medium uppercase tracking-wider text-rose-700 dark:text-rose-400">
                Compare your answer
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Correct answer
                  </div>
                  <div
                    className="mt-1 break-words text-base font-semibold text-emerald-900 dark:text-emerald-100"
                    lang="ja"
                  >
                    {record.expected}
                  </div>
                </div>
                <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 dark:border-rose-900/60 dark:bg-rose-950/20">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                    {missedComparisonLabel}
                  </div>
                  <div
                    className="mt-1 break-words text-base font-semibold text-rose-900 dark:text-rose-100"
                    lang={record.reviewChoiceLabel || record.revealedMiss ? undefined : 'ja'}
                  >
                    {missedComparisonValue}
                  </div>
                </div>
              </div>
            </>
          )}
          {explanation.rule && (
            <div className="rounded-lg bg-white/70 px-3 py-2 text-sm leading-relaxed text-stone-700 dark:bg-stone-900/70 dark:text-stone-300">
              <span className="font-semibold text-stone-900 dark:text-stone-100">Rule: </span>
              {explanation.rule}
            </div>
          )}
          {missedContrast && (
            <div className="rounded-lg bg-white/70 px-3 py-2 text-sm leading-relaxed text-stone-700 dark:bg-stone-900/70 dark:text-stone-300">
              <span className="font-semibold text-stone-900 dark:text-stone-100">
                {missedContrast.title}:{' '}
              </span>
              {missedContrast.body}
            </div>
          )}
          <ReviewDisclosure tone="rose" summary="Full breakdown" alwaysOpen>
            {!minimalPairFeedback && (
              <div className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                {explanation.intro}
              </div>
            )}
            {explanation.derivation && explanation.derivation !== record.expected && (
              <div
                className="rounded-lg bg-white/70 px-3 py-2 text-center text-base text-stone-900 dark:bg-stone-900/70 dark:text-stone-100"
                lang="ja"
              >
                {explanation.derivation}
              </div>
            )}
            <ConjugationBreakdown
              word={record.word}
              type={record.practicedType}
              userAnswer={record.revealedMiss ? '' : reviewSubmittedAnswer}
              practicePrefs={prefs}
              onOpenFormationKeys={openFormationKeys}
              onOpenLearn={onOpenLearn}
            />
            {minimalPairFeedback && (
              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Full contrast details
                </div>
                <div className="text-sm text-stone-700 dark:text-stone-300">
                  {minimalPairFeedback.intro}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
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
              </section>
            )}
          </ReviewDisclosure>
          {geminiKey && (
            <ReviewChatSection tone="rose" chatOpen={chatOpen} onOpen={() => setChatOpen(true)}>
              {chatOpen && (
                <ChatPanel
                  verb={record.word}
                  type={record.practicedType}
                  userAnswer={record.revealedMiss ? '(revealed)' : record.submittedAnswer}
                  expected={record.expected}
                  explanation={explanation}
                  geminiKey={geminiKey}
                  practicePrefs={prefs}
                  taskOverride={record.taskOverride}
                  wasCorrected={record.wasCorrected}
                />
              )}
            </ReviewChatSection>
          )}
        </div>
      )}
      {canOpenRuleLesson && (
        <div className="mt-4 border-t border-stone-200/60 pt-3 text-left dark:border-stone-800/60">
          <button
            type="button"
            onClick={openRuleLesson}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-900 dark:bg-stone-950 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
          >
            <IconBook className="h-4 w-4" />
            {ruleLessonLabel}
          </button>
          <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Opens {relatedLesson.title}, then returns to this form.
          </div>
        </div>
      )}
      {canOpenGuidePrompt && (
        <GuideReviewPrompt
          buttonRef={reviewAction.kind === 'guide' ? actionButtonRef : null}
          onClick={openGuidePrompt}
        />
      )}
      {reviewAction.kind !== 'guide' && (
        <ReviewFeedbackAction
          action={reviewAction}
          buttonRef={actionButtonRef}
          onClick={runReviewAction}
        />
      )}
    </div>
  );
}

function RunAnswerReviewItem({
  record,
  geminiKey,
  onOpenGuide,
  onOpenLab,
  onOpenLearn,
  onOpenLearnFocus,
  onTryAnother,
}) {
  const answerText =
    record.reviewChoiceLabel ||
    (record.revealedMiss ? "I don't know" : record.submittedAnswer?.trim() || '(empty)');
  const toneClass = record.correct
    ? 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
    : record.wasCorrected
      ? 'border-amber-200 text-amber-700 dark:border-amber-900 dark:text-amber-300'
      : 'border-rose-200 text-rose-700 dark:border-rose-900 dark:text-rose-300';
  const statusLabel = record.correct ? 'Correct' : record.wasCorrected ? 'Assisted' : 'Missed';

  return (
    <details className="group rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
      <summary className="cursor-pointer list-none px-4 py-3 transition hover:bg-stone-50 dark:hover:bg-stone-950/40">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Answer #{record.number}
              </span>
              <span lang="ja" className="text-base font-semibold text-stone-900 dark:text-stone-50">
                {record.word?.dict}
              </span>
              <span className="text-xs text-stone-500 dark:text-stone-400">{record.typeLabel}</span>
            </div>
            <div className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">
              Your answer: <span lang="ja">{answerText}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClass}`}
            >
              {statusLabel}
            </span>
            <span className="text-xs font-semibold text-stone-400 group-open:hidden">Expand</span>
            <span className="hidden text-xs font-semibold text-stone-400 group-open:inline">
              Collapse
            </span>
          </div>
        </div>
      </summary>
      <div className="border-t border-stone-100 p-3 dark:border-stone-800">
        <RunAnswerReveal
          record={record}
          geminiKey={geminiKey}
          onOpenGuide={onOpenGuide}
          onOpenLab={onOpenLab}
          onOpenLearn={onOpenLearn}
          onOpenLearnFocus={onOpenLearnFocus}
          onTryAnother={onTryAnother}
        />
      </div>
    </details>
  );
}

function PracticeRunReviewPage({
  answers,
  runStatsLabel,
  onBack,
  geminiKey,
  onOpenGuide,
  onOpenLab,
  onOpenLearn,
  onOpenLearnFocus,
}) {
  return (
    <section className="mx-auto max-w-3xl space-y-4" aria-label="Practice run review">
      <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              Practice run review
            </div>
            <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
              Answers from this run
            </h2>
            <div className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              {answers.length
                ? `${answers.length} answer${answers.length === 1 ? '' : 's'} captured - ${runStatsLabel}`
                : 'No answers captured yet.'}
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center justify-center rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50 hover:text-stone-800 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          >
            Back to Practice
          </button>
        </div>
      </div>
      {answers.length ? (
        <div className="space-y-2">
          {answers.map((record) => (
            <RunAnswerReviewItem
              key={record.id}
              record={record}
              geminiKey={geminiKey}
              onOpenGuide={onOpenGuide}
              onOpenLab={onOpenLab}
              onOpenLearn={onOpenLearn}
              onOpenLearnFocus={onOpenLearnFocus}
              onTryAnother={onBack}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
          Answer a card, then come back here to expand the reveal details.
        </div>
      )}
    </section>
  );
}

export {
  PracticeRunReviewPage,
  RunAnswerReveal,
  cardOriginForStudyCard,
  cardOriginMeta,
  snapshotPracticePrefs,
  withCardOrigin,
};
