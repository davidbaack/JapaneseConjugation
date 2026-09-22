import React, { useState } from 'react';
import HorizontalChoiceRail from '../../components/HorizontalChoiceRail.jsx';
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
      aria-label={category.label}
      aria-description={category.description}
      title={category.description}
      className={`min-h-9 shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition active:scale-[0.98] ${
        active
          ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-950/15 dark:border-indigo-400 dark:bg-indigo-500 dark:text-stone-950'
          : 'border-stone-200 bg-white text-stone-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-200'
      }`}
    >
      {category.label}
    </button>
  );
}

function FilterGroup({ filter, selected, onSelect }) {
  return (
    <div
      role="radiogroup"
      aria-label={filter.label}
      className="inline-flex min-h-8 shrink-0 items-center gap-0.5 rounded-lg border border-stone-200 bg-stone-50 p-0.5 dark:border-stone-800 dark:bg-stone-950"
    >
      <div className="border-r border-stone-200 px-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-stone-500 dark:border-stone-800">
        {filter.label}
      </div>
      {filter.options.map((option) => {
        const active = selected === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            onClick={() => onSelect(option.id)}
            aria-checked={active}
            className={`min-h-7 rounded-md px-2 py-1 text-[10px] font-semibold transition ${
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
  );
}

function ExactFormRefinement({ categories, selection, onToggleType }) {
  return (
    <div className="mt-2 space-y-4 rounded-xl border border-stone-200 bg-white/80 px-3 py-3 dark:border-stone-800 dark:bg-stone-950/45">
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
  );
}

export default function PracticeSelector({
  selection,
  onToggleCategory,
  onSetFilter,
  onToggleType,
  statusMessage = '',
}) {
  const [showExactForms, setShowExactForms] = useState(false);
  const normalized = normalizePracticeSelection(selection);
  const selectedCategories = selectedPracticeCategories(normalized);
  const activeTypeCount = effectiveTypeIdsForPracticeSelection(normalized).length;
  const categoryButtons = PRACTICE_CATEGORIES.map((category) => (
    <CategoryButton
      key={category.id}
      category={category}
      active={normalized.selectedCategoryIds.includes(category.id)}
      onClick={() => onToggleCategory(category.id)}
    />
  ));
  const filterGroups = PRACTICE_FILTERS.map((filter) => (
    <FilterGroup
      key={filter.id}
      filter={filter}
      selected={normalized.filters[filter.id]}
      onSelect={(value) => onSetFilter(filter.id, value)}
    />
  ));

  return (
    <section
      aria-label="Practice selection"
      className="rounded-2xl border border-stone-200 bg-white px-3 py-2.5 shadow-sm shadow-stone-950/5 dark:border-stone-800 dark:bg-stone-900 sm:px-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">
          Practice categories
        </span>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-200">
            {activeTypeCount} forms
          </span>
          <button
            type="button"
            onClick={() => setShowExactForms((current) => !current)}
            aria-expanded={showExactForms}
            aria-controls="practice-exact-form-refinement"
            className="min-h-7 rounded-lg border border-stone-200 px-2 py-1 text-[10px] font-semibold text-stone-600 transition hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Refine
            <span className="sr-only"> exact forms</span>
          </button>
        </div>
      </div>

      <HorizontalChoiceRail
        ariaLabel="Practice categories"
        testId="practice-category-rail"
        wrapperClassName="mt-2"
        className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:auto-cols-max lg:grid-flow-col lg:grid-rows-2"
      >
        {categoryButtons}
      </HorizontalChoiceRail>

      <div className="mt-2 border-t border-stone-100 pt-2 dark:border-stone-800">
        <HorizontalChoiceRail
          ariaLabel="Practice quick filters"
          testId="practice-filter-rail"
          className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:justify-between"
        >
          {filterGroups}
        </HorizontalChoiceRail>
      </div>

      {showExactForms && (
        <div id="practice-exact-form-refinement">
          <ExactFormRefinement
            categories={selectedCategories}
            selection={normalized}
            onToggleType={onToggleType}
          />
        </div>
      )}

      {statusMessage && (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-xs font-medium text-indigo-700 dark:text-indigo-300"
        >
          {statusMessage}
        </p>
      )}
    </section>
  );
}
