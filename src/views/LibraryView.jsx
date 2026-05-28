import React, { useState } from 'react';
import ReferenceViewSub from './ReferenceViewSub.jsx';
import ListsViewSub from './ListsViewSub.jsx';
import CustomDictionaryViewSub from './CustomDictionaryViewSub.jsx';

export default function LibraryView({
  state,
  setState,
  verbs,
  adjectives,
  customVerbs,
  setCustomVerbs,
  customAdjectives,
  setCustomAdjectives,
  wordLists,
  setWordLists,
  practicePrefs,
  setPracticePrefs,
  geminiKey,
  setTab
}) {
  const [subTab, setSubTab] = useState('reference');

  return (
    <div className="space-y-4">
      {/* Sub-navigation bar */}
      <div className="flex border-b border-stone-200 dark:border-stone-800">
        {[
          { id: 'reference', label: 'Search & Reference', desc: 'Verb & adjective lookup' },
          { id: 'lists', label: 'Lists & Decks', desc: 'Custom groupings & Anki export' },
          { id: 'dictionary', label: 'Custom Dictionary', desc: 'Manage custom verbs & adjectives' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex-1 pb-3 text-center border-b-2 transition ${
              subTab === t.id
                ? 'border-indigo-600 text-indigo-600 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            <div className="text-sm">{t.label}</div>
            <div className="text-xs text-stone-450 dark:text-stone-500 font-normal hidden sm:block">{t.desc}</div>
          </button>
        ))}
      </div>

      <div className="mt-4">
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
