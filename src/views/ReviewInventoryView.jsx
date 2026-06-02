import React, { useMemo, useState } from 'react';
import { FORM_GROUPS } from '../data/conjugationTypes.js';
import { useApp } from '../state/AppStateContext.jsx';
import { compatibleTypes, getWordMeta, wordKey } from '../utils/conjugator.js';
import {
  excludeFormFamilyFromReviewState,
  excludeWordFromReviewState,
  includeFormFamilyInReviewState,
  includeWordInReviewState,
  isFormFamilyExcludedFromReview,
  isWordExcludedFromReview,
} from '../utils/reviewScope.js';

function lessonLabel(word) {
  const meta = getWordMeta(word);
  const labels = [
    meta.lesson ? `Genki ${meta.lesson}` : '',
    meta.minnaLesson ? `Minna ${meta.minnaLesson}` : '',
    meta.jlpt || '',
  ].filter(Boolean);
  return labels.join(' / ') || 'Custom';
}

function wordRank(word) {
  const meta = getWordMeta(word);
  const genki = Number(meta.lesson || 999);
  const minna = Number(meta.minnaLesson || 999);
  const jlptRank = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 }[meta.jlpt] ?? 9;
  return Math.min(genki, minna) * 100 + jlptRank * 10 + wordKey(word).length;
}

export default function ReviewInventoryView() {
  const { state, setState, allWords, practiceWord } = useApp();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const sortedWords = useMemo(
    () =>
      [...(allWords || [])]
        .sort((a, b) => wordRank(a) - wordRank(b) || wordKey(a).localeCompare(wordKey(b)))
        .filter((word) => {
          if (!q) return true;
          return (
            word.dict?.includes(query) ||
            word.reading?.includes(query) ||
            word.meaning?.toLowerCase().includes(q)
          );
        })
        .slice(0, 80),
    [allWords, q, query],
  );

  function toggleWord(word) {
    setState((prev) =>
      isWordExcludedFromReview(prev, word)
        ? includeWordInReviewState(prev, word)
        : excludeWordFromReviewState(prev, word),
    );
  }

  function toggleFamily(family) {
    setState((prev) => {
      const restored = isFormFamilyExcludedFromReview(prev, family.id)
        ? includeFormFamilyInReviewState(prev, family.id)
        : excludeFormFamilyFromReviewState(prev, family.id);
      if (isFormFamilyExcludedFromReview(prev, family.id)) {
        return {
          ...restored,
          enabledTypes: [...new Set([...(restored.enabledTypes || []), ...family.typeIds])],
        };
      }
      return restored;
    });
  }

  function reviewWord(word) {
    const type = compatibleTypes(word).find(
      (item) => !['plain-present', 'adj-plain-present'].includes(item.id),
    )?.id;
    practiceWord(word, type, { source: 'library', launchMode: 'inventory' });
  }

  const excludedWords = state.reviewScope?.excludedWordKeys?.length || 0;
  const excludedFamilies = state.reviewScope?.excludedFormFamilyIds?.length || 0;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              Review inventory
            </div>
            <h3 className="mt-1 text-lg font-semibold text-stone-950 dark:text-stone-50">
              Words and form families in automatic Reviews.
            </h3>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-stone-600 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300">
              {excludedWords} words off
            </span>
            <span className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-stone-600 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300">
              {excludedFamilies} families off
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Form families
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              These controls are the same durable switches Reviews uses.
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {FORM_GROUPS.map((family) => {
            const excluded = isFormFamilyExcludedFromReview(state, family.id);
            return (
              <div
                key={family.id}
                className={`rounded-xl border px-3 py-3 ${
                  excluded
                    ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/20'
                    : 'border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-950'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      {family.label}
                    </div>
                    <div className="mt-0.5 text-xs text-stone-500">
                      {family.typeIds.length} card types
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFamily(family)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      excluded
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800'
                    }`}
                  >
                    {excluded ? 'Restore' : 'Remove'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Words</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Textbook order uses the earliest Genki or Minna lesson.
            </p>
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search words..."
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 dark:border-stone-800 dark:bg-stone-950"
          />
        </div>
        <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
          {sortedWords.map((word) => {
            const excluded = isWordExcludedFromReview(state, word);
            return (
              <div
                key={wordKey(word)}
                className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-stone-900 dark:text-stone-100" lang="ja">
                      {word.dict}
                    </span>
                    <span className="text-sm text-stone-500" lang="ja">
                      {word.reading}
                    </span>
                    {excluded && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                        excluded
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-stone-500">
                    {word.meaning} / {lessonLabel(word)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => reviewWord(word)}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300"
                  >
                    Review now
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleWord(word)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      excluded
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300'
                    }`}
                  >
                    {excluded ? 'Restore' : 'Remove'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
