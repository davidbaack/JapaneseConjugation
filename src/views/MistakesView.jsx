import React, { useState, useEffect, useMemo } from 'react';
import { IconVolume } from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import StickyAction from '../components/StickyAction.jsx';
import { toHiragana } from '../utils/romaji.js';
import { conjugateItem, getTypeInfo, promptFormLabel } from '../utils/conjugator.js';
import { explainItem } from '../utils/conjugatorExplain.js';
import { bumpDaily, markMistakeResolved } from '../utils/storage.js';
import { promptDisplay, formDisplay } from '../utils/display.js';
import { playPronunciation } from '../utils/speech.js';
import { useApp } from '../state/AppStateContext.jsx';

export default function MistakesView() {
  const { state, setState, practicePrefs } = useApp();
  const mistakes = useMemo(() => state.mistakes || [], [state.mistakes]);
  const open = useMemo(() => mistakes.filter((m) => !m.resolved), [mistakes]);
  const [activeKey, setActiveKey] = useState(open[0]?.key || mistakes[0]?.key || null);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (activeKey && !mistakes.some((m) => m.key === activeKey)) {
      setActiveKey(open[0]?.key || mistakes[0]?.key || null);
    }
  }, [mistakes, open, activeKey]);

  const active = mistakes.find((m) => m.key === activeKey) || open[0] || mistakes[0] || null;

  function itemFromMistake(m) {
    return { dict: m.dict, reading: m.reading, meaning: m.meaning, group: m.group };
  }

  function retest(m) {
    setActiveKey(m.key);
    setAnswer('');
    setResult(null);
  }

  function submit() {
    if (!active || !answer.trim()) return;
    const item = itemFromMistake(active);
    const expected = conjugateItem(item, active.type) || active.expected;
    const ok = toHiragana(answer) === expected;
    setResult({ ok, expected, item });
    if (ok) {
      setState({
        ...state,
        mistakes: markMistakeResolved(state.mistakes, active.key),
        daily: bumpDaily(state.daily, true, practicePrefs.dailyGoal || 10),
      });
    }
  }

  const activeItem = active ? itemFromMistake(active) : null;
  const activeExpected = activeItem
    ? conjugateItem(activeItem, active.type) || active.expected
    : '';
  const activePromptView = activeItem
    ? promptDisplay(activeItem, active.promptType, practicePrefs)
    : null;
  const activeExpectedView = activeExpected
    ? formDisplay(activeExpected, practicePrefs, activeItem, active.type)
    : null;

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4 text-left">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 overflow-hidden">
        <div className="p-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
          <div>
            <h3 className="font-medium text-stone-950 dark:text-stone-50">Mistake history</h3>
            <p className="text-xs text-stone-500">
              {open.length} unresolved / {mistakes.length} total
            </p>
          </div>
          {!!mistakes.length && (
            <button
              onClick={() => setState({ ...state, mistakes: mistakes.filter((m) => !m.resolved) })}
              className="text-xs text-stone-400 hover:text-rose-600 transition"
            >
              Clear resolved
            </button>
          )}
        </div>
        {!mistakes.length ? (
          <div className="p-8 text-center text-sm text-stone-500">
            Missed answers will appear here for one-tap retests.
          </div>
        ) : (
          <div className="max-h-[560px] overflow-y-auto divide-y divide-stone-50 dark:divide-stone-850">
            {mistakes.map((m) => (
              <button
                key={m.key}
                onClick={() => retest(m)}
                className={`w-full text-left px-4 py-3 transition ${
                  active?.key === m.key
                    ? 'bg-indigo-50 dark:bg-indigo-950/20'
                    : 'hover:bg-stone-50 dark:hover:bg-stone-800/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-stone-800 dark:text-stone-200" lang="ja">
                    {m.dict}
                  </span>
                  <span
                    className={`text-[11px] font-medium ${m.resolved ? 'text-emerald-600 dark:text-emerald-450' : 'text-rose-600 dark:text-rose-450'}`}
                  >
                    {m.resolved ? 'resolved' : `${m.count}x`}
                  </span>
                </div>
                <div className="text-xs text-stone-500">
                  {getTypeInfo(m.type).label}
                  {m.promptType ? ` from ${promptFormLabel(itemFromMistake(m), m.promptType)}` : ''}
                </div>
                <div className="text-xs text-stone-450 truncate">
                  You wrote <span lang="ja">{m.userAnswer}</span>; expected{' '}
                  <span lang="ja">{m.expected}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
        {!active ? (
          <div className="text-center text-stone-550 py-16">No mistakes to retest yet.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-indigo-650 dark:text-indigo-400 font-semibold">
                  Retest missed card
                </div>
                <ScriptDisplay
                  view={activePromptView}
                  className="text-4xl font-medium mt-2 text-stone-900 dark:text-stone-100"
                  subClassName="text-stone-500 mt-1"
                />
                {active.promptType && (
                  <div className="text-xs text-stone-400 mt-1">
                    Base: <span lang="ja">{active.dict}</span> ·{' '}
                    {promptFormLabel(activeItem, active.promptType)}
                  </div>
                )}
                <div className="text-sm text-stone-500 italic mt-2">{active.meaning}</div>
                <div className="text-xs text-stone-400 mt-1">
                  Answer with {getTypeInfo(active.type).label}
                </div>
              </div>
              <button
                onClick={() => playPronunciation(activeExpected, 0.9, practicePrefs.voiceURI)}
                className="p-2 border border-stone-205 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg text-stone-500"
                title="Speak"
                aria-label="Speak answer"
              >
                <IconVolume className="w-4 h-4" />
              </button>
            </div>
            <input
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                setResult(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Type romaji or kana..."
              aria-label="Type your answer in romaji or kana"
              className="w-full px-4 py-3 text-xl text-center border-2 border-stone-200 dark:border-stone-805 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 rounded-xl focus:border-indigo-500 focus:outline-none transition"
              lang="ja"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
            />
            <StickyAction pad="-mx-5 px-5">
              <button
                onClick={submit}
                disabled={!answer.trim()}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-lg transition"
              >
                Retest
              </button>
            </StickyAction>
            {result && (
              <div
                className={`rounded-xl border p-4 ${
                  result.ok
                    ? 'bg-emerald-50 dark:bg-emerald-950/15 border-emerald-250 dark:border-emerald-900/50'
                    : 'bg-rose-50 dark:bg-rose-950/15 border-rose-250 dark:border-rose-900/50'
                }`}
              >
                <span role="status" aria-live="polite" className="sr-only">
                  {result.ok ? 'Resolved.' : 'Still needs work.'}
                </span>
                <div
                  className={`text-sm font-medium ${result.ok ? 'text-emerald-800 dark:text-emerald-305' : 'text-rose-800 dark:text-rose-305'}`}
                >
                  {result.ok ? 'Resolved.' : 'Still needs work.'}
                </div>
                <ScriptDisplay
                  view={activeExpectedView}
                  word={result.item}
                  type={active.type}
                  colorHighlight={practicePrefs.colorCodeConjugations !== false}
                  className="text-xl mt-2 text-stone-900 dark:text-stone-50"
                  subClassName="text-xs text-stone-500 mt-1"
                />
                {!result.ok && (
                  <div className="mt-3 text-sm text-stone-705 dark:text-stone-300">
                    {explainItem(result.item, active.type).rule}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
