import React, { useState, useEffect, useMemo } from 'react';
import { IconSpark } from './Icons.jsx';
import { callGemini, extractJSON } from '../utils/gemini.js';
import { getAICache, setAICache } from '../utils/storage.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

export function getMorae(text) {
  if (!text) return [];
  const morae = [];
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const next = chars[i + 1];
    if (next && /^[ゃゅょぁぃぅぇぉャュョァィゥェォ]/.test(next)) {
      morae.push(char + next);
      i++;
    } else {
      morae.push(char);
    }
  }
  return morae;
}

export function getOfflinePitchAccent(word, morae) {
  if (!morae || morae.length === 0) return { pitch: [], pattern: 'Unknown', typeNumber: 0 };
  if (morae.length === 1) return { pitch: [1], pattern: 'Heiban', typeNumber: 0 };
  const pitch = morae.map((_, idx) => (idx === 0 ? 0 : 1));
  return { pitch, pattern: 'Heiban (Heuristic)', typeNumber: 0 };
}

export function PitchAccentContour({ morae, pitch }) {
  if (!morae || !morae.length || !pitch || !pitch.length) return null;
  const stepWidth = 28;
  const height = 24;
  const padding = 14;

  const points = morae.map((_, i) => {
    const x = padding + i * stepWidth;
    const y = pitch[i] === 1 ? 5 : 19;
    return { x, y };
  });

  let pathD = '';
  if (points.length > 0) {
    pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      pathD += ` L ${points[i].x} ${points[i].y}`;
    }
  }

  return (
    <div className="flex flex-col items-center select-none font-mono">
      <div
        className="relative"
        style={{ height: `${height}px`, width: `${morae.length * stepWidth}px` }}
      >
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ overflow: 'visible' }}
        >
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-indigo-600 dark:text-indigo-400"
            />
          )}
          {points.map((p, idx) => (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r="3.5"
              className="fill-indigo-600 dark:fill-indigo-400 stroke-white dark:stroke-stone-900"
              strokeWidth="1.5"
            />
          ))}
        </svg>
      </div>
      <div className="flex" style={{ width: `${morae.length * stepWidth}px` }}>
        {morae.map((m, idx) => (
          <div
            key={idx}
            className="text-center font-semibold text-stone-700 dark:text-stone-300"
            style={{ width: `${stepWidth}px`, fontSize: '15px' }}
          >
            {m}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PitchAccentSection({
  word,
  kanaText,
  geminiKey,
  practicePrefs: _practicePrefs = DEFAULT_PREFS,
}) {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pitchData, setPitchData] = useState(null);
  const [err, setErr] = useState('');

  const morae = useMemo(() => getMorae(kanaText), [kanaText]);
  const cacheKey = `${word.dict}|${kanaText}`;

  useEffect(() => {
    setShow(false);
    setPitchData(null);
    setErr('');
  }, [word.dict, kanaText]);

  async function toggleShow() {
    if (show) {
      setShow(false);
      return;
    }
    setShow(true);
    if (pitchData) return;

    const cached = getAICache('katachiya_ai_pitch_cache', cacheKey);
    if (cached) {
      setPitchData(cached);
      return;
    }

    if (!geminiKey) {
      const fallback = getOfflinePitchAccent(word, morae);
      setPitchData(fallback);
      setErr('offline');
      return;
    }

    setLoading(true);
    setErr('');
    try {
      const prompt = `Return the Tokyo standard pitch accent data for the Japanese word "${word.dict}" pronounced as "${kanaText}".
Morae of "${kanaText}": [${morae.join(', ')}] (Length: ${morae.length})
Return ONLY JSON in this format:
{"pitch": [1, 0, 0], "pattern": "Atamadaka", "typeNumber": 1}
Where "pitch" is an array of exactly ${morae.length} binary numbers (1 for High, 0 for Low) corresponding to each mora of "${kanaText}".
Do not return any extra markdown or chat formatting. Return valid JSON only.`;

      const reply = await callGemini(
        [{ role: 'user', parts: [{ text: prompt }] }],
        geminiKey,
        400,
        0.1,
        'You are a precise Japanese phonetics database. Return JSON pitch accent arrays matching Tokyo standard pronunciation.',
      );

      const parsed = extractJSON(reply);
      if (parsed && Array.isArray(parsed.pitch)) {
        const alignedPitch = morae.map((_, i) =>
          parsed.pitch[i] !== undefined
            ? parsed.pitch[i]
            : parsed.pitch[parsed.pitch.length - 1] || 0,
        );
        const result = {
          pitch: alignedPitch,
          pattern: parsed.pattern || 'Heiban',
          typeNumber: parsed.typeNumber || 0,
        };

        setAICache('katachiya_ai_pitch_cache', cacheKey, result);

        setPitchData(result);
      } else {
        throw new Error('Invalid JSON structure from AI.');
      }
    } catch (e) {
      const fallback = getOfflinePitchAccent(word, morae);
      setPitchData(fallback);
      setErr(e.message || 'AI pitch accent retrieval failed.');
    }
    setLoading(false);
  }

  const alignedPitch = pitchData
    ? morae.map((_, i) =>
        pitchData.pitch[i] !== undefined
          ? pitchData.pitch[i]
          : pitchData.pitch[pitchData.pitch.length - 1] || 0,
      )
    : [];

  return (
    <div className="mt-2 text-left">
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleShow();
        }}
        aria-expanded={show}
        className="px-2 py-1 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg text-[11px] font-medium flex items-center gap-1 transition select-none"
      >
        <IconSpark className="w-3 h-3 text-indigo-500" />
        {show ? 'Hide Pitch Accent' : 'Show Pitch Accent'}
      </button>

      {show && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 p-3 bg-stone-50 dark:bg-stone-900/40 rounded-xl border border-stone-100 dark:border-stone-800/80 flex flex-col items-center justify-center"
        >
          {loading ? (
            <div className="text-[11px] text-stone-400 italic py-2 animate-pulse">
              Querying pitch accent...
            </div>
          ) : (
            <>
              {pitchData && <PitchAccentContour morae={morae} pitch={alignedPitch} />}
              {pitchData && (
                <div className="text-xs text-stone-500 dark:text-stone-400 mt-2 font-medium">
                  Pattern: {pitchData.pattern}{' '}
                  {pitchData.typeNumber !== undefined ? `(Type ${pitchData.typeNumber})` : ''}
                  {err && err !== 'offline' && (
                    <span className="text-rose-500 ml-2"> (fallback loaded: {err})</span>
                  )}
                  {err === 'offline' && (
                    <span className="text-amber-600 dark:text-amber-400 ml-2">
                      {' '}
                      (offline estimate)
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
