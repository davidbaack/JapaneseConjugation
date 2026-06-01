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
  } = useApp();
  const signedIn = !!session?.user;

  if (!signedIn) {
    return (
      <section
        aria-label="SRS queue"
        className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 shadow-sm dark:border-indigo-900/70 dark:bg-indigo-950/25"
      >
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
      </section>
    );
  }

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
  const syncText =
    syncStatus.kind === 'syncing'
      ? t('sync.syncing')
      : syncStatus.kind === 'error'
        ? t('sync.error')
        : t('sync.synced');
  const syncTone =
    syncStatus.kind === 'error'
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
