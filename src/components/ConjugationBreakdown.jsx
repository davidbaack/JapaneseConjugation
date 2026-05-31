import React, { useState, useEffect, useMemo, useRef } from 'react';
import { IconSpark } from './Icons.jsx';
import { conjugateItem, wordKey } from '../utils/conjugator.js';
import { getConjugationDebugInfo } from '../utils/conjugatorExplain.js';
import { getTypeInfo } from '../data/conjugationTypes.js';
import { callGemini, aiSystemFromPrefs } from '../utils/gemini.js';
import { getAICache, setAICache } from '../utils/storage.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { kanaToRomaji } from '../utils/romaji.js';

export function ConjugationBreakdown({
  word,
  type,
  userAnswer = '',
  geminiKey,
  practicePrefs = DEFAULT_PREFS,
}) {
  const [aiExplanation, setAiExplanation] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showAi, setShowAi] = useState(false);
  const abortRef = useRef(null);

  const debug = useMemo(
    () => getConjugationDebugInfo(word, type, userAnswer),
    [word, type, userAnswer],
  );
  const steps = debug.steps;
  const wKey = wordKey(word);
  const cacheKey = `${wKey}|${type}`;
  const showRomaji =
    practicePrefs?.displayScripts?.romaji ||
    practicePrefs?.scriptMode === 'romaji' ||
    practicePrefs?.scriptMode === 'all';
  const romajiFor = (value) =>
    showRomaji && /[\u3040-\u30ff\u3400-\u9fff]/.test(String(value || ''))
      ? kanaToRomaji(value)
      : '';

  useEffect(() => {
    setAiExplanation('');
    setErr('');
    setLoading(false);
    setShowAi(false);
  }, [wKey, type]);

  async function getAIExplanation() {
    if (loading) {
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      return;
    }
    setShowAi(true);
    const cached = getAICache('katachiya_ai_explanations_cache', cacheKey);
    if (cached) {
      setAiExplanation(cached);
      return;
    }

    if (!geminiKey) {
      setErr('Please configure a Gemini API key in Settings to use AI explanations.');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setErr('');
    try {
      const prompt = `Explain the conjugation of the Japanese word "${word.dict}" (${word.reading}) to the form "${getTypeInfo(type).label}" (${conjugateItem(word, type)}). Break it down into simple, easy-to-understand linguistic steps for a Japanese learner. Keep it under 100 words and be direct.`;
      const reply = await callGemini(
        [{ role: 'user', parts: [{ text: prompt }] }],
        geminiKey,
        600,
        0.25,
        aiSystemFromPrefs(
          practicePrefs,
          'You are a patient Japanese language teacher explaining conjugation rules step-by-step. Keep explanation concise and direct.',
        ),
      );
      if (!controller.signal.aborted) {
        setAiExplanation(reply.trim());
        setAICache('katachiya_ai_explanations_cache', cacheKey, reply.trim());
      }
    } catch (e) {
      if (!controller.signal.aborted) setErr(e.message || 'Failed to get AI explanation.');
    }
    if (!controller.signal.aborted) setLoading(false);
    abortRef.current = null;
  }

  return (
    <div className="mt-3 border-t border-stone-100 dark:border-stone-800 pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          Visual Rule Path
        </h4>
        <button
          onClick={(e) => {
            e.stopPropagation();
            getAIExplanation();
          }}
          aria-expanded={showAi}
          className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-medium flex items-center gap-1 transition"
        >
          <IconSpark className="w-3 h-3" /> {showAi ? 'Refresh AI' : 'Explain with AI'}
        </button>
      </div>

      <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white/75 dark:bg-stone-950/55 p-3 space-y-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold text-stone-900 dark:text-stone-100" lang="ja">
            {debug.source}
          </span>
          <span className="text-stone-350 dark:text-stone-600">-&gt;</span>
          <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300" lang="ja">
            {debug.result}
          </span>
          <span className="text-[11px] text-stone-450">{debug.targetLabel}</span>
        </div>
        {romajiFor(debug.source) && (
          <div className="text-[11px] italic text-stone-450">
            {romajiFor(debug.source)} -&gt; {romajiFor(debug.result)}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ['Stem', debug.stem || debug.source, 'text-sky-700 dark:text-sky-300'],
            ['Ending', debug.originalEnding, 'text-amber-700 dark:text-amber-300'],
            ['Replace', debug.replacement || 'same form', 'text-indigo-700 dark:text-indigo-300'],
            ['Result', debug.result, 'text-emerald-700 dark:text-emerald-300'],
          ].map(([label, value, tone]) => (
            <div
              key={label}
              className="min-w-0 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/70 px-2.5 py-2"
            >
              <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
                {label}
              </div>
              <div className={`mt-0.5 text-base font-semibold break-words ${tone}`} lang="ja">
                {value}
              </div>
              {romajiFor(value) && (
                <div className="mt-0.5 text-[10px] italic text-stone-450 break-words">
                  {romajiFor(value)}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-indigo-50/70 dark:bg-indigo-950/25 border border-indigo-100 dark:border-indigo-900/50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-indigo-500 dark:text-indigo-350 font-semibold">
            Rule
          </div>
          <div className="mt-0.5 text-sm font-semibold text-indigo-900 dark:text-indigo-100">
            {debug.rule.short}
          </div>
          <div className="mt-0.5 text-xs text-stone-600 dark:text-stone-350 leading-relaxed">
            {debug.rule.detail}
          </div>
          <div className="mt-2 text-sm text-center font-mono text-stone-900 dark:text-stone-100 bg-white/80 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-800 rounded-lg px-2 py-1.5 break-words">
            {debug.formula.expression}
          </div>
        </div>

        {debug.mistake && (
          <div className="grid sm:grid-cols-2 gap-2 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/15 p-2.5">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-rose-600 dark:text-rose-350 font-semibold">
                Your answer used
              </div>
              <div className="mt-1 text-sm font-semibold text-rose-900 dark:text-rose-200">
                {debug.mistake.userRule}
              </div>
              <div className="mt-0.5 text-xs text-rose-700 dark:text-rose-300" lang="ja">
                {debug.mistake.userResult}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-650 dark:text-emerald-350 font-semibold">
                Expected
              </div>
              <div className="mt-1 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                {debug.mistake.expectedRule}
              </div>
              <div className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300" lang="ja">
                {debug.mistake.expectedResult}
              </div>
            </div>
            <div className="sm:col-span-2 text-xs text-stone-600 dark:text-stone-350 leading-relaxed">
              {debug.mistake.detail}
            </div>
          </div>
        )}
      </div>

      <div className="relative border-l-2 border-indigo-100 dark:border-indigo-900 ml-2 pl-4 space-y-3.5">
        {steps.map((s, idx) => (
          <div key={idx} className="relative">
            <span
              className={`absolute -left-[1.55rem] top-0.5 flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${s.isResult ? 'bg-emerald-500 text-white' : 'bg-indigo-500 text-white'}`}
            >
              {idx + 1}
            </span>
            <div className="text-[11px] font-semibold text-stone-700">{s.title}</div>
            <div className="text-[11px] text-stone-500 mt-0.5 leading-relaxed">{s.desc}</div>
            {s.isResult && (
              <div className="mt-1 inline-block rounded-lg bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                {s.expected}
              </div>
            )}
          </div>
        ))}
      </div>

      {showAi && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-2.5 space-y-1">
          <div className="text-[11px] font-semibold text-indigo-800 flex items-center gap-1">
            <IconSpark className="w-3 h-3" /> AI Sensei Breakdown
          </div>
          <div role="status" aria-live="polite">
            {loading ? (
              <div className="text-[11px] text-stone-400 italic">Thinking...</div>
            ) : err ? (
              <div className="text-[11px] text-rose-600">{err}</div>
            ) : (
              <p className="text-[11px] text-stone-600 leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
                {aiExplanation}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
