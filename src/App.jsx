import React, { Suspense } from 'react';
import { IconCloud } from './components/Icons.jsx';
import AuthModal from './components/AuthModal.jsx';
import ViewSkeleton from './components/Skeleton.jsx';
import UpdatePrompt from './components/UpdatePrompt.jsx';
import { t } from './i18n/index.js';
import { AppStateProvider, useApp } from './state/AppStateContext.jsx';
import { useTablist } from './components/useTablist.js';

// Views — lazy-loaded so each gets its own chunk. Each view sources what it
// needs from the central app state via useApp(), so the shell renders them
// without prop-drilling.
const StudyView = React.lazy(() => import('./views/StudyView.jsx'));
const CheckView = React.lazy(() => import('./views/CheckView.jsx'));
const GamesView = React.lazy(() => import('./views/GamesView.jsx'));
const EndingsView = React.lazy(() => import('./views/EndingsView.jsx'));
const ClassificationView = React.lazy(() => import('./views/ClassificationView.jsx'));
const InsightsView = React.lazy(() => import('./views/InsightsView.jsx'));
const LibraryView = React.lazy(() => import('./views/LibraryView.jsx'));
const SettingsView = React.lazy(() => import('./views/SettingsView.jsx'));

const TABS = ['study', 'check', 'classify', 'endings', 'games', 'insights', 'library', 'settings'];

export function SRSQueueBar() {
  const {
    state,
    tab,
    setTab,
    practicePrefs,
    session,
    syncStatus,
    daily,
    dailyPct,
    showAuth,
    todayPlan,
    todayGoalHit,
    todayDrillActive,
    srsQueue,
    startTodayDrill,
    supabase,
  } = useApp();
  const signedIn = !!session?.user;
  const cloudSyncAvailable = !!supabase;

  const dueTotal = srsQueue?.dueRuleIds?.length || 0;
  const dueCleared = srsQueue?.completedDueRuleIds?.length || 0;
  const hasDueQueue = dueTotal > 0;
  const queueDone = hasDueQueue && dueCleared >= dueTotal;
  const upcoming = todayPlan.forecastLabel;
  const dueNow = todayPlan.sourceCounts?.due || 0;
  const progressPct = hasDueQueue
    ? Math.min(100, Math.round((dueCleared / dueTotal) * 100))
    : dailyPct;
  const progressMax = hasDueQueue ? dueTotal : practicePrefs.dailyGoal || 30;
  const progressNow = hasDueQueue ? dueCleared : Math.min(daily.count || 0, progressMax);
  const statusText = hasDueQueue
    ? `${dueCleared}/${dueTotal} cleared`
    : todayGoalHit
      ? 'Daily goal complete'
      : dueNow
        ? `${dueNow} due now`
        : todayPlan.available
          ? 'Ready'
          : 'No cards';
  const syncText = !signedIn
    ? t('sync.local')
    : syncStatus.kind === 'syncing'
      ? t('sync.syncing')
      : syncStatus.kind === 'error'
        ? t('sync.error')
        : t('sync.synced');
  const syncTone = !signedIn
    ? 'text-stone-500 dark:text-stone-400'
    : syncStatus.kind === 'error'
      ? 'text-rose-600 dark:text-rose-400'
      : syncStatus.kind === 'syncing'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-emerald-700 dark:text-emerald-400';
  const sessionReviewed = state.session?.reviewed || 0;
  const sessionCorrect = state.session?.correct || 0;
  const dailyGoal = practicePrefs.dailyGoal || 30;
  const chips = [
    `${daily.count || 0}/${dailyGoal} today`,
    `${sessionCorrect}/${sessionReviewed} session`,
    daily.goalStreak ? `${daily.goalStreak} day streak` : '',
  ].filter(Boolean);
  const canStart = !todayDrillActive && !todayGoalHit && todayPlan.available;
  const canResumeQueue = tab !== 'study' && todayDrillActive && hasDueQueue && !queueDone;
  const showStudyAction = canStart || canResumeQueue;

  return (
    <section
      aria-label="SRS queue"
      className="mb-4 rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              {queueDone ? 'Queue cleared' : 'SRS Queue'}
            </div>
            <div className={`flex items-center gap-1 text-[11px] ${syncTone}`}>
              <IconCloud className="h-3 w-3" />
              <span>{syncText}</span>
            </div>
          </div>
          <div className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">
            {upcoming ? `up next: ${upcoming}` : todayPlan.summary}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip}
                className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-medium text-stone-600 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 sm:justify-end">
          <div className="min-w-[7.5rem] shrink-0 text-right text-xs font-semibold text-stone-700 dark:text-stone-200">
            <div className="tabular-nums">{statusText}</div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progressMax}
              aria-valuenow={progressNow}
              className="mt-1 inline-block h-1.5 w-20 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
            >
              <span
                className={`block h-full ${queueDone || todayGoalHit ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                style={{ width: progressPct + '%' }}
              />
            </div>
          </div>
          {showStudyAction && (
            <button
              type="button"
              onClick={() => {
                if (canStart) startTodayDrill(todayPlan);
                else setTab('study');
              }}
              className="min-h-9 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              {canStart ? 'Start review' : 'Go study'}
            </button>
          )}
          {!signedIn && cloudSyncAvailable && (
            <button
              type="button"
              onClick={showAuth}
              className="min-h-9 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-800 dark:bg-stone-950 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
            >
              Sign in to sync
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export function PracticalCorePathPanel() {
  const {
    tab,
    setTab,
    practicalCorePath,
    practicalCorePathActive,
    todayGoalHit,
    startPracticalCorePath,
  } = useApp();

  if (tab !== 'study' || !practicalCorePath) return null;

  const { activeStage, available, completeStages, stages, totalProgressPct } = practicalCorePath;
  const actionDisabled = !available || todayGoalHit;
  const actionLabel = practicalCorePathActive
    ? 'Continue path'
    : todayGoalHit
      ? 'Goal complete'
      : 'Start Core Path';

  return (
    <section
      aria-label="Practical Core Path"
      className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-3 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/20"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Practical Core Path
            </div>
            <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200 dark:bg-stone-950/60 dark:text-emerald-300 dark:ring-emerald-900">
              {completeStages}/{stages.length} stages
            </span>
          </div>
          <div className="mt-1 text-sm font-semibold text-stone-900 dark:text-stone-100">
            {activeStage.label}
          </div>
          <div className="mt-0.5 text-xs text-stone-600 dark:text-stone-300">
            {activeStage.focus}
          </div>
          <div className="mt-3 grid gap-2">
            {stages.map((stage, index) => {
              const active = stage.id === activeStage.id;
              const done = stage.stats.complete;
              const session = stage.session || {};
              const startProgressPct = Math.max(
                0,
                Math.min(100, session.startProgressPct ?? stage.stats.progressPct),
              );
              const progressDeltaPct = Math.max(
                0,
                Math.min(100 - startProgressPct, session.progressDeltaPct || 0),
              );
              const correctDelta = Math.max(0, session.correctDelta || 0);
              return (
                <div
                  key={stage.id}
                  aria-current={active ? 'step' : undefined}
                  className={`rounded-md border px-2.5 py-2 ${
                    active
                      ? 'border-emerald-300 bg-white/95 dark:border-emerald-700 dark:bg-stone-950'
                      : done
                        ? 'border-emerald-200 bg-emerald-100/70 dark:border-emerald-900 dark:bg-emerald-950/30'
                        : 'border-stone-200 bg-white/70 dark:border-stone-800 dark:bg-stone-950/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className={`text-xs font-semibold ${
                          active || done
                            ? 'text-emerald-800 dark:text-emerald-300'
                            : 'text-stone-700 dark:text-stone-200'
                        }`}
                      >
                        {index + 1}. {stage.label}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-stone-600 dark:text-stone-300">
                        {stage.description || stage.focus}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[11px] font-semibold tabular-nums text-stone-700 dark:text-stone-200">
                      {stage.stats.progressPct}%
                    </div>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${stage.label} stage progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={stage.stats.progressPct}
                    aria-valuetext={`${stage.stats.progressPct}% total, ${correctDelta} correct this session`}
                    className="relative mt-2 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 rounded-full bg-emerald-700/35 dark:bg-emerald-500/20"
                      style={{ width: `${startProgressPct}%` }}
                    />
                    {progressDeltaPct > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 rounded-full bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.45)] dark:bg-emerald-300"
                        style={{ left: `${startProgressPct}%`, width: `${progressDeltaPct}%` }}
                      />
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-stone-500 dark:text-stone-400">
                    <span>
                      {correctDelta
                        ? `+${correctDelta} correct this session`
                        : 'No session gain yet'}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {stage.stats.correct}/{stage.targetCorrect} correct
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3 sm:justify-end">
          <div className="min-w-[7.5rem] shrink-0 text-right text-xs font-semibold text-stone-700 dark:text-stone-200">
            <div className="tabular-nums">{totalProgressPct}% path</div>
            <div
              role="progressbar"
              aria-label="Practical Core Path progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={totalProgressPct}
              className="mt-1 inline-block h-1.5 w-20 overflow-hidden rounded-full bg-emerald-100 dark:bg-stone-800"
            >
              <span
                className="block h-full bg-emerald-600"
                style={{ width: totalProgressPct + '%' }}
              />
            </div>
          </div>
          <button
            type="button"
            disabled={actionDisabled}
            onClick={() => {
              if (practicalCorePathActive) setTab('study');
              else startPracticalCorePath(practicalCorePath);
            }}
            className="min-h-9 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-emerald-500 dark:text-stone-950 dark:hover:bg-emerald-400"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </section>
  );
}

function AppShell() {
  const { tab, setTab, showAuthModal, setShowAuthModal, supabase } = useApp();

  const { tabProps, panelProps } = useTablist(TABS, tab, setTab);

  return (
    <div
      className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-800 dark:text-stone-200 transition-colors duration-200"
      style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif' }}
    >
      <div className="max-w-4xl mx-auto px-4 py-3 sm:py-6">
        <header className="mb-4 sm:mb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              {t('app.title')}{' '}
              <span className="text-stone-500 dark:text-stone-400 font-normal">形屋</span>{' '}
              <span className="text-stone-400 font-normal">·</span>{' '}
              <span className="font-normal">{t('app.subtitle')}</span>
            </h1>
          </div>
        </header>
        <nav
          role="tablist"
          aria-label="App sections"
          className="mb-3 flex flex-wrap gap-1 rounded-xl border border-stone-200 bg-white p-1 dark:border-stone-800 dark:bg-stone-900"
        >
          {TABS.map((id) => (
            <button
              key={id}
              {...tabProps(id)}
              onClick={() => setTab(id)}
              className={`flex-1 min-w-[5.25rem] py-2 px-3 rounded-lg text-sm transition capitalize ${
                tab === id
                  ? 'bg-stone-800 dark:bg-indigo-700 text-white font-semibold'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              {t(`nav.${id}`)}
            </button>
          ))}
        </nav>
        <PracticalCorePathPanel />
        <SRSQueueBar />
        <Suspense fallback={<ViewSkeleton />}>
          <div {...panelProps(tab)}>
            {tab === 'study' && <StudyView />}
            {tab === 'check' && <CheckView />}
            {tab === 'games' && <GamesView />}
            {tab === 'endings' && <EndingsView />}
            {tab === 'classify' && <ClassificationView />}
            {tab === 'insights' && <InsightsView />}
            {tab === 'library' && <LibraryView />}
            {tab === 'settings' && <SettingsView />}
          </div>
        </Suspense>
      </div>
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        supabase={supabase}
      />
      <UpdatePrompt />
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <AppShell />
    </AppStateProvider>
  );
}
