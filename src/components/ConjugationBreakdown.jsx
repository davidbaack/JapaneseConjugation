import React, { useMemo } from 'react';
import { getConjugationDebugInfo } from '../utils/conjugatorExplain.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { kanaToRomaji } from '../utils/romaji.js';

function ValueCell({ label, value, tone = 'text-stone-850 dark:text-stone-100', romajiFor }) {
  const romaji = romajiFor(value);
  return (
    <div className="min-w-0 rounded-lg border border-stone-200 bg-white/80 px-2.5 py-2 dark:border-stone-800 dark:bg-stone-950/60">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
        {label}
      </div>
      <div className={`mt-0.5 break-words text-base font-semibold ${tone}`} lang="ja">
        {value}
      </div>
      {romaji && (
        <div className="mt-0.5 break-words text-[10px] italic text-stone-450">{romaji}</div>
      )}
    </div>
  );
}

function RoutePanel({ route, accent = 'indigo', romajiFor }) {
  if (!route) return null;
  const accentClass =
    accent === 'emerald'
      ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/15'
      : 'border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/50 dark:bg-indigo-950/20';
  const headingClass =
    accent === 'emerald'
      ? 'text-emerald-800 dark:text-emerald-200'
      : 'text-indigo-800 dark:text-indigo-200';

  return (
    <div className={`rounded-xl border ${accentClass} p-3`}>
      <div className={`text-sm font-semibold ${headingClass}`}>{route.title}</div>
      {route.detail && (
        <div className="mt-1 text-xs leading-relaxed text-stone-600 dark:text-stone-350">
          {route.detail}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {route.cells.map((cell) => (
          <ValueCell
            key={`${route.title}-${cell.label}`}
            label={cell.label}
            value={cell.value}
            tone={
              cell.label === 'Result'
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-stone-850 dark:text-stone-100'
            }
            romajiFor={romajiFor}
          />
        ))}
      </div>
      <div
        className="mt-3 rounded-lg border border-white/70 bg-white/85 px-2 py-1.5 text-center font-mono text-sm text-stone-900 dark:border-stone-800 dark:bg-stone-900/80 dark:text-stone-100"
        lang="ja"
      >
        {route.formula}
      </div>
    </div>
  );
}

function RowShiftVisual({ visual, onOpenLearn }) {
  if (!visual) return null;
  return (
    <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/55 px-3 py-2.5 dark:border-indigo-900/60 dark:bg-indigo-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-350">
            Row visual
          </div>
          <div className="mt-0.5 text-xs leading-relaxed text-indigo-900 dark:text-indigo-100">
            Final <span lang="ja">{visual.ending}</span> moves to the {visual.targetRow}.
          </div>
        </div>
        {onOpenLearn && (
          <button
            type="button"
            onClick={() => onOpenLearn()}
            className="text-xs font-semibold text-indigo-650 underline decoration-indigo-300 underline-offset-4 transition hover:text-indigo-800 dark:text-indigo-300 dark:decoration-indigo-700 dark:hover:text-indigo-100"
          >
            See Learn table
          </button>
        )}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(4.5rem,0.7fr)_minmax(0,3fr)] sm:items-center">
        <div className="rounded-lg border border-white/80 bg-white/85 px-2.5 py-2 text-center dark:border-stone-800 dark:bg-stone-950/60">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
            Final
          </div>
          <div className="mt-0.5 text-xl font-bold text-stone-950 dark:text-stone-100" lang="ja">
            {visual.ending}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {visual.rows.map((row) => (
            <div
              key={row.label}
              className={`rounded-lg border px-2 py-2 text-center ${
                row.active
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-100'
                  : 'border-stone-200 bg-white/70 text-stone-600 dark:border-stone-800 dark:bg-stone-950/45 dark:text-stone-300'
              }`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider">{row.label}</div>
              <div className="mt-0.5 text-lg font-bold" lang="ja">
                {row.kana}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div
        className="mt-2 rounded-lg border border-white/80 bg-white/85 px-2 py-1.5 text-center font-mono text-sm text-stone-900 dark:border-stone-800 dark:bg-stone-900/80 dark:text-stone-100"
        lang="ja"
      >
        {visual.formula}
      </div>
    </div>
  );
}

export function ConjugationBreakdown({
  word,
  type,
  userAnswer = '',
  practicePrefs = DEFAULT_PREFS,
  onOpenLearn,
}) {
  const debug = useMemo(
    () => getConjugationDebugInfo(word, type, userAnswer),
    [word, type, userAnswer],
  );
  const showRomaji =
    practicePrefs?.displayScripts?.romaji ||
    practicePrefs?.scriptMode === 'romaji' ||
    practicePrefs?.scriptMode === 'all';
  const romajiFor = (value) =>
    showRomaji && /[\u3040-\u30ff\u3400-\u9fff]/.test(String(value || ''))
      ? kanaToRomaji(value)
      : '';

  return (
    <div className="space-y-3 text-left">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          Visual Rule Path
        </h4>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-stone-900 dark:text-stone-100" lang="ja">
            {debug.source}
          </span>
          <span className="text-stone-350 dark:text-stone-600">-&gt;</span>
          <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300" lang="ja">
            {debug.result}
          </span>
          <span className="text-[11px] text-stone-450">{debug.targetLabel}</span>
        </div>
      </div>
      {romajiFor(debug.source) && (
        <div className="text-right text-[11px] italic text-stone-450">
          {romajiFor(debug.source)} -&gt; {romajiFor(debug.result)}
        </div>
      )}

      <section className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2.5 dark:border-stone-800 dark:bg-stone-950/50">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          1. What category is this and why?
        </div>
        <div className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-50">
          {debug.category.label}
        </div>
        <div className="mt-1 text-sm leading-relaxed text-stone-650 dark:text-stone-300">
          {debug.category.why}
        </div>
        {Array.isArray(debug.category.checks) && debug.category.checks.length > 0 && (
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-stone-600 dark:text-stone-350">
            {debug.category.checks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          2. Step-by-step conjugation rules
        </div>
        <div className={`grid gap-2 ${debug.routes.polite ? 'lg:grid-cols-2' : ''}`}>
          <RoutePanel route={debug.routes.plain} accent="indigo" romajiFor={romajiFor} />
          <RoutePanel route={debug.routes.polite} accent="emerald" romajiFor={romajiFor} />
        </div>
        <div className="rounded-lg border border-indigo-100 bg-white/80 px-3 py-2 dark:border-indigo-900/50 dark:bg-stone-950/55">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-350">
            Rule
          </div>
          <div className="mt-0.5 text-sm font-semibold text-indigo-900 dark:text-indigo-100">
            {debug.rule.short}
          </div>
          <div className="mt-0.5 text-xs leading-relaxed text-stone-600 dark:text-stone-350">
            {debug.rule.detail}
          </div>
          <RowShiftVisual visual={debug.rowShiftVisual} onOpenLearn={onOpenLearn} />
          {debug.groupConnection && (
            <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/70 px-2.5 py-2 text-xs leading-relaxed text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/25 dark:text-indigo-100">
              {debug.groupConnection}
            </div>
          )}
        </div>
      </section>

      {debug.mistake ? (
        <div className="grid gap-2 rounded-xl border border-rose-200 bg-rose-50/70 p-2.5 dark:border-rose-900/50 dark:bg-rose-950/15 sm:grid-cols-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-350">
              What went wrong
            </div>
            <div className="mt-1 text-sm font-semibold text-rose-900 dark:text-rose-200">
              {debug.mistake.userRule}
            </div>
            <div className="mt-0.5 text-xs text-rose-700 dark:text-rose-300" lang="ja">
              {debug.mistake.userResult}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-650 dark:text-emerald-350">
              What should have happened
            </div>
            <div className="mt-1 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              {debug.mistake.expectedRule}
            </div>
            <div className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300" lang="ja">
              {debug.mistake.expectedResult}
            </div>
          </div>
          <div className="text-xs leading-relaxed text-stone-600 dark:text-stone-350 sm:col-span-2">
            {debug.mistake.detail}
          </div>
        </div>
      ) : userAnswer && userAnswer !== debug.result ? (
        <div className="grid gap-2 rounded-xl border border-rose-200 bg-rose-50/70 p-2.5 dark:border-rose-900/50 dark:bg-rose-950/15 sm:grid-cols-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-350">
              Your answer
            </div>
            <div className="mt-1 text-sm font-semibold text-rose-900 dark:text-rose-200" lang="ja">
              {userAnswer}
            </div>
            {romajiFor(userAnswer) && (
              <div className="mt-0.5 text-xs italic text-rose-600/70" lang="ja">
                {romajiFor(userAnswer)}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-650 dark:text-emerald-350">
              Correct answer
            </div>
            <div
              className="mt-1 text-sm font-semibold text-emerald-900 dark:text-emerald-200"
              lang="ja"
            >
              {debug.result}
            </div>
            {romajiFor(debug.result) && (
              <div className="mt-0.5 text-xs italic text-emerald-600/70" lang="ja">
                {romajiFor(debug.result)}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
