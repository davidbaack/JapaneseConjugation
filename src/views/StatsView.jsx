import React, { useMemo } from 'react';
import { TE_TA_SOUND_CHANGE_FAMILY_ID } from '../data/conjugationTypes.js';
import { useApp } from '../state/AppStateContext.jsx';
import {
  buildReadinessFamilyRows,
  launchPrefsForReadinessDimension,
  READINESS_DIMENSIONS,
  weakestReadinessSkill,
} from '../utils/readiness.js';
import {
  aggregateDiagnosedMistakes,
  labRouteForMistakePattern,
} from '../utils/mistakeDiagnosis.js';
import { buildGuideDiagnosticInsight } from '../utils/guidePractice.js';
import { buildFormFamilyProgress } from '../utils/formFamilyProgress.js';

const TE_TA_FAMILY_ID = TE_TA_SOUND_CHANGE_FAMILY_ID;

const READINESS_TONE = {
  strong: 'bg-emerald-500',
  developing: 'bg-amber-500',
  weak: 'bg-rose-500',
  untested: 'bg-stone-300 dark:bg-stone-700',
};

function reviewForecastRows(forecast) {
  return [
    ['1h', forecast?.in1h || 0],
    ['4h', forecast?.in4h || 0],
    ['Today', forecast?.today || 0],
    ['Tomorrow', forecast?.tomorrow || 0],
    ['Week', forecast?.week || 0],
  ];
}

function statTile(label, value) {
  return (
    <div
      key={label}
      className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-800 dark:bg-stone-950"
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-stone-950 dark:text-stone-50">
        {value}
      </div>
    </div>
  );
}

function cleanAnswerCount(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
}

function answerStatsFromCards(cards = {}) {
  let correct = 0;
  let incorrect = 0;
  for (const card of Object.values(cards || {})) {
    correct += cleanAnswerCount(card?.correct);
    incorrect += cleanAnswerCount(card?.incorrect);
  }
  const answered = correct + incorrect;
  return {
    correct,
    incorrect,
    answered,
    accuracy: answered ? Math.round((correct / answered) * 100) : 0,
  };
}

export function StatsDashboard({
  daily,
  srsQueue,
  state,
  todayPlan,
  onStartRecommendation,
  onRetestMisses,
  retestCount = 0,
  mistakeRoute = null,
  readinessFamilies = [],
  weakestSkill = null,
  onDrillReadiness,
  onbinWeakness = false,
  onDrillEndingLab,
  groupConfusion = false,
  onDrillClassify,
  onDrillRush,
  onOpenGuide,
}) {
  const dueTotal = srsQueue?.dueRuleIds?.length || 0;
  const practiceTypeCount = Array.isArray(todayPlan?.typeIds) ? todayPlan.typeIds.length : 0;
  const recommendations = state.reviewScope?.recommendations || [];
  const mistakeHistoryCount = (state.mistakes || []).length;
  const { rows: strengthRows, totalPracticed } = buildFormFamilyProgress(state);
  const answerStats = answerStatsFromCards(state.cards);
  const highlightedRows = strengthRows.filter((row) => row.attempted > 0).slice(0, 4);
  const rowsToShow = highlightedRows.length ? highlightedRows : strengthRows.slice(0, 4);
  const readinessById = new Map(readinessFamilies.map((row) => [row.id, row]));
  const guideInsight = buildGuideDiagnosticInsight(state.guide);
  const guideAttemptCount = Number(state.guide?.attempted) || 0;
  const weakestToEndingLab =
    !!weakestSkill &&
    weakestSkill.familyId === TE_TA_FAMILY_ID &&
    onbinWeakness &&
    !!onDrillEndingLab;
  const weakestToRush = !!weakestSkill && weakestSkill.dimension === 'speed' && !!onDrillRush;
  const primaryNudge =
    guideInsight && onOpenGuide
      ? {
          onClick: onOpenGuide,
          message: guideInsight.message,
          detail: guideInsight.detail,
          action: guideInsight.actionLabel,
        }
      : groupConfusion && onDrillClassify
        ? {
            onClick: onDrillClassify,
            lead: 'You keep mixing up ',
            emphasis: 'verb groups',
            tail: ' - drill them in Groups',
            action: 'Groups',
          }
        : weakestSkill && weakestToEndingLab
          ? {
              onClick: onDrillEndingLab,
              lead: 'You keep missing ',
              emphasis: 'sound changes',
              tail: ' - drill them in Ending Lab',
              action: 'Ending Lab',
            }
          : weakestSkill && weakestToRush
            ? {
                onClick: onDrillRush,
                lead: 'Your ',
                emphasis: 'recall is slow',
                tail: ' - build speed in Rush',
                action: 'Rush',
              }
            : weakestSkill && onDrillReadiness
              ? {
                  onClick: () =>
                    onDrillReadiness({
                      familyId: weakestSkill.familyId,
                      dimension: weakestSkill.dimension,
                    }),
                  lead: 'Sharpen ',
                  emphasis: weakestSkill.label,
                  tail: ` - ${weakestSkill.dimensionLabel.toLowerCase()} is ${weakestSkill.status}`,
                  action: 'Drill',
                }
              : null;
  const weakCount = strengthRows.filter((row) => row.status === 'weak').length;
  const hasHistory =
    answerStats.answered > 0 ||
    strengthRows.some((row) => row.attempted > 0) ||
    (daily.count || 0) > 0 ||
    dueTotal > 0 ||
    recommendations.length > 0 ||
    mistakeHistoryCount > 0 ||
    guideAttemptCount > 0;

  return (
    <section className="space-y-4" aria-label="Stats dashboard">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              Stats
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
              Practice pulse.
            </h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
              Recent misses, form-family readiness, and upcoming reviews live here so Practice can
              open straight to the next card.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ['Practiced', totalPracticed],
                ['Accuracy', answerStats.answered ? `${answerStats.accuracy}%` : 'new'],
                ['Right', answerStats.correct],
                ['Wrong', answerStats.incorrect],
                ['Today', `${daily.count || 0} cards`],
                ['Recent misses', weakCount],
              ].map(([label, value]) => statTile(label, value))}
            </div>
          </div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              Practice scope
            </div>
            <div className="mt-2 grid gap-2 text-sm text-stone-700 dark:text-stone-200">
              <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-white/70 px-2.5 py-1.5 dark:border-indigo-900/60 dark:bg-stone-950/30">
                <span>Form types selected</span>
                <span className="font-semibold tabular-nums text-indigo-800 dark:text-indigo-200">
                  {practiceTypeCount}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-white/70 px-2.5 py-1.5 dark:border-indigo-900/60 dark:bg-stone-950/30">
                <span>Mode</span>
                <span className="font-semibold tabular-nums text-indigo-800 dark:text-indigo-200">
                  Continuous
                </span>
              </div>
              <div className="rounded-lg border border-indigo-100 bg-white/70 px-2.5 py-2 dark:border-indigo-900/60 dark:bg-stone-950/30">
                <div className="flex items-center justify-between gap-3">
                  <span>Answer balance</span>
                  <span className="font-semibold tabular-nums text-indigo-800 dark:text-indigo-200">
                    {answerStats.answered ? `${answerStats.accuracy}% right` : 'New'}
                  </span>
                </div>
                <div
                  role="meter"
                  aria-label="Lifetime right answer rate"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={answerStats.accuracy}
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-rose-200/80 dark:bg-rose-950/60"
                >
                  <span
                    className="block h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                    style={{ width: `${answerStats.answered ? answerStats.accuracy : 0}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                  {answerStats.answered
                    ? `${answerStats.correct} right / ${answerStats.incorrect} wrong lifetime`
                    : 'Answer a few cards to see right/wrong rate.'}
                </div>
              </div>
            </div>
            {!hasHistory && (
              <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
                Stats will get sharper as you answer your first few cards.
              </p>
            )}
          </div>
        </div>
      </div>

      {recommendations.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Recommended practice
              </div>
              <div className="text-sm text-stone-600 dark:text-stone-300">
                Learn and Drills can send focused work back into Practice.
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            {recommendations.map((rec) => (
              <button
                key={rec.id}
                type="button"
                onClick={() => onStartRecommendation(rec)}
                className="rounded-xl border border-emerald-200 bg-white px-3 py-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-stone-950 dark:hover:bg-emerald-950/30"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      {rec.source === 'lesson'
                        ? 'Learn'
                        : rec.source === 'lab'
                          ? 'Drills'
                          : 'Tools'}
                    </div>
                    <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      {rec.label}
                    </div>
                    {rec.detail && (
                      <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                        {rec.detail}
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    Start
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {retestCount > 0 && (
        <button
          type="button"
          onClick={onRetestMisses}
          className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200"
        >
          {mistakeRoute
            ? `${mistakeRoute.triggerLabel} -> ${mistakeRoute.toolLabel}`
            : `Practice ${retestCount} miss${retestCount === 1 ? '' : 'es'}`}
        </button>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">
            Upcoming reviews
          </div>
          <div className="grid grid-cols-5 gap-2">
            {reviewForecastRows(todayPlan.upcomingForecast).map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-center dark:border-stone-800 dark:bg-stone-950"
              >
                <div className="text-base font-semibold tabular-nums text-stone-950 dark:text-stone-50">
                  {value}
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wider text-stone-500">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">
            Form families
          </div>
          {primaryNudge && (
            <button
              type="button"
              onClick={primaryNudge.onClick}
              className="mb-3 flex w-full items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900 transition hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200 dark:hover:bg-amber-950/40"
            >
              <span>
                {primaryNudge.message ? (
                  <>
                    <span className="font-semibold">{primaryNudge.message}</span>
                    {primaryNudge.detail && (
                      <span className="mt-0.5 block font-normal">{primaryNudge.detail}</span>
                    )}
                  </>
                ) : (
                  <>
                    {primaryNudge.lead}
                    <span className="font-semibold">{primaryNudge.emphasis}</span>
                    {primaryNudge.tail}
                  </>
                )}
              </span>
              <span className="shrink-0 font-semibold">{primaryNudge.action} -&gt;</span>
            </button>
          )}
          <div className="space-y-1">
            {rowsToShow.map((row) => {
              const tone =
                row.status === 'strong'
                  ? 'bg-emerald-500'
                  : row.status === 'weak'
                    ? 'bg-rose-500'
                    : row.status === 'developing'
                      ? 'bg-amber-500'
                      : 'bg-stone-300';
              const readiness = readinessById.get(row.id);
              const weakest = readiness?.weakest;
              const rowToEndingLab =
                row.id === TE_TA_FAMILY_ID && onbinWeakness && !!onDrillEndingLab;
              const rowToRush = !rowToEndingLab && weakest?.id === 'speed' && !!onDrillRush;
              const accuracyLabel = row.attempted ? `${row.accuracy}%` : 'new';
              const bar = (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                  <span
                    className={`block h-full ${tone}`}
                    style={{ width: `${row.attempted ? row.accuracy : 8}%` }}
                  />
                </div>
              );

              if (!readiness || readiness.practiced === 0) {
                return (
                  <div key={row.id} className="px-1 py-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-stone-700 dark:text-stone-200">
                        {row.label}
                      </span>
                      <span className="tabular-nums text-stone-500">{accuracyLabel}</span>
                    </div>
                    {bar}
                  </div>
                );
              }

              return (
                <details key={row.id} className="group rounded-md px-1 py-1">
                  <summary className="cursor-pointer list-none rounded-md transition hover:bg-stone-50 dark:hover:bg-stone-950/60">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-stone-700 dark:text-stone-200">
                        <span className="text-[10px] text-stone-400 transition group-open:rotate-90">
                          &gt;
                        </span>
                        {row.label}
                      </span>
                      <span className="tabular-nums text-stone-500">{accuracyLabel}</span>
                    </div>
                    {bar}
                  </summary>
                  <div className="mt-2 space-y-1.5 border-t border-stone-100 pl-4 pt-2 dark:border-stone-800">
                    {READINESS_DIMENSIONS.map((dimension) => {
                      const cell = readiness.cells[dimension.id];
                      const tested = cell.status !== 'untested';
                      return (
                        <div
                          key={dimension.id}
                          className="flex items-center justify-between gap-3 text-[11px]"
                        >
                          <span className="flex items-center gap-1.5 text-stone-600 dark:text-stone-300">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${READINESS_TONE[cell.status]}`}
                            />
                            {dimension.label}
                          </span>
                          <span
                            className={
                              tested
                                ? 'font-medium text-stone-600 dark:text-stone-300'
                                : 'text-stone-400 dark:text-stone-500'
                            }
                          >
                            {tested
                              ? `${cell.label}${cell.detail ? ` / ${cell.detail}` : ''}`
                              : dimension.id === 'recognition'
                                ? 'Not tested - try a choice round'
                                : 'Not yet tested'}
                          </span>
                        </div>
                      );
                    })}
                    {readiness.types.length > 0 && (
                      <div className="truncate text-[11px] text-stone-400 dark:text-stone-500">
                        {readiness.types.map((type) => type.label).join(' / ')}
                      </div>
                    )}
                    {weakest && rowToEndingLab && (
                      <button
                        type="button"
                        onClick={onDrillEndingLab}
                        className="mt-1 w-full rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/60"
                      >
                        Drill sound changes in Ending Lab -&gt;
                      </button>
                    )}
                    {weakest && rowToRush && (
                      <button
                        type="button"
                        onClick={onDrillRush}
                        className="mt-1 w-full rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/60"
                      >
                        Drill speed in Rush -&gt;
                      </button>
                    )}
                    {weakest && !rowToEndingLab && !rowToRush && onDrillReadiness && (
                      <button
                        type="button"
                        onClick={() =>
                          onDrillReadiness({ familyId: row.id, dimension: weakest.id })
                        }
                        className="mt-1 w-full rounded-md border border-stone-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200 dark:hover:bg-stone-800"
                      >
                        Drill {weakest.label.toLowerCase()} in {row.label}
                      </button>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function StatsView() {
  const {
    state,
    daily,
    todayPlan,
    srsQueue,
    startReviewRecommendation,
    openLabTool,
    practiceFormGroup,
    hydrated,
    setTab,
  } = useApp();

  const openMistakeSummary = useMemo(() => {
    const open = (state.mistakes || []).filter((mistake) => !mistake.resolved);
    return {
      count: open.length,
      patterns: aggregateDiagnosedMistakes(open),
    };
  }, [state.mistakes]);
  const topMistakeRoute = labRouteForMistakePattern(openMistakeSummary.patterns[0]);
  const retestableMisses = topMistakeRoute ? openMistakeSummary.count : 0;
  const onbinWeakness = openMistakeSummary.patterns.some(
    (pattern) => pattern.category === 'godan-sound-change',
  );
  const groupConfusion = openMistakeSummary.patterns.some(
    (pattern) => pattern.category === 'verb-group-confusion',
  );
  const readinessFamilies = useMemo(() => buildReadinessFamilyRows(state), [state]);
  const weakestReadiness = useMemo(() => weakestReadinessSkill(state), [state]);

  function drillReadinessGap({ familyId, dimension }) {
    practiceFormGroup({
      familyId,
      launchPrefs: launchPrefsForReadinessDimension(dimension),
    });
  }

  function launchMistakeRetest() {
    if (!topMistakeRoute) return;
    openLabTool(topMistakeRoute.tool);
  }

  if (!hydrated) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
        Loading Stats...
      </div>
    );
  }

  return (
    <StatsDashboard
      daily={daily}
      srsQueue={srsQueue}
      state={state}
      todayPlan={todayPlan}
      onStartRecommendation={startReviewRecommendation}
      onRetestMisses={launchMistakeRetest}
      retestCount={retestableMisses}
      mistakeRoute={topMistakeRoute}
      readinessFamilies={readinessFamilies}
      weakestSkill={weakestReadiness}
      onDrillReadiness={drillReadinessGap}
      onbinWeakness={onbinWeakness}
      onDrillEndingLab={() => openLabTool('endings')}
      groupConfusion={groupConfusion}
      onDrillClassify={() => openLabTool('classify')}
      onDrillRush={() => openLabTool('games')}
      onOpenGuide={() => setTab('guide')}
    />
  );
}
