import React, { useState, useMemo, useRef, useCallback } from 'react';
import { IconCheck, IconX, IconPen, IconVolume } from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import KanaInputPad from '../components/KanaInputPad.jsx';
import { speakJapanese } from '../utils/speech.js';
import { identifyConjugation } from '../utils/checkIdentify.js';
import {
  getTypeInfo,
  explainItem,
  getWordMeta,
  GROUP_NAMES,
} from '../utils/conjugator.js';
import { formDisplay, englishForForm } from '../utils/display.js';
import { toHiragana } from '../utils/romaji.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

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

// "Plain Past of 食べる（たべる）— to eat" line for a secondary candidate.
function candidateLabel(cand) {
  const ti = getTypeInfo(cand.type);
  const word = cand.word;
  return `${ti.label} of ${word.dict}（${word.reading}）— ${word.meaning}`;
}

export default function CheckView({ verbs, practicePrefs = DEFAULT_PREFS }) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [kanaPadOpen, setKanaPadOpen] = useState(false);
  const inputRef = useRef(null);

  // Check recognises a conjugation of ANY known word, in ANY valid form — a
  // correct conjugation should never be reported as wrong just because it
  // isn't part of the current Study filters. We pass the full word set and let
  // identifyConjugation default to every compatible form.
  const allWords = useMemo(() => verbs || [], [verbs]);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const runCheck = useCallback(
    (value) => {
      const raw = (value ?? '').trim();
      if (!raw) return;
      const res = identifyConjugation(raw, allWords);
      const status = res.exact.length > 0 ? 'exact' : res.near.length > 0 ? 'near' : 'none';
      setResult({ ...res, status });
    },
    [allWords]
  );

  const handleCheck = useCallback(() => runCheck(input), [runCheck, input]);

  const handleExample = useCallback(
    (ex) => {
      setInput(ex);
      runCheck(ex);
    },
    [runCheck]
  );

  const handleNext = useCallback(() => {
    setInput('');
    setResult(null);
    focusInput();
  }, [focusInput]);

  const speak = useCallback(
    (text) => speakJapanese(text, 0.9, practicePrefs.voiceURI),
    [practicePrefs.voiceURI]
  );

  const insertText = useCallback((t) => setInput((a) => a + t), []);
  const backspaceText = useCallback(() => setInput((a) => Array.from(a).slice(0, -1).join('')), []);
  const clearText = useCallback(() => setInput(''), []);

  if (!allWords.length) {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-12 text-center">
        <p className="text-stone-600 dark:text-stone-300 mb-2">No words available</p>
        <p className="text-xs text-stone-400 dark:text-stone-500">
          Add or enable words in the Library.
        </p>
      </div>
    );
  }

  const previewKana = toHiragana(input);
  // When several distinct forms share the same surface, that's a teaching
  // moment (e.g. potential = passive for ichidan verbs), not a footnote.
  const exactForms = result?.exact ?? [];
  const sameWord =
    exactForms.length > 1 &&
    exactForms.every((e) => e.word.reading === exactForms[0].word.reading);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800">
        <div className="px-4 py-6 sm:px-6 sm:py-8">
          <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium mb-2">
            Check a conjugation
          </div>
          <p className="text-sm text-stone-500 dark:text-stone-400 mb-5 max-w-md">
            Type a conjugated verb or adjective — in romaji, kana, or kanji — and
            I'll work out which dictionary word it is and which form you made.
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
            <>
              <button
                onClick={handleCheck}
                disabled={!input.trim()}
                className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium transition"
              >
                Check
              </button>
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
        </div>
      </div>

      {/* Result card */}
      {result && (
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5 sm:p-6">
          {result.status === 'exact' && (
            <div>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold mb-4">
                <IconCheck className="w-5 h-5" />
                Correct conjugation
              </div>

              {/* The dictionary word is the headline — that's what the learner
                  most wants confirmed. */}
              <div className="text-center mb-4">
                <div className="text-3xl font-semibold text-stone-900 dark:text-stone-100" lang="ja">
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
                      exactForms[0].type
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
              </div>

              {/* Distinct OTHER words this string could also belong to. */}
              {!sameWord && exactForms.length > 1 && (
                <div className="mt-4 pt-4 border-t border-stone-100 dark:border-stone-800 text-sm text-stone-500 dark:text-stone-400">
                  <div className="font-medium mb-1">Also a valid form of:</div>
                  <ul className="space-y-0.5">
                    {exactForms.slice(1).map((e) => (
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
                It looks like you were going for the{' '}
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
                  <span className="flex items-center gap-1.5">
                    <span className="text-emerald-700 dark:text-emerald-300 text-lg">
                      <DiffForm correct={result.near[0].kana} firstDiff={result.near[0].diff.firstDiff} />
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
                <span className="font-medium" lang="ja">{result.normalized}</span> isn't close to
                any conjugation I could find. Two things to check:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-stone-600 dark:text-stone-300 list-disc pl-5">
                <li>
                  <span className="font-medium">A typo?</span> If a character is off it may be too
                  far from the real form to match — give it another look.
                </li>
                <li>
                  <span className="font-medium">Verb not loaded?</span> Check only knows the
                  {' '}
                  {allWords.length} words in your active set. If this verb isn't one of them, add it
                  in the Library.
                </li>
              </ul>
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
