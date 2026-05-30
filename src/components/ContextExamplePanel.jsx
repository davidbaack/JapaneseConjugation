import React, { useState, useEffect, useMemo, useRef } from 'react';
import { IconVolume, IconSpark } from './Icons.jsx';
import { contextSentenceFor } from '../utils/conjugatorExplain.js';
import { callGemini, aiSystemFromPrefs, AI_COACH_SYSTEM } from '../utils/gemini.js';
import { TYPE_LABEL } from '../data/conjugationTypes.js';
import { playPronunciation } from '../utils/speech.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

export function ContextExamplePanel({ item, type, geminiKey, practicePrefs = DEFAULT_PREFS }) {
  const example = useMemo(() => contextSentenceFor(item, type), [item, type]);
  const [aiText, setAiText] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const abortRef = useRef(null);

  useEffect(() => {
    setAiText('');
    setErr('');
    setLoading(false);
  }, [item?.dict, type]);

  async function generate() {
    if (!geminiKey || !item) return;
    if (loading) {
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setErr('');
    setAiText('');
    try {
      const prompt = `Create two short natural Japanese example sentences using exactly this conjugated form: ${example.form}\nBase word: ${item.dict} (${item.reading})\nMeaning: ${item.meaning}\nForm: ${TYPE_LABEL[type] || type}\nReturn each sentence with a brief English meaning and one tiny usage note. Keep it beginner-friendly.`;
      const reply = await callGemini(
        [{ role: 'user', parts: [{ text: prompt }] }],
        geminiKey,
        700,
        0.35,
        aiSystemFromPrefs(practicePrefs, AI_COACH_SYSTEM),
      );
      if (!controller.signal.aborted) setAiText(reply.trim());
    } catch (e) {
      if (!controller.signal.aborted) setErr(e.message);
    }
    if (!controller.signal.aborted) setLoading(false);
    abortRef.current = null;
  }

  return (
    <div className="mt-4 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-300 font-medium">
            In context
          </div>
          <div className="mt-1 text-lg text-stone-900 dark:text-stone-100" lang="ja">
            {example.ja}
          </div>
          <div className="mt-1 text-xs text-indigo-900/80 dark:text-indigo-300/90">
            {example.en}
          </div>
        </div>
        <button
          onClick={() => playPronunciation(example.ja, 0.85, practicePrefs.voiceURI)}
          aria-label="Play example audio"
          className="px-2.5 py-2 rounded-lg border border-indigo-200 bg-white/70 hover:bg-white text-indigo-700"
        >
          <IconVolume className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={generate}
          disabled={!geminiKey}
          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm inline-flex items-center gap-1.5"
        >
          <IconSpark className="w-4 h-4" />
          {loading ? 'Cancel' : 'AI examples'}
        </button>
        {!geminiKey && (
          <div className="text-xs text-indigo-900/60 dark:text-indigo-300/60 self-center">
            Add a Gemini key for natural examples.
          </div>
        )}
      </div>
      <div role="status" aria-live="polite">
        {err && <div className="mt-2 text-sm text-rose-600">{err}</div>}
        {aiText && (
          <div className="mt-3 rounded-lg border border-indigo-100 dark:border-indigo-900/40 bg-white/80 dark:bg-stone-800/80 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-stone-700 dark:text-stone-200 max-h-80 overflow-y-auto">
            {aiText}
          </div>
        )}
      </div>
    </div>
  );
}
