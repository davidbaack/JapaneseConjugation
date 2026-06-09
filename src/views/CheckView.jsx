import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { IconCheck, IconX, IconVolume } from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import { ConjugationBreakdown } from '../components/ConjugationBreakdown.jsx';
import StickyAction from '../components/StickyAction.jsx';
import { playPronunciation } from '../utils/speech.js';
import { identifyConjugation } from '../utils/checkIdentify.js';
import { getTypeInfo, getWordMeta } from '../utils/conjugator.js';
import { explainItem, GROUP_NAMES } from '../utils/conjugatorExplain.js';
import { formRows } from './ReferenceViewSub.jsx';
import { formDisplay, englishForForm } from '../utils/display.js';
import { toKanaInputValue } from '../utils/romaji.js';
import { useApp } from '../state/AppStateContext.jsx';

const MAX_HISTORY = 6;
const HISTORY_KEY = 'katachiya_check_history';

// Recent checks should survive tab switches and reloads like the rest of the
// app's state — CheckView unmounts whenever you leave the tab.
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

// Avoid popping the soft keyboard on phones the instant the tab opens.
const isCoarsePointer =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

const EXAMPLES = ['食べた', 'のんで', 'たかかった', 'tabemasu'];

// Render the correct form with the first character that differs from the
// learner's input highlighted, so they can see exactly what to fix.
function DiffForm({ correct, firstDiff }) {
  const chars = Array.from(correct || '');
  return (
    <span className="font-medium tracking-wide" lang="ja">
      {chars.map((ch, i) => (
        <span
          key={i}
          className={
            i === firstDiff
              ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 rounded px-0.5'
              : undefined
          }
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

// Post-result extras shared by the correct and near-miss branches: a full
// conjugation table for the recognised word, and a jump into Study to drill it.
function WordExtras({ word, type, showForms, onToggleForms, onPracticeWord }) {
  const rows = useMemo(() => (showForms ? formRows(word) : []), [showForms, word]);
  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          onClick={onToggleForms}
          aria-expanded={showForms}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          {showForms ? 'Hide all forms' : `Show all forms of ${word.dict}`}
        </button>
        {onPracticeWord && (
          <button
            onClick={() => onPracticeWord(word, type)}
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Practice this word →
          </button>
        )}
      </div>
      {showForms && (
        <div className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.type.id}
                  className={i % 2 ? 'bg-stone-50 dark:bg-stone-950/40' : undefined}
                >
                  <td className="px-3 py-1.5 text-stone-500 dark:text-stone-400 whitespace-nowrap">
                    {getTypeInfo(r.type.id).label}
                  </td>
                  <td
                    className="px-3 py-1.5 text-right font-medium text-stone-800 dark:text-stone-200"
                    lang="ja"
                  >
                    {r.answer}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function matchKey(match) {
  return `${match.matchStatus}-${match.word.reading}-${match.word.dict}-${match.type}-${match.kana}`;
}

function sameMatch(left, right) {
  return (
    left &&
    right &&
    left.word.reading === right.word.reading &&
    left.word.dict === right.word.dict &&
    left.type === right.type &&
    left.kana === right.kana
  );
}

function CandidateMatchList({ matches, practicePrefs, onSpeak }) {
  if (matches.length === 0) return null;

  return (
    <details className="mt-4 overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-800 dark:bg-stone-950/70 [&::-webkit-details-marker]:hidden">
        <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Other close matches
        </div>
        <div className="text-xs text-stone-400">
          {matches.length} {matches.length === 1 ? 'match' : 'matches'}
        </div>
      </summary>
      <ul className="divide-y divide-stone-200 dark:divide-stone-800">
        {matches.map((match) => {
          const correct = match.matchStatus === 'correct';
          const info = getTypeInfo(match.type);
          const statusClass = correct
            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800'
            : 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800';

          return (
            <li key={matchKey(match)} className="px-3 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${statusClass}`}
                    >
                      {correct ? <IconCheck className="h-3 w-3" /> : <IconX className="h-3 w-3" />}
                      {correct ? 'Right' : 'Wrong'}
                    </span>
                    <span className="font-semibold text-stone-900 dark:text-stone-100" lang="ja">
                      {match.word.dict}
                    </span>
                    <span className="text-sm text-stone-500 dark:text-stone-400" lang="ja">
                      （{match.word.reading}）
                    </span>
                    <span className="text-sm text-stone-500 dark:text-stone-400">
                      {match.word.meaning}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-medium text-stone-800 dark:text-stone-200">
                      {info.label}
                    </span>
                    <span className="text-stone-400">{englishForForm(match.word, match.type)}</span>
                  </div>
                  {!correct && match.diff?.summary && (
                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                      {match.diff.summary}.
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                  <div className="text-left sm:text-right">
                    <div className="text-[11px] uppercase tracking-wide text-stone-400">
                      {correct ? 'Entered form' : 'Correct answer'}
                    </div>
                    <ScriptDisplay
                      view={formDisplay(match.kana, practicePrefs, match.word, match.type)}
                      word={match.word}
                      type={match.type}
                      className="text-base text-stone-900 dark:text-stone-100"
                      subClassName="text-[11px] text-stone-500 dark:text-stone-400 leading-tight"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onSpeak(match.kana)}
                    className="shrink-0 rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-indigo-600 dark:hover:bg-stone-800 dark:hover:text-indigo-400"
                    title="Play audio"
                    aria-label={`Play ${correct ? 'correct' : 'suggested'} match`}
                  >
                    <IconVolume className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function explanationLine(value) {
  return typeof value === 'string' ? value : '';
}

export default function CheckView() {
  const {
    setTab,
    allWords: verbs,
    practicePrefs,
    activeGeminiKey: geminiKey,
    practiceWord: onPracticeWord,
  } = useApp();
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(loadHistory);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showForms, setShowForms] = useState(false);
  const inputRef = useRef(null);
  const resultRef = useRef(null);

  // Check recognises a conjugation of ANY known word, in ANY valid form — a
  // correct conjugation should never be reported as wrong just because it
  // isn't part of the current Study filters. We pass the full word set and let
  // identifyConjugation default to every compatible form.
  const allWords = useMemo(() => verbs || [], [verbs]);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // Land with the cursor in the box — this is a "type immediately" tool — but
  // not on touch devices, where it would force the keyboard up over the intro.
  useEffect(() => {
    if (!isCoarsePointer) focusInput();
  }, [focusInput]);

  // Persist recent checks so they survive tab switches and reloads.
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* ignore quota / private-mode failures */
    }
  }, [history]);

  // Bring the verdict into view after a check — on mobile it lands below the
  // fold under the keyboard otherwise.
  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [result]);

  const runCheck = useCallback(
    (value) => {
      const raw = (value ?? '').trim();
      if (!raw) return;
      const res = identifyConjugation(raw, allWords, { includeNearWhenExact: true });
      const status = res.exact.length > 0 ? 'exact' : res.near.length > 0 ? 'near' : 'none';
      setShowBreakdown(false);
      setShowForms(false);
      setResult({ ...res, status });
      setHistory((h) => {
        const entry = { input: res.normalized || raw, status };
        return [entry, ...h.filter((e) => e.input !== entry.input)].slice(0, MAX_HISTORY);
      });
    },
    [allWords],
  );

  const handleCheck = useCallback(() => runCheck(input), [runCheck, input]);

  const handleExample = useCallback(
    (ex) => {
      setInput(toKanaInputValue(ex));
      runCheck(ex);
    },
    [runCheck],
  );

  const handleNext = useCallback(() => {
    setInput('');
    setResult(null);
    focusInput();
  }, [focusInput]);

  const speak = useCallback(
    (text) => playPronunciation(text, 0.9, practicePrefs.voiceURI),
    [practicePrefs.voiceURI],
  );

  if (!allWords.length) {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-12 text-center">
        <p className="text-stone-600 dark:text-stone-300 mb-2">No words available</p>
        <p className="text-xs text-stone-400 dark:text-stone-500 mb-4">
          Add or enable words in Tools.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => setTab('tools')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition"
          >
            Go to Tools
          </button>
          <button
            onClick={() => setTab('settings')}
            className="px-4 py-2 border border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-sm rounded-lg transition"
          >
            Settings
          </button>
        </div>
      </div>
    );
  }

  // When several distinct forms share the same surface, that's a teaching
  // moment (e.g. potential = passive for ichidan verbs), not a footnote.
  const exactForms = result?.exact ?? [];
  const sameWord =
    exactForms.length > 1 && exactForms.every((e) => e.word.reading === exactForms[0].word.reading);
  // The word+form a breakdown should explain: the recognised form when correct,
  // or the intended form when it's a near-miss.
  const headForm =
    result?.status === 'exact' ? exactForms[0] : result?.status === 'near' ? result.near[0] : null;
  const secondaryMatchRows = result
    ? [
        ...exactForms
          .filter((match) => !sameMatch(match, headForm))
          .map((match) => ({ ...match, matchStatus: 'correct' })),
        ...(result.near ?? [])
          .filter((match) => !sameMatch(match, headForm))
          .map((match) => ({ ...match, matchStatus: 'wrong' })),
      ]
    : [];
  const showMatchRows = secondaryMatchRows.length > 0;
  const nearExplanation =
    result?.status === 'near' && result.near?.[0]
      ? explainItem(result.near[0].word, result.near[0].type)
      : null;
  const nearRule =
    explanationLine(nearExplanation?.rule) || explanationLine(nearExplanation?.intro);
  const nearDerivation = explanationLine(nearExplanation?.derivation);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800">
        <div className="px-4 py-6 sm:px-6 sm:py-8">
          <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium mb-2">
            Check a conjugation
          </div>
          <p className="text-sm text-stone-500 dark:text-stone-400 mb-5 max-w-md">
            Type a conjugated verb or adjective — in romaji, kana, or kanji — and I'll work out
            which dictionary word it is and which form you made.
          </p>

          {/* Input row — mirrors Study's answer input */}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => {
                setResult(null);
                setInput(
                  e.nativeEvent?.isComposing ? e.target.value : toKanaInputValue(e.target.value),
                );
              }}
              onCompositionEnd={(e) => {
                setResult(null);
                setInput(toKanaInputValue(e.currentTarget.value));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (result) handleNext();
                  else if (input.trim()) handleCheck();
                }
              }}
              placeholder="e.g. tabeta, たべた, 食べた…"
              className="flex-1 min-w-0 px-4 py-3 text-xl text-center border-2 border-stone-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 focus:border-indigo-500 focus:outline-none transition"
              lang="ja"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="done"
              spellCheck="false"
            />
          </div>

          {!result && (
            <>
              <StickyAction pad="-mx-4 px-4 sm:-mx-6 sm:px-6" className="mt-4">
                <button
                  onClick={handleCheck}
                  disabled={!input.trim()}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium shadow-lg transition"
                >
                  Check
                </button>
              </StickyAction>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs text-stone-400">Try:</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => handleExample(ex)}
                    className="px-2.5 py-1 rounded-full border border-stone-200 dark:border-stone-800 text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                    lang="ja"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Recent checks — re-run any of the last few without re-typing. */}
          {history.length > 0 && (
            <div className="mt-5 pt-4 border-t border-stone-100 dark:border-stone-800">
              <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-2">Recent</div>
              <div className="flex flex-wrap gap-2">
                {history.map((h) => (
                  <button
                    key={h.input}
                    onClick={() => handleExample(h.input)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-stone-200 dark:border-stone-800 text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                    lang="ja"
                    title="Check again"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        h.status === 'exact'
                          ? 'bg-emerald-500'
                          : h.status === 'near'
                            ? 'bg-rose-500'
                            : 'bg-stone-400'
                      }`}
                    />
                    {h.input}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Result card */}
      {result && (
        <div
          ref={resultRef}
          className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5 sm:p-6 scroll-mt-4"
        >
          {/* Only the verdict is a live region — scoping it here (rather than the
              whole card) keeps screen readers from re-announcing the breakdown,
              forms table, etc. each time the user expands a disclosure. */}
          <span role="status" aria-live="polite" className="sr-only">
            {result.status === 'exact'
              ? 'Correct conjugation.'
              : result.status === 'near'
                ? 'Not quite.'
                : "Couldn't identify that."}
          </span>
          {result.status === 'exact' && (
            <div>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold mb-4">
                <IconCheck className="w-5 h-5" />
                Correct conjugation
              </div>

              {/* The dictionary word is the headline — that's what the learner
                  most wants confirmed. */}
              <div className="text-center mb-4">
                <div
                  className="text-3xl font-semibold text-stone-900 dark:text-stone-100"
                  lang="ja"
                >
                  {exactForms[0].word.dict}
                </div>
                <div className="text-sm text-stone-500 dark:text-stone-400 mt-1" lang="ja">
                  {exactForms[0].word.reading} — {exactForms[0].word.meaning}
                </div>
                <div className="text-xs text-stone-400 mt-1">
                  {GROUP_NAMES?.[exactForms[0].word.group] || exactForms[0].word.group}
                  {' · '}
                  {getWordMeta(exactForms[0].word).jlpt}
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <ScriptDisplay
                    view={formDisplay(
                      exactForms[0].kana,
                      practicePrefs,
                      exactForms[0].word,
                      exactForms[0].type,
                    )}
                    word={exactForms[0].word}
                    type={exactForms[0].type}
                    className="text-2xl text-stone-900 dark:text-stone-100"
                  />
                  <button
                    type="button"
                    onClick={() => speak(exactForms[0].kana)}
                    className="shrink-0 p-1.5 rounded-lg text-stone-400 hover:text-indigo-600 hover:bg-stone-100 dark:hover:text-indigo-400 dark:hover:bg-stone-800 transition"
                    title="Play audio"
                    aria-label="Play audio"
                  >
                    <IconVolume className="w-5 h-5" />
                  </button>
                </div>
                {sameWord ? (
                  <div className="mt-3 text-sm text-stone-600 dark:text-stone-300">
                    This form is both the{' '}
                    {exactForms.map((e, i) => (
                      <React.Fragment key={e.type}>
                        {i > 0 && (i === exactForms.length - 1 ? ' and ' : ', ')}
                        <span className="font-semibold">{getTypeInfo(e.type).label}</span>
                      </React.Fragment>
                    ))}
                    .
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-stone-600 dark:text-stone-300">
                    <span className="font-semibold">{getTypeInfo(exactForms[0].type).label}</span>
                  </div>
                )}
                {exactForms[0].variantNote && (
                  <div className="mt-3 text-sm text-stone-600 dark:text-stone-300">
                    {exactForms[0].variantNote}
                  </div>
                )}
              </div>

              {showMatchRows && (
                <CandidateMatchList
                  matches={secondaryMatchRows}
                  practicePrefs={practicePrefs}
                  onSpeak={speak}
                />
              )}

              {/* How it's built — reinforces the pattern, not just a checkmark. */}
              {headForm && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowBreakdown((v) => !v)}
                    aria-expanded={showBreakdown}
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {showBreakdown ? 'Hide breakdown' : 'Show how it’s built'}
                  </button>
                  {showBreakdown && (
                    <ConjugationBreakdown
                      word={headForm.word}
                      type={headForm.type}
                      userAnswer={result.normalized}
                      geminiKey={geminiKey}
                      practicePrefs={practicePrefs}
                      onOpenLearn={() => {
                        window.location.hash = 'formation-keys';
                        setTab('learn');
                      }}
                    />
                  )}
                </div>
              )}

              {headForm && (
                <WordExtras
                  word={headForm.word}
                  type={headForm.type}
                  showForms={showForms}
                  onToggleForms={() => setShowForms((v) => !v)}
                  onPracticeWord={onPracticeWord}
                />
              )}
            </div>
          )}

          {result.status === 'near' && (
            <div>
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold mb-3">
                <IconX className="w-5 h-5" />
                Not quite
              </div>
              <p className="text-stone-700 dark:text-stone-300">
                It looks like you were going for the{' '}
                <span className="font-semibold">{getTypeInfo(result.near[0].type).label}</span> of{' '}
                <span className="font-semibold" lang="ja">
                  {result.near[0].word.dict}
                </span>{' '}
                <span className="text-stone-500" lang="ja">
                  （{result.near[0].word.reading}）
                </span>{' '}
                — {result.near[0].word.meaning}.
              </p>
              <div className="mt-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-stone-400">You wrote</span>
                  <span className="font-medium text-rose-600 dark:text-rose-400" lang="ja">
                    {result.normalized}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm mt-2">
                  <span className="text-stone-400">Correct answer</span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-emerald-700 dark:text-emerald-300 text-lg">
                      <DiffForm
                        correct={result.near[0].kana}
                        firstDiff={result.near[0].diff.firstDiff}
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() => speak(result.near[0].kana)}
                      className="shrink-0 p-1 rounded-lg text-stone-400 hover:text-indigo-600 hover:bg-stone-100 dark:hover:text-indigo-400 dark:hover:bg-stone-800 transition"
                      title="Play audio"
                      aria-label="Play audio"
                    >
                      <IconVolume className="w-4 h-4" />
                    </button>
                  </span>
                </div>
                <div className="mt-3 pt-3 border-t border-stone-200 dark:border-stone-800 text-xs text-stone-500 dark:text-stone-400">
                  {result.near[0].diff.summary}.
                </div>
              </div>

              {showMatchRows && (
                <CandidateMatchList
                  matches={secondaryMatchRows}
                  practicePrefs={practicePrefs}
                  onSpeak={speak}
                />
              )}

              {/* Lead with the rule — the most useful part for learning. */}
              <p className="mt-4 text-sm text-stone-700 dark:text-stone-200">
                {nearRule}
                <span className="text-stone-400">
                  {' '}
                  ({englishForForm(result.near[0].word, result.near[0].type)})
                </span>
              </p>
              {nearDerivation && nearDerivation !== result.near[0].kana && (
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{nearDerivation}</p>
              )}

              {headForm && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowBreakdown((v) => !v)}
                    aria-expanded={showBreakdown}
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {showBreakdown ? 'Hide breakdown' : 'Show how it’s built'}
                  </button>
                  {showBreakdown && (
                    <ConjugationBreakdown
                      word={headForm.word}
                      type={headForm.type}
                      userAnswer={result.normalized}
                      geminiKey={geminiKey}
                      practicePrefs={practicePrefs}
                      onOpenLearn={() => {
                        window.location.hash = 'formation-keys';
                        setTab('learn');
                      }}
                    />
                  )}
                </div>
              )}

              {headForm && (
                <WordExtras
                  word={headForm.word}
                  type={headForm.type}
                  showForms={showForms}
                  onToggleForms={() => setShowForms((v) => !v)}
                  onPracticeWord={onPracticeWord}
                />
              )}
            </div>
          )}

          {result.status === 'none' && (
            <div>
              <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 font-semibold mb-3">
                <IconX className="w-5 h-5" />
                Couldn't identify that
              </div>
              <p className="text-stone-700 dark:text-stone-300">
                <span className="font-medium" lang="ja">
                  {result.normalized}
                </span>{' '}
                isn't close to any conjugation I could find. Two things to check:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-stone-600 dark:text-stone-300 list-disc pl-5">
                <li>
                  <span className="font-medium">A typo?</span> If a character is off it may be too
                  far from the real form to match — give it another look.
                </li>
                <li>
                  <span className="font-medium">Word not loaded?</span> Check only knows the{' '}
                  {allWords.length} words in your active set. If this word isn't one of them, add it
                  in Tools.
                </li>
              </ul>
            </div>
          )}

          <StickyAction pad="-mx-5 px-5 sm:-mx-6 sm:px-6" className="mt-5">
            <button
              onClick={handleNext}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-medium shadow-lg transition"
            >
              Check another
            </button>
          </StickyAction>
        </div>
      )}
    </div>
  );
}
