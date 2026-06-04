import React, { Suspense } from 'react';
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
const LessonsView = React.lazy(() => import('./views/LessonsView.jsx'));
const ToolsView = React.lazy(() => import('./views/ToolsView.jsx'));
const SettingsView = React.lazy(() => import('./views/SettingsView.jsx'));
const DevHistoryPanel = import.meta.env.DEV
  ? React.lazy(() => import('./components/DevHistoryPanel.jsx'))
  : null;

const TABS = ['practice', 'learn', 'tools', 'settings'];

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
              className={`flex-1 min-w-[5.25rem] py-2 px-3 rounded-lg text-sm transition ${
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
            {tab === 'practice' && <StudyView />}
            {tab === 'learn' && <LessonsView />}
            {tab === 'tools' && <ToolsView />}
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
      {DevHistoryPanel && (
        <Suspense fallback={null}>
          <DevHistoryPanel />
        </Suspense>
      )}
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
