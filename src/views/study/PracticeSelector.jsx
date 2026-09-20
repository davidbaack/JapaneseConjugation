import React from 'react';
import { ALL_CARD_TYPES, FORM_GROUPS } from '../../data/conjugationTypes.js';
import {
  FEATURED_PRACTICE_TOPIC_IDS,
  PRACTICE_TOPIC_SECTIONS,
  effectiveTypeIdsForPracticeSelection,
  normalizePracticeSelection,
  selectedPracticeTopics,
} from '../../utils/practiceSelection.js';

const TYPE_BY_ID = new Map(ALL_CARD_TYPES.map((type) => [type.id, type]));
const TOPIC_BY_ID = new Map(FORM_GROUPS.map((topic) => [topic.id, topic]));

function TopicButton({ topic, active, muted = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition active:scale-[0.98] ${
        active
          ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-950/15 dark:border-indigo-400 dark:bg-indigo-500 dark:text-stone-950'
          : muted
            ? 'border-stone-200 bg-stone-50 text-stone-500 hover:border-stone-300 hover:bg-white dark:border-stone-800 dark:bg-stone-950 dark:text-stone-400 dark:hover:border-stone-700'
            : 'border-stone-200 bg-white text-stone-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-200'
      }`}
    >
      {topic.label}
    </button>
  );
}

function TopicRefinement({ topic, selection, onToggleType }) {
  const selected = new Set(selection.selectedTypeIdsByTopic[topic.id] || topic.typeIds);
  if (topic.typeIds.length <= 1) return null;
  return (
    <details className="mt-2 rounded-xl border border-stone-200 bg-white/70 dark:border-stone-800 dark:bg-stone-950/40">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
        Refine forms · {selected.size} of {topic.typeIds.length}
      </summary>
      <div className="flex flex-wrap gap-1.5 border-t border-stone-100 px-3 py-3 dark:border-stone-800">
        {topic.typeIds.map((typeId) => {
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
    </details>
  );
}

export default function PracticeSelector({
  selection,
  onToggleMixed,
  onToggleTopic,
  onToggleType,
  statusMessage = '',
}) {
  const normalized = normalizePracticeSelection(selection);
  const selectedTopics = selectedPracticeTopics(normalized);
  const selectedTopicIds = new Set(normalized.selectedTopicIds);
  const activeTypeCount = effectiveTypeIdsForPracticeSelection(normalized).length;

  return (
    <section
      aria-labelledby="practice-selection-heading"
      className="overflow-hidden rounded-2xl border border-stone-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(238,242,255,0.72))] shadow-sm shadow-stone-950/5 dark:border-stone-800 dark:bg-[linear-gradient(135deg,rgba(28,25,23,0.98),rgba(30,27,75,0.24))]"
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">
              Practice selection
            </div>
            <h2
              id="practice-selection-heading"
              className="mt-1 text-xl font-semibold tracking-tight text-stone-950 dark:text-stone-50"
            >
              What do you want to practice?
            </h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
              Change topics any time. Practice updates immediately and keeps cycling through
              different words.
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleMixed}
            aria-pressed={normalized.mixed}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition active:scale-[0.98] ${
              normalized.mixed
                ? 'border-stone-900 bg-stone-900 text-white shadow-sm dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950'
                : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800'
            }`}
          >
            Mixed practice {normalized.mixed ? 'on' : 'off'}
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-white/80 bg-white/70 p-3 dark:border-stone-800 dark:bg-stone-950/45">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-stone-600 dark:text-stone-300">
              {normalized.mixed ? 'Mixed practice' : 'Practicing'}
            </span>
            {normalized.mixed ? (
              <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white dark:bg-stone-100 dark:text-stone-950">
                Broad mix · {activeTypeCount} forms
              </span>
            ) : (
              selectedTopics.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => onToggleTopic(topic.id)}
                  aria-label={`Remove ${topic.label} from practice`}
                  className="min-h-8 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:border-rose-800 dark:hover:bg-rose-950/30 dark:hover:text-rose-200"
                >
                  {topic.label} <span aria-hidden="true">×</span>
                </button>
              ))
            )}
          </div>
          {normalized.mixed && (
            <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
              Your custom mix is saved: {selectedTopics.map((topic) => topic.label).join(', ')}.
              Turn Mixed practice off to restore it.
            </p>
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
        </div>

        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
            Quick picks
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FEATURED_PRACTICE_TOPIC_IDS.map((topicId) => {
              const topic = TOPIC_BY_ID.get(topicId);
              if (!topic) return null;
              return (
                <TopicButton
                  key={topic.id}
                  topic={topic}
                  active={!normalized.mixed && selectedTopicIds.has(topic.id)}
                  muted={normalized.mixed}
                  onClick={() => onToggleTopic(topic.id)}
                />
              );
            })}
          </div>
        </div>

        <details className="mt-4 rounded-xl border border-stone-200 bg-white/75 dark:border-stone-800 dark:bg-stone-950/45">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-stone-700 dark:text-stone-200">
            <span>Browse all practice topics</span>
            <span className="text-xs font-medium text-stone-500">{FORM_GROUPS.length} topics</span>
          </summary>
          <div className="space-y-5 border-t border-stone-100 px-3 py-4 dark:border-stone-800">
            {PRACTICE_TOPIC_SECTIONS.map((section) => (
              <section key={section.id} aria-labelledby={`practice-topic-section-${section.id}`}>
                <h3
                  id={`practice-topic-section-${section.id}`}
                  className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500"
                >
                  {section.label}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {section.topicIds.map((topicId) => {
                    const topic = TOPIC_BY_ID.get(topicId);
                    if (!topic) return null;
                    const active = !normalized.mixed && selectedTopicIds.has(topic.id);
                    return (
                      <div key={topic.id}>
                        <TopicButton
                          topic={topic}
                          active={active}
                          muted={normalized.mixed}
                          onClick={() => onToggleTopic(topic.id)}
                        />
                        {active && (
                          <TopicRefinement
                            topic={topic}
                            selection={normalized}
                            onToggleType={onToggleType}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}
