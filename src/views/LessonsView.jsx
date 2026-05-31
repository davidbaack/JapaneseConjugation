import React, { useMemo, useState } from 'react';
import { IconBook, IconList, IconRefresh, IconSpark } from '../components/Icons.jsx';
import { ALL_CARD_TYPES, getTypeInfo } from '../data/conjugationTypes.js';
import {
  FOUNDATION_CARDS,
  GODAN_ROW_KEYS,
  LESSON_SECTIONS,
  ONBIN_ROWS,
  getLessonCoverage,
} from '../data/lessonContent.js';
import { useApp } from '../state/AppStateContext.jsx';

function LessonStat({ label, value }) {
  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 px-3 py-2">
      <div className="text-lg font-semibold tabular-nums text-stone-950 dark:text-stone-50">
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-stone-500">{label}</div>
    </div>
  );
}

function TypeChip({ id }) {
  const type = getTypeInfo(id);
  return (
    <span
      title={type.hint}
      className="inline-flex items-center rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-2 py-1 text-[11px] font-medium text-stone-650 dark:text-stone-300"
    >
      {type.label}
    </span>
  );
}

function lessonMatches(lesson, query) {
  if (!query) return true;
  const haystack = [
    lesson.title,
    lesson.kana,
    lesson.summary,
    lesson.build,
    lesson.variants,
    lesson.watch,
    ...lesson.examples.flat(),
    ...lesson.typeIds.map((id) => {
      const type = getTypeInfo(id);
      return `${type.label} ${type.hint}`;
    }),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export default function LessonsView() {
  const { setState, setTab } = useApp();
  const [query, setQuery] = useState('');
  const coverage = useMemo(() => getLessonCoverage(), []);
  const allTypeIds = useMemo(() => ALL_CARD_TYPES.map((type) => type.id), []);
  const filteredLessons = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LESSON_SECTIONS.filter((lesson) => lessonMatches(lesson, q));
  }, [query]);

  function drillTypeIds(typeIds) {
    setState((prev) => ({ ...prev, enabledTypes: [...new Set(typeIds)] }));
    setTab('study');
  }

  return (
    <div className="space-y-4">
      <section className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
              <IconBook className="w-4 h-4" />
              Lessons
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
              Conjugation formation guide
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600 dark:text-stone-300">
              Succinct rules for every verb and adjective form in the app, with the stems, sound
              changes, exceptions, and usage notes that matter in practice.
            </p>
          </div>
          <button
            onClick={() => drillTypeIds(allTypeIds)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-850 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-900 dark:bg-stone-200 dark:text-stone-950 dark:hover:bg-stone-100"
          >
            <IconRefresh className="w-4 h-4" />
            Drill every form
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <LessonStat label="lessons" value={LESSON_SECTIONS.length} />
          <LessonStat label="forms mapped" value={`${coverage.covered}/${coverage.total}`} />
          <LessonStat label="verb families" value="4" />
          <LessonStat label="adjective types" value="2" />
        </div>

        {coverage.missing.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-300">
            {coverage.missing.length} form type needs a lesson mapping.
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
              Find a rule
            </label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="potential, て, passive..."
              className="mt-2 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-950"
            />
            <nav className="mt-3 space-y-1" aria-label="Lesson list">
              <a
                href="#formation-keys"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-850"
              >
                <IconList className="w-4 h-4 text-indigo-500" />
                Formation keys
              </a>
              {LESSON_SECTIONS.map((lesson) => (
                <a
                  key={lesson.groupId}
                  href={`#lesson-${lesson.groupId}`}
                  className="block rounded-lg px-3 py-2 text-sm text-stone-600 transition hover:bg-stone-50 hover:text-stone-950 dark:text-stone-400 dark:hover:bg-stone-850 dark:hover:text-stone-100"
                >
                  <span className="block font-medium">{lesson.title}</span>
                  <span className="block text-[11px] text-stone-400">
                    {lesson.typeIds.length} forms
                  </span>
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <main className="space-y-4">
          <section
            id="formation-keys"
            className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5"
          >
            <div className="flex items-center gap-2">
              <IconSpark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="font-semibold text-stone-950 dark:text-stone-50">Formation keys</h3>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {FOUNDATION_CARDS.map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-semibold text-stone-900 dark:text-stone-100">
                      {card.title}
                    </h4>
                    <span className="rounded-md bg-white dark:bg-stone-900 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                      {card.badge}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-stone-650 dark:text-stone-300">
                    {card.pattern}
                  </p>
                  <div
                    lang="ja"
                    className="mt-3 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-sm font-medium text-stone-900 dark:text-stone-100"
                  >
                    {card.example}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-stone-500">{card.note}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                <div className="bg-stone-50 dark:bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-800 dark:text-stone-200">
                  Godan row shifts
                </div>
                <div className="divide-y divide-stone-100 dark:divide-stone-850">
                  {GODAN_ROW_KEYS.map((row) => (
                    <div
                      key={row.row}
                      className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[5rem_1fr]"
                    >
                      <div className="font-semibold text-stone-900 dark:text-stone-100">
                        {row.row}
                      </div>
                      <div>
                        <div className="text-stone-600 dark:text-stone-300">{row.use}</div>
                        <div lang="ja" className="mt-1 text-stone-500">
                          {row.example}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                <div className="bg-stone-50 dark:bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-800 dark:text-stone-200">
                  Te and ta sound changes
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">ending</th>
                        <th className="px-4 py-2 font-medium">て</th>
                        <th className="px-4 py-2 font-medium">た</th>
                        <th className="px-4 py-2 font-medium">example</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-850">
                      {ONBIN_ROWS.map((row) => (
                        <tr key={row.ending}>
                          <td
                            lang="ja"
                            className="px-4 py-2 font-semibold text-stone-850 dark:text-stone-100"
                          >
                            {row.ending}
                          </td>
                          <td lang="ja" className="px-4 py-2 text-stone-650 dark:text-stone-300">
                            {row.te}
                          </td>
                          <td lang="ja" className="px-4 py-2 text-stone-650 dark:text-stone-300">
                            {row.ta}
                          </td>
                          <td lang="ja" className="px-4 py-2 text-stone-500">
                            {row.example}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          {filteredLessons.map((lesson) => (
            <article
              id={`lesson-${lesson.groupId}`}
              key={lesson.groupId}
              className="scroll-mt-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div
                    lang="ja"
                    className="text-sm font-medium text-indigo-600 dark:text-indigo-400"
                  >
                    {lesson.kana}
                  </div>
                  <h3 className="mt-1 text-xl font-semibold text-stone-950 dark:text-stone-50">
                    {lesson.title}
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                    {lesson.summary}
                  </p>
                </div>
                <button
                  onClick={() => drillTypeIds(lesson.typeIds)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-750 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200 dark:hover:bg-indigo-950/25"
                >
                  <IconRefresh className="w-4 h-4" />
                  Drill lesson
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Build
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                    {lesson.build}
                  </p>
                </div>
                <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Variants
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                    {lesson.variants}
                  </p>
                </div>
                <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Watch
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                    {lesson.watch}
                  </p>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 dark:bg-stone-950 text-left text-xs uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">base</th>
                      <th className="px-4 py-2 font-medium">forms</th>
                      <th className="px-4 py-2 font-medium hidden sm:table-cell">why</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-850">
                    {lesson.examples.map(([base, forms, why]) => (
                      <tr key={`${lesson.groupId}-${base}`}>
                        <td
                          lang="ja"
                          className="px-4 py-2 font-semibold text-stone-900 dark:text-stone-100"
                        >
                          {base}
                        </td>
                        <td lang="ja" className="px-4 py-2 text-stone-700 dark:text-stone-300">
                          {forms}
                        </td>
                        <td className="px-4 py-2 text-stone-500 hidden sm:table-cell">{why}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Forms covered
                  </div>
                  <div className="text-xs text-stone-400">{lesson.typeIds.length} total</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {lesson.typeIds.map((id) => (
                    <TypeChip key={id} id={id} />
                  ))}
                </div>
              </div>
            </article>
          ))}

          {filteredLessons.length === 0 && (
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-8 text-center">
              <div className="text-sm font-medium text-stone-800 dark:text-stone-200">
                No lesson matched that search.
              </div>
              <button
                onClick={() => setQuery('')}
                className="mt-3 rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-600 transition hover:bg-stone-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-850"
              >
                Clear search
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
