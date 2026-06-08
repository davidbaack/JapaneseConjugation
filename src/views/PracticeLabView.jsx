import React, { useEffect, useMemo, useState } from 'react';
import { IconList, IconRefresh, IconSpark } from '../components/Icons.jsx';
import { useTablist } from '../components/useTablist.js';
import { useApp } from '../state/AppStateContext.jsx';
import { buildLabReviewRecommendations } from '../utils/reviewRecommendations.js';
import ClassificationView from './ClassificationView.jsx';
import EndingsView from './EndingsView.jsx';
import GamesView from './GamesView.jsx';

const LAB_TABS = [
  { id: 'endings', label: 'Ending Lab', icon: IconSpark },
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
      <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm dark:border-stone-850 dark:bg-stone-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Drills
            </div>
            <h2 className="mt-1 text-xl font-semibold text-stone-950 dark:text-stone-50">
              Focused exercises for endings, groups, and speed.
            </h2>
          </div>
          <button
            type="button"
            onClick={() => sendRecommendation()}
            disabled={!canRecommend}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
          >
            <IconRefresh className="h-4 w-4" />
            Send to Practice
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label="Drills"
            className="flex flex-wrap gap-1 rounded-xl border border-stone-200 bg-stone-50 p-1 dark:border-stone-800 dark:bg-stone-950"
          >
            {LAB_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  {...tabProps(tab.id)}
                  onClick={() => setActive(tab.id)}
                  className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    active === tab.id
                      ? 'bg-stone-850 font-semibold text-white dark:bg-indigo-700'
                      : 'text-stone-600 hover:bg-white dark:text-stone-350 dark:hover:bg-stone-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        {recommendations.length > 0 && (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {recommendations.map((recommendation) => (
              <button
                key={recommendation.id}
                type="button"
                onClick={() => sendRecommendation(recommendation)}
                className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-left transition hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/35"
              >
                <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  {recommendation.label}
                </div>
                {recommendation.detail && (
                  <div className="mt-0.5 text-xs text-stone-600 dark:text-stone-350">
                    {recommendation.detail}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      <section {...panelProps(active)}>
        {active === 'endings' && <EndingsView />}
        {active === 'classify' && <ClassificationView />}
        {active === 'games' && <GamesView />}
      </section>
    </div>
  );
}
