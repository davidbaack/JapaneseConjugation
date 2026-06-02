import React, { useState } from 'react';
import { IconCheck, IconList, IconRefresh, IconSpark } from '../components/Icons.jsx';
import { useTablist } from '../components/useTablist.js';
import { useApp } from '../state/AppStateContext.jsx';
import CheckView from './CheckView.jsx';
import ClassificationView from './ClassificationView.jsx';
import EndingsView from './EndingsView.jsx';
import GamesView from './GamesView.jsx';

const LAB_TABS = [
  { id: 'check', label: 'Check', icon: IconCheck },
  { id: 'endings', label: 'Ending Lab', icon: IconSpark },
  { id: 'classify', label: 'Groups', icon: IconList },
  { id: 'games', label: 'Rush', icon: IconRefresh },
];

const REVIEW_RECOMMENDATIONS = {
  endings: {
    id: 'lab-te-ta-review',
    source: 'lab',
    label: 'Te and ta form Reviews',
    detail: 'Full recall for the forms practiced in Ending Lab.',
    typeIds: ['te-form', 'plain-past'],
    suggestedCount: 12,
  },
  classify: {
    id: 'lab-foundation-review',
    source: 'lab',
    label: 'Group-aware foundation Reviews',
    detail: 'Plain, polite, negative, past, and te-form recall.',
    typeIds: [
      'plain-present',
      'plain-past',
      'plain-negative',
      'plain-past-negative',
      'polite-present',
      'polite-past',
      'polite-negative',
      'te-form',
    ],
    suggestedCount: 14,
  },
  games: {
    id: 'lab-rush-review',
    source: 'lab',
    label: 'Rush follow-up Reviews',
    detail: 'A short full-recall set for forms that appear in Rush.',
    typeIds: ['plain-past', 'plain-negative', 'polite-present', 'te-form', 'potential'],
    suggestedCount: 10,
  },
};

export default function PracticeLabView() {
  const { addReviewRecommendation, setTab } = useApp();
  const [active, setActive] = useState('check');
  const { tabProps, panelProps } = useTablist(
    LAB_TABS.map((tab) => tab.id),
    active,
    setActive,
  );

  function sendRecommendation() {
    const recommendation = REVIEW_RECOMMENDATIONS[active];
    if (!recommendation) return;
    addReviewRecommendation(recommendation);
    setTab('study');
  }

  const canRecommend = !!REVIEW_RECOMMENDATIONS[active];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm dark:border-stone-850 dark:bg-stone-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label="Practice Lab tools"
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
          <button
            type="button"
            onClick={sendRecommendation}
            disabled={!canRecommend}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
          >
            <IconRefresh className="h-4 w-4" />
            Send to Reviews
          </button>
        </div>
      </section>

      <section {...panelProps(active)}>
        {active === 'check' && <CheckView />}
        {active === 'endings' && <EndingsView />}
        {active === 'classify' && <ClassificationView />}
        {active === 'games' && <GamesView />}
      </section>
    </div>
  );
}
