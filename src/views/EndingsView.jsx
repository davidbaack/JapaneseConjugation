import React, { useState, useEffect, useMemo, useRef } from 'react';
import { IconSpark } from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import StickyAction from '../components/StickyAction.jsx';
import {
  isAdjective,
  conjugate,
  onbinTailFor,
  onbinPatternForVerb,
  ONBIN_TE_CHOICES,
  ONBIN_TA_CHOICES,
  ONBIN_PATTERN_META,
} from '../utils/conjugator.js';
import { filterWordsForStudyScope } from '../utils/vocabularyProgression.js';
import { defaultState } from '../utils/storage.js';
import { promptDisplay, formDisplay, shuffled } from '../utils/display.js';
import { callGemini, aiSystemFromPrefs, AI_COACH_SYSTEM } from '../utils/gemini.js';
import { playPronunciation } from '../utils/speech.js';
import { useApp } from '../state/AppStateContext.jsx';

const REGISTER_PAIRS = [
  { plain: 'plain-present', polite: 'polite-present', label: 'present' },
  { plain: 'plain-past', polite: 'polite-past', label: 'past' },
  { plain: 'plain-negative', polite: 'polite-negative', label: 'negative' },
  { plain: 'plain-past-negative', polite: 'polite-past-negative', label: 'past-negative' },
];
const REGISTER_SUB_MODES = ['te-form', 'plain-past', 'masu', 'plain-register'];

const MODE_BUTTONS = [
  { id: 'te-form', label: 'て', lang: 'ja' },
  { id: 'plain-past', label: 'た', lang: 'ja' },
  { id: 'masu', label: 'ます', lang: 'ja' },
  { id: 'plain-register', label: 'plain' },
  { id: 'mix', label: 'mix' },
];

export default function EndingsView() {
  const {
    state,
    setState,
    setTab,
    allVerbs: verbs,
    builtInWords,
    practicePrefs,
    wordLists,
    activeGeminiKey: geminiKey,
  } = useApp();
  const drillVerbs = useMemo(
    () =>
      filterWordsForStudyScope(verbs, { cards: state.cards }, practicePrefs, wordLists, {
        builtInWords,
      }).filter((v) => !isAdjective(v)),
    [verbs, state.cards, practicePrefs, wordLists, builtInWords],
  );

  const stats = state.onbin || defaultState().onbin;
  const registerStats = state.register || defaultState().register;

  const [target, setTarget] = useState('te-form');
  const [current, setCurrent] = useState(null);
  const [result, setResult] = useState(null);
  const [hintChars, setHintChars] = useState(0);
  const [activePair, setActivePair] = useState(null);
  const [activeMixTarget, setActiveMixTarget] = useState(null);
  const [registerChoices, setRegisterChoices] = useState(null);
  const [aiTip, setAiTip] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const aiAbortRef = useRef(null);

  const effectiveTarget = target === 'mix' ? activeMixTarget : target;
  const isRegisterMode = effectiveTarget === 'masu' || effectiveTarget === 'plain-register';

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
    const verb = shuffled(pool)[0];

    let newActiveMixTarget = null;
    let newActivePair = null;
    let newRegChoices = null;
    let effectiveTgt = target;

    if (target === 'mix') {
      newActiveMixTarget = shuffled(REGISTER_SUB_MODES)[0];
      effectiveTgt = newActiveMixTarget;
    }

    if (effectiveTgt === 'masu' || effectiveTgt === 'plain-register') {
      newActivePair = shuffled(REGISTER_PAIRS)[0];
      newRegChoices = shuffled(
        REGISTER_PAIRS.map((p) => conjugate(verb, effectiveTgt === 'masu' ? p.polite : p.plain)),
      );
    }

    setCurrent(verb);
    setActiveMixTarget(newActiveMixTarget);
    setActivePair(newActivePair);
    setRegisterChoices(newRegChoices);
    setResult(null);
    setHintChars(0);
    setAiTip('');
    setAiErr('');
  }

  if (!drillVerbs.length) {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-8 text-center text-stone-500">
        <p className="mb-4">No verbs match the current filters.</p>
        <button
          onClick={() => setTab('settings')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition"
        >
          Go to Settings
        </button>
      </div>
    );
  }

  if (!current) return null;
  if (target === 'mix' && !activeMixTarget) return null;
  if (isRegisterMode && (!activePair || !registerChoices)) return null;

  // --- Te/ta computed values ---
  const expected = !isRegisterMode ? conjugate(current, effectiveTarget) : null;
  const expectedTail = !isRegisterMode ? onbinTailFor(current, effectiveTarget) : null;
  const pattern = !isRegisterMode ? onbinPatternForVerb(current) : null;
  const onbinChoices = !isRegisterMode
    ? effectiveTarget === 'te-form'
      ? ONBIN_TE_CHOICES
      : ONBIN_TA_CHOICES
    : null;
  const prompt = promptDisplay(current, null, practicePrefs);
  const expectedView = !isRegisterMode
    ? formDisplay(expected, practicePrefs, current, effectiveTarget)
    : null;
  const patternStats = !isRegisterMode
    ? stats.byPattern?.[pattern.label] || { attempted: 0, correct: 0 }
    : null;
  const hint =
    expected && !isRegisterMode
      ? expected
          .split('')
          .map((ch, i) => (i < hintChars ? ch : '＿'))
          .join('')
      : null;

  // --- Register computed values ---
  const sourceType = isRegisterMode
    ? effectiveTarget === 'masu'
      ? activePair.plain
      : activePair.polite
    : null;
  const targetType = isRegisterMode
    ? effectiveTarget === 'masu'
      ? activePair.polite
      : activePair.plain
    : null;
  const promptForm = isRegisterMode ? conjugate(current, sourceType) : null;
  const expectedForm = isRegisterMode ? conjugate(current, targetType) : null;
  const masuStem = isRegisterMode ? conjugate(current, 'masu-stem') : null;
  const promptFormView = isRegisterMode
    ? formDisplay(promptForm, practicePrefs, current, sourceType)
    : null;
  const expectedFormView = isRegisterMode
    ? formDisplay(expectedForm, practicePrefs, current, targetType)
    : null;
  const registerPatternStats = isRegisterMode
    ? registerStats.byPattern?.[activePair.label] || { attempted: 0, correct: 0 }
    : null;

  // Struggling verb: 3+ wrong answers across sessions
  const verbRecord = registerStats.byVerb?.[current.dict] || { attempted: 0, correct: 0 };
  const isStrugglingVerb = isRegisterMode && verbRecord.attempted - verbRecord.correct >= 3;

  // Stats header values — adapt to active mode family
  const displayStats = isRegisterMode ? registerStats : stats;
  const displayAcc = displayStats.attempted
    ? Math.round((displayStats.correct / displayStats.attempted) * 100)
    : 0;
  const displayPatternStats = isRegisterMode ? registerPatternStats : patternStats;
  const displayPatternLabel = isRegisterMode ? (activePair?.label ?? '—') : (pattern?.label ?? '—');

  function choose(value) {
    if (result) return;
    const ok = isRegisterMode ? value === expectedForm : value === expectedTail;
    setResult({ ok, chosen: value });

    if (isRegisterMode) {
      playPronunciation(expectedForm, 0.85, practicePrefs.voiceURI);
      setState((s) => {
        const prev = s.register || defaultState().register;
        const pp = prev.byPattern?.[activePair.label] || { attempted: 0, correct: 0 };
        const pv = prev.byVerb?.[current.dict] || { attempted: 0, correct: 0 };
        const streak = ok ? (prev.streak || 0) + 1 : 0;
        return {
          ...s,
          register: {
            ...prev,
            attempted: (prev.attempted || 0) + 1,
            correct: (prev.correct || 0) + (ok ? 1 : 0),
            streak,
            bestStreak: Math.max(prev.bestStreak || 0, streak),
            byPattern: {
              ...(prev.byPattern || {}),
              [activePair.label]: {
                attempted: (pp.attempted || 0) + 1,
                correct: (pp.correct || 0) + (ok ? 1 : 0),
                lastAt: Date.now(),
              },
            },
            byVerb: {
              ...(prev.byVerb || {}),
              [current.dict]: {
                attempted: (pv.attempted || 0) + 1,
                correct: (pv.correct || 0) + (ok ? 1 : 0),
              },
            },
          },
        };
      });
    } else {
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
        };
      });
    }
  }

  function revealAll() {
    if (result || isRegisterMode) return;
    setHintChars(expected.length);
    setResult({ ok: false, chosen: null });
    setState((s) => {
      const prev = s.onbin || defaultState().onbin;
      const pp = prev.byPattern?.[pattern.label] || { attempted: 0, correct: 0 };
      return {
        ...s,
        onbin: {
          ...prev,
          attempted: (prev.attempted || 0) + 1,
          correct: prev.correct || 0,
          hints: (prev.hints || 0) + expected.length,
          streak: 0,
          bestStreak: prev.bestStreak || 0,
          byPattern: {
            ...(prev.byPattern || {}),
            [pattern.label]: {
              attempted: (pp.attempted || 0) + 1,
              correct: pp.correct || 0,
              lastAt: Date.now(),
            },
          },
        },
      };
    });
  }

  async function generateMnemonic() {
    if (!geminiKey) return;
    if (aiLoading) {
      aiAbortRef.current?.abort();
      aiAbortRef.current = null;
      setAiLoading(false);
      return;
    }
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setAiLoading(true);
    setAiTip('');
    setAiErr('');
    try {
      const promptText = isRegisterMode
        ? `Create one short memorable learner mnemonic for this Japanese register switch.\nVerb: ${current.dict} (${current.reading}, ${current.meaning})\nStem before ます: ${masuStem}\nSource (${sourceType}): ${promptForm}\nTarget (${targetType}): ${expectedForm}\nKeep it under 35 words, friendly, and include the Japanese forms.`
        : `Create one short memorable learner mnemonic for this Japanese conjugation sound-change pattern.\nVerb: ${current.dict} (${current.reading}, ${current.meaning})\nTarget: ${
            effectiveTarget === 'te-form' ? 'te-form' : 'plain past / ta-form'
          }\nPattern: ${pattern.label}\nRule: ${pattern.cue}\nCorrect answer: ${expected}\nKeep it under 35 words, friendly, and include the Japanese ending.`;
      const reply = await callGemini(
        [{ role: 'user', parts: [{ text: promptText }] }],
        geminiKey,
        350,
        0.45,
        aiSystemFromPrefs(practicePrefs, AI_COACH_SYSTEM),
      );
      if (!controller.signal.aborted) setAiTip(reply.trim());
    } catch (e) {
      if (!controller.signal.aborted) setAiErr(e.message);
    }
    if (!controller.signal.aborted) setAiLoading(false);
    aiAbortRef.current = null;
  }

  return (
    <div className="space-y-4">
      {/* Stats header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-850 p-4">
          <div className="text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-50">
            {displayStats.correct || 0}/{displayStats.attempted || 0}
          </div>
          <div className="text-xs text-stone-500">Accuracy</div>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-850 p-4">
          <div className="text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-50">
            {displayAcc}%
          </div>
          <div className="text-xs text-stone-500">Overall</div>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-850 p-4">
          <div className="text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-50">
            {displayStats.streak || 0}
          </div>
          <div className="text-xs text-stone-500">Streak</div>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-850 p-4">
          <div className="text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-50 text-ellipsis overflow-hidden whitespace-nowrap">
            {displayPatternStats
              ? `${displayPatternStats.correct || 0}/${displayPatternStats.attempted || 0}`
              : '—'}
          </div>
          <div className="text-xs text-stone-500 text-ellipsis overflow-hidden whitespace-nowrap">
            {displayPatternLabel}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        {/* Main card */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
          {/* Header + mode buttons */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="font-medium flex items-center gap-2 text-stone-900 dark:text-stone-50">
                <IconSpark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Ending Lab
              </h3>
              <p className="text-xs text-stone-500">
                {isRegisterMode
                  ? 'Register-switch drill — flip between plain and polite forms.'
                  : 'Rapid sound-change drill for て-form and plain past endings.'}
              </p>
            </div>
            <div className="flex gap-1.5 flex-wrap justify-end">
              {MODE_BUTTONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    setTarget(o.id);
                    setCurrent(null);
                    setResult(null);
                  }}
                  lang={o.lang}
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

          {/* Question area */}
          <div className="rounded-2xl bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-850 p-5 text-center">
            <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium mb-2">
              {isRegisterMode
                ? effectiveTarget === 'masu'
                  ? 'Make it polite'
                  : 'Make it plain'
                : 'Choose the ending tail'}
            </div>

            {isStrugglingVerb && (
              <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                ⚠ Watch this one
              </div>
            )}

            {isRegisterMode ? (
              <ScriptDisplay
                view={promptFormView}
                word={current}
                type={sourceType}
                colorHighlight={practicePrefs.colorCodeConjugations !== false}
                className="text-4xl sm:text-5xl font-semibold text-stone-900 dark:text-stone-50"
                subClassName="text-sm text-stone-500 mt-1"
              />
            ) : (
              <ScriptDisplay
                view={prompt}
                className="text-4xl sm:text-5xl font-semibold text-stone-900 dark:text-stone-50"
                subClassName="text-sm text-stone-500 mt-1"
              />
            )}

            <div className="mt-2 text-sm text-stone-500">{current.meaning}</div>

            {isRegisterMode ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-850 px-3 py-1 text-xs text-stone-600 dark:text-stone-400">
                <span>{activePair.label}</span>
                <span className="text-stone-300 dark:text-stone-800">|</span>
                <span>{effectiveTarget === 'masu' ? 'plain → polite' : 'polite → plain'}</span>
              </div>
            ) : (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-850 px-3 py-1 text-xs text-stone-600 dark:text-stone-400">
                <span>{pattern.label}</span>
                <span className="text-stone-300 dark:text-stone-800">|</span>
                <span>{pattern.cue}</span>
              </div>
            )}
          </div>

          {/* Choice buttons */}
          {isRegisterMode ? (
            <div className="grid grid-cols-2 gap-2 mt-4">
              {registerChoices.map((form) => (
                <button
                  key={form}
                  onClick={() => choose(form)}
                  disabled={!!result}
                  lang="ja"
                  className={`min-h-14 px-3 py-3 rounded-xl border text-xl transition ${
                    result && form === expectedForm
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-850 dark:text-emerald-305'
                      : result && form === result.chosen && !result.ok
                        ? 'bg-rose-50 border-rose-305 text-rose-800 dark:bg-rose-950/20 dark:border-rose-850 dark:text-rose-305'
                        : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-805 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-stone-800 dark:text-stone-200'
                  }`}
                >
                  {form}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              {onbinChoices.map((c) => (
                <button
                  key={c}
                  onClick={() => choose(c)}
                  disabled={!!result}
                  lang="ja"
                  className={`min-h-14 px-3 py-3 rounded-xl border text-xl transition ${
                    result && c === expectedTail
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-850 dark:text-emerald-305'
                      : result && c === result.chosen && !result.ok
                        ? 'bg-rose-50 border-rose-305 text-rose-800 dark:bg-rose-950/20 dark:border-rose-850 dark:text-rose-305'
                        : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-805 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-stone-800 dark:text-stone-200'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Hint / AI button row */}
          <div className="mt-4 flex flex-wrap gap-2">
            {!isRegisterMode && (
              <button
                onClick={() => {
                  if (hintChars + 1 >= expected.length) {
                    revealAll();
                  } else {
                    setHintChars(hintChars + 1);
                  }
                }}
                disabled={hintChars >= expected.length || !!result}
                className="px-3 py-2 border border-stone-205 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 disabled:opacity-40 rounded-lg text-sm transition"
              >
                Hint kana
              </button>
            )}
            <button
              onClick={generateMnemonic}
              disabled={!geminiKey}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm transition"
            >
              {aiLoading ? 'Cancel' : 'AI memory hook'}
            </button>
          </div>

          {/* Hint display (te/ta only) */}
          {!isRegisterMode && hintChars > 0 && (
            <div
              className="mt-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-center text-xl tracking-widest text-amber-800 dark:text-amber-300"
              lang="ja"
            >
              {hint}
            </div>
          )}

          {/* Reveal panel */}
          {result && (
            <div
              className={`mt-4 rounded-xl border p-4 text-left ${
                result.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/15 border-emerald-250 dark:border-emerald-900/50'
                  : 'bg-rose-50 dark:bg-rose-950/15 border-rose-250 dark:border-rose-900/50'
              }`}
            >
              <span role="status" aria-live="polite" className="sr-only">
                {result.ok
                  ? isRegisterMode
                    ? 'Correct.'
                    : 'Clean sound change.'
                  : isRegisterMode
                    ? 'Wrong form.'
                    : 'Different ending pattern.'}
              </span>
              <div
                className={`text-sm font-medium ${result.ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}
              >
                {result.ok
                  ? isRegisterMode
                    ? 'Correct.'
                    : 'Clean sound change.'
                  : isRegisterMode
                    ? 'Wrong form.'
                    : 'Different ending pattern.'}
              </div>

              {isRegisterMode ? (
                <>
                  <ScriptDisplay
                    view={expectedFormView}
                    word={current}
                    type={targetType}
                    colorHighlight={practicePrefs.colorCodeConjugations !== false}
                    className="text-2xl mt-1 text-stone-900 dark:text-stone-100"
                    subClassName="text-xs text-stone-500 mt-1"
                  />
                  {/* Stem-before-ます bridge */}
                  <div className="mt-3 flex items-center gap-2 text-sm flex-wrap">
                    <span lang="ja" className="font-medium text-stone-700 dark:text-stone-300">
                      {current.reading}
                    </span>
                    <span className="text-stone-400">→</span>
                    <span lang="ja" className="font-bold text-indigo-600 dark:text-indigo-400">
                      {masuStem}
                    </span>
                    <span className="text-stone-400">→</span>
                    <span lang="ja" className="font-medium text-stone-700 dark:text-stone-300">
                      {expectedForm}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <ScriptDisplay
                    view={expectedView}
                    word={current}
                    type={effectiveTarget}
                    colorHighlight={practicePrefs.colorCodeConjugations !== false}
                    className="text-2xl mt-1 text-stone-900 dark:text-stone-100"
                    subClassName="text-xs text-stone-500 mt-1"
                  />
                  <div className="text-sm text-stone-705 dark:text-stone-300 mt-2">
                    {pattern.cue}
                  </div>
                </>
              )}
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

        {/* Sidebar — adapts per mode family */}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
          {isRegisterMode || target === 'mix' ? (
            <>
              <h3 className="font-medium mb-3 text-stone-950 dark:text-stone-50">Register map</h3>
              <div className="space-y-2">
                {REGISTER_PAIRS.map((p) => {
                  const s = registerStats.byPattern?.[p.label] || { attempted: 0, correct: 0 };
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
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
