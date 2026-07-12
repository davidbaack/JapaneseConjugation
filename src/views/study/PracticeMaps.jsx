import React from 'react';
import { ALL_CARD_TYPES, FORM_GROUPS } from '../../data/conjugationTypes.js';
import { LESSON_SECTIONS } from '../../data/lessonContent.js';
import {
  PRACTICE_FORM_FILTER_GROUPS,
  enabledTypeIdsForPracticeScope,
  normalizePracticeScope,
  practiceScopeFamilyState,
  practiceScopeFilterSummary,
  practiceScopeFromEnabledTypes,
  practiceScopeOptionSelected,
  practiceTypeMatchesScopeFilters,
  reducePracticeScope,
} from '../../utils/practiceScope.js';

export { PRACTICE_FORM_FILTER_GROUPS } from '../../utils/practiceScope.js';

export const FAMILY_INTRO_REVIEW_LIMIT_SOURCE = 'intro-family';
const FAMILY_INTRO_TYPE_LIMIT = 4;

const WEAKNESS_ROW_TONE = {
  strong: 'bg-emerald-500',
  developing: 'bg-amber-500',
  weak: 'bg-rose-500',
};

const LEARNER_STATE_TONE = {
  'not-introduced':
    'border-stone-200 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300',
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

function legacyScopeUpdate(enabledTypeIds, action) {
  const scope = practiceScopeFromEnabledTypes(enabledTypeIds);
  return enabledTypeIdsForPracticeScope(reducePracticeScope(scope, action));
}

export function togglePracticeDimensionEnabledTypes(enabledTypeIds = [], optionId) {
  return legacyScopeUpdate(enabledTypeIds, { type: 'toggle-filter', optionId });
}

export function togglePracticeTypeEnabledTypes(enabledTypeIds = [], typeId) {
  return legacyScopeUpdate(enabledTypeIds, { type: 'toggle-form', typeId });
}

export function togglePracticeFamilyEnabledTypes(enabledTypeIds = [], family) {
  return legacyScopeUpdate(enabledTypeIds, { type: 'toggle-family', familyId: family?.id });
}

export function familyIntroTypeIds(family, enabledTypeIds = null) {
  const familyTypeIds = (family?.typeIds || []).filter((typeId) => CARD_TYPE_BY_ID.has(typeId));
  if (!familyTypeIds.length) return [];
  if (!Array.isArray(enabledTypeIds)) return familyTypeIds.slice(0, FAMILY_INTRO_TYPE_LIMIT);
  const scope = practiceScopeFromEnabledTypes(enabledTypeIds);
  const matchingTypeIds = familyTypeIds.filter((typeId) => {
    const type = CARD_TYPE_BY_ID.get(typeId);
    return type && practiceTypeMatchesScopeFilters(type, scope);
  });
  return matchingTypeIds.slice(0, FAMILY_INTRO_TYPE_LIMIT);
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
  onToggleFamily,
  onIntroduceFamily,
  onToggleType,
  onToggleDimension,
  mobileOpen = false,
  onToggleMobileOpen,
  className = '',
}) {
  const scope = normalizePracticeScope(state.practiceScope, state.enabledTypes || []);
  const scopedEnabledTypeIds = enabledTypeIdsForPracticeScope(scope);
  const enabled = new Set(scopedEnabledTypeIds);
  const weaknessByFamily = new Map(weaknessFamilies.map((family) => [family.id, family]));
  const activeCount = scopedEnabledTypeIds.length;
  const filterSummary = practiceScopeFilterSummary(scope);

  return (
    <aside
      className={`space-y-3 lg:sticky lg:top-4 lg:self-start ${className}`}
      aria-label="Practice map"
    >
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900 lg:border-0 lg:bg-transparent lg:px-1 lg:py-0 lg:dark:bg-transparent">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              Practice map
            </div>
            <h2 className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-50">
              Practice categories
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold tabular-nums text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
              {activeCount} forms on
            </span>
            <button
              type="button"
              aria-expanded={mobileOpen}
              aria-controls="practice-map-controls"
              onClick={onToggleMobileOpen}
              className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-700 dark:border-stone-800 dark:text-stone-300 lg:hidden"
            >
              {mobileOpen ? 'Close' : 'Focus'}
            </button>
          </div>
        </div>

        <div
          id="practice-map-controls"
          className={`${mobileOpen ? 'block' : 'hidden'} space-y-3 lg:block`}
        >
          <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                Form filters
              </div>
              <p className="mt-1 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
                These choices apply to every category you turn on.
              </p>
            </div>
            <div className="space-y-2.5">
              {PRACTICE_FORM_FILTER_GROUPS.map((group) => (
                <div key={group.id} role="group" aria-label={`${group.label} filters`}>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                    {group.label}
                  </div>
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-950">
                    {group.options.map((option) => {
                      const active = practiceScopeOptionSelected(scope, option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={active}
                          aria-label={`Turn ${option.label} ${active ? 'off' : 'on'}`}
                          onClick={() => onToggleDimension?.(option.id)}
                          className={`min-h-10 rounded-lg border px-2.5 py-2 text-sm font-semibold transition ${
                            active
                              ? 'border-indigo-200 bg-white text-indigo-800 shadow-sm dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200'
                              : 'border-transparent bg-transparent text-stone-500 hover:bg-white hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-200'
                          }`}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-stone-400'}`}
                            />
                            {option.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-2.5 py-2 text-[11px] font-medium leading-relaxed text-indigo-800 dark:border-indigo-900/70 dark:bg-indigo-950/25 dark:text-indigo-200">
              Practicing: {filterSummary}
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="practice-category-list-title">
            <div className="px-1">
              <div
                id="practice-category-list-title"
                className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300"
              >
                Categories
              </div>
              <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                Each category remembers its form choices when you turn it off.
              </p>
            </div>
            {FORM_GROUPS.map((family) => {
              const lesson = LESSON_BY_GROUP_ID.get(family.id);
              const familyScopeState = practiceScopeFamilyState(scope, family);
              const enabledInFamily = familyScopeState?.enabledTypeIds || [];
              const allEnabled = enabledInFamily.length === family.typeIds.length;
              const someEnabled = enabledInFamily.length > 0;
              const familyActive = !!familyScopeState?.active;
              const statusLabel =
                familyScopeState?.status === 'no-matches'
                  ? 'No matches'
                  : familyScopeState?.status === 'filtered-out'
                    ? 'Filtered out'
                    : familyActive
                      ? `${enabledInFamily.length} practicing`
                      : 'Off';
              const familyTypes = family.typeIds
                .map((typeId) => CARD_TYPE_BY_ID.get(typeId))
                .filter(Boolean);
              const familyToggleDisabled = familyActive
                ? someEnabled && enabled.size <= enabledInFamily.length
                : !familyScopeState?.canActivate;
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
              const displayLearnerState =
                someEnabled && learnerState.id === 'not-introduced'
                  ? { id: 'learning', label: 'New' }
                  : learnerState;
              const repsText = !introduced
                ? someEnabled
                  ? 'No attempts yet'
                  : 'Not introduced'
                : attempted
                  ? `${correct} right / ${incorrect} wrong lifetime`
                  : 'No reps yet';
              const sessionStats = sessionFamilyStats[family.id] || {};
              const sessionCorrect = sessionStats.correct || 0;
              const sessionIncorrect = sessionStats.incorrect || 0;
              const sessionTotal = sessionCorrect + sessionIncorrect;
              const sessionCorrectPct = sessionTotal ? (sessionCorrect / sessionTotal) * 100 : 0;
              const sessionIncorrectPct = sessionTotal
                ? (sessionIncorrect / sessionTotal) * 100
                : 0;
              const open = openFamilyIds.has(family.id);
              const contentId = `practice-map-family-${family.id}`;
              const introEligible =
                familyScopeState?.canActivate && (!familyActive || (!introduced && !allEnabled));
              const title = lesson?.title || family.label;
              const titleId = `practice-map-title-${family.id}`;
              return (
                <article
                  key={family.id}
                  aria-labelledby={titleId}
                  className={`rounded-2xl border p-3 transition ${
                    allEnabled
                      ? 'border-indigo-200 bg-indigo-50/70 dark:border-indigo-900/70 dark:bg-indigo-950/20'
                      : familyActive
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
                            LEARNER_STATE_TONE[displayLearnerState.id] ||
                            LEARNER_STATE_TONE.learning
                          }`}
                        >
                          {displayLearnerState.label}
                        </span>
                        <span className="text-[11px] font-medium text-stone-600 dark:text-stone-400">
                          {enabledInFamily.length}/{family.typeIds.length} forms on
                        </span>
                      </span>
                      {open && (
                        <>
                          <span className="mt-2 block text-xs leading-relaxed text-stone-600 dark:text-stone-300">
                            {lesson?.summary || 'Practice the forms in this category.'}
                          </span>
                          <span className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-600 dark:text-stone-400">
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
                            <span className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium text-stone-600 dark:text-stone-400">
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
                        </>
                      )}
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <button
                        type="button"
                        aria-pressed={familyActive}
                        aria-label={`Turn ${title} ${familyActive ? 'off' : 'on'}`}
                        onClick={() => onToggleFamily?.(family)}
                        disabled={familyToggleDisabled}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold transition ${
                          familyActive
                            ? 'border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-stone-950 dark:text-indigo-300 dark:hover:bg-indigo-950/50'
                            : familyScopeState?.status === 'no-matches'
                              ? 'border-stone-200 bg-stone-100 text-stone-500 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-500'
                              : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-300'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            someEnabled
                              ? 'bg-emerald-500'
                              : familyActive
                                ? 'bg-amber-500'
                                : 'bg-stone-400'
                          }`}
                        />
                        {statusLabel}
                      </button>
                      {familyScopeState?.status === 'no-matches' && (
                        <span className="max-w-28 text-right text-[10px] leading-tight text-stone-500 dark:text-stone-400">
                          No forms match your filters
                        </span>
                      )}
                      {familyScopeState?.status === 'filtered-out' && (
                        <span className="max-w-28 text-right text-[10px] leading-tight text-amber-700 dark:text-amber-300">
                          Saved and ready when filters match
                        </span>
                      )}
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
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-600">
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
                                <span className="tabular-nums text-stone-600">
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
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-600">
                          Forms in this category
                        </div>
                        {familyTypes.length ? (
                          <div className="grid gap-1.5">
                            {familyTypes.map((type) => {
                              const selected = familyScopeState?.selectedTypeIds.includes(type.id);
                              const matchesFilters = practiceTypeMatchesScopeFilters(type, scope);
                              const practicing = familyActive && selected && matchesFilters;
                              const disabled =
                                selected && (familyScopeState?.selectedTypeIds.length || 0) <= 1;
                              const formStatus = practicing
                                ? 'Practicing'
                                : selected && !matchesFilters
                                  ? 'Filtered out'
                                  : selected
                                    ? 'Saved'
                                    : 'Off';
                              return (
                                <button
                                  key={type.id}
                                  type="button"
                                  aria-pressed={selected}
                                  aria-label={`Turn ${type.label} ${selected ? 'off' : 'on'}`}
                                  onClick={() => onToggleType?.(type.id)}
                                  disabled={disabled}
                                  className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                                    practicing
                                      ? 'border-indigo-200 bg-indigo-50 text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-100'
                                      : selected
                                        ? 'border-amber-200 bg-amber-50/60 text-stone-700 hover:bg-amber-50 dark:border-amber-900/70 dark:bg-amber-950/15 dark:text-stone-200 dark:hover:bg-amber-950/25'
                                        : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800'
                                  } disabled:cursor-not-allowed disabled:opacity-60`}
                                >
                                  <span
                                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded border ${
                                      selected
                                        ? 'border-indigo-600 bg-indigo-600 dark:border-indigo-400 dark:bg-indigo-400'
                                        : 'border-stone-300 bg-white dark:border-stone-600 dark:bg-stone-950'
                                    }`}
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-xs font-semibold">
                                      {type.label}
                                    </span>
                                    {type.sub && (
                                      <span className="block truncate text-[11px] opacity-70">
                                        {type.sub}
                                      </span>
                                    )}
                                  </span>
                                  <span
                                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                      practicing
                                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200'
                                        : selected && !matchesFilters
                                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                                          : selected
                                            ? 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
                                            : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
                                    }`}
                                  >
                                    {formStatus}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-stone-600 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-400">
                            No forms in this category
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </div>
      </section>
    </aside>
  );
}

export function FocusCategoryMap({ state, onToggleFamily, className = '' }) {
  const scope = normalizePracticeScope(state.practiceScope, state.enabledTypes || []);
  const enabled = new Set(enabledTypeIdsForPracticeScope(scope));
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
          const familyScopeState = practiceScopeFamilyState(scope, family);
          const enabledInFamily = familyScopeState?.enabledTypeIds || [];
          const allEnabled = enabledInFamily.length === family.typeIds.length;
          const someEnabled = enabledInFamily.length > 0;
          const statusLabel =
            familyScopeState?.status === 'no-matches'
              ? 'No matches'
              : familyScopeState?.status === 'filtered-out'
                ? 'Filtered out'
                : familyScopeState?.active
                  ? `${enabledInFamily.length} practicing`
                  : 'Off';
          const pressed = !!familyScopeState?.active;
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
                  aria-label={`Turn ${title} focus ${pressed ? 'off' : 'on'}`}
                  onClick={() => onToggleFamily(family)}
                  disabled={!pressed && !familyScopeState?.canActivate}
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
              <div className="mt-3 flex items-center justify-between gap-3 text-[11px] font-medium text-stone-600 dark:text-stone-400">
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
