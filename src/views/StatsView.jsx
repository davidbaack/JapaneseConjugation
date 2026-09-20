import React from 'react';
import { FORM_GROUPS } from '../data/conjugationTypes.js';
import { useApp } from '../state/AppStateContext.jsx';
import {
  accuracyForTotals,
  evidenceLabelForTotals,
  normalizePracticeStats,
  practiceTrendDays,
  totalsForPracticeTopic,
} from '../utils/practiceStats.js';

function StatTile({ label, value, detail }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-3 dark:border-stone-800 dark:bg-stone-900">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-stone-950 dark:text-stone-50">
        {value}
      </div>
      {detail && <div className="mt-0.5 text-xs text-stone-500">{detail}</div>}
    </div>
  );
}

function recentComparison(recent = []) {
  const answered = recent.filter((row) => typeof row.correct === 'boolean');
  const current = answered.slice(0, 20);
  const previous = answered.slice(20, 40);
  const accuracy = (rows) =>
    rows.length ? Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) : 0;
  const currentAccuracy = accuracy(current);
  const previousAccuracy = accuracy(previous);
  return {
    currentCount: current.length,
    previousCount: previous.length,
    currentAccuracy,
    previousAccuracy,
    change: current.length >= 5 && previous.length >= 5 ? currentAccuracy - previousAccuracy : null,
  };
}

function topicTrend(recent, topic) {
  const typeIds = new Set(topic.typeIds || []);
  const rows = recent.filter((row) => typeIds.has(row.typeId));
  const current = rows.slice(0, 10);
  const previous = rows.slice(10, 20);
  if (current.length < 3 || previous.length < 3) return null;
  const accuracy = (items) =>
    Math.round((items.filter((row) => row.correct).length / items.length) * 100);
  return accuracy(current) - accuracy(previous);
}

function modeTotals(stats, modes) {
  const totals = { attempted: 0, correct: 0, responseMs: 0, byMode: {} };
  for (const mode of modes) {
    const row = stats.lifetime.byMode?.[mode];
    totals.attempted += Number(row?.attempted) || 0;
    totals.correct += Number(row?.correct) || 0;
    totals.responseMs += Number(row?.responseMs) || 0;
  }
  return totals;
}

function ModeCard({ label, totals, detail }) {
  const accuracy = accuracyForTotals(totals);
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-stone-800 dark:text-stone-100">{label}</div>
        <div className="text-sm font-semibold tabular-nums text-stone-950 dark:text-stone-50">
          {totals.attempted ? `${accuracy}%` : 'New'}
        </div>
      </div>
      <div className="mt-1 text-xs text-stone-500">
        {totals.correct} right / {totals.attempted} attempts
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        <span
          className="block h-full rounded-full bg-indigo-500"
          style={{ width: `${totals.attempted ? accuracy : 0}%` }}
        />
      </div>
      <div className="mt-2 text-[11px] text-stone-500">{detail}</div>
    </div>
  );
}

function TrendChart({ rows }) {
  const total = rows.reduce((sum, row) => sum + row.attempted, 0);
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
            Trend
          </div>
          <h3 className="mt-1 text-lg font-semibold text-stone-950 dark:text-stone-50">
            Accuracy over the last 14 days
          </h3>
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold tabular-nums text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          {total} {total === 1 ? 'answer' : 'answers'}
        </span>
      </div>
      {total ? (
        <div
          className="mt-5 grid h-40 grid-cols-[repeat(14,minmax(0,1fr))] items-end gap-1.5"
          aria-label="Answer activity over the last 14 days"
        >
          {rows.map((row) => (
            <div key={row.key} className="flex h-full min-w-0 flex-col justify-end gap-1">
              <div className="text-center text-[9px] font-medium tabular-nums text-stone-500">
                {row.attempted || ''}
              </div>
              <div
                title={`${row.key}: ${row.attempted} attempts, ${row.accuracy}% right`}
                aria-label={`${row.key}: ${row.attempted} attempts, ${row.accuracy}% right`}
                className={`min-h-1 rounded-t-md transition-all ${
                  row.accuracy >= 80
                    ? 'bg-emerald-500 dark:bg-emerald-400'
                    : row.accuracy >= 60
                      ? 'bg-amber-500 dark:bg-amber-400'
                      : 'bg-rose-500 dark:bg-rose-400'
                }`}
                style={{
                  height: `${row.attempted ? Math.max(4, (row.accuracy / 100) * 112) : 4}px`,
                  opacity: row.attempted ? 1 : 0.2,
                }}
              />
              <div className="truncate text-center text-[9px] text-stone-400">{row.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-stone-300 px-4 py-8 text-center dark:border-stone-700">
          <div className="text-sm font-semibold text-stone-700 dark:text-stone-200">
            Your trend starts with your next answer.
          </div>
          <div className="mt-1 text-xs text-stone-500">
            This chart will show how your accuracy changes as you keep practicing.
          </div>
        </div>
      )}
    </section>
  );
}

export function StatsDashboard({ state, onPracticeTopic }) {
  const stats = normalizePracticeStats(state.practiceStats);
  const comparison = recentComparison(stats.recent);
  const trendRows = practiceTrendDays(stats, 14);
  const topicRows = FORM_GROUPS.map((topic) => ({
    ...topic,
    totals: totalsForPracticeTopic(stats, topic),
    trend: topicTrend(stats.recent, topic),
  })).sort(
    (a, b) =>
      Number(b.totals.attempted > 0) - Number(a.totals.attempted > 0) ||
      b.totals.attempted - a.totals.attempted,
  );
  const ratedTopics = topicRows.filter((row) => row.totals.attempted >= 3);
  const strongest = [...ratedTopics].sort(
    (a, b) => accuracyForTotals(b.totals) - accuracyForTotals(a.totals),
  )[0];
  const weakest = [...ratedTopics].sort(
    (a, b) => accuracyForTotals(a.totals) - accuracyForTotals(b.totals),
  )[0];
  const production = modeTotals(stats, ['input', 'speak']);
  const recognition = modeTotals(stats, ['choice', 'listening']);
  const selfCheck = modeTotals(stats, ['self-check']);
  const recentMisses = stats.recent.filter((row) => !row.correct).slice(0, 5);

  return (
    <section className="space-y-4" aria-label="Stats dashboard">
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(236,253,245,0.82))] p-4 shadow-sm dark:border-stone-800 dark:bg-[linear-gradient(135deg,rgba(28,25,23,1),rgba(6,78,59,0.18))] sm:p-5">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
              Lifetime progress
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
              See what is getting easier.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-600 dark:text-stone-300">
              Every answer contributes to your long-term picture. Recent results sit beside lifetime
              evidence so a difficult day never erases real progress.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Answers" value={stats.lifetime.attempted} detail="lifetime" />
            <StatTile
              label="Accuracy"
              value={stats.lifetime.attempted ? `${accuracyForTotals(stats.lifetime)}%` : 'New'}
              detail={evidenceLabelForTotals(stats.lifetime)}
            />
            <StatTile
              label="Recent 20"
              value={comparison.currentCount ? `${comparison.currentAccuracy}%` : 'New'}
              detail={
                comparison.change == null
                  ? 'More answers needed for a trend'
                  : `${comparison.change >= 0 ? '+' : ''}${comparison.change} points`
              }
            />
            <StatTile
              label="Strongest"
              value={strongest?.label || 'Gathering data'}
              detail={strongest ? `${accuracyForTotals(strongest.totals)}% right` : ''}
            />
          </div>
        </div>
      </div>

      {weakest && (
        <button
          type="button"
          onClick={() => onPracticeTopic?.(weakest.id)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition hover:border-amber-300 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/20 dark:hover:bg-amber-950/35"
        >
          <span>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Worth another look
            </span>
            <span className="mt-0.5 block text-sm font-semibold text-amber-950 dark:text-amber-100">
              {weakest.label} · {accuracyForTotals(weakest.totals)}% right across{' '}
              {weakest.totals.attempted} attempts
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-amber-800 dark:text-amber-200">
            Practice →
          </span>
        </button>
      )}

      <TrendChart rows={trendRows} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-stone-950/40">
          <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            By answer style
          </div>
          <div className="mt-3 grid gap-2">
            <ModeCard
              label="Typed and spoken production"
              totals={production}
              detail="Recall the form yourself"
            />
            <ModeCard
              label="Choice and listening"
              totals={recognition}
              detail="Recognize the right form"
            />
            {selfCheck.attempted > 0 && (
              <ModeCard label="Self-check" totals={selfCheck} detail="Learner-rated answers" />
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
          <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            Recent misses
          </div>
          {recentMisses.length ? (
            <div className="mt-3 space-y-2">
              {recentMisses.map((row, index) => {
                const topic = FORM_GROUPS.find((item) => item.id === row.topicId);
                return (
                  <div
                    key={`${row.at}-${row.typeId}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2 text-xs dark:border-rose-900/50 dark:bg-rose-950/15"
                  >
                    <span className="font-medium text-rose-900 dark:text-rose-100">
                      {topic?.label || row.typeId}
                    </span>
                    <span className="text-rose-700 dark:text-rose-300">
                      {new Date(row.at).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500 dark:border-stone-700">
              No recent misses yet.
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              Practice topics
            </div>
            <h3 className="mt-1 text-lg font-semibold text-stone-950 dark:text-stone-50">
              Lifetime strength by topic
            </h3>
          </div>
          <div className="text-xs text-stone-500">Tap a topic to practice it</div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {topicRows.map((topic) => {
            const accuracy = accuracyForTotals(topic.totals);
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => onPracticeTopic?.(topic.id)}
                className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-stone-800 dark:bg-stone-950 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/25"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">
                    {topic.label}
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-stone-600 dark:text-stone-300">
                    {topic.totals.attempted ? `${accuracy}%` : 'New'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-stone-500">
                  {topic.totals.correct} right / {topic.totals.attempted} attempts
                  {topic.totals.attempted > 0 && topic.totals.attempted < 3
                    ? ' · early estimate'
                    : ''}
                  {topic.trend == null
                    ? ''
                    : ` · ${topic.trend >= 0 ? '+' : ''}${topic.trend} points recently`}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                  <span
                    className="block h-full rounded-full bg-indigo-500"
                    style={{ width: `${topic.totals.attempted ? accuracy : 0}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </section>
  );
}

export default function StatsView() {
  const { state, practiceFormGroup, hydrated } = useApp();

  if (!hydrated) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
        Loading Stats...
      </div>
    );
  }

  return (
    <StatsDashboard state={state} onPracticeTopic={(familyId) => practiceFormGroup({ familyId })} />
  );
}
