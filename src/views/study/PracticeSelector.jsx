import React from 'react';
import { ALL_CARD_TYPES } from '../../data/conjugationTypes.js';
import { PRACTICE_CATEGORIES, PRACTICE_FILTERS } from '../../data/practiceTaxonomy.js';
import {
  effectiveTypeIdsForPracticeSelection,
  normalizePracticeSelection,
  selectedPracticeCategories,
} from '../../utils/practiceSelection.js';

const TYPE_BY_ID = new Map(ALL_CARD_TYPES.map((type) => [type.id, type]));

function CategoryButton({ category, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-12 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.98] ${
        active
          ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-950/15 dark:border-indigo-400 dark:bg-indigo-500 dark:text-stone-950'
          : 'border-stone-200 bg-white text-stone-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-200'
      }`}
    >
      <span className="block text-sm font-semibold leading-tight">{category.label}</span>
      <span
        className={`mt-1 block text-[11px] leading-snug ${
          active ? 'text-indigo-100 dark:text-indigo-950' : 'text-stone-500 dark:text-stone-400'
        }`}
      >
        {category.description}
      </span>
    </button>
  );
}

function FilterGroup({ filter, selected, onSelect }) {
  return (
    <div role="radiogroup" aria-label={filter.label} className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
        {filter.label}
      </div>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-stone-200 bg-stone-50 p-1 dark:border-stone-800 dark:bg-stone-950">
        {filter.options.map((option) => {
          const active = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              onClick={() => onSelect(option.id)}
              aria-checked={active}
              className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? 'bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-950'
                  : 'text-stone-600 hover:bg-white dark:text-stone-400 dark:hover:bg-stone-900'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExactFormRefinement({ categories, selection, onToggleType }) {
  return (
    <details className="rounded-xl border border-stone-200 bg-white/80 dark:border-stone-800 dark:bg-stone-950/45">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-stone-700 dark:text-stone-200">
        <span>Refine exact forms</span>
        <span className="text-xs font-medium text-stone-500">Optional</span>
      </summary>
      <div className="space-y-4 border-t border-stone-100 px-3 py-4 dark:border-stone-800">
        {categories.map((category) => {
          const selected = new Set(
            selection.selectedTypeIdsByCategory[category.id] || category.typeIds,
          );
          return (
            <section key={category.id} aria-labelledby={`practice-category-forms-${category.id}`}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3
                  id={`practice-category-forms-${category.id}`}
                  className="text-xs font-semibold text-stone-700 dark:text-stone-200"
                >
                  {category.label}
                </h3>
                <span className="text-[11px] text-stone-500">
                  {selected.size} of {category.typeIds.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {category.typeIds.map((typeId) => {
                  const type = TYPE_BY_ID.get(typeId);
                  const active = selected.has(typeId);
                  return (
                    <button
                      key={typeId}
                      type="button"
                      onClick={() => onToggleType(typeId)}
                      aria-pressed={active}
                      className={`min-h-9 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                        active
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200'
                          : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400'
                      }`}
                    >
                      {type?.label || typeId}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </details>
  );
}

export default function PracticeSelector({
  selection,
  onToggleCategory,
  onSetFilter,
  onToggleType,
  statusMessage = '',
}) {
  const normalized = normalizePracticeSelection(selection);
  const selectedCategories = selectedPracticeCategories(normalized);
  const activeTypeCount = effectiveTypeIdsForPracticeSelection(normalized).length;
  const categorySummary =
    selectedCategories.length <= 2
      ? selectedCategories.map((category) => category.label).join(' + ')
      : `${selectedCategories.length} categories`;
  const activeFilterLabels = PRACTICE_FILTERS.flatMap((filter) => {
    const selected = normalized.filters[filter.id];
    if (selected === 'all') return [];
    return filter.options.find((option) => option.id === selected)?.label || [];
  });
  const selectionSummary = [categorySummary, ...activeFilterLabels].filter(Boolean).join(' · ');

  return (
    <section
      aria-label="Practice selection"
      className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm shadow-stone-950/5 dark:border-stone-800 dark:bg-stone-900"
    >
      <details>
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">
                Practice
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-200">
                {activeTypeCount} forms
              </span>
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
              {selectionSummary}
            </div>
          </div>
          <span className="shrink-0 rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 dark:border-stone-700 dark:text-stone-200">
            Change
          </span>
        </summary>

        <div className="border-t border-stone-100 bg-[linear-gradient(135deg,rgba(250,250,249,0.98),rgba(238,242,255,0.55))] px-4 py-5 dark:border-stone-800 dark:bg-[linear-gradient(135deg,rgba(28,25,23,0.98),rgba(30,27,75,0.2))] sm:px-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              Categories
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-stone-950 dark:text-stone-50">
              Choose what you want to practice.
            </h2>
            <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
              Turn categories on or off. Your next card updates immediately.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PRACTICE_CATEGORIES.map((category) => (
                <CategoryButton
                  key={category.id}
                  category={category}
                  active={normalized.selectedCategoryIds.includes(category.id)}
                  onClick={() => onToggleCategory(category.id)}
                />
              ))}
            </div>
          </div>

          <div className="mt-5 border-t border-stone-200 pt-5 dark:border-stone-800">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              Quick filters
            </div>
            <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
              A specific filter shows only exact forms with that distinction.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {PRACTICE_FILTERS.map((filter) => (
                <FilterGroup
                  key={filter.id}
                  filter={filter}
                  selected={normalized.filters[filter.id]}
                  onSelect={(value) => onSetFilter(filter.id, value)}
                />
              ))}
            </div>
          </div>

          <div className="mt-5">
            <ExactFormRefinement
              categories={selectedCategories}
              selection={normalized}
              onToggleType={onToggleType}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5 dark:border-indigo-900 dark:bg-indigo-950/25">
            <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-100">
              {activeTypeCount} matching forms
            </span>
            <span className="text-[11px] text-indigo-700 dark:text-indigo-300">
              Selection saves automatically
            </span>
          </div>

          {statusMessage && (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 text-xs font-medium text-indigo-700 dark:text-indigo-300"
            >
              {statusMessage}
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
