import React, { useState } from 'react';
import StatsView from './StatsView.jsx';
import SRSLevelView from './SRSLevelView.jsx';
import MistakesView from './MistakesView.jsx';
import { useTablist } from '../components/useTablist.js';

const INSIGHTS_TABS = [
  { id: 'overview', label: 'Overview', desc: 'Skills & form accuracy' },
  { id: 'mastery', label: 'Mastery', desc: 'SRS card levels' },
  { id: 'mistakes', label: 'Mistakes', desc: 'History & retest' },
];

export default function InsightsView() {
  const [subTab, setSubTab] = useState('overview');
  const { tabProps, panelProps } = useTablist(
    INSIGHTS_TABS.map((t) => t.id),
    subTab,
    setSubTab,
  );

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Insights sections"
        className="flex border-b border-stone-200 dark:border-stone-800"
      >
        {INSIGHTS_TABS.map((t) => (
          <button
            key={t.id}
            {...tabProps(t.id)}
            onClick={() => setSubTab(t.id)}
            className={`flex-1 pb-3 text-center border-b-2 transition ${
              subTab === t.id
                ? 'border-indigo-600 text-indigo-600 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            <div className="text-sm">{t.label}</div>
            <div className="text-xs text-stone-450 dark:text-stone-500 font-normal hidden sm:block">
              {t.desc}
            </div>
          </button>
        ))}
      </div>

      <div {...panelProps(subTab)}>
        {subTab === 'overview' && <StatsView />}
        {subTab === 'mastery' && <SRSLevelView />}
        {subTab === 'mistakes' && <MistakesView />}
      </div>
    </div>
  );
}
