import React, { useState } from 'react';
import { IconBook, IconCheck, IconList, IconPen } from '../components/Icons.jsx';
import { useTablist } from '../components/useTablist.js';
import { useApp } from '../state/AppStateContext.jsx';
import ReferenceViewSub from './ReferenceViewSub.jsx';
import CheckView from './CheckView.jsx';
import ReviewInventoryView from './ReviewInventoryView.jsx';
import ListsViewSub from './ListsViewSub.jsx';
import CustomDictionaryViewSub from './CustomDictionaryViewSub.jsx';

const TOOL_TABS = [
  {
    id: 'lookup',
    label: 'Lookup',
    desc: 'Search real forms and launch targeted practice.',
    icon: IconBook,
  },
  {
    id: 'check',
    label: 'Check',
    desc: 'Identify a conjugated form and diagnose close misses.',
    icon: IconCheck,
  },
  {
    id: 'words',
    label: 'Words',
    desc: 'Remove or restore words from automatic practice.',
    icon: IconCheck,
  },
  { id: 'lists', label: 'Lists', desc: 'Manage saved practice decks.', icon: IconList },
  {
    id: 'dictionary',
    label: 'Custom words',
    desc: 'Add your own verbs and adjectives.',
    icon: IconPen,
  },
];

export default function ToolsView() {
  const {
    allAdjectives: adjectives,
    allVerbs: verbs,
    customAdjectives,
    customVerbs,
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
  const [active, setActive] = useState('lookup');

  const { tabProps, panelProps } = useTablist(
    TOOL_TABS.map((tab) => tab.id),
    active,
    setActive,
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-850 dark:bg-stone-900 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Tools
            </div>
            <h2 className="mt-1 text-xl font-semibold text-stone-950 dark:text-stone-50">
              Lookup, check, word lists, and word management.
            </h2>
          </div>
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
      </section>

      <section {...panelProps(active)}>
        {active === 'lookup' && (
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
        {active === 'check' && <CheckView />}
        {active === 'words' && <ReviewInventoryView />}
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
