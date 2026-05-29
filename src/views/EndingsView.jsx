import React, { useState, useEffect, useMemo } from 'react';
import { IconSpark } from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import StickyAction from '../components/StickyAction.jsx';
import {
  filterWordsForPrefs,
  isAdjective,
  conjugate,
  onbinTailFor,
  onbinPatternForVerb,
  ONBIN_TE_CHOICES,
  ONBIN_TA_CHOICES,
  ONBIN_PATTERN_META,
} from '../utils/conjugator.js';
import { defaultState, bumpDaily } from '../utils/storage.js';
import { promptDisplay, formDisplay, shuffled } from '../utils/display.js';
import { callGemini, aiSystemFromPrefs, AI_COACH_SYSTEM } from '../utils/gemini.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

export default function EndingsView({
  state,
  setState,
  verbs,
  practicePrefs = DEFAULT_PREFS,
  wordLists = [],
  geminiKey,
}) {
  const drillVerbs = useMemo(
    () => filterWordsForPrefs(verbs, practicePrefs, wordLists).filter((v) => !isAdjective(v)),
    [verbs, practicePrefs, wordLists],
  );

  const stats = state.onbin || defaultState().onbin;
  const [target, setTarget] = useState('te-form');
  const [current, setCurrent] = useState(null);
  const [result, setResult] = useState(null);
  const [hintChars, setHintChars] = useState(0);
  const [aiTip, setAiTip] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState('');

  useEffect(() => {
    if (!current && drillVerbs.length) {
      next(drillVerbs);
    }
    // next is defined inline without useCallback — adding it would cause infinite re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, drillVerbs, target]);

  useEffect(() => {
    if (
      current &&
      drillVerbs.length &&
      !drillVerbs.some((v) => v.dict === current.dict && v.group === current.group)
    ) {
      setCurrent(null);
      setResult(null);
    }
  }, [drillVerbs, current]);

  function next(pool = drillVerbs) {
    if (!pool.length) {
      setCurrent(null);
      return;
    }
    setCurrent(shuffled(pool)[0]);
    setResult(null);
    setHintChars(0);
    setAiTip('');
    setAiErr('');
  }

  if (!drillVerbs.length) {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-8 text-center text-stone-500">
        No verbs match the current filters.
      </div>
    );
  }

  if (!current) return null;

  const expected = conjugate(current, target);
  const expectedTail = onbinTailFor(current, target);
  const pattern = onbinPatternForVerb(current);
  const prompt = promptDisplay(current, null, practicePrefs);
  const expectedView = formDisplay(expected, practicePrefs, current, target);
  const choices = target === 'te-form' ? ONBIN_TE_CHOICES : ONBIN_TA_CHOICES;
  const patternStats = stats.byPattern?.[pattern.label] || { attempted: 0, correct: 0 };
  const acc = stats.attempted ? Math.round((stats.correct / stats.attempted) * 100) : 0;
  const hint = expected
    .split('')
    .map((ch, i) => (i < hintChars ? ch : '＿'))
    .join('');

  function choose(tail) {
    if (result) return;
    const ok = tail === expectedTail;
    setResult({ ok, tail });
    setState((s) => {
      const prev = s.onbin || defaultState().onbin;
      const pp = prev.byPattern?.[pattern.label] || { attempted: 0, correct: 0 };
      const streak = ok ? (prev.streak || 0) + 1 : 0;
      return {
        ...s,
        onbin: {
          ...prev,
          attempted: (prev.attempted || 0) + 1,
          correct: (prev.correct || 0) + (ok ? 1 : 0),
          hints: (prev.hints || 0) + hintChars,
          streak,
          bestStreak: Math.max(prev.bestStreak || 0, streak),
          byPattern: {
            ...(prev.byPattern || {}),
            [pattern.label]: {
              attempted: (pp.attempted || 0) + 1,
              correct: (pp.correct || 0) + (ok ? 1 : 0),
              lastAt: Date.now(),
            },
          },
        },
        daily: ok ? bumpDaily(s.daily, true, practicePrefs.dailyGoal || 10) : s.daily,
      };
    });
  }

  async function generateMnemonic() {
    if (!geminiKey) return;
    setAiLoading(true);
    setAiTip('');
    setAiErr('');
    try {
      const promptText = `Create one short memorable learner mnemonic for this Japanese conjugation sound-change pattern.\nVerb: ${current.dict} (${current.reading}, ${current.meaning})\nTarget: ${
        target === 'te-form' ? 'te-form' : 'plain past / ta-form'
      }\nPattern: ${pattern.label}\nRule: ${pattern.cue}\nCorrect answer: ${expected}\nKeep it under 35 words, friendly, and include the Japanese ending.`;
      const reply = await callGemini(
        [{ role: 'user', parts: [{ text: promptText }] }],
        geminiKey,
        350,
        0.45,
        aiSystemFromPrefs(practicePrefs, AI_COACH_SYSTEM),
      );
      setAiTip(reply.trim());
    } catch (e) {
      setAiErr(e.message);
    }
    setAiLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-850 p-4">
          <div className="text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-50">
            {stats.correct || 0}/{stats.attempted || 0}
          </div>
          <div className="text-xs text-stone-500">Ending accuracy</div>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-850 p-4">
          <div className="text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-50">
            {acc}%
          </div>
          <div className="text-xs text-stone-500">Overall</div>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-850 p-4">
          <div className="text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-50">
            {stats.streak || 0}
          </div>
          <div className="text-xs text-stone-500">Streak</div>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-850 p-4">
          <div className="text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-50 text-ellipsis overflow-hidden whitespace-nowrap">
            {patternStats.correct || 0}/{patternStats.attempted || 0}
          </div>
          <div className="text-xs text-stone-500 text-ellipsis overflow-hidden whitespace-nowrap">
            {pattern.label}
          </div>
        </div>
      </div>
      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="font-medium flex items-center gap-2 text-stone-900 dark:text-stone-50">
                <IconSpark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Te/Ta Ending Lab
              </h3>
              <p className="text-xs text-stone-500">
                Rapid sound-change drill for て-form and plain past endings.
              </p>
            </div>
            <div className="flex gap-2">
              {[
                { id: 'te-form', label: 'て' },
                { id: 'plain-past', label: 'た' },
              ].map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    setTarget(o.id);
                    setCurrent(null);
                    setResult(null);
                  }}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    target === o.id
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:text-white dark:border-indigo-600'
                      : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-750 dark:text-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-850 p-5 text-center">
            <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium mb-2">
              Choose the ending tail
            </div>
            <ScriptDisplay
              view={prompt}
              className="text-4xl sm:text-5xl font-semibold text-stone-900 dark:text-stone-50"
              subClassName="text-sm text-stone-500 mt-1"
            />
            <div className="mt-2 text-sm text-stone-500">{current.meaning}</div>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-850 px-3 py-1 text-xs text-stone-600 dark:text-stone-400">
              <span>{pattern.label}</span>
              <span className="text-stone-300 dark:text-stone-800">|</span>
              <span>{pattern.cue}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            {choices.map((c) => (
              <button
                key={c}
                onClick={() => choose(c)}
                disabled={!!result}
                className={`min-h-14 px-3 py-3 rounded-xl border text-xl transition ${
                  result && c === expectedTail
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-850 dark:text-emerald-305'
                    : result && c === result.tail && !result.ok
                      ? 'bg-rose-50 border-rose-305 text-rose-800 dark:bg-rose-950/20 dark:border-rose-850 dark:text-rose-305'
                      : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-805 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-stone-800 dark:text-stone-200'
                }`}
                lang="ja"
              >
                {c}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setHintChars(Math.min(expected.length, hintChars + 1))}
              disabled={hintChars >= expected.length || !!result}
              className="px-3 py-2 border border-stone-205 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 disabled:opacity-40 rounded-lg text-sm transition"
            >
              Hint kana
            </button>
            <button
              onClick={generateMnemonic}
              disabled={!geminiKey || aiLoading}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm transition"
            >
              {aiLoading ? 'Thinking...' : 'AI memory hook'}
            </button>
          </div>
          {hintChars > 0 && (
            <div
              className="mt-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-center text-xl tracking-widest text-amber-800 dark:text-amber-300"
              lang="ja"
            >
              {hint}
            </div>
          )}
          {result && (
            <div
              className={`mt-4 rounded-xl border p-4 text-left ${
                result.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/15 border-emerald-250 dark:border-emerald-900/50'
                  : 'bg-rose-50 dark:bg-rose-950/15 border-rose-250 dark:border-rose-900/50'
              }`}
            >
              <span role="status" aria-live="polite" className="sr-only">
                {result.ok ? 'Clean sound change.' : 'Different ending pattern.'}
              </span>
              <div
                className={`text-sm font-medium ${result.ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}
              >
                {result.ok ? 'Clean sound change.' : 'Different ending pattern.'}
              </div>
              <ScriptDisplay
                view={expectedView}
                word={current}
                type={target}
                colorHighlight={practicePrefs.colorCodeConjugations !== false}
                className="text-2xl mt-1 text-stone-900 dark:text-stone-100"
                subClassName="text-xs text-stone-500 mt-1"
              />
              <div className="text-sm text-stone-705 dark:text-stone-300 mt-2">{pattern.cue}</div>
            </div>
          )}
          {aiErr && <div className="mt-3 text-sm text-rose-600">{aiErr}</div>}
          {aiTip && (
            <div className="mt-3 text-left rounded-xl border border-indigo-100 bg-indigo-50 dark:bg-indigo-950/25 dark:border-indigo-900/50 px-3 py-2 text-sm text-indigo-900 dark:text-indigo-300 leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
              {aiTip}
            </div>
          )}
          {result && (
            <StickyAction pad="-mx-5 px-5" className="mt-4">
              <button
                onClick={() => next()}
                autoFocus
                className="w-full py-2.5 bg-stone-850 hover:bg-stone-900 dark:bg-stone-200 dark:hover:bg-stone-150 text-white dark:text-stone-900 rounded-xl font-medium shadow-lg transition"
              >
                Next
              </button>
            </StickyAction>
          )}
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
          <h3 className="font-medium mb-3 text-stone-950 dark:text-stone-50">Pattern map</h3>
          <div className="space-y-2">
            {Object.values(ONBIN_PATTERN_META).map((p) => {
              const s = stats.byPattern?.[p.label] || { attempted: 0, correct: 0 };
              const pctVal = s.attempted ? Math.round((s.correct / s.attempted) * 100) : 0;
              return (
                <div
                  key={p.label}
                  className="rounded-xl border border-stone-200 dark:border-stone-800 px-3 py-2 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-stone-800 dark:text-stone-200">
                      {p.label}
                    </span>
                    <span className="text-xs text-stone-500">
                      {s.correct || 0}/{s.attempted || 0}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 bg-stone-100 dark:bg-stone-950 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: pctVal + '%' }} />
                  </div>
                  <div className="mt-1 text-xs text-stone-500">{p.cue}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
