import React, { useState, useMemo, useRef, useCallback } from 'react';
import { IconCheck, IconX, IconPen } from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import KanaInputPad from '../components/KanaInputPad.jsx';
import { identifyConjugation } from '../utils/checkIdentify.js';
import {
  filterWordsForPrefs,
  practiceTypesForItem,
  getTypeInfo,
  explainItem,
  getWordMeta,
  GROUP_NAMES,
} from '../utils/conjugator.js';
import { formDisplay, englishForForm } from '../utils/display.js';
import { toHiragana } from '../utils/romaji.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

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

// Human-readable "Plain Past of 食べる (to eat)" line for a candidate.
function candidateLabel(cand) {
  const ti = getTypeInfo(cand.type);
  const word = cand.word;
  return `${ti.label} of ${word.dict}（${word.reading}）— ${word.meaning}`;
}

export default function CheckView({ state, verbs, practicePrefs = DEFAULT_PREFS, wordLists = [] }) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [session, setSession] = useState({ correct: 0, attempts: 0 });
  const [kanaPadOpen, setKanaPadOpen] = useState(false);
  const inputRef = useRef(null);

  // The same active word set StudyView practices against.
  const practiceWords = useMemo(
    () => filterWordsForPrefs(verbs, practicePrefs, wordLists),
    [verbs, practicePrefs, wordLists]
  );

  // The same enabled conjugation types StudyView uses.
  const enabledTypes = useMemo(
    () => (state?.enabledTypes?.length > 0 ? state.enabledTypes : ['plain-past']),
    [state]
  );

  // For each word, the forms the learner has enabled — so Check recognises the
  // same conjugations Study would quiz, and flags everything else as unknown.
  const lookupOptions = useMemo(
    () => ({
      typesFor: (item) => practiceTypesForItem(item, enabledTypes, practicePrefs),
    }),
    [enabledTypes, practicePrefs]
  );

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handleCheck = useCallback(() => {
    const raw = input.trim();
    if (!raw) return;
    const res = identifyConjugation(raw, practiceWords, lookupOptions);
    const status = res.exact.length > 0 ? 'exact' : res.near.length > 0 ? 'near' : 'none';
    setResult({ ...res, status });
    setSession((s) => ({
      correct: s.correct + (status === 'exact' ? 1 : 0),
      attempts: s.attempts + 1,
    }));
  }, [input, practiceWords, lookupOptions]);

  const handleNext = useCallback(() => {
    setInput('');
    setResult(null);
    focusInput();
  }, [focusInput]);

  const insertText = useCallback((t) => setInput((a) => a + t), []);
  const backspaceText = useCallback(() => setInput((a) => Array.from(a).slice(0, -1).join('')), []);
  const clearText = useCallback(() => setInput(''), []);

  if (!practiceWords.length) {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-12 text-center">
        <p className="text-stone-600 dark:text-stone-300 mb-2">No words available</p>
        <p className="text-xs text-stone-400 dark:text-stone-500">
          Enable words and conjugation types in Settings.
        </p>
      </div>
    );
  }

  const acc = session.attempts ? Math.round((session.correct / session.attempts) * 100) : 0;
  const previewKana = toHiragana(input);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800">
        <div className="px-4 py-6 sm:px-6 sm:py-8 relative">
          {/* Session score, top-right — mirrors Study */}
          <div className="absolute top-4 right-4 sm:top-6 sm:right-6 text-right text-[11px] text-stone-400">
            <div className="text-indigo-600 dark:text-indigo-400 font-medium">
              {session.correct} correct
            </div>
            <div>{session.attempts} checked</div>
            {session.attempts > 0 && <div className="text-[10px]">{acc}%</div>}
          </div>

          <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium mb-2">
            Check a conjugation
          </div>
          <p className="text-sm text-stone-500 dark:text-stone-400 mb-5 max-w-md">
            Type a conjugated verb or adjective — in romaji, kana, or kanji — and
            I'll work out which dictionary word and form it is, and tell you if
            it's right.
          </p>

          {/* Input row — mirrors Study's answer input */}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => {
                setResult(null);
                setInput(e.target.value);
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
              autoCorrect="off"
              spellCheck="false"
            />
            <button
              type="button"
              onClick={() => setKanaPadOpen((v) => !v)}
              className={`shrink-0 p-2 rounded-lg border inline-flex items-center justify-center aspect-square transition ${
                kanaPadOpen
                  ? 'bg-stone-800 border-stone-800 text-white dark:bg-indigo-600 dark:border-indigo-600 dark:text-white'
                  : 'bg-white border-stone-200 hover:bg-stone-50 text-stone-600 dark:bg-stone-900 dark:border-stone-800 dark:hover:bg-stone-800 dark:text-stone-300'
              }`}
              title="Kana pad"
            >
              <IconPen className="w-4 h-4" />
            </button>
          </div>

          {/* Romaji→kana preview, matching Study's auto-convert affordance */}
          {!result && previewKana && previewKana !== input && (
            <div className="mt-2 text-center text-sm text-stone-400" lang="ja">
              → {previewKana}
            </div>
          )}

          <KanaInputPad
            open={kanaPadOpen}
            onToggle={() => setKanaPadOpen((v) => !v)}
            onInsert={insertText}
            onBackspace={backspaceText}
            onClear={clearText}
            onSubmit={handleCheck}
            canSubmit={!!input.trim()}
            noToggle
          />

          {!result && (
            <button
              onClick={handleCheck}
              disabled={!input.trim()}
              className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium transition"
            >
              Check
            </button>
          )}
        </div>
      </div>

      {/* Result card */}
      {result && (
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5 sm:p-6">
          {result.status === 'exact' && (
            <div>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold mb-3">
                <IconCheck className="w-5 h-5" />
                Correct!
              </div>
              <div className="text-center mb-4">
                <ScriptDisplay
                  view={formDisplay(
                    result.exact[0].kana,
                    practicePrefs,
                    result.exact[0].word,
                    result.exact[0].type
                  )}
                  word={result.exact[0].word}
                  type={result.exact[0].type}
                  className="text-3xl text-stone-900 dark:text-stone-100"
                />
              </div>
              <p className="text-stone-700 dark:text-stone-300 text-center">
                That's the{' '}
                <span className="font-semibold">{getTypeInfo(result.exact[0].type).label}</span> of{' '}
                <span className="font-semibold" lang="ja">{result.exact[0].word.dict}</span>{' '}
                <span className="text-stone-500" lang="ja">（{result.exact[0].word.reading}）</span>{' '}
                — {result.exact[0].word.meaning}.
              </p>
              <p className="mt-1 text-center text-xs text-stone-400">
                {GROUP_NAMES?.[result.exact[0].word.group] || result.exact[0].word.group}
                {' · '}
                {getWordMeta(result.exact[0].word).jlpt}
              </p>
              {result.exact.length > 1 && (
                <div className="mt-4 pt-4 border-t border-stone-100 dark:border-stone-800 text-sm text-stone-500 dark:text-stone-400">
                  <div className="font-medium mb-1">Also a valid reading of:</div>
                  <ul className="space-y-0.5">
                    {result.exact.slice(1).map((e) => (
                      <li key={`${e.word.reading}-${e.type}`} lang="ja">
                        {candidateLabel(e)}
                      </li>
                    ))}
                  </ul>
                </div>
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
                You typed{' '}
                <span className="font-medium" lang="ja">{result.normalized}</span>. It looks like you
                were going for the{' '}
                <span className="font-semibold">{getTypeInfo(result.near[0].type).label}</span> of{' '}
                <span className="font-semibold" lang="ja">{result.near[0].word.dict}</span>{' '}
                <span className="text-stone-500" lang="ja">（{result.near[0].word.reading}）</span>{' '}
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
                  <span className="text-stone-400">Correct form</span>
                  <span className="text-emerald-700 dark:text-emerald-300 text-lg">
                    <DiffForm correct={result.near[0].kana} firstDiff={result.near[0].diff.firstDiff} />
                  </span>
                </div>
                <div className="mt-3 pt-3 border-t border-stone-200 dark:border-stone-800 text-xs text-stone-500 dark:text-stone-400">
                  {result.near[0].diff.summary}.
                </div>
              </div>
              <p className="mt-4 text-sm text-stone-600 dark:text-stone-300">
                {explainItem(result.near[0].word, result.near[0].type)}
              </p>
              <p className="mt-1 text-xs text-stone-400">
                ({englishForForm(result.near[0].word, result.near[0].type)})
              </p>
              {result.near.length > 1 && (
                <div className="mt-4 pt-4 border-t border-stone-100 dark:border-stone-800 text-sm text-stone-500 dark:text-stone-400">
                  <div className="font-medium mb-1">Or did you mean:</div>
                  <ul className="space-y-0.5">
                    {result.near.slice(1).map((e) => (
                      <li key={`${e.word.reading}-${e.type}`} lang="ja">
                        {e.kana} — {candidateLabel(e)}
                      </li>
                    ))}
                  </ul>
                </div>
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
                <span className="font-medium" lang="ja">{result.normalized}</span> doesn't match a
                conjugation of any word in your active set. Double-check the
                spelling, or review which words and conjugation forms are enabled
                in Settings.
              </p>
            </div>
          )}

          <button
            onClick={handleNext}
            className="mt-5 w-full py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-medium transition"
          >
            Check another
          </button>
        </div>
      )}
    </div>
  );
}
