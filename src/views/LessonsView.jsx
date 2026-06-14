import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IconBook, IconList, IconRefresh, IconSpark } from '../components/Icons.jsx';
import { getTypeInfo } from '../data/conjugationTypes.js';
import {
  FOUNDATION_CARDS,
  GODAN_ROW_KEYS,
  LESSON_SECTIONS,
  LESSON_TRACKS,
  ONBIN_ROWS,
  RU_MASU_DIAGNOSTIC_ROWS,
  getLessonCoverage,
} from '../data/lessonContent.js';
import { useApp } from '../state/AppStateContext.jsx';
import {
  buildLessonReviewRecommendation,
  buildRuleReviewRecommendation,
} from '../utils/reviewRecommendations.js';

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

function PracticeCardReturnPanel({ focus, onGuide, onPractice, onDismiss }) {
  const type = getTypeInfo(focus?.typeId);
  const typeLabel = focus?.typeLabel || type.label || 'this form';
  const word = focus?.word || {};
  return (
    <section
      aria-label="Missed Practice card"
      className="mb-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900/70 dark:bg-amber-950/20"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
            From your Practice card
          </div>
          <p className="mt-1 text-sm text-stone-700 dark:text-stone-250">
            {word.dict ? (
              <>
                {typeLabel} for{' '}
                <span lang="ja" className="font-semibold text-stone-950 dark:text-stone-50">
                  {word.dict}
                </span>
                {word.reading && word.reading !== word.dict ? (
                  <span lang="ja" className="text-stone-500 dark:text-stone-350">
                    {' '}
                    ({word.reading})
                  </span>
                ) : null}
              </>
            ) : (
              typeLabel
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onGuide?.(focus)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-50 dark:border-amber-700 dark:bg-stone-950 dark:text-amber-200 dark:hover:bg-amber-950/30"
          >
            <IconSpark className="h-4 w-4" />
            Guide this form
          </button>
          <button
            type="button"
            onClick={() => onPractice?.(focus)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-900 dark:bg-stone-950 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
          >
            <IconRefresh className="h-4 w-4" />
            Practice this form
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-600 transition hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300 dark:hover:bg-stone-850"
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}

const TRACK_STYLES = {
  beginner: {
    shell: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20',
    eyebrow: 'text-emerald-700 dark:text-emerald-300',
    step: 'bg-emerald-600 text-white dark:bg-emerald-400 dark:text-stone-950',
    button:
      'border-emerald-200 bg-white text-emerald-800 hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-stone-950 dark:text-emerald-300 dark:hover:bg-emerald-950/30',
  },
  intermediate: {
    shell: 'border-sky-200 bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-950/20',
    eyebrow: 'text-sky-700 dark:text-sky-300',
    step: 'bg-sky-600 text-white dark:bg-sky-400 dark:text-stone-950',
    button:
      'border-sky-200 bg-white text-sky-800 hover:border-sky-300 hover:bg-sky-50 dark:border-sky-900 dark:bg-stone-950 dark:text-sky-300 dark:hover:bg-sky-950/30',
  },
  advanced: {
    shell: 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20',
    eyebrow: 'text-amber-800 dark:text-amber-300',
    step: 'bg-amber-500 text-stone-950 dark:bg-amber-300',
    button:
      'border-amber-200 bg-white text-amber-900 hover:border-amber-300 hover:bg-amber-50 dark:border-amber-900 dark:bg-stone-950 dark:text-amber-300 dark:hover:bg-amber-950/30',
  },
};

function uniqueTypeIds(lessons = []) {
  return [...new Set(lessons.flatMap((lesson) => lesson.typeIds || []))];
}

function TrackCard({ track, lessons, onLearnLesson, onPracticeLesson, onPracticeTrack }) {
  const styles = TRACK_STYLES[track.id] || TRACK_STYLES.beginner;
  const formCount = uniqueTypeIds(lessons).length;

  return (
    <article id={`track-${track.id}`} className={`rounded-2xl border p-4 ${styles.shell}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${styles.eyebrow}`}>
        {track.level} track
      </div>
      <h3 className="mt-1 text-lg font-semibold text-stone-950 dark:text-stone-50">
        {track.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-stone-650 dark:text-stone-300">
        {track.summary}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-stone-500 dark:text-stone-400">
        <span>{lessons.length} lessons</span>
        <span>{formCount} forms</span>
      </div>
      <button
        type="button"
        onClick={() => onPracticeTrack(track, lessons)}
        className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${styles.button}`}
      >
        <IconRefresh className="w-4 h-4" />
        Practice track
      </button>

      <ol className="mt-4 space-y-2">
        {lessons.map((lesson, index) => (
          <li
            key={`${track.id}-${lesson.groupId}`}
            className="rounded-xl border border-white/70 bg-white/80 p-3 shadow-sm dark:border-stone-800/80 dark:bg-stone-950/80"
          >
            <div className="flex gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${styles.step}`}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-stone-900 dark:text-stone-100">
                  {lesson.title}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-stone-550 dark:text-stone-400">
                  Learn the rule, then practice the forms while they are fresh.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`#lesson-${lesson.groupId}`}
                    onClick={() => onLearnLesson(lesson.groupId)}
                    className="inline-flex items-center rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-850"
                  >
                    Learn this
                  </a>
                  <button
                    type="button"
                    onClick={() => onPracticeLesson(lesson)}
                    className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${styles.button}`}
                  >
                    Practice this
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </article>
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
  const {
    addReviewRecommendation,
    allWords,
    clearLearnFocus,
    learnFocus,
    openGuideForRule,
    setTab,
    startReviewRecommendation,
  } = useApp();
  const [query, setQuery] = useState('');
  const [showFormationKeys, setShowFormationKeys] = useState(false);
  const [openLessonIds, setOpenLessonIds] = useState(() => new Set());
  const lessonRefs = useRef(new Map());
  const coverage = useMemo(() => getLessonCoverage(), []);
  const lessonMap = useMemo(
    () => new Map(LESSON_SECTIONS.map((lesson) => [lesson.groupId, lesson])),
    [],
  );
  const trackRows = useMemo(
    () =>
      LESSON_TRACKS.map((track) => ({
        track,
        lessons: track.lessonGroupIds.map((groupId) => lessonMap.get(groupId)).filter(Boolean),
      })),
    [lessonMap],
  );
  const filteredLessons = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LESSON_SECTIONS.filter((lesson) => lessonMatches(lesson, q));
  }, [query]);
  const searchActive = query.trim().length > 0;

  useEffect(() => {
    function openFromHash() {
      const hash = window.location.hash;
      if (hash === '#formation-keys') {
        setShowFormationKeys(true);
        return;
      }
      const lessonMatch = hash.match(/^#lesson-(.+)$/);
      if (lessonMatch) {
        setOpenLessonIds((prev) => new Set(prev).add(lessonMatch[1]));
      }
    }
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  const focusedLessonGroupId = learnFocus?.lessonGroupId || '';

  useEffect(() => {
    if (!focusedLessonGroupId) return;
    setOpenLessonIds((prev) => new Set(prev).add(focusedLessonGroupId));
  }, [focusedLessonGroupId]);

  useEffect(() => {
    if (!focusedLessonGroupId) return;
    if (!searchActive && !openLessonIds.has(focusedLessonGroupId)) return;

    const lesson = lessonRefs.current.get(focusedLessonGroupId);
    if (!lesson) return;

    const timer = window.setTimeout(() => {
      lesson.scrollIntoView({ behavior: 'smooth', block: 'start' });
      try {
        lesson.focus({ preventScroll: true });
      } catch {
        lesson.focus();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [focusedLessonGroupId, openLessonIds, searchActive, filteredLessons]);

  function sendLessonRecommendation(lesson, options = {}) {
    const recommendation = buildLessonReviewRecommendation(lesson, allWords, options);
    if (!recommendation) return;
    clearLearnFocus?.();
    if (startReviewRecommendation?.(recommendation)) return;
    addReviewRecommendation(recommendation);
    setTab('practice');
  }

  function sendTrackRecommendation(track, lessons) {
    sendLessonRecommendation(
      {
        groupId: `track-${track.id}`,
        title: `${track.level} track`,
        typeIds: uniqueTypeIds(lessons),
      },
      { suggestedCount: track.suggestedCount, wordLimit: track.wordLimit },
    );
  }

  function guideFocusedRule(focus) {
    if (!focus) return;
    openGuideForRule?.(focus.word, focus.typeId, {
      source: 'learn-return',
      lessonGroupId: focus.lessonGroupId,
      lessonTitle: focus.lessonTitle,
      typeLabel: focus.typeLabel,
    });
    clearLearnFocus?.();
  }

  function practiceFocusedRule(focus) {
    if (!focus) return;
    const recommendation = buildRuleReviewRecommendation(focus, allWords, {
      suggestedCount: 8,
      wordLimit: 10,
    });
    if (!recommendation) return;
    clearLearnFocus?.();
    if (startReviewRecommendation?.(recommendation)) return;
    addReviewRecommendation(recommendation);
    setTab('practice');
  }

  function openLesson(groupId) {
    setOpenLessonIds((prev) => {
      const next = new Set(prev);
      next.add(groupId);
      return next;
    });
  }

  function toggleLesson(groupId) {
    setOpenLessonIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <section className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
            <IconBook className="w-4 h-4" />
            Lessons
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
            Conjugation formation guide
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
            Follow a track when you want a learning path, or use the reference sections when you
            need a specific rule. Each lesson can hand a focused set back to Practice.
          </p>
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

      {learnFocus?.lessonGroupId && (
        <PracticeCardReturnPanel
          focus={learnFocus}
          onGuide={guideFocusedRule}
          onPractice={practiceFocusedRule}
          onDismiss={clearLearnFocus}
        />
      )}

      <section aria-labelledby="lesson-tracks-heading">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3
              id="lesson-tracks-heading"
              className="text-lg font-semibold text-stone-950 dark:text-stone-50"
            >
              Guided lesson tracks
            </h3>
            <p className="text-sm text-stone-600 dark:text-stone-300">
              Pick a level, learn one section, then send the matching forms to Practice.
            </p>
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-3">
          {trackRows.map(({ track, lessons }) => (
            <TrackCard
              key={track.id}
              track={track}
              lessons={lessons}
              onLearnLesson={openLesson}
              onPracticeLesson={sendLessonRecommendation}
              onPracticeTrack={sendTrackRecommendation}
            />
          ))}
        </div>
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
              {LESSON_TRACKS.map((track) => (
                <a
                  key={track.id}
                  href={`#track-${track.id}`}
                  className="block rounded-lg px-3 py-2 text-sm text-stone-600 transition hover:bg-stone-50 hover:text-stone-950 dark:text-stone-400 dark:hover:bg-stone-850 dark:hover:text-stone-100"
                >
                  <span className="block font-medium">{track.level} track</span>
                  <span className="block text-[11px] text-stone-400">
                    {track.lessonGroupIds.length} lessons
                  </span>
                </a>
              ))}
            </nav>
            <nav
              className="mt-3 border-t border-stone-100 pt-3 dark:border-stone-850"
              aria-label="All lessons"
            >
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                All lessons
              </div>
              {LESSON_SECTIONS.map((lesson) => (
                <a
                  key={lesson.groupId}
                  href={`#lesson-${lesson.groupId}`}
                  onClick={() => openLesson(lesson.groupId)}
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <IconSpark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-semibold text-stone-950 dark:text-stone-50">Formation keys</h3>
              </div>
              <button
                type="button"
                aria-expanded={showFormationKeys}
                onClick={() => setShowFormationKeys((current) => !current)}
                className="inline-flex items-center justify-center rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-750 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200 dark:hover:bg-indigo-950/25"
              >
                {showFormationKeys ? 'Hide keys' : 'Open keys'}
              </button>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-stone-600 dark:text-stone-300">
              Use these stem, row-shift, and sound-change notes when a lesson needs a quick
              refresher.
            </p>

            {showFormationKeys && (
              <>
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
                              <td
                                lang="ja"
                                className="px-4 py-2 text-stone-650 dark:text-stone-300"
                              >
                                {row.te}
                              </td>
                              <td
                                lang="ja"
                                className="px-4 py-2 text-stone-650 dark:text-stone-300"
                              >
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

                <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
                  <div className="bg-stone-50 dark:bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-800 dark:text-stone-200">
                    る-verb traps: masu check
                  </div>
                  <div className="grid gap-4 p-4 lg:grid-cols-[16rem_1fr]">
                    <div className="text-sm leading-relaxed text-stone-650 dark:text-stone-300">
                      <p>
                        <span className="font-semibold text-stone-850 dark:text-stone-100">
                          -いる/-える is a clue, not a guarantee.
                        </span>{' '}
                        If the polite form keeps the same stem before ます, it behaves as ichidan.
                        If final る becomes り before ます, it is godan.
                      </p>
                      <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                        Kanji and okurigana help, but pairs like 切る and 着る still need the
                        dictionary group or a known polite form.
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[34rem] text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                          <tr>
                            <th className="px-3 py-2 font-medium">dictionary</th>
                            <th className="px-3 py-2 font-medium">ます form</th>
                            <th className="px-3 py-2 font-medium">class</th>
                            <th className="px-3 py-2 font-medium">why</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 dark:divide-stone-850">
                          {RU_MASU_DIAGNOSTIC_ROWS.map((row) => (
                            <tr key={`${row.dict}-${row.group}`}>
                              <td
                                lang="ja"
                                className="px-3 py-2 font-semibold text-stone-850 dark:text-stone-100"
                              >
                                {row.dict}
                              </td>
                              <td
                                lang="ja"
                                className="px-3 py-2 text-stone-700 dark:text-stone-250"
                              >
                                {row.polite}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                                    row.group === 'ichidan'
                                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/25 dark:text-emerald-300'
                                      : 'bg-amber-50 text-amber-800 dark:bg-amber-950/25 dark:text-amber-300'
                                  }`}
                                >
                                  {row.group}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-stone-550 dark:text-stone-350">
                                {row.clue}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>

          {filteredLessons.map((lesson) => {
            const isOpen = searchActive || openLessonIds.has(lesson.groupId);
            const toggleLabel = searchActive
              ? 'Search match'
              : isOpen
                ? 'Hide lesson'
                : 'Learn this';

            return (
              <article
                id={`lesson-${lesson.groupId}`}
                key={lesson.groupId}
                ref={(node) => {
                  if (node) {
                    lessonRefs.current.set(lesson.groupId, node);
                  } else {
                    lessonRefs.current.delete(lesson.groupId);
                  }
                }}
                tabIndex={focusedLessonGroupId === lesson.groupId ? -1 : undefined}
                className="scroll-mt-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850"
              >
                <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
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
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`lesson-panel-${lesson.groupId}`}
                    disabled={searchActive}
                    onClick={() => toggleLesson(lesson.groupId)}
                    className="inline-flex items-center justify-center rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-750 transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-default disabled:opacity-70 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200 dark:hover:bg-indigo-950/25"
                  >
                    {toggleLabel}
                  </button>
                </div>
                {isOpen && (
                  <div
                    id={`lesson-panel-${lesson.groupId}`}
                    className="border-t border-stone-100 p-5 pt-4 dark:border-stone-850"
                  >
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 dark:border-indigo-950 dark:bg-indigo-950/20">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                            Learn this, then practice this
                          </div>
                          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                            Read the rule below, then send these forms to Practice for active
                            recall.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => sendLessonRecommendation(lesson)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-900 dark:bg-stone-950 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
                        >
                          <IconRefresh className="w-4 h-4" />
                          Practice this
                        </button>
                      </div>
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
                              <td
                                lang="ja"
                                className="px-4 py-2 text-stone-700 dark:text-stone-300"
                              >
                                {forms}
                              </td>
                              <td className="px-4 py-2 text-stone-500 hidden sm:table-cell">
                                {why}
                              </td>
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
                  </div>
                )}
              </article>
            );
          })}

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
