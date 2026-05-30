import React, { useState, useEffect, useRef, useMemo } from 'react';
import { IconChat } from './Icons.jsx';
import { toHiragana } from '../utils/romaji.js';
import { callGemini, aiSystemFromPrefs, AI_SYSTEM } from '../utils/gemini.js';
import { getTypeInfo } from '../data/conjugationTypes.js';
import { isAdjective } from '../utils/conjugator.js';
import { GROUP_NAMES, explainItem } from '../utils/conjugatorExplain.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

function feedbackNoteFor(prefs) {
  return (prefs.aiFeedbackLevel || DEFAULT_PREFS.aiFeedbackLevel) === 'expert'
    ? 'Use the configured Expert JP feedback style; romaji only for the most important forms.'
    : 'Use the configured Beginner feedback style; show romaji for key forms.';
}

export function buildContext(
  verb,
  type,
  userAnswer,
  expected,
  explanation,
  prefs = DEFAULT_PREFS,
  taskOverride = '',
  wasCorrected = false,
) {
  const ti = getTypeInfo(type);
  const label = isAdjective(verb) ? 'Adjective' : 'Verb';
  const feedbackNote = feedbackNoteFor(prefs);
  const task = taskOverride || `${ti.label} (${ti.hint})`;
  const opener = wasCorrected
    ? `I'm studying Japanese. I made a mistake mid-typing but self-corrected to the right answer — it still counts as wrong.`
    : `I'm studying Japanese and just got this wrong.`;
  const answerLabel = wasCorrected ? 'My answer when I went wrong' : 'My answer';
  const correctedNote = wasCorrected
    ? `\nSelf-correction: I later typed the right answer before submitting, but the initial mistake counted.`
    : '';
  return `${opener}\n\n${label}: ${verb.dict} (${verb.reading}) — ${verb.meaning}\nType: ${GROUP_NAMES[verb.group]}\nTask: ${task}\n${answerLabel}: ${toHiragana(userAnswer) || userAnswer || '(blank)'}\nCorrect: ${expected}${correctedNote}\n\nAuto-explanation: ${explanation.intro} ${explanation.rule}${explanation.derivation && explanation.derivation !== expected ? '\nStep: ' + explanation.derivation : ''}${explanation.note ? '\nNote: ' + explanation.note : ''}\n\nHelp me understand what I typed wrong and how to remember the right form. ${feedbackNote}`;
}

// Context for the "Discuss further" chat opened while the student is still
// answering. Crucially it never states the correct answer — the AI coaches
// toward it one step at a time.
export function buildCoachContext(
  verb,
  type,
  userAnswer,
  prefs = DEFAULT_PREFS,
  taskOverride = '',
) {
  const ti = getTypeInfo(type);
  const label = isAdjective(verb) ? 'Adjective' : 'Verb';
  const feedbackNote = feedbackNoteFor(prefs);
  const exp = explainItem(verb, type);
  const task = taskOverride || `${ti.label} (${ti.hint})`;
  return `I'm practicing Japanese conjugation and want step-by-step hints. IMPORTANT: do NOT tell me the final answer — coach me toward it.\n\n${label}: ${verb.dict} (${verb.reading}) — ${verb.meaning}\nType: ${GROUP_NAMES[verb.group]}\nTask: transform to ${task}\nWhat I've typed so far: ${toHiragana(userAnswer) || userAnswer || '(nothing yet)'}\nHow this form is built: ${exp.rule || 'apply the standard rule for this form'}${exp.note ? ' ' + exp.note : ''}\n\nTell me what to do for the next step only, then wait for me. Never reveal the whole answer. ${feedbackNote}`;
}

export function ChatPanel({
  verb,
  type,
  userAnswer,
  expected,
  explanation,
  geminiKey,
  practicePrefs = DEFAULT_PREFS,
  taskOverride = '',
  mode = 'review',
  wasCorrected = false,
}) {
  const [apiHistory, setApiHistory] = useState([]);
  const [display, setDisplay] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const endRef = useRef(null);
  /* eslint-disable react-hooks/exhaustive-deps */
  const context = useMemo(
    () =>
      mode === 'coach'
        ? buildCoachContext(verb, type, userAnswer, practicePrefs, taskOverride)
        : buildContext(
            verb,
            type,
            userAnswer,
            expected,
            explanation,
            practicePrefs,
            taskOverride,
            wasCorrected,
          ),
    [
      verb,
      type,
      userAnswer,
      expected,
      explanation,
      practicePrefs.aiFeedbackLevel,
      taskOverride,
      mode,
      wasCorrected,
    ],
  );
  /* eslint-enable react-hooks/exhaustive-deps */
  const baseSystem =
    mode === 'coach'
      ? `${AI_SYSTEM} You are coaching a student who is still mid-answer: never reveal the full correct answer, and guide only the next single step.`
      : AI_SYSTEM;
  /* eslint-disable react-hooks/exhaustive-deps */
  const systemText = useMemo(
    () => aiSystemFromPrefs(practicePrefs, baseSystem),
    [practicePrefs.aiFeedbackLevel, practicePrefs.aiGuideTone, mode],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    const init = [{ role: 'user', content: context }];
    const geminiMsgs = init.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    callGemini(geminiMsgs, geminiKey, 600, 0.7, systemText)
      .then((reply) => {
        setApiHistory([...init, { role: 'assistant', content: reply }]);
        setDisplay([{ role: 'assistant', content: reply }]);
      })
      .catch((e) => setDisplay([{ role: 'assistant', content: `Error: ${e.message}` }]))
      .finally(() => setLoading(false));
  }, [context, geminiKey, systemText]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [display, loading]);

  async function send() {
    if (!input.trim() || loading) return;
    const txt = input;
    setInput('');
    const newDisplay = [...display, { role: 'user', content: txt }];
    setDisplay(newDisplay);
    setLoading(true);
    const newApi = [...apiHistory, { role: 'user', content: txt }];
    try {
      const geminiMsgs = newApi.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const reply = await callGemini(geminiMsgs, geminiKey, 600, 0.7, systemText);
      setApiHistory([...newApi, { role: 'assistant', content: reply }]);
      setDisplay([...newDisplay, { role: 'assistant', content: reply }]);
    } catch (e) {
      setDisplay([...newDisplay, { role: 'assistant', content: `Error: ${e.message}` }]);
    }
    setLoading(false);
  }

  return (
    <div
      className={`mt-3 pt-3 border-t ${mode === 'coach' ? 'border-indigo-200 dark:border-indigo-800/40' : 'border-rose-200'}`}
    >
      <div className="text-xs font-medium text-stone-500 mb-2 flex items-center gap-1.5">
        <IconChat className="w-3.5 h-3.5" />
        {mode === 'coach' ? 'Discuss with Gemini' : 'Chat with Gemini'}
      </div>
      <div
        role="log"
        aria-live="polite"
        aria-busy={loading}
        className="space-y-2 max-h-96 overflow-y-auto pb-1"
      >
        {loading && !display.length && (
          <div className="text-sm text-stone-400 italic px-3 py-2 animate-pulse">
            Gemini is thinking…
          </div>
        )}
        {display.map((m, i) => (
          <div
            key={i}
            style={{ whiteSpace: 'pre-wrap' }}
            className={`text-sm px-3 py-2 rounded-lg leading-relaxed ${m.role === 'assistant' ? 'bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-100' : 'bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/50 text-indigo-900 dark:text-indigo-200 ml-6 text-right'}`}
          >
            {m.content}
          </div>
        ))}
        {loading && display.length > 0 && (
          <div className="text-sm text-stone-400 italic px-3 animate-pulse">
            Gemini is thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask a follow-up…"
          disabled={loading}
          aria-label="Ask Gemini a follow-up question"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          className="flex-1 px-3 py-1.5 text-sm border border-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium"
        >
          Send
        </button>
      </div>
    </div>
  );
}
