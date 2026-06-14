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

const POLITE_TYPE_IDS = ALL_CARD_TYPES.filter(isPolitePracticeType).map((type) => type.id);
const PLAIN_TYPE_IDS = ALL_CARD_TYPES.filter((type) => !isPolitePracticeType(type)).map(
  (type) => type.id,
);

export const PRACTICE_REGISTER_FILTERS = [
  {
    id: 'plain',
    label: 'Plain forms',
    typeIds: PLAIN_TYPE_IDS,
  },
  {
    id: 'polite',
    label: 'Polite forms',
    typeIds: POLITE_TYPE_IDS,
  },
];

export function familyIntroTypeIds(family) {
  return (family?.typeIds || [])
    .filter((typeId) => CARD_TYPE_BY_ID.has(typeId))
    .slice(0, FAMILY_INTRO_TYPE_LIMIT);
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
  onToggleTypeSet,
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

        <div className="grid gap-2">
          {PRACTICE_REGISTER_FILTERS.map((filter) => {
            const enabledInFilter = filter.typeIds.filter((typeId) => enabled.has(typeId));
            const allEnabled = enabledInFilter.length === filter.typeIds.length;
            const someEnabled = enabledInFilter.length > 0;
            const statusLabel = allEnabled ? 'On' : someEnabled ? 'Partial' : 'Off';
            const pressed = allEnabled ? true : someEnabled ? 'mixed' : false;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={pressed}
                aria-label={`Turn ${filter.label} ${allEnabled ? 'off' : 'on'}`}
                onClick={() => onToggleTypeSet?.(filter.typeIds)}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                  allEnabled
                    ? 'border-indigo-200 bg-indigo-50/70 text-indigo-950 dark:border-indigo-900/70 dark:bg-indigo-950/20 dark:text-indigo-100'
                    : someEnabled
                      ? 'border-amber-200 bg-amber-50/70 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/20 dark:text-amber-100'
                      : 'border-stone-200 bg-white text-stone-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-300'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">{filter.label}</span>
                  <span className="mt-0.5 block text-[11px] tabular-nums opacity-70">
                    {enabledInFilter.length}/{filter.typeIds.length} forms on
                  </span>
                </span>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${
                    allEnabled
                      ? 'border-indigo-300 bg-white text-indigo-700 dark:border-indigo-700 dark:bg-stone-950 dark:text-indigo-300'
                      : someEnabled
                        ? 'border-amber-300 bg-white text-amber-800 dark:border-amber-700 dark:bg-stone-950 dark:text-amber-300'
                        : 'border-stone-200 bg-stone-50 text-stone-600 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      allEnabled ? 'bg-emerald-500' : someEnabled ? 'bg-amber-500' : 'bg-stone-400'
                    }`}
                  />
                  {statusLabel}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {FORM_GROUPS.map((family) => {
            const lesson = LESSON_BY_GROUP_ID.get(family.id);
            const enabledInFamily = family.typeIds.filter((typeId) => enabled.has(typeId));
            const allEnabled = enabledInFamily.length === family.typeIds.length;
            const someEnabled = enabledInFamily.length > 0;
            const statusLabel = allEnabled ? 'On' : someEnabled ? 'Partial' : 'Off';
            const pressed = allEnabled ? true : someEnabled ? 'mixed' : false;
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
                          allEnabled
                            ? 'bg-emerald-500'
                            : someEnabled
                              ? 'bg-amber-500'
                              : 'bg-stone-400'
                        }`}
                      />
                      {statusLabel}
                    </button>
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
                    <div className="grid gap-1.5">
                      {family.typeIds.map((typeId) => {
                        const type = CARD_TYPE_BY_ID.get(typeId);
                        if (!type) return null;
                        const checked = enabled.has(typeId);
                        return (
                          <button
                            key={typeId}
                            type="button"
                            aria-pressed={checked}
                            onClick={() => onToggleType(typeId)}
                            className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                              checked
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-100'
                                : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800'
                            }`}
                          >
                            <span
                              className={`mt-0.5 h-3.5 w-3.5 rounded border ${
                                checked
                                  ? 'border-indigo-600 bg-indigo-600 dark:border-indigo-400 dark:bg-indigo-400'
                                  : 'border-stone-300 bg-white dark:border-stone-600 dark:bg-stone-950'
                              }`}
                            />
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold">{type.label}</span>
                              {type.sub && (
                                <span className="block truncate text-[11px] opacity-70">
                                  {type.sub}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
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
