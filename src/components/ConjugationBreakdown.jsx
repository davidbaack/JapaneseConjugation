import React, { useState, useEffect, useMemo } from 'react';
import { IconSpark } from './Icons.jsx';
import { getConjugationSteps, conjugateItem, wordKey } from '../utils/conjugator.js';
import { getTypeInfo } from '../data/conjugationTypes.js';
import { callGemini, aiSystemFromPrefs } from '../utils/gemini.js';
import { getAICache, setAICache } from '../utils/storage.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

export function ConjugationBreakdown({ word, type, geminiKey, practicePrefs = DEFAULT_PREFS }) {
  const [aiExplanation, setAiExplanation] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showAi, setShowAi] = useState(false);

  const steps = useMemo(() => getConjugationSteps(word, type), [word, type]);
  const wKey = wordKey(word);
  const cacheKey = `${wKey}|${type}`;

  useEffect(() => {
    setAiExplanation('');
    setErr('');
    setLoading(false);
    setShowAi(false);
  }, [wKey, type]);

  async function getAIExplanation() {
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

    setLoading(true);
    setErr('');
    try {
      const prompt = `Explain the conjugation of the Japanese word "${word.dict}" (${word.reading}) to the form "${getTypeInfo(type).label}" (${conjugateItem(word, type)}). Break it down into simple, easy-to-understand linguistic steps for a Japanese learner. Keep it under 100 words and be direct.`;
      const reply = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], geminiKey, 600, 0.25, aiSystemFromPrefs(practicePrefs, 'You are a patient Japanese language teacher explaining conjugation rules step-by-step. Keep explanation concise and direct.'));
      setAiExplanation(reply.trim());
      setAICache('katachiya_ai_explanations_cache', cacheKey, reply.trim());
    } catch (e) {
      setErr(e.message || 'Failed to get AI explanation.');
    }
    setLoading(false);
  }

  return (
    <div className="mt-3 border-t border-stone-100 pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">Conjugation Stepper</h4>
        <button onClick={(e) => { e.stopPropagation(); getAIExplanation(); }} className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-medium flex items-center gap-1 transition">
          <IconSpark className="w-3 h-3"/> {showAi ? 'Refresh AI' : 'Explain with AI'}
        </button>
      </div>

      <div className="relative border-l-2 border-indigo-100 dark:border-indigo-900 ml-2 pl-4 space-y-3.5">
        {steps.map((s, idx) => (
          <div key={idx} className="relative">
            <span className={`absolute -left-[1.55rem] top-0.5 flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${s.isResult ? 'bg-emerald-500 text-white' : 'bg-indigo-500 text-white'}`}>
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
            <IconSpark className="w-3 h-3"/> AI Sensei Breakdown
          </div>
          {loading ? (
            <div className="text-[11px] text-stone-400 italic">Thinking...</div>
          ) : err ? (
            <div className="text-[11px] text-rose-600">{err}</div>
          ) : (
            <p className="text-[11px] text-stone-600 leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">{aiExplanation}</p>
          )}
        </div>
      )}
    </div>
  );
}
