import React, { useEffect, useMemo, useState } from 'react';
import {
  IconBook,
  IconCheck,
  IconList,
  IconPen,
  IconRefresh,
  IconSpark,
} from '../components/Icons.jsx';
import { useTablist } from '../components/useTablist.js';
import { useApp } from '../state/AppStateContext.jsx';
import { buildLabReviewRecommendations } from '../utils/reviewRecommendations.js';
import ReferenceViewSub from './ReferenceViewSub.jsx';
import ReviewInventoryView from './ReviewInventoryView.jsx';
import ListsViewSub from './ListsViewSub.jsx';
import CustomDictionaryViewSub from './CustomDictionaryViewSub.jsx';
import EndingsView from './EndingsView.jsx';
import ClassificationView from './ClassificationView.jsx';
import GamesView from './GamesView.jsx';

const TOOL_TABS = [
  {
    id: 'reference',
    label: 'Lookup / Check',
    desc: 'Search real forms and launch targeted practice.',
    icon: IconBook,
  },
  {
    id: 'words',
    label: 'Words',
    desc: 'Remove or restore words from automatic practice.',
    icon: IconCheck,
  },
  {
    id: 'endings',
    label: 'Ending Lab',
    desc: 'Repair te/ta and sound-change patterns.',
    icon: IconSpark,
  },
  {
    id: 'classify',
    label: 'Groups',
    desc: 'Practice verb and adjective group recognition.',
    icon: IconList,
  },
  { id: 'games', label: 'Rush', desc: 'Build speed on familiar forms.', icon: IconRefresh },
  { id: 'lists', label: 'Lists', desc: 'Manage saved practice decks.', icon: IconList },
  {
    id: 'dictionary',
    label: 'Custom words',
    desc: 'Add your own verbs and adjectives.',
    icon: IconPen,
  },
];

const LAB_TOOL_IDS = new Set(['endings', 'classify', 'games']);

export default function ToolsView() {
  const {
    addReviewRecommendation,
    allAdjectives: adjectives,
    allVerbs: verbs,
    allWords,
    builtInWords,
    clearLabFocus,
    customAdjectives,
    customVerbs,
    labFocus,
    practicePrefs,
    setCustomAdjectives,
    setCustomVerbs,
    setPracticePrefs,
    setState,
    setTab,
    setWordLists,
    state,
    activeGeminiKey: geminiKey,
    practiceWord,
    wordLists,
  } = useApp();
  const [active, setActive] = useState('reference');

  useEffect(() => {
    const tool = labFocus?.tool;
    if (tool && TOOL_TABS.some((tab) => tab.id === tool)) {
      setActive(tool);
      clearLabFocus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labFocus]);

  const { tabProps, panelProps } = useTablist(
    TOOL_TABS.map((tab) => tab.id),
    active,
    setActive,
  );
  const recommendations = useMemo(
    () =>
      LAB_TOOL_IDS.has(active)
        ? buildLabReviewRecommendations(state, allWords, practicePrefs, wordLists, {
            activeTool: active,
            builtInWords,
          })
        : [],
    [active, allWords, builtInWords, practicePrefs, state, wordLists],
  );

  function sendRecommendation(recommendation = recommendations[0]) {
    if (!recommendation) return;
    addReviewRecommendation(recommendation);
    setTab('practice');
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-850 dark:bg-stone-900 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Tools
            </div>
            <h2 className="mt-1 text-xl font-semibold text-stone-950 dark:text-stone-50">
              Lookup, repair drills, and word management.
            </h2>
          </div>
          {recommendations.length > 0 && (
            <button
              type="button"
              onClick={() => sendRecommendation()}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
            >
              <IconRefresh className="h-4 w-4" />
              Send to Practice
            </button>
          )}
        </div>

        <div role="tablist" aria-label="Tools" className="mt-4 grid gap-2 sm:grid-cols-2">
          {TOOL_TABS.map((tool) => {
            const activeTool = active === tool.id;
            const ToolIcon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                {...tabProps(tool.id)}
                onClick={() => setActive(tool.id)}
                className={`text-left rounded-lg border p-3 transition ${
                  activeTool
                    ? 'border-indigo-300 bg-indigo-50/80 text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-100'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-950/40 dark:text-stone-300 dark:hover:border-stone-700'
                }`}
              >
                <span className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 rounded-lg border p-2 ${
                      activeTool
                        ? 'border-indigo-200 bg-white text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                        : 'border-stone-200 bg-stone-50 text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400'
                    }`}
                  >
                    <ToolIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{tool.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed opacity-80">
                      {tool.desc}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
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
        {active === 'reference' && (
          <ReferenceViewSub
            state={state}
            setState={setState}
            verbs={verbs}
            adjectives={adjectives}
            wordLists={wordLists}
            setWordLists={setWordLists}
            geminiKey={geminiKey}
            practicePrefs={practicePrefs}
            setPracticePrefs={setPracticePrefs}
            setTab={setTab}
            practiceWord={practiceWord}
            focused
          />
        )}
        {active === 'words' && <ReviewInventoryView />}
        {active === 'endings' && <EndingsView />}
        {active === 'classify' && <ClassificationView />}
        {active === 'games' && <GamesView />}
        {active === 'lists' && (
          <ListsViewSub
            words={[...verbs, ...adjectives]}
            customVerbs={customVerbs}
            setCustomVerbs={setCustomVerbs}
            customAdjectives={customAdjectives}
            setCustomAdjectives={setCustomAdjectives}
            wordLists={wordLists}
            setWordLists={setWordLists}
            practicePrefs={practicePrefs}
            setPracticePrefs={setPracticePrefs}
            geminiKey={geminiKey}
          />
        )}
        {active === 'dictionary' && (
          <CustomDictionaryViewSub
            customVerbs={customVerbs}
            setCustomVerbs={setCustomVerbs}
            customAdjectives={customAdjectives}
            setCustomAdjectives={setCustomAdjectives}
            geminiKey={geminiKey}
          />
        )}
      </section>
    </div>
  );
}
