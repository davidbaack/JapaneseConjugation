import React from 'react';
import { ALL_CARD_TYPES, FORM_GROUPS } from '../../data/conjugationTypes.js';
import { LESSON_SECTIONS } from '../../data/lessonContent.js';

export const FAMILY_INTRO_REVIEW_LIMIT_SOURCE = 'intro-family';
const FAMILY_INTRO_TYPE_LIMIT = 4;

const WEAKNESS_ROW_TONE = {
  strong: 'bg-emerald-500',
  developing: 'bg-amber-500',
  weak: 'bg-rose-500',
};

const LEARNER_STATE_TONE = {
  'not-introduced':
    'border-stone-200 bg-white text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300',
  learning:
    'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300',
  'needs-review':
    'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300',
  reliable:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
};

export const LESSON_BY_GROUP_ID = new Map(
  LESSON_SECTIONS.map((lesson) => [lesson.groupId, lesson]),
);
export const CARD_TYPE_BY_ID = new Map(ALL_CARD_TYPES.map((type) => [type.id, type]));

function isPolitePracticeType(type) {
  return (
    String(type?.id || '').includes('polite') ||
    /\bPolite\b/.test(type?.label || '') ||
    type?.id === 'request-kudasai' ||
    type?.id === 'negative-request'
  );
}

function isNegativePracticeType(type) {
  return (
    String(type?.id || '').includes('negative') ||
    /\bNegative\b/.test(type?.label || '') ||
    type?.id === 'prohibition'
  );
}

function isPastPracticeType(type) {
  return String(type?.id || '').includes('past') || /\bPast\b/.test(type?.label || '');
}

const POLITE_TYPE_IDS = ALL_CARD_TYPES.filter(isPolitePracticeType).map((type) => type.id);
const PLAIN_TYPE_IDS = ALL_CARD_TYPES.filter((type) => !isPolitePracticeType(type)).map(
  (type) => type.id,
);
const NEGATIVE_TYPE_IDS = ALL_CARD_TYPES.filter(isNegativePracticeType).map((type) => type.id);
const AFFIRMATIVE_TYPE_IDS = ALL_CARD_TYPES.filter((type) => !isNegativePracticeType(type)).map(
  (type) => type.id,
);
const PAST_TYPE_IDS = ALL_CARD_TYPES.filter(isPastPracticeType).map((type) => type.id);
const NON_PAST_TYPE_IDS = ALL_CARD_TYPES.filter((type) => !isPastPracticeType(type)).map(
  (type) => type.id,
);

export const PRACTICE_FORM_FILTER_GROUPS = [
  {
    id: 'register',
    label: 'Register',
    options: [
      {
        id: 'plain',
        label: 'Plain',
        typeIds: PLAIN_TYPE_IDS,
      },
      {
        id: 'polite',
        label: 'Polite',
        typeIds: POLITE_TYPE_IDS,
      },
    ],
  },
  {
    id: 'polarity',
    label: 'Polarity',
    options: [
      {
        id: 'affirmative',
        label: 'Affirmative',
        typeIds: AFFIRMATIVE_TYPE_IDS,
      },
      {
        id: 'negative',
        label: 'Negative',
        typeIds: NEGATIVE_TYPE_IDS,
      },
    ],
  },
  {
    id: 'tense',
    label: 'Time',
    options: [
      {
        id: 'past',
        label: 'Past',
        typeIds: PAST_TYPE_IDS,
      },
      {
        id: 'non-past',
        label: 'Non-past',
        typeIds: NON_PAST_TYPE_IDS,
      },
    ],
  },
];

const PRACTICE_FORM_FILTERS = PRACTICE_FORM_FILTER_GROUPS.flatMap((group) =>
  group.options.map((option) => ({ ...option, groupId: group.id })),
);
const PRACTICE_FORM_FILTER_BY_ID = new Map(
  PRACTICE_FORM_FILTERS.map((option) => [option.id, option]),
);

function optionMatchesType(optionId, type) {
  switch (optionId) {
    case 'plain':
      return !isPolitePracticeType(type);
    case 'polite':
      return isPolitePracticeType(type);
    case 'affirmative':
      return !isNegativePracticeType(type);
    case 'negative':
      return isNegativePracticeType(type);
    case 'past':
      return isPastPracticeType(type);
    case 'non-past':
      return !isPastPracticeType(type);
    default:
      return false;
  }
}

function selectedPracticeDimensions(enabledTypeIds = []) {
  const enabled = new Set((enabledTypeIds || []).filter((typeId) => CARD_TYPE_BY_ID.has(typeId)));
  return new Map(
    PRACTICE_FORM_FILTER_GROUPS.map((group) => {
      const selected = group.options
        .filter((option) => option.typeIds.some((typeId) => enabled.has(typeId)))
        .map((option) => option.id);
      return [group.id, selected.length ? selected : group.options.map((option) => option.id)];
    }),
  );
}

function typeMatchesDimensionSelection(type, selections) {
  return PRACTICE_FORM_FILTER_GROUPS.every((group) => {
    const selected = selections.get(group.id) || group.options.map((option) => option.id);
    return selected.some((optionId) => optionMatchesType(optionId, type));
  });
}

function typeIdsForDimensionSelection(
  selections,
  sourceTypeIds = ALL_CARD_TYPES.map((type) => type.id),
) {
  return sourceTypeIds.filter((typeId) => {
    const type = CARD_TYPE_BY_ID.get(typeId);
    return type && typeMatchesDimensionSelection(type, selections);
  });
}

function activeFamilyTypeIdsFor(enabledTypeIds = []) {
  const enabled = new Set((enabledTypeIds || []).filter((typeId) => CARD_TYPE_BY_ID.has(typeId)));
  const familyTypeIds = FORM_GROUPS.filter((family) =>
    (family.typeIds || []).some((typeId) => enabled.has(typeId)),
  ).flatMap((family) => family.typeIds || []);
  const source = familyTypeIds.length ? familyTypeIds : enabledTypeIds;
  return [...new Set(source)].filter((typeId) => CARD_TYPE_BY_ID.has(typeId));
}

export function togglePracticeDimensionEnabledTypes(enabledTypeIds = [], optionId) {
  const option = PRACTICE_FORM_FILTER_BY_ID.get(optionId);
  if (!option) return enabledTypeIds;
  const currentTypeIds = [
    ...new Set(enabledTypeIds.filter((typeId) => CARD_TYPE_BY_ID.has(typeId))),
  ];
  const current = new Set(currentTypeIds);
  const selections = selectedPracticeDimensions(enabledTypeIds);
  const selectedInGroup = new Set(selections.get(option.groupId) || []);
  if (selectedInGroup.has(option.id)) {
    if (selectedInGroup.size <= 1) return enabledTypeIds;
    const next = currentTypeIds.filter((typeId) => {
      const type = CARD_TYPE_BY_ID.get(typeId);
      return type && !optionMatchesType(option.id, type);
    });
    return next.length ? next : enabledTypeIds;
  }
  selectedInGroup.add(option.id);
  selections.set(option.groupId, [...selectedInGroup]);
  const restoredTypeIds = typeIdsForDimensionSelection(
    selections,
    activeFamilyTypeIdsFor(currentTypeIds),
  );
  const next = [...new Set([...current, ...restoredTypeIds])];
  return next.length ? next : enabledTypeIds;
}

function practiceDimensionOptionState(option, enabled) {
  const enabledTypeIds = option.typeIds.filter((typeId) => enabled.has(typeId));
  return {
    ...option,
    active: enabledTypeIds.length > 0,
    activeCount: enabledTypeIds.length,
  };
}

export function familyIntroTypeIds(family, enabledTypeIds = null) {
  const familyTypeIds = (family?.typeIds || []).filter((typeId) => CARD_TYPE_BY_ID.has(typeId));
  if (!familyTypeIds.length) return [];
  if (!Array.isArray(enabledTypeIds)) return familyTypeIds.slice(0, FAMILY_INTRO_TYPE_LIMIT);
  const selections = selectedPracticeDimensions(enabledTypeIds);
  const matchingTypeIds = typeIdsForDimensionSelection(selections, familyTypeIds);
  return (matchingTypeIds.length ? matchingTypeIds : familyTypeIds).slice(
    0,
    FAMILY_INTRO_TYPE_LIMIT,
  );
}

export function familyIntroFocusFromLaunch(focus) {
  if (focus?.launchMode !== FAMILY_INTRO_REVIEW_LIMIT_SOURCE || !focus?.formGroupId) return null;
  const family = FORM_GROUPS.find((group) => group.id === focus.formGroupId);
  const fallbackTypeIds = familyIntroTypeIds(family);
  const launchTypeIds = Array.isArray(focus.typeIds)
    ? focus.typeIds.filter((typeId) => CARD_TYPE_BY_ID.has(typeId))
    : [];
  const typeIds = launchTypeIds.length ? launchTypeIds : fallbackTypeIds;
  if (!typeIds.length) return null;
  return { familyId: focus.formGroupId, typeIds };
}

export function PracticeScopeSidebar({
  state,
  weaknessFamilies = [],
  sessionFamilyStats = {},
  openFamilyIds,
  onToggleFamilyOpen,
  onIntroduceFamily,
  onToggleDimension,
  className = '',
}) {
  const enabled = new Set(state.enabledTypes || []);
  const weaknessByFamily = new Map(weaknessFamilies.map((family) => [family.id, family]));
  const activeCount = (state.enabledTypes || []).length;

  return (
    <aside
      className={`space-y-3 lg:sticky lg:top-4 lg:self-start ${className}`}
      aria-label="Practice map"
    >
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3 px-1">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              Practice map
            </div>
            <h2 className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-50">
              Practice categories
            </h2>
          </div>
          <span className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold tabular-nums text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
            {activeCount} forms on
          </span>
        </div>

        <div className="space-y-2">
          {PRACTICE_FORM_FILTER_GROUPS.map((group) => (
            <div
              key={group.id}
              role="group"
              aria-label={`${group.label} filters`}
              className="rounded-xl border border-stone-200 bg-white p-2 dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                {group.label}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {group.options.map((option) => {
                  const optionState = practiceDimensionOptionState(option, enabled);
                  const active = optionState.active;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      aria-label={`Turn ${option.label} ${active ? 'off' : 'on'}`}
                      onClick={() => onToggleDimension?.(option.id)}
                      className={`flex min-h-14 items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                        active
                          ? 'border-indigo-200 bg-indigo-50/70 text-indigo-950 dark:border-indigo-900/70 dark:bg-indigo-950/20 dark:text-indigo-100'
                          : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-300'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold leading-tight">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] tabular-nums opacity-70">
                          {optionState.activeCount} active
                        </span>
                      </span>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${
                          active
                            ? 'border-indigo-300 bg-white text-indigo-700 dark:border-indigo-700 dark:bg-stone-950 dark:text-indigo-300'
                            : 'border-stone-200 bg-white text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400'
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            active ? 'bg-emerald-500' : 'bg-stone-400'
                          }`}
                        />
                        {active ? 'On' : 'Off'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {FORM_GROUPS.map((family) => {
            const lesson = LESSON_BY_GROUP_ID.get(family.id);
            const enabledInFamily = family.typeIds.filter((typeId) => enabled.has(typeId));
            const allEnabled = enabledInFamily.length === family.typeIds.length;
            const someEnabled = enabledInFamily.length > 0;
            const statusLabel = someEnabled ? 'Active' : 'Off';
            const activeTypes = enabledInFamily
              .map((typeId) => CARD_TYPE_BY_ID.get(typeId))
              .filter(Boolean);
            const progress = weaknessByFamily.get(family.id) || {};
            const weaknessRows = progress.rows || [];
            const attempted = progress.attempted || 0;
            const correct = progress.correct || 0;
            const incorrect = progress.incorrect || 0;
            const introduced = progress.introduced ?? attempted > 0;
            const skillStatus = progress.skillStatus || 'untested';
            const skillLabel =
              progress.skillLabel ||
              (attempted ? 'Gathering data' : introduced ? 'Untested' : 'Not introduced');
            const skillScore = progress.skillScore || 0;
            const skillWidth = skillStatus === 'untested' ? 8 : Math.max(6, skillScore);
            const skillText = !introduced
              ? ''
              : skillStatus === 'untested'
                ? skillLabel
                : `${skillScore}% skill - ${skillLabel}`;
            const skillAriaText = skillText || skillLabel;
            const learnerState = progress.learnerState || {
              id: introduced ? 'learning' : 'not-introduced',
              label: introduced ? 'Learning' : 'Not introduced',
            };
            const repsText = !introduced
              ? 'Not introduced'
              : attempted
                ? `${correct} right / ${incorrect} wrong lifetime`
                : 'No reps yet';
            const sessionStats = sessionFamilyStats[family.id] || {};
            const sessionCorrect = sessionStats.correct || 0;
            const sessionIncorrect = sessionStats.incorrect || 0;
            const sessionTotal = sessionCorrect + sessionIncorrect;
            const sessionCorrectPct = sessionTotal ? (sessionCorrect / sessionTotal) * 100 : 0;
            const sessionIncorrectPct = sessionTotal ? (sessionIncorrect / sessionTotal) * 100 : 0;
            const open = openFamilyIds.has(family.id);
            const contentId = `practice-map-family-${family.id}`;
            const introEligible = enabledInFamily.length === 0 || (!introduced && !allEnabled);
            const title = lesson?.title || family.label;
            const titleId = `practice-map-title-${family.id}`;
            return (
              <article
                key={family.id}
                aria-labelledby={titleId}
                className={`rounded-2xl border p-3 transition ${
                  allEnabled
                    ? 'border-indigo-200 bg-indigo-50/70 dark:border-indigo-900/70 dark:bg-indigo-950/20'
                    : someEnabled
                      ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/20'
                      : 'border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900'
                }`}
              >
                <div className="flex items-start justify-between gap-3 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => onToggleFamilyOpen(family.id)}
                    aria-expanded={open}
                    aria-controls={contentId}
                    aria-label={`${family.label} category details`}
                    className="min-w-0 flex-1 cursor-pointer rounded-lg bg-transparent p-0 text-left"
                  >
                    <span className="block min-w-0">
                      {lesson?.kana && (
                        <span
                          lang="ja"
                          className="block text-sm font-semibold leading-tight text-indigo-600 dark:text-indigo-300"
                        >
                          {lesson.kana}
                        </span>
                      )}
                      <span
                        id={titleId}
                        className="mt-1 block text-sm font-semibold leading-tight text-stone-950 dark:text-stone-50"
                      >
                        {title}
                      </span>
                    </span>
                    <span className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                      <span
                        className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                          LEARNER_STATE_TONE[learnerState.id] || LEARNER_STATE_TONE.learning
                        }`}
                      >
                        {learnerState.label}
                      </span>
                      <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                        {enabledInFamily.length}/{family.typeIds.length} forms on
                      </span>
                    </span>
                    <span className="mt-2 block text-xs leading-relaxed text-stone-600 dark:text-stone-300">
                      {lesson?.summary || 'Practice the forms in this category.'}
                    </span>
                    <span className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-500 dark:text-stone-400">
                      <span>{repsText}</span>
                      {skillText && (
                        <span className="font-semibold text-stone-700 dark:text-stone-300">
                          {skillText}
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block">
                      <span
                        className="block h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
                        aria-label={`${family.label} skill: ${skillAriaText}`}
                      >
                        <span
                          className={`block h-full ${
                            skillStatus === 'untested'
                              ? 'bg-stone-300 dark:bg-stone-700'
                              : 'bg-indigo-600 dark:bg-indigo-400'
                          }`}
                          style={{ width: `${skillWidth}%` }}
                        />
                      </span>
                    </span>
                    <span className="mt-3 block">
                      <span className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium text-stone-500 dark:text-stone-400">
                        <span>This session</span>
                        <span className="tabular-nums">
                          {sessionTotal
                            ? `${sessionCorrect} right / ${sessionIncorrect} wrong`
                            : 'No reps'}
                        </span>
                      </span>
                      <span
                        className="flex h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
                        role="img"
                        aria-label={`${family.label} this session: ${sessionCorrect} right / ${sessionIncorrect} wrong`}
                      >
                        {sessionTotal ? (
                          <>
                            <span
                              className="block h-full bg-emerald-500"
                              style={{ width: `${sessionCorrectPct}%` }}
                            />
                            <span
                              className="block h-full bg-rose-500"
                              style={{ width: `${sessionIncorrectPct}%` }}
                            />
                          </>
                        ) : (
                          <span className="block h-full w-2 bg-stone-300 dark:bg-stone-700" />
                        )}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold transition ${
                        someEnabled
                          ? 'border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-stone-950 dark:text-indigo-300 dark:hover:bg-indigo-950/50'
                          : 'border-stone-200 bg-stone-50 text-stone-600 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${someEnabled ? 'bg-emerald-500' : 'bg-stone-400'}`}
                      />
                      {statusLabel}
                    </span>
                    {introEligible && onIntroduceFamily && (
                      <button
                        type="button"
                        onClick={() => onIntroduceFamily(family)}
                        className="max-w-28 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold leading-tight text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:text-stone-950 dark:hover:bg-indigo-400"
                        aria-label={`Introduce ${family.label} family`}
                      >
                        Introduce this family
                      </button>
                    )}
                  </div>
                </div>
                {open && (
                  <div
                    id={contentId}
                    className="border-t border-stone-200 px-3 py-3 dark:border-stone-800"
                  >
                    {weaknessRows.length > 0 && (
                      <div className="mb-3 space-y-1.5">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                          Recent weak spots
                        </div>
                        {weaknessRows.slice(0, 4).map((row) => (
                          <div
                            key={row.key}
                            className="rounded-lg border border-stone-200 bg-white px-2.5 py-2 dark:border-stone-800 dark:bg-stone-900"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate font-medium text-stone-700 dark:text-stone-200">
                                {row.typeLabel} - {row.subcategoryLabel}
                              </span>
                              <span className="tabular-nums text-stone-500">
                                {row.correct}/{row.attempted}
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                              <span
                                className={`block h-full ${WEAKNESS_ROW_TONE[row.status] || 'bg-stone-300'}`}
                                style={{ width: `${Math.max(8, row.accuracy)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                        Active forms
                      </div>
                      {activeTypes.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {activeTypes.map((type) => (
                            <span
                              key={type.id}
                              className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200"
                            >
                              {type.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-stone-500 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-400">
                          No active forms
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

export function FocusCategoryMap({ state, onToggleFamily, className = '' }) {
  const enabled = new Set(state.enabledTypes || []);
  const activeCount = enabled.size;

  return (
    <aside
      className={`space-y-3 lg:sticky lg:top-4 lg:self-start ${className}`}
      aria-label="Focus map"
    >
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
            Focus map
          </div>
          <h2 className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-50">
            Practice categories
          </h2>
        </div>
        <span className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold tabular-nums text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
          {activeCount} forms on
        </span>
      </div>
      <div className="space-y-3">
        {FORM_GROUPS.map((family) => {
          const lesson = LESSON_BY_GROUP_ID.get(family.id);
          const enabledInFamily = family.typeIds.filter((typeId) => enabled.has(typeId));
          const allEnabled = enabledInFamily.length === family.typeIds.length;
          const someEnabled = enabledInFamily.length > 0;
          const statusLabel = allEnabled ? 'On' : someEnabled ? 'Partial' : 'Off';
          const pressed = allEnabled ? true : someEnabled ? 'mixed' : false;
          const title = lesson?.title || family.label;
          const titleId = `focus-map-title-${family.id}`;

          return (
            <article
              key={family.id}
              aria-labelledby={titleId}
              className={`rounded-2xl border p-3 transition ${
                allEnabled
                  ? 'border-indigo-200 bg-indigo-50/70 dark:border-indigo-900/70 dark:bg-indigo-950/20'
                  : someEnabled
                    ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/20'
                    : 'border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {lesson?.kana && (
                    <div
                      lang="ja"
                      className="text-sm font-semibold leading-tight text-indigo-600 dark:text-indigo-300"
                    >
                      {lesson.kana}
                    </div>
                  )}
                  <h3
                    id={titleId}
                    className="mt-1 text-sm font-semibold leading-tight text-stone-950 dark:text-stone-50"
                  >
                    {title}
                  </h3>
                </div>
                <button
                  type="button"
                  aria-pressed={pressed}
                  aria-label={`Turn ${title} focus ${allEnabled ? 'off' : 'on'}`}
                  onClick={() => onToggleFamily(family)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold transition ${
                    allEnabled
                      ? 'border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-stone-950 dark:text-indigo-300 dark:hover:bg-indigo-950/50'
                      : someEnabled
                        ? 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-stone-950 dark:text-amber-300 dark:hover:bg-amber-950/50'
                        : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-300'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      allEnabled ? 'bg-emerald-500' : someEnabled ? 'bg-amber-500' : 'bg-stone-400'
                    }`}
                  />
                  {statusLabel}
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-stone-600 dark:text-stone-300">
                {lesson?.summary || 'Practice the forms in this category.'}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3 text-[11px] font-medium text-stone-500 dark:text-stone-400">
                <span>
                  {enabledInFamily.length}/{family.typeIds.length} forms on
                </span>
                <span>{family.label}</span>
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
