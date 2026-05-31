import React, { useState, useEffect, useMemo, useRef } from 'react';
import { IconVolume, IconRefresh } from './Icons.jsx';
import { contextSentenceFor } from '../utils/conjugatorExplain.js';
import { callGemini, extractJSON, aiSystemFromPrefs, AI_COACH_SYSTEM } from '../utils/gemini.js';
import { TYPE_LABEL } from '../data/conjugationTypes.js';
import { playPronunciation } from '../utils/speech.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

export function ContextExamplePanel({ item, type, geminiKey, practicePrefs = DEFAULT_PREFS }) {
  const staticExample = useMemo(() => contextSentenceFor(item, type), [item, type]);
  const [aiExample, setAiExample] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const abortRef = useRef(null);

  const example = aiExample || staticExample;

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAiExample(null);
    setErr('');
    setLoading(false);
  }, [item?.dict, type]);

  async function generateNew() {
    if (!geminiKey || !item || loading) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setErr('');
    try {
      const prompt = `Create one short natural Japanese sentence using exactly this conjugated form: ${staticExample.form}
Base word: ${item.dict} (${item.reading})
Meaning: ${item.meaning}
Form: ${TYPE_LABEL[type] || type}
Return ONLY valid JSON with no markdown: {"ja": "Japanese sentence", "en": "English translation"}
Keep it simple and beginner-friendly.`;
      const reply = await callGemini(
        [{ role: 'user', parts: [{ text: prompt }] }],
        geminiKey,
        200,
        0.4,
        aiSystemFromPrefs(practicePrefs, AI_COACH_SYSTEM),
      );
      if (!controller.signal.aborted) {
        const data = extractJSON(reply);
        if (data?.ja && data?.en) {
          setAiExample({
            ja: data.ja,
            en: data.en,
            form: staticExample.form,
            label: staticExample.label,
          });
        } else {
          setErr('Could not parse example.');
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) setErr(e.message);
    }
    if (!controller.signal.aborted) setLoading(false);
    abortRef.current = null;
  }

  return (
    <div className="mt-4 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-300 font-medium">
            In context
          </div>
          <div className="mt-1 text-lg text-stone-900 dark:text-stone-100" lang="ja">
            {example.ja}
          </div>
          <div className="mt-1 text-xs text-indigo-900/80 dark:text-indigo-300/90">
            {example.en}
          </div>
          {err && <div className="mt-1 text-xs text-rose-600">{err}</div>}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={() => playPronunciation(example.ja, 0.85, practicePrefs.voiceURI)}
            aria-label="Play example audio"
            className="px-2.5 py-2 rounded-lg border border-indigo-200 bg-white/70 hover:bg-white text-indigo-700"
          >
            <IconVolume className="w-4 h-4" />
          </button>
          {geminiKey && (
            <button
              onClick={generateNew}
              disabled={loading}
              aria-label="Generate new example"
              className="px-2.5 py-2 rounded-lg border border-indigo-200 bg-white/70 hover:bg-white text-indigo-700 disabled:opacity-40"
            >
              <IconRefresh className={`w-4 h-4${loading ? ' animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
