import { useState, useEffect } from 'react';
import { callGemini, extractJSON } from '../utils/gemini.js';
import { getTypeInfo } from '../data/conjugationTypes.js';
import { getWordMeta } from '../utils/conjugator.js';
import { getOfflineTemplateSentence } from '../utils/conjugatorExplain.js';
import { getAICache, setAICache } from '../utils/storage.js';

// Fill-in-the-blank sentence for the "sentence" drill mode (improvement #4 —
// StudyView decomposition). Resolves a cached clip first, then asks Gemini for
// a level-appropriate sentence containing the target form as a blank, and
// falls back to an offline template on any failure or when AI is unavailable.
// Keyed on the card id so it doesn't refetch on unrelated re-renders.
export function useAISentence({
  current,
  drillMode,
  geminiKey,
  reverseDrill,
  sourceForm,
  scriptMode,
}) {
  const [aiSentence, setAiSentence] = useState(null);

  useEffect(() => {
    if (!current || drillMode !== 'sentence') {
      setAiSentence(null);
      return;
    }

    const key = `${current.verb.group}:${current.verb.dict}|${current.type}`;

    const cached = getAICache('katachiya_ai_sentence_cache', key);
    if (cached) {
      setAiSentence({
        sentence: cached.sentence,
        translation: cached.translation,
        loading: false,
        err: '',
      });
      return;
    }

    if (!geminiKey) {
      const fallback = getOfflineTemplateSentence(current.verb, current.type);
      setAiSentence({ ...fallback, loading: false, err: '' });
      return;
    }

    setAiSentence({ sentence: '', translation: '', loading: true, err: '' });

    const expectedVal = reverseDrill ? current.verb.reading : sourceForm;
    const targetLabel = getTypeInfo(current.type).label;
    const jlptLevel = getWordMeta(current.verb).jlpt || 'N5';
    const scriptPref =
      scriptMode === 'hiragana'
        ? 'Write the Japanese sentence in Hiragana only (no Kanji).'
        : scriptMode === 'romaji'
          ? 'Write the Japanese sentence in Romaji only (English letters).'
          : 'Use standard Japanese writing with Kanji and Hiragana.';
    const prompt = `Create one short, level-appropriate Japanese practice sentence for a learner of JLPT ${jlptLevel}.
${scriptPref}
The sentence must naturally contain the word "${current.verb.dict}" (${current.verb.reading}) conjugated into its "${targetLabel}" form (which is "${expectedVal}").
In the sentence, replace the conjugated form with a blank "[______]".

Return ONLY valid JSON (no markdown formatting, no code block backticks):
{"sentence": "Japanese sentence with [______]", "translation": "English translation"}

Keep it concise and clear.`;

    let cancelled = false;
    callGemini(
      [{ role: 'user', parts: [{ text: prompt }] }],
      geminiKey,
      400,
      0.2,
      'You create short Japanese grammar sentences for quizzes. Return JSON only.',
    )
      .then((reply) => {
        if (cancelled) return;
        const data = extractJSON(reply);
        if (data && data.sentence && data.translation) {
          const resultObj = { sentence: data.sentence, translation: data.translation };
          setAICache('katachiya_ai_sentence_cache', key, resultObj);
          setAiSentence({ ...resultObj, loading: false, err: '' });
        } else {
          throw new Error('Invalid JSON structure from AI.');
        }
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = getOfflineTemplateSentence(current.verb, current.type);
        setAiSentence({ ...fallback, loading: false, err: '' });
      });
    return () => {
      cancelled = true;
    };
    // Other inputs intentionally omitted — keyed on the card id to avoid refetching on render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, drillMode, geminiKey]);

  return aiSentence;
}
