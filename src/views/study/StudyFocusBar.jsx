import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IconPlus, IconX } from '../../components/Icons.jsx';
import { FORM_GROUPS } from '../../data/conjugationTypes.js';

export function StudyFocusBar({
  allWords,
  sessionFilterWord,
  onWordChange,
  sessionFilterFormGroupId,
  onFormGroupChange,
}) {
  const [wordQuery, setWordQuery] = useState('');
  const [mode, setMode] = useState(null); // null | 'word' | 'form'
  const inputRef = useRef(null);

  useEffect(() => {
    if (mode === 'word') inputRef.current?.focus();
  }, [mode]);

  const searchResults = useMemo(() => {
    if (!wordQuery.trim()) return [];
    const q = wordQuery.trim().toLowerCase();
    return allWords
      .filter(
        (w) =>
          w.dict?.includes(wordQuery) ||
          w.reading?.includes(wordQuery) ||
          w.meaning?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [wordQuery, allWords]);

  const hasFilter = !!sessionFilterWord || !!sessionFilterFormGroupId;
  const activeFormGroup = sessionFilterFormGroupId
    ? FORM_GROUPS.find((g) => g.id === sessionFilterFormGroupId)
    : null;

  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Focus practice
        </span>
        {sessionFilterWord && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300">
            <span lang="ja">{sessionFilterWord.dict}</span>
            <span className="text-indigo-300 dark:text-indigo-600">·</span>
            <span>{sessionFilterWord.meaning}</span>
            <button
              onClick={() => {
                onWordChange(null);
                setWordQuery('');
              }}
              className="ml-0.5 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200"
              aria-label="Remove word filter"
            >
              <IconX className="w-3 h-3" />
            </button>
          </span>
        )}
        {activeFormGroup && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-xs text-violet-700 dark:text-violet-300">
            {activeFormGroup.label}
            <button
              onClick={() => onFormGroupChange(null)}
              className="ml-0.5 text-violet-400 hover:text-violet-600 dark:hover:text-violet-200"
              aria-label="Remove form filter"
            >
              <IconX className="w-3 h-3" />
            </button>
          </span>
        )}
        {!sessionFilterWord && (
          <button
            onClick={() => setMode(mode === 'word' ? null : 'word')}
            className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition ${
              mode === 'word'
                ? 'border-indigo-300 bg-indigo-50 text-indigo-600 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300'
                : 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-indigo-300 hover:text-indigo-600 dark:hover:border-indigo-700 dark:hover:text-indigo-300'
            }`}
          >
            <IconPlus className="h-3 w-3" />
            Word
          </button>
        )}
        {!sessionFilterFormGroupId && (
          <button
            onClick={() => setMode(mode === 'form' ? null : 'form')}
            className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition ${
              mode === 'form'
                ? 'border-violet-300 bg-violet-50 text-violet-600 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300'
                : 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-violet-300 hover:text-violet-600 dark:hover:border-violet-700 dark:hover:text-violet-300'
            }`}
          >
            <IconPlus className="h-3 w-3" />
            Form
          </button>
        )}
        {hasFilter && (
          <button
            onClick={() => {
              onWordChange(null);
              onFormGroupChange(null);
              setMode(null);
              setWordQuery('');
            }}
            className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition ml-auto"
          >
            Clear all
          </button>
        )}
        {!hasFilter && mode !== null && (
          <button
            onClick={() => setMode(null)}
            className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition ml-auto"
          >
            Cancel
          </button>
        )}
      </div>

      {mode === 'word' && (
        <div>
          <input
            ref={inputRef}
            type="text"
            value={wordQuery}
            onChange={(e) => setWordQuery(e.target.value)}
            placeholder="Search by word, reading, or meaning…"
            className="w-full rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-sm text-stone-800 dark:text-stone-200 placeholder-stone-400 outline-none focus:border-indigo-300 dark:focus:border-indigo-600"
          />
          {searchResults.length > 0 && (
            <div className="mt-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 divide-y divide-stone-100 dark:divide-stone-800 max-h-48 overflow-y-auto">
              {searchResults.map((word) => (
                <button
                  key={`${word.dict}-${word.group}`}
                  onClick={() => {
                    onWordChange(word);
                    setWordQuery('');
                    setMode(null);
                  }}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-stone-50 dark:hover:bg-stone-800 transition"
                >
                  <span lang="ja" className="font-medium text-stone-900 dark:text-stone-100">
                    {word.dict}
                  </span>
                  <span className="text-stone-400 text-xs" lang="ja">
                    {word.reading}
                  </span>
                  <span className="text-stone-500 text-xs ml-auto truncate max-w-[120px]">
                    {word.meaning}
                  </span>
                </button>
              ))}
            </div>
          )}
          {wordQuery.trim() && !searchResults.length && (
            <div className="mt-1 text-xs text-stone-400 px-1">No matches</div>
          )}
        </div>
      )}

      {mode === 'form' && (
        <div className="flex flex-wrap gap-1.5">
          {FORM_GROUPS.map((group) => (
            <button
              key={group.id}
              onClick={() => {
                onFormGroupChange(group.id);
                setMode(null);
              }}
              className="px-2.5 py-1 rounded-full border text-xs transition border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:hover:border-violet-700 dark:hover:bg-violet-950/20 dark:hover:text-violet-300"
            >
              {group.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
