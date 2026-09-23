import React, { useState } from 'react';
import HorizontalChoiceRail from '../../components/HorizontalChoiceRail.jsx';
import { ALL_CARD_TYPES } from '../../data/conjugationTypes.js';
import { PRACTICE_CATEGORIES, PRACTICE_FILTERS } from '../../data/practiceTaxonomy.js';
import { surfaceFormFor, typePreviewValues } from '../../utils/conjugator.js';
import {
  effectiveTypeIdsForPracticeSelection,
  matchingPracticeTypeIdsForCategory,
  normalizePracticeSelection,
  practiceFilterConflictsForType,
} from '../../utils/practiceSelection.js';

const TYPE_BY_ID = new Map(ALL_CARD_TYPES.map((type) => [type.id, type]));
const TYPE_EXAMPLE_CACHE = new Map();

function categoryPreviewText(category) {
  return category.previewParts.map((part) => `${part.pattern} ${part.meaning}`).join(', ');
}

function examplesForType(typeId) {
  if (TYPE_EXAMPLE_CACHE.has(typeId)) return TYPE_EXAMPLE_CACHE.get(typeId);
  const examples = typePreviewValues(typeId).map(({ item, answer }) => ({
    source: item.dict,
    answer: surfaceFormFor(item, typeId) || answer,
  }));
  TYPE_EXAMPLE_CACHE.set(typeId, examples);
  return examples;
}

function CategoryPreview({ parts }) {
  return (
    <span className="flex items-center gap-1.5">
      {parts.map((part, index) => (
        <React.Fragment key={`${part.pattern}-${part.meaning}`}>
          {index > 0 ? <span>·</span> : null}
          <span>
            <span lang="ja" className="font-semibold">
              {part.pattern}
            </span>{' '}
            <span>{part.meaning}</span>
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}

function CategoryButton({ category, active, matchingCount, onClick }) {
  const totalCount = category.typeIds.length;
  const previewText = categoryPreviewText(category);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={category.label}
      aria-description={`${category.description} ${matchingCount} of ${totalCount} forms match the current filters. ${previewText}.`}
      title={`${category.description} ${previewText}.`}
      className={`min-h-14 shrink-0 whitespace-nowrap rounded-xl border px-3 py-2 text-left transition active:scale-[0.98] ${
        active
          ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-950/15 dark:border-indigo-400 dark:bg-indigo-500 dark:text-stone-950'
          : 'border-stone-200 bg-white text-stone-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-200'
      }`}
    >
      <span className="flex items-center justify-between gap-3 text-[11px] font-semibold">
        <span>{category.label}</span>
        <span
          aria-hidden="true"
          className={`rounded-full px-1.5 py-0.5 text-[9px] tabular-nums ${
            active
              ? 'bg-white/18 text-white dark:bg-stone-950/15 dark:text-stone-950'
              : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200'
          }`}
        >
          {matchingCount}/{totalCount}
        </span>
      </span>
      <span aria-hidden="true" className="mt-1 block text-[9px] leading-none">
        <CategoryPreview parts={category.previewParts} />
      </span>
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

function ExactFormButton({ typeId, categoryId, categoryActive, selection, onToggleType }) {
  const type = TYPE_BY_ID.get(typeId);
  const storedSelected = selection.selectedTypeIdsByCategory[categoryId]?.includes(typeId);
  const selected = categoryActive && storedSelected;
  const conflicts = practiceFilterConflictsForType(typeId, selection.filters);
  const filteredOut = selected && conflicts.length > 0;
  const examples = examplesForType(typeId);
  const details = [...new Set([type?.sub, type?.hint].filter(Boolean))];
  const filterText = conflicts.map((conflict) => conflict.valueLabel).join(' + ');
  const exampleText = examples.map((example) => `${example.source} → ${example.answer}`).join(', ');

  return (
    <button
      type="button"
      onClick={() => onToggleType(typeId)}
      aria-pressed={selected}
      aria-label={type?.label || typeId}
      aria-description={`${details.join('. ')}. ${exampleText}.${
        conflicts.length ? ` Excluded by ${filterText}.` : ''
      }`}
      className={`min-h-20 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${
        filteredOut
          ? 'border-amber-300 bg-amber-50/80 text-amber-950 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100'
          : selected
            ? 'border-indigo-300 bg-indigo-50 text-indigo-950 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-100'
            : 'border-stone-200 bg-white text-stone-700 hover:border-indigo-300 hover:bg-indigo-50/60 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/20'
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold">{type?.label || typeId}</span>
        {filteredOut ? (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
            Filtered
          </span>
        ) : selected ? (
          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200">
            On
          </span>
        ) : conflicts.length ? (
          <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
            {filterText}
          </span>
        ) : null}
      </span>
      {details.length ? (
        <span className="mt-1 block text-[10px] text-stone-500 dark:text-stone-400">
          {details.map((detail, index) => (
            <React.Fragment key={detail}>
              {index > 0 ? ' · ' : null}
              <span lang={/[ぁ-んァ-ン一-龯]/.test(detail) ? 'ja' : undefined}>{detail}</span>
            </React.Fragment>
          ))}
        </span>
      ) : null}
      <span className="mt-1.5 block text-[10px] font-medium text-stone-700 dark:text-stone-300">
        {examples.map((example, index) => (
          <React.Fragment key={`${example.source}-${example.answer}`}>
            {index > 0 ? <span className="mx-1 text-stone-300 dark:text-stone-700">·</span> : null}
            <span lang="ja">
              {example.source} → {example.answer}
            </span>
          </React.Fragment>
        ))}
      </span>
    </button>
  );
}

function ExactFormRefinement({ selection, categoryMatchCounts, onToggleCategory, onToggleType }) {
  const [expandedCategoryIds, setExpandedCategoryIds] = useState(() => new Set());

  function toggleExpanded(categoryId) {
    setExpandedCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  return (
    <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50/80 p-2 dark:border-stone-800 dark:bg-stone-950/45">
      <div className="px-1 pb-2">
        <h2 className="text-xs font-semibold text-stone-800 dark:text-stone-100">Exact forms</h2>
        <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500 dark:text-stone-400">
          Open any category to see its endings, meaning, and example conjugations.
        </p>
      </div>
      <div className="space-y-1.5">
        {PRACTICE_CATEGORIES.map((category) => {
          const active = selection.selectedCategoryIds.includes(category.id);
          const expanded = expandedCategoryIds.has(category.id);
          const matchingCount = categoryMatchCounts.get(category.id) || 0;
          const contentId = `practice-category-forms-${category.id}`;
          return (
            <section
              key={category.id}
              aria-labelledby={`practice-category-heading-${category.id}`}
              className="overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => toggleExpanded(category.id)}
                  aria-expanded={expanded}
                  aria-controls={contentId}
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${category.label} forms`}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left transition hover:bg-stone-50 dark:hover:bg-stone-800/60"
                >
                  <span
                    aria-hidden="true"
                    className={`text-sm text-stone-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
                  >
                    ›
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      id={`practice-category-heading-${category.id}`}
                      className="flex items-center gap-2 text-xs font-semibold text-stone-800 dark:text-stone-100"
                    >
                      {category.label}
                      <span className="text-[9px] font-medium tabular-nums text-stone-500 dark:text-stone-400">
                        {matchingCount}/{category.typeIds.length}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-stone-500 dark:text-stone-400">
                      {category.description}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleCategory(category.id)}
                  aria-pressed={active}
                  aria-label={`${category.label} category`}
                  className={`m-1.5 min-w-12 rounded-md border px-2 text-[10px] font-semibold transition ${
                    active
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200'
                      : 'border-stone-200 bg-stone-50 text-stone-500 hover:border-indigo-300 hover:text-indigo-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-400 dark:hover:border-indigo-700 dark:hover:text-indigo-200'
                  }`}
                >
                  {active ? 'On' : 'Off'}
                </button>
              </div>
              {expanded ? (
                <div
                  id={contentId}
                  className="grid gap-2 border-t border-stone-100 bg-stone-50/60 p-2 md:grid-cols-2 dark:border-stone-800 dark:bg-stone-950/25"
                >
                  {category.typeIds.map((typeId) => (
                    <ExactFormButton
                      key={typeId}
                      typeId={typeId}
                      categoryId={category.id}
                      categoryActive={active}
                      selection={selection}
                      onToggleType={onToggleType}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
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
  const activeTypeCount = effectiveTypeIdsForPracticeSelection(normalized).length;
  const categoryMatchCounts = new Map(
    PRACTICE_CATEGORIES.map((category) => [
      category.id,
      matchingPracticeTypeIdsForCategory(normalized, category.id).length,
    ]),
  );
  const categoryButtons = PRACTICE_CATEGORIES.map((category) => (
    <CategoryButton
      key={category.id}
      category={category}
      active={normalized.selectedCategoryIds.includes(category.id)}
      matchingCount={categoryMatchCounts.get(category.id) || 0}
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
            See all forms
          </button>
        </div>
      </div>

      <HorizontalChoiceRail
        ariaLabel="Practice categories"
        testId="practice-category-rail"
        wrapperClassName="mt-2"
        className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:auto-cols-max lg:grid-flow-col lg:grid-rows-2"
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

      {showExactForms ? (
        <div id="practice-exact-form-refinement">
          <ExactFormRefinement
            selection={normalized}
            categoryMatchCounts={categoryMatchCounts}
            onToggleCategory={onToggleCategory}
            onToggleType={onToggleType}
          />
        </div>
      ) : null}

      {statusMessage ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-xs font-medium text-indigo-700 dark:text-indigo-300"
        >
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
