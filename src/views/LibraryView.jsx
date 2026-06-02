import React, { useState } from 'react';
import ReferenceViewSub from './ReferenceViewSub.jsx';
import CustomDictionaryViewSub from './CustomDictionaryViewSub.jsx';
import { useTablist } from '../components/useTablist.js';
import { IconBook, IconPen } from '../components/Icons.jsx';
import { useApp } from '../state/AppStateContext.jsx';

const LIBRARY_SECTIONS = [
  {
    id: 'reference',
    label: 'Lookup',
    desc: 'Search a word or form, then launch practice.',
    Icon: IconBook,
  },
  {
    id: 'words',
    label: 'Words',
    desc: 'Add custom practice words.',
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
  const [subTab, setSubTab] = useState('reference');
  const { tabProps, panelProps } = useTablist(
    LIBRARY_SECTIONS.map((t) => t.id),
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
              Lookup and words for practice.
            </h2>
          </div>
          <div className="text-sm text-stone-550 dark:text-stone-400">Find, add, drill.</div>
        </div>

        <div role="tablist" aria-label="Library sections" className="mt-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-2">
            {LIBRARY_SECTIONS.map((section) => {
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
        </div>
      </section>

      <div {...panelProps(subTab)}>
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
        {subTab === 'words' && (
          <CustomDictionaryViewSub
            customVerbs={customVerbs}
            setCustomVerbs={setCustomVerbs}
            customAdjectives={customAdjectives}
            setCustomAdjectives={setCustomAdjectives}
            geminiKey={geminiKey}
            aiToolsEnabled={false}
            state={state}
          />
        )}
      </div>
    </div>
  );
}
