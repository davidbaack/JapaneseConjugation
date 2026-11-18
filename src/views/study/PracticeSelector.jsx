import React, { useRef, useState } from 'react';
import {
  PRACTICE_FORM_CHOICE_BY_ID,
  PRACTICE_FORM_SECTIONS,
} from '../../data/practiceFormChoices.js';
import { surfaceFormFor, typePreviewValues } from '../../utils/conjugator.js';
import { effectiveTypeIdsForPracticeSelection } from '../../utils/practiceSelection.js';

const TYPE_EXAMPLE_CACHE = new Map();

function examplesForType(typeId) {
  if (TYPE_EXAMPLE_CACHE.has(typeId)) return TYPE_EXAMPLE_CACHE.get(typeId);
  const examples = typePreviewValues(typeId).map(({ item, answer }) => ({
    source: item.dict,
    answer: surfaceFormFor(item, typeId) || answer,
    reading: answer,
  }));
  TYPE_EXAMPLE_CACHE.set(typeId, examples);
  return examples;
}

function matchesSearch(typeId, sectionLabel, terms) {
  const type = PRACTICE_FORM_CHOICE_BY_ID.get(typeId);
  const text = [
    type.choiceLabel,
    type.meaning,
    type.sub,
    sectionLabel,
    ...examplesForType(typeId).flatMap((example) => [
      example.source,
      example.answer,
      example.reading,
    ]),
  ]
    .join(' ')
    .toLocaleLowerCase();
  return terms.every((term) => text.includes(term));
}

function ExactFormChoice({ typeId, selected, onToggleType }) {
  const type = PRACTICE_FORM_CHOICE_BY_ID.get(typeId);
  const id = `practice-form-${typeId}`;
  return (
    <label
      htmlFor={id}
      className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo-500 ${
        selected
          ? 'border-indigo-300 bg-indigo-50/70 dark:border-indigo-700 dark:bg-indigo-950/30'
          : 'border-stone-200 bg-white hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-500'
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={selected}
        onChange={() => onToggleType(typeId)}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-meaning ${id}-examples`}
        className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600 dark:accent-indigo-400"
      />
      <span className="min-w-0 text-xs leading-relaxed">
        <span id={`${id}-label`} className="block font-semibold text-stone-900 dark:text-stone-100">
          {type.choiceLabel}
        </span>
        <span id={`${id}-meaning`} className="mt-0.5 block text-stone-600 dark:text-stone-400">
          {type.meaning}
        </span>
        <span
          id={`${id}-examples`}
          className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-stone-700 dark:text-stone-300"
        >
          {examplesForType(typeId).map((example) => (
            <span key={example.source} lang="ja">
              {example.source} → {example.answer}
            </span>
          ))}
        </span>
      </span>
    </label>
  );
}

export default function PracticeSelector({ selection, onToggleType, statusMessage = '' }) {
  const [showForms, setShowForms] = useState(false);
  const [query, setQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState([]);
  const [collapsedSearchSections, setCollapsedSearchSections] = useState([]);
  const chooserButtonRef = useRef(null);
  const activeTypeIds = effectiveTypeIdsForPracticeSelection(selection);
  const selected = new Set(activeTypeIds);
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const sections = showForms
    ? PRACTICE_FORM_SECTIONS.map((section) => ({
        ...section,
        visibleTypeIds: terms.length
          ? section.typeIds.filter((typeId) => matchesSearch(typeId, section.label, terms))
          : section.typeIds,
      })).filter((section) => section.visibleTypeIds.length)
    : [];

  function toggleChooser() {
    if (!showForms) {
      setQuery('');
      setCollapsedSearchSections([]);
      setExpandedSections(
        PRACTICE_FORM_SECTIONS.filter((section) =>
          section.typeIds.some((typeId) => selected.has(typeId)),
        ).map((section) => section.id),
      );
    }
    setShowForms((current) => !current);
  }

  function closeChooser() {
    setShowForms(false);
    chooserButtonRef.current?.focus();
  }

  return (
    <section
      aria-label="Practice selection"
      className="min-w-0 rounded-2xl border border-stone-200 bg-white px-3 py-3 shadow-sm shadow-stone-950/5 dark:border-stone-800 dark:bg-stone-900 sm:px-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
          Practicing {activeTypeIds.length} {activeTypeIds.length === 1 ? 'form' : 'forms'}
        </h2>
        <button
          ref={chooserButtonRef}
          type="button"
          onClick={toggleChooser}
          aria-expanded={showForms}
          aria-controls="practice-form-chooser"
          className="min-h-9 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          {showForms ? 'Hide form chooser' : 'Choose forms'}
        </button>
      </div>
      <p
        className="mt-1.5 text-xs leading-relaxed text-stone-600 dark:text-stone-400"
        data-testid="practice-form-summary"
      >
        {activeTypeIds
          .slice(0, 3)
          .map((typeId) => PRACTICE_FORM_CHOICE_BY_ID.get(typeId).choiceLabel)
          .join(' / ')}
        {activeTypeIds.length > 3 ? ` / and ${activeTypeIds.length - 3} more` : ''}
      </p>
      <div id="practice-form-chooser" hidden={!showForms}>
        {showForms ? (
          <>
            <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-700">
              <p className="mb-3 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
                Check the exact forms you want to practice. Changes apply immediately.
              </p>
              <label
                htmlFor="practice-form-search"
                className="text-xs font-semibold text-stone-800 dark:text-stone-200"
              >
                Find a form
              </label>
              <input
                id="practice-form-search"
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCollapsedSearchSections([]);
                }}
                placeholder="Try past, can, or たい"
                className="mt-1.5 block min-h-10 w-full min-w-0 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 placeholder:text-stone-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-400"
              />
            </div>
            <div className="mt-3 space-y-2">
              {sections.map((section) => {
                const open =
                  terms.length > 0
                    ? !collapsedSearchSections.includes(section.id)
                    : expandedSections.includes(section.id);
                const selectedCount = section.typeIds.filter((typeId) =>
                  selected.has(typeId),
                ).length;
                const sectionId = `practice-form-section-${section.id}`;
                return (
                  <div
                    key={section.id}
                    className="rounded-xl border border-stone-200 dark:border-stone-700"
                  >
                    <h3>
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={sectionId}
                        onClick={() => {
                          const update = (current) =>
                            current.includes(section.id)
                              ? current.filter((id) => id !== section.id)
                              : [...current, section.id];
                          if (terms.length) setCollapsedSearchSections(update);
                          else setExpandedSections(update);
                        }}
                        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-stone-200"
                      >
                        <span
                          aria-hidden="true"
                          className="w-3 shrink-0 text-stone-500 dark:text-stone-400"
                        >
                          {open ? '−' : '+'}
                        </span>
                        <span className="min-w-0 flex-1">{section.label}</span>{' '}
                        {selectedCount ? (
                          <span className="shrink-0 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
                            {selectedCount} selected
                          </span>
                        ) : null}
                      </button>
                    </h3>
                    <div id={sectionId} hidden={!open}>
                      {open ? (
                        <div className="grid gap-2 px-2 pb-2 md:grid-cols-2">
                          {section.visibleTypeIds.map((typeId) => (
                            <ExactFormChoice
                              key={typeId}
                              typeId={typeId}
                              selected={selected.has(typeId)}
                              onToggleType={onToggleType}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {!sections.length ? (
                <p role="status" className="py-3 text-xs text-stone-600 dark:text-stone-400">
                  No forms found. Try another name, meaning, or Japanese example.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={closeChooser}
              className="mt-3 min-h-10 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
            >
              Close form chooser
            </button>
          </>
        ) : null}
      </div>
      <p
        role="status"
        aria-live="polite"
        className={
          statusMessage
            ? 'mt-2 text-xs font-medium text-indigo-700 dark:text-indigo-300'
            : 'sr-only'
        }
      >
        {statusMessage}
      </p>
    </section>
  );
}
