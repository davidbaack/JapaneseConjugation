import React, { useState } from 'react';
import ReferenceViewSub from './ReferenceViewSub.jsx';
import ListsViewSub from './ListsViewSub.jsx';
import CustomDictionaryViewSub from './CustomDictionaryViewSub.jsx';
import ReviewInventoryView from './ReviewInventoryView.jsx';
import { useTablist } from '../components/useTablist.js';
import { IconBook, IconCheck, IconList, IconPen } from '../components/Icons.jsx';
import { useApp } from '../state/AppStateContext.jsx';

const PRIMARY_SECTIONS = [
  {
    id: 'inventory',
    label: 'Inventory',
    desc: 'Turn review words and form families on or off.',
    Icon: IconCheck,
  },
  {
    id: 'reference',
    label: 'Lookup / Check',
    desc: 'Search real forms and launch targeted practice.',
    Icon: IconBook,
  },
];

const MANAGEMENT_SECTIONS = [
  {
    id: 'lists',
    label: 'Lists',
    desc: 'Decks and exports.',
    Icon: IconList,
  },
  {
    id: 'dictionary',
    label: 'Custom words',
    desc: 'Your verbs and adjectives.',
    Icon: IconPen,
  },
];

export default function LibraryView() {
  const {
    state,
    setState,
    allVerbs: verbs,
    allAdjectives: adjectives,
    customVerbs,
    setCustomVerbs,
    customAdjectives,
    setCustomAdjectives,
    wordLists,
    setWordLists,
    practicePrefs,
    setPracticePrefs,
    activeGeminiKey: geminiKey,
    setTab,
    practiceWord,
  } = useApp();
  const [subTab, setSubTab] = useState('inventory');
  const sections = [...PRIMARY_SECTIONS, ...MANAGEMENT_SECTIONS];
  const { tabProps, panelProps } = useTablist(
    sections.map((t) => t.id),
    subTab,
    setSubTab,
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-stone-200 dark:border-stone-850 bg-white dark:bg-stone-900 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Library
            </div>
            <h2 className="mt-1 text-xl font-semibold text-stone-950 dark:text-stone-50">
              What Reviews is allowed to show.
            </h2>
          </div>
          <div className="text-sm text-stone-550 dark:text-stone-400">
            Inventory, lookup, lists.
          </div>
        </div>

        <div role="tablist" aria-label="Library sections" className="mt-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-2">
            {PRIMARY_SECTIONS.map((section) => {
              const active = subTab === section.id;
              const SectionIcon = section.Icon;
              return (
                <button
                  key={section.id}
                  {...tabProps(section.id)}
                  onClick={() => setSubTab(section.id)}
                  className={`text-left rounded-lg border p-3 transition ${
                    active
                      ? 'border-indigo-300 bg-indigo-50/80 text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-100'
                      : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-950/40 dark:text-stone-300 dark:hover:border-stone-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 rounded-lg border p-2 ${
                        active
                          ? 'border-indigo-200 bg-white text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                          : 'border-stone-200 bg-stone-50 text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400'
                      }`}
                    >
                      <SectionIcon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{section.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed opacity-80">
                        {section.desc}
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3 dark:border-stone-800">
            <span className="text-xs uppercase tracking-wider text-stone-450 dark:text-stone-500">
              Manage
            </span>
            {MANAGEMENT_SECTIONS.map((section) => {
              const active = subTab === section.id;
              const SectionIcon = section.Icon;
              return (
                <button
                  key={section.id}
                  {...tabProps(section.id)}
                  onClick={() => setSubTab(section.id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    active
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-750 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300'
                      : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-stone-800 dark:text-stone-350 dark:hover:bg-stone-850'
                  }`}
                  title={section.desc}
                >
                  <SectionIcon className="w-4 h-4" />
                  {section.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div {...panelProps(subTab)}>
        {subTab === 'inventory' && <ReviewInventoryView />}
        {subTab === 'reference' && (
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
        {subTab === 'lists' && (
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
        {subTab === 'dictionary' && (
          <CustomDictionaryViewSub
            customVerbs={customVerbs}
            setCustomVerbs={setCustomVerbs}
            customAdjectives={customAdjectives}
            setCustomAdjectives={setCustomAdjectives}
            geminiKey={geminiKey}
            state={state}
          />
        )}
      </div>
    </div>
  );
}
