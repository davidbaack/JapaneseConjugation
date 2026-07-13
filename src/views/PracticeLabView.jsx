import React, { useEffect, useMemo, useState } from 'react';
import HorizontalTabList from '../components/HorizontalTabList.jsx';
import { IconList, IconRefresh, IconSpark } from '../components/Icons.jsx';
import { useTablist } from '../components/useTablist.js';
import { useApp } from '../state/AppStateContext.jsx';
import { buildLabReviewRecommendations } from '../utils/reviewRecommendations.js';
import ClassificationView from './ClassificationView.jsx';
import EndingsView from './EndingsView.jsx';
import GamesView from './GamesView.jsx';
import StudyView from './StudyView.jsx';

const LAB_TABS = [
  { id: 'endings', label: 'Ending Lab', icon: IconSpark },
  { id: 'transform', label: 'Transform', icon: IconRefresh },
  { id: 'classify', label: 'Groups', icon: IconList },
  { id: 'games', label: 'Rush', icon: IconRefresh },
];

export default function PracticeLabView() {
  const {
    addReviewRecommendation,
    allWords,
    builtInWords,
    clearLabFocus,
    labFocus,
    practicePrefs,
    setTab,
    startReviewRecommendation,
    state,
    wordLists,
  } = useApp();
  const [active, setActive] = useState('endings');
  // Open the exercise another view asked for (e.g. dashboard -> Ending Lab),
  // then consume the request so a later manual visit lands on the default drill.
  useEffect(() => {
    const tool = labFocus?.tool;
    if (tool && LAB_TABS.some((tab) => tab.id === tool)) {
      setActive(tool);
      clearLabFocus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labFocus]);
  const { tabProps, panelProps } = useTablist(
    LAB_TABS.map((tab) => tab.id),
    active,
    setActive,
  );
  const recommendations = useMemo(
    () =>
      buildLabReviewRecommendations(state, allWords, practicePrefs, wordLists, {
        activeTool: active,
        builtInWords,
      }),
    [active, allWords, builtInWords, practicePrefs, state, wordLists],
  );

  function sendRecommendation(recommendation = recommendations[0]) {
    if (!recommendation) return;
    if (startReviewRecommendation?.(recommendation)) return;
    addReviewRecommendation(recommendation);
    setTab('practice');
  }

  const canRecommend = recommendations.length > 0;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div>
          <div className="text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Drills
          </div>
          <h2 className="mt-1 text-lg font-semibold text-stone-950 dark:text-stone-50">
            Pick a drill and start.
          </h2>
        </div>
        <div className="mt-3">
          <HorizontalTabList
            activeId={active}
            ariaLabel="Drills"
            fadeClassName="from-stone-50 dark:from-stone-950"
            className="flex flex-nowrap gap-1 overflow-x-auto rounded-xl border border-stone-200 bg-stone-50 p-1 [scrollbar-width:thin] dark:border-stone-800 dark:bg-stone-950"
          >
            {LAB_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  {...tabProps(tab.id)}
                  onClick={() => setActive(tab.id)}
                  className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    active === tab.id
                      ? 'bg-stone-800 font-semibold text-white dark:bg-indigo-700'
                      : 'text-stone-600 hover:bg-white dark:text-stone-300 dark:hover:bg-stone-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </HorizontalTabList>
        </div>
      </section>

      <section {...panelProps(active)}>
        {active === 'endings' && <EndingsView />}
        {active === 'transform' && <StudyView mode="transform" />}
        {active === 'classify' && <ClassificationView />}
        {active === 'games' && <GamesView />}
      </section>

      {canRecommend && (
        <details className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <summary className="cursor-pointer list-none text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            Practice what this drill found
          </summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {recommendations.map((recommendation) => (
              <button
                key={recommendation.id}
                type="button"
                aria-label={`Practice ${recommendation.label}`}
                onClick={() => sendRecommendation(recommendation)}
                className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-left transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-stone-950 dark:hover:bg-emerald-950/30"
              >
                <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  {recommendation.label}
                </div>
                {recommendation.detail && (
                  <div className="mt-0.5 text-xs text-stone-600 dark:text-stone-300">
                    {recommendation.detail}
                  </div>
                )}
                <div className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  Practice this
                </div>
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
