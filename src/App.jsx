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

function AppShell() {
  const {
    tab,
    setTab,
    state,
    practicePrefs,
    session,
    syncStatus,
    daily,
    dailyPct,
    showAuthModal,
    setShowAuthModal,
    supabase,
  } = useApp();

  const { tabProps, panelProps } = useTablist(TABS, tab, setTab);

  return (
    <div
      className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-800 dark:text-stone-200 transition-colors duration-200"
      style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif' }}
    >
      <div className="max-w-4xl mx-auto px-4 py-3 sm:py-6">
        <header className="mb-4 sm:mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              {t('app.title')}{' '}
              <span className="text-stone-500 dark:text-stone-400 font-normal">形屋</span>{' '}
              <span className="text-stone-400 font-normal">·</span>{' '}
              <span className="font-normal">{t('app.subtitle')}</span>
            </h1>
          </div>
          <div className="text-xs text-stone-500 text-right">
            <div>
              {t('header.session', {
                correct: state.session.correct,
                reviewed: state.session.reviewed,
              })}
            </div>
            <div className="mt-1 flex items-center justify-end gap-2">
              <span>
                {t('header.today', { count: daily.count, goal: practicePrefs.dailyGoal })}
              </span>
              <span className="inline-block w-14 h-1.5 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden">
                <span
                  className={`block h-full ${daily.goalHit ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                  style={{ width: dailyPct + '%' }}
                />
              </span>
            </div>
            {!!daily.goalStreak && (
              <div className="text-amber-600 dark:text-amber-400 mt-0.5">
                {t('header.goalStreak', { days: daily.goalStreak })}
              </div>
            )}
            {session && (
              <div
                className={`flex items-center justify-end gap-1 mt-0.5 ${syncStatus.kind === 'error' ? 'text-rose-500' : syncStatus.kind === 'syncing' ? 'text-amber-500' : 'text-emerald-600'}`}
              >
                <IconCloud className="w-3 h-3" />
                <span>
                  {syncStatus.kind === 'syncing'
                    ? t('sync.syncing')
                    : syncStatus.kind === 'error'
                      ? t('sync.error')
                      : t('sync.synced')}
                </span>
              </div>
            )}
          </div>
        </header>
        <nav
          role="tablist"
          aria-label="App sections"
          className="flex flex-wrap gap-1 mb-4 sm:mb-6 p-1 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800"
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
