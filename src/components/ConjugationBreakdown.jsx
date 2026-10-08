import React, { useId, useMemo, useState } from 'react';
import { getConjugationDebugInfo } from '../utils/conjugatorExplain.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { kanaToRomaji } from '../utils/romaji.js';
import { GodanRowChart } from './GodanRowChart.jsx';

function RowShiftVisual({ visual, onOpenFormationKeys, onOpenLearn }) {
  if (!visual) return null;
  const canOpenTable = !!(onOpenFormationKeys || onOpenLearn);
  const openTable = () => {
    if (onOpenFormationKeys) {
      onOpenFormationKeys(visual);
      return;
    }
    onOpenLearn?.();
  };

  return (
    <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/55 px-3 py-2.5 dark:border-indigo-900/60 dark:bg-indigo-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-300">
            Row visual
          </div>
          <div className="mt-0.5 text-xs leading-relaxed text-indigo-900 dark:text-indigo-100">
            Final <span lang="ja">{visual.ending}</span> moves to the {visual.targetRow}.
          </div>
        </div>
        {canOpenTable && (
          <button
            type="button"
            onClick={openTable}
            className="text-xs font-semibold text-indigo-600 underline decoration-indigo-300 underline-offset-4 transition hover:text-indigo-800 dark:text-indigo-300 dark:decoration-indigo-700 dark:hover:text-indigo-100"
          >
            See Learn table
          </button>
        )}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(4.5rem,0.7fr)_minmax(0,3fr)] sm:items-center">
        <div className="rounded-lg border border-white/80 bg-white/85 px-2.5 py-2 text-center dark:border-stone-800 dark:bg-stone-950/60">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
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
      <details className="group mt-3 overflow-hidden rounded-xl border border-indigo-100 bg-white/70 dark:border-indigo-900/60 dark:bg-stone-950/45">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:bg-indigo-950/30 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-xs font-semibold text-indigo-900 dark:text-indigo-100">
              Full godan row table
            </span>
            <span className="mt-0.5 block text-[11px] text-stone-500 dark:text-stone-400">
              All five vowel rows, with this shift highlighted
            </span>
          </span>
          <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 group-open:hidden dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
            Show
          </span>
          <span className="hidden rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 group-open:inline dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
            Hide
          </span>
        </summary>
        <div className="border-t border-indigo-100 p-2 dark:border-indigo-900/60 sm:p-3">
          <GodanRowChart highlightEnding={visual.ending} highlightRow={visual.targetRow} />
        </div>
      </details>
    </div>
  );
}

const MASU_SOUND_CHANGE_ROWS = {
  'te-form': [
    { label: 'き', kana: 'いて' },
    { label: 'ぎ', kana: 'いで' },
    { label: 'し', kana: 'して' },
    { label: 'い/ち/り', kana: 'って' },
    { label: 'に/び/み', kana: 'んで' },
  ],
  'ta-form': [
    { label: 'き', kana: 'いた' },
    { label: 'ぎ', kana: 'いだ' },
    { label: 'し', kana: 'した' },
    { label: 'い/ち/り', kana: 'った' },
    { label: 'に/び/み', kana: 'んだ' },
  ],
};

function SoundChangeVisual({ visual, onOpenLearn, sourceLabel = 'Final' }) {
  if (!visual) return null;
  return (
    <div className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50/55 px-3 py-2.5 dark:border-cyan-900/60 dark:bg-cyan-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
            Sound-change visual
          </div>
          <div className="mt-0.5 text-xs leading-relaxed text-cyan-950 dark:text-cyan-100">
            {sourceLabel} <span lang="ja">{visual.ending}</span> takes the{' '}
            <span lang="ja">{visual.targetLabel}</span> sound-change ending.
          </div>
        </div>
        {onOpenLearn && (
          <button
            type="button"
            onClick={() => onOpenLearn()}
            className="text-xs font-semibold text-cyan-700 underline decoration-cyan-300 underline-offset-4 transition hover:text-cyan-900 dark:text-cyan-300 dark:decoration-cyan-700 dark:hover:text-cyan-100"
          >
            See Learn table
          </button>
        )}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(4.5rem,0.65fr)_minmax(0,4fr)] sm:items-center">
        <div className="rounded-lg border border-white/80 bg-white/85 px-2.5 py-2 text-center dark:border-stone-800 dark:bg-stone-950/60">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            {sourceLabel}
          </div>
          <div className="mt-0.5 text-xl font-bold text-stone-950 dark:text-stone-100" lang="ja">
            {visual.ending}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {visual.rows.map((row) => (
            <div
              key={row.label}
              className={`rounded-lg border px-2 py-2 text-center ${
                row.active
                  ? 'border-amber-300 bg-amber-50 text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-950/35 dark:text-amber-100'
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

function MasuPathVisual({ route, onOpenLearn }) {
  if (!route) return null;
  const role = route.cells?.[2]?.label;
  const standardRows = MASU_SOUND_CHANGE_ROWS[role];
  const rows = standardRows?.map((row) => ({
    ...row,
    kana: row.label.split('/').includes(route.stemEnding) ? route.bridgeEnding : row.kana,
    active: row.label.split('/').includes(route.stemEnding),
  }));

  if (rows?.some((row) => row.active)) {
    return (
      <SoundChangeVisual
        visual={{
          ending: route.stemEnding,
          targetLabel: route.bridgeEnding,
          rows,
          formula: route.formula,
        }}
        onOpenLearn={onOpenLearn}
        sourceLabel="ます stem final"
      />
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/55 px-3 py-2.5 dark:border-emerald-900/60 dark:bg-emerald-950/20">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
        From ます form
      </div>
      <div className="mt-1 text-xs leading-relaxed text-emerald-950 dark:text-emerald-100">
        Drop <span lang="ja">ます</span>, then build the target from the remaining stem.
      </div>
      <div
        className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-100"
        lang="ja"
      >
        <span>{route.source}</span>
        <span aria-hidden="true" className="text-stone-400">
          →
        </span>
        <span>{route.stem}</span>
        <span aria-hidden="true" className="text-stone-400">
          →
        </span>
        <span className="text-emerald-700 dark:text-emerald-300">{route.result}</span>
      </div>
      <div
        className="mt-3 rounded-lg border border-white/80 bg-white/85 px-2 py-1.5 text-center font-mono text-sm text-stone-900 dark:border-stone-800 dark:bg-stone-900/80 dark:text-stone-100"
        lang="ja"
      >
        {route.formula}
      </div>
    </div>
  );
}

export function ConjugationBreakdown({
  word,
  type,
  userAnswer = '',
  practicePrefs = DEFAULT_PREFS,
  onOpenFormationKeys,
  onOpenLearn,
  suppressRuleSummary = false,
}) {
  const debug = useMemo(
    () => getConjugationDebugInfo(word, type, userAnswer),
    [word, type, userAnswer],
  );
  const [selectedMasuPath, setSelectedMasuPath] = useState('');
  const pathTabsId = useId();
  const pathKey = `${debug.source}:${type}`;
  const showMasuPath = !!debug.routes.polite && selectedMasuPath === pathKey;
  const masuRuleShort = debug.routes.polite?.stemEnding
    ? `${debug.routes.polite.stemEnding} -> ${debug.routes.polite.bridgeEnding} (${kanaToRomaji(debug.routes.polite.stemEnding)} -> ${kanaToRomaji(debug.routes.polite.bridgeEnding)})`
    : 'drop ます -> use the remaining stem';
  const handlePathKeyDown = (event) => {
    const chooseMasu =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'End';
    const chooseDictionary =
      event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'Home';
    if (!chooseMasu && !chooseDictionary) return;
    event.preventDefault();
    setSelectedMasuPath(chooseMasu ? pathKey : '');
    const tabs = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
    tabs?.[chooseMasu ? 1 : 0]?.focus();
  };
  const hasRuleExtras = !!(
    debug.soundChangeVisual ||
    debug.rowShiftVisual ||
    debug.groupConnection
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
          <span className="text-stone-300 dark:text-stone-600">-&gt;</span>
          <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300" lang="ja">
            {debug.result}
          </span>
          <span className="text-[11px] text-stone-500 dark:text-stone-400">
            {debug.targetLabel}
          </span>
        </div>
      </div>
      {romajiFor(debug.source) && (
        <div className="text-right text-[11px] italic text-stone-500 dark:text-stone-400">
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
        <div className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
          {debug.category.why}
        </div>
        {Array.isArray(debug.category.checks) && debug.category.checks.length > 0 && (
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-stone-600 dark:text-stone-300">
            {debug.category.checks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          2. Apply the rule
        </div>
        {(!suppressRuleSummary || hasRuleExtras) && (
          <div className="rounded-lg border border-indigo-100 bg-white/80 px-3 py-2 dark:border-indigo-900/50 dark:bg-stone-950/55">
            {!suppressRuleSummary && (
              <>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-300">
                  Rule
                </div>
                <div className="mt-0.5 text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                  {showMasuPath ? masuRuleShort : debug.rule.short}
                </div>
                <div className="mt-0.5 text-xs leading-relaxed text-stone-600 dark:text-stone-300">
                  {showMasuPath ? debug.routes.polite.detail : debug.rule.detail}
                </div>
              </>
            )}
            {debug.routes.polite && (
              <div
                className="mt-3 inline-flex w-full rounded-lg border border-stone-200 bg-stone-100/80 p-1 dark:border-stone-800 dark:bg-stone-900/70"
                role="tablist"
                aria-label="Conjugation starting point"
              >
                <button
                  type="button"
                  role="tab"
                  id={`${pathTabsId}-dictionary`}
                  aria-controls={`${pathTabsId}-panel`}
                  aria-selected={!showMasuPath}
                  tabIndex={showMasuPath ? -1 : 0}
                  onClick={() => setSelectedMasuPath('')}
                  onKeyDown={handlePathKeyDown}
                  className={`min-h-10 flex-1 rounded-md px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    !showMasuPath
                      ? 'bg-white text-indigo-800 shadow-sm dark:bg-stone-800 dark:text-indigo-200'
                      : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
                  }`}
                >
                  Dictionary form
                </button>
                <button
                  type="button"
                  role="tab"
                  id={`${pathTabsId}-masu`}
                  aria-controls={`${pathTabsId}-panel`}
                  aria-selected={showMasuPath}
                  tabIndex={showMasuPath ? 0 : -1}
                  onClick={() => setSelectedMasuPath(pathKey)}
                  onKeyDown={handlePathKeyDown}
                  className={`min-h-10 flex-1 rounded-md px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    showMasuPath
                      ? 'bg-white text-emerald-800 shadow-sm dark:bg-stone-800 dark:text-emerald-200'
                      : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
                  }`}
                >
                  ます form
                </button>
              </div>
            )}
            <div
              id={`${pathTabsId}-panel`}
              role="tabpanel"
              aria-labelledby={`${pathTabsId}-${showMasuPath ? 'masu' : 'dictionary'}`}
            >
              {showMasuPath ? (
                <MasuPathVisual route={debug.routes.polite} onOpenLearn={onOpenLearn} />
              ) : debug.soundChangeVisual ? (
                <SoundChangeVisual visual={debug.soundChangeVisual} onOpenLearn={onOpenLearn} />
              ) : (
                <RowShiftVisual
                  visual={debug.rowShiftVisual}
                  onOpenFormationKeys={onOpenFormationKeys}
                  onOpenLearn={onOpenLearn}
                />
              )}
            </div>
            {debug.groupConnection && (
              <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/70 px-2.5 py-2 text-xs leading-relaxed text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/25 dark:text-indigo-100">
                {debug.groupConnection}
              </div>
            )}
          </div>
        )}
      </section>

      {debug.mistake ? (
        <div className="grid gap-2 rounded-xl border border-rose-200 bg-rose-50/70 p-2.5 dark:border-rose-900/50 dark:bg-rose-950/15 sm:grid-cols-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">
              Pattern you used
            </div>
            <div className="mt-1 text-sm font-semibold text-rose-900 dark:text-rose-200">
              {debug.mistake.userRule}
            </div>
            <div className="mt-0.5 text-xs text-rose-700 dark:text-rose-300" lang="ja">
              {debug.mistake.userResult}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Pattern to use
            </div>
            <div className="mt-1 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              {debug.mistake.expectedRule}
            </div>
            <div className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300" lang="ja">
              {debug.mistake.expectedResult}
            </div>
          </div>
          <div className="text-xs leading-relaxed text-stone-600 dark:text-stone-300 sm:col-span-2">
            {debug.mistake.detail}
          </div>
        </div>
      ) : userAnswer && userAnswer !== debug.result ? (
        <div className="grid gap-2 rounded-xl border border-rose-200 bg-rose-50/70 p-2.5 dark:border-rose-900/50 dark:bg-rose-950/15 sm:grid-cols-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">
              Your answer
            </div>
            <div className="mt-1 text-sm font-semibold text-rose-900 dark:text-rose-200" lang="ja">
              {userAnswer}
            </div>
            {romajiFor(userAnswer) && (
              <div className="mt-0.5 text-xs italic text-rose-700 dark:text-rose-300" lang="ja">
                {romajiFor(userAnswer)}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Correct answer
            </div>
            <div
              className="mt-1 text-sm font-semibold text-emerald-900 dark:text-emerald-200"
              lang="ja"
            >
              {debug.result}
            </div>
            {romajiFor(debug.result) && (
              <div
                className="mt-0.5 text-xs italic text-emerald-700 dark:text-emerald-300"
                lang="ja"
              >
                {romajiFor(debug.result)}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
