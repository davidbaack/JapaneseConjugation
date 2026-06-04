import React, { useState, useEffect, useMemo, useRef } from 'react';
import { IconSpark } from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import StickyAction from '../components/StickyAction.jsx';
import {
  isAdjective,
  classifyGroupId,
  isIrregularAdjective,
  conjugate,
  conjugateAdjective,
  conjugateItem,
  getWordMeta,
  surfaceFormFor,
} from '../utils/conjugator.js';
import { filterWordsForStudyScope } from '../utils/vocabularyProgression.js';
import { defaultState } from '../utils/storage.js';
import { promptDisplay } from '../utils/display.js';
import { TYPE_LABEL } from '../data/conjugationTypes.js';
import { callGemini, aiSystemFromPrefs } from '../utils/gemini.js';
import { useApp } from '../state/AppStateContext.jsx';
import {
  GROUP_DECODER_ROWS,
  VERB_GROUP_IDS,
  getGroupDisplay,
  groupDisplayLabel,
  groupRecognitionClue,
  groupTrapText,
} from '../utils/groupDisplay.js';
import { ruMasuDiagnostic } from '../utils/ruVerbDiagnostics.js';

const IRREGULAR_CLASSIFY_GROUP_IDS = new Set(['suru', 'kuru', 'irregular-adjective']);
const REGULAR_VERB_CLASSIFY_IDS = VERB_GROUP_IDS.filter(
  (id) => !IRREGULAR_CLASSIFY_GROUP_IDS.has(id),
);

const VERB_CLASSIFY_OPTIONS = REGULAR_VERB_CLASSIFY_IDS.map((id) => {
  const meta = getGroupDisplay(id);
  return { id, label: meta.label, hint: meta.decoder, aliasText: meta.aliasText };
});

const IRREGULAR_CLASSIFY_OPTION = {
  id: 'irregular',
  label: 'irregular',
  hint: 'Memorize the special する, 来る, and いい patterns.',
  aliasText: 'includes する, 来る, and いい',
};

const ADJECTIVE_CLASSIFY_OPTIONS = [
  {
    id: 'i-adjective',
    label: 'い-adjective',
    hint: 'Usually ends in い and conjugates like 高い → 高かった.',
  },
  {
    id: 'na-adjective',
    label: 'な-adjective',
    hint: 'Takes な before nouns and uses だ/です as a predicate.',
  },
];

export const CLASSIFY_OPTIONS = [
  ...VERB_CLASSIFY_OPTIONS,
  IRREGULAR_CLASSIFY_OPTION,
  ...ADJECTIVE_CLASSIFY_OPTIONS,
];

export function classificationCategoryId(word) {
  const id = classifyGroupId(word);
  return IRREGULAR_CLASSIFY_GROUP_IDS.has(id) ? IRREGULAR_CLASSIFY_OPTION.id : id;
}

function classifyOptionLabel(id) {
  return CLASSIFY_OPTIONS.find((o) => o.id === id)?.label || id;
}

function irregularSpecificText(word) {
  const id = classifyGroupId(word);
  if (id === 'suru') return 'Specific pattern: する / compound する.';
  if (id === 'kuru') return 'Specific pattern: 来る / くる.';
  if (id === 'irregular-adjective') return 'Specific pattern: いい-style adjective.';
  return '';
}

function classificationStatsForCategory(stats, category) {
  const byGroup = stats.byGroup || {};
  if (category !== IRREGULAR_CLASSIFY_OPTION.id) {
    return byGroup[category] || { attempted: 0, correct: 0 };
  }
  return [IRREGULAR_CLASSIFY_OPTION.id, ...IRREGULAR_CLASSIFY_GROUP_IDS].reduce(
    (total, id) => {
      const row = byGroup[id] || { attempted: 0, correct: 0 };
      return {
        attempted: total.attempted + (row.attempted || 0),
        correct: total.correct + (row.correct || 0),
      };
    },
    { attempted: 0, correct: 0 },
  );
}

function negativeExample(word) {
  const answer = surfaceFormFor(word, 'plain-negative') || conjugate(word, 'plain-negative');
  return `${word.dict} -> ${answer}`;
}

export function classifyHint(word) {
  if (VERB_GROUP_IDS.includes(word.group)) {
    const trap = groupTrapText(word);
    const masuDiagnostic = ruMasuDiagnostic(word);
    return [
      `${groupDisplayLabel(word.group)}: ${groupRecognitionClue(word)}`,
      getGroupDisplay(word.group).aliasText,
      `Example: ${negativeExample(word)}.`,
      masuDiagnostic &&
        `Masu check: ${masuDiagnostic.dict} -> ${masuDiagnostic.politeSurface}. ${masuDiagnostic.contrast}`,
      trap,
    ]
      .filter(Boolean)
      .join(' ');
  }
  if (isIrregularAdjective(word)) {
    return `${word.reading} is an irregular い-adjective: present stays ${word.reading}, but other forms use よ, as in ${conjugateAdjective(word, 'adj-plain-past')} and ${conjugateAdjective(word, 'adj-plain-negative')}.`;
  }
  if (word.group === 'i-adjective')
    return `${word.reading} conjugates as an い-adjective: ${conjugateAdjective(word, 'adj-plain-past')}, ${conjugateAdjective(word, 'adj-plain-negative')}.`;
  return `${word.reading} is a な-adjective: ${conjugateAdjective(word, 'adj-attributive')} + noun, or ${conjugateAdjective(word, 'adj-polite-present')}.`;
}

export function classificationTeachingMoment(word) {
  const displayGroup = classifyGroupId(word);
  if (classificationCategoryId(word) === IRREGULAR_CLASSIFY_OPTION.id) {
    const isVerbIrregular = VERB_GROUP_IDS.includes(displayGroup);
    const adjectiveExampleType = 'adj-plain-negative';
    return {
      label: IRREGULAR_CLASSIFY_OPTION.label,
      aliasText: irregularSpecificText(word),
      clue: isVerbIrregular ? groupRecognitionClue(word) : classifyHint(word),
      example: isVerbIrregular
        ? negativeExample(word)
        : `${word.dict} -> ${conjugateAdjective(word, adjectiveExampleType)}`,
      trap: isVerbIrregular ? groupTrapText(word) : '',
      masuDiagnostic: isVerbIrregular ? ruMasuDiagnostic(word) : null,
    };
  }

  if (VERB_GROUP_IDS.includes(displayGroup)) {
    return {
      label: groupDisplayLabel(displayGroup),
      aliasText: getGroupDisplay(displayGroup).aliasText,
      clue: groupRecognitionClue(word),
      example: negativeExample(word),
      trap: groupTrapText(word),
      masuDiagnostic: ruMasuDiagnostic(word),
    };
  }

  const adjectiveExampleType = 'adj-plain-negative';
  return {
    label: groupDisplayLabel(displayGroup),
    aliasText: '',
    clue: classifyHint(word),
    example: `${word.dict} -> ${conjugateAdjective(word, adjectiveExampleType)}`,
    trap: '',
    masuDiagnostic: null,
  };
}

export default function ClassificationView() {
  const {
    state,
    setState,
    setTab,
    allWords: words,
    builtInWords,
    practicePrefs,
    wordLists,
    activeGeminiKey: geminiKey,
  } = useApp();
  const filtered = useMemo(
    () =>
      filterWordsForStudyScope(words, { cards: state.cards }, practicePrefs, wordLists, {
        builtInWords,
      }),
    [words, state.cards, practicePrefs, wordLists, builtInWords],
  );
  const [current, setCurrent] = useState(null);
  const [result, setResult] = useState(null);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const aiAbortRef = useRef(null);

  useEffect(() => {
    if (!current && filtered.length) {
      setCurrent(filtered[Math.floor(Math.random() * filtered.length)]);
    }
  }, [current, filtered]);

  useEffect(() => {
    if (
      current &&
      filtered.length &&
      !filtered.some((w) => w.dict === current.dict && w.group === current.group)
    ) {
      setCurrent(null);
      setResult(null);
    }
  }, [filtered, current]);

  useEffect(() => {
    setAiText('');
    setAiErr('');
    setAiLoading(false);
  }, [current?.dict, current?.group, result?.chosen]);

  if (!filtered.length) {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-8 text-center text-stone-500">
        <p className="mb-4">No words match the current filters.</p>
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

  const correctCategory = classificationCategoryId(current);
  const allowed = CLASSIFY_OPTIONS.filter(
    (o) => filtered.some((w) => classificationCategoryId(w) === o.id) || o.id === correctCategory,
  );
  const stats = state.classify || defaultState().classify;
  const groupRows = CLASSIFY_OPTIONS.map((o) => {
    const row = classificationStatsForCategory(stats, o.id);
    const accuracy = row.attempted ? Math.round((row.correct / row.attempted) * 100) : 0;
    return {
      ...o,
      ...row,
      accuracy,
      inDeck: filtered.some((w) => classificationCategoryId(w) === o.id),
    };
  }).filter((row) => row.inDeck);

  function choose(group) {
    if (result) return;
    const ok = group === correctCategory;
    const prev = stats.byGroup?.[correctCategory] || { attempted: 0, correct: 0 };
    setState({
      ...state,
      classify: {
        attempted: (stats.attempted || 0) + 1,
        correct: (stats.correct || 0) + (ok ? 1 : 0),
        byGroup: {
          ...(stats.byGroup || {}),
          [correctCategory]: {
            attempted: prev.attempted + 1,
            correct: prev.correct + (ok ? 1 : 0),
          },
        },
      },
    });
    setResult({ ok, chosen: group });
  }

  function next() {
    setResult(null);
    const pool =
      filtered.length > 1
        ? filtered.filter((w) => w.dict !== current.dict || w.group !== current.group)
        : filtered;
    setCurrent(pool[Math.floor(Math.random() * pool.length)]);
  }

  async function explainClassificationWithAI() {
    if (!geminiKey || !current) return;
    if (aiLoading) {
      aiAbortRef.current?.abort();
      aiAbortRef.current = null;
      setAiLoading(false);
      return;
    }
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setAiLoading(true);
    setAiErr('');
    setAiText('');
    try {
      const label = classifyOptionLabel(correctCategory);
      const chosen = result?.chosen ? classifyOptionLabel(result.chosen) : 'not answered';
      const sampleTypes = isAdjective(current)
        ? ['adj-plain-past', 'adj-plain-negative']
        : ['polite-present', 'plain-negative'];
      const samples = sampleTypes
        .map((id) => `${TYPE_LABEL[id] || id}: ${conjugateItem(current, id)}`)
        .join(', ');
      const prompt = `Explain why this Japanese word belongs to its conjugation class.\n\nWord: ${current.dict} (${current.reading}) — ${current.meaning}\nCorrect class: ${label}\nLearner chose: ${chosen}\nLocal hint: ${classifyHint(current)}\nSample forms: ${samples}\n\nGive a concise coaching note with the recognition clue, one common trap or contrast, and one tiny follow-up drill. If the word is an exception or the spelling can mislead learners, call that out.`;
      const reply = await callGemini(
        [{ role: 'user', parts: [{ text: prompt }] }],
        geminiKey,
        900,
        0.2,
        aiSystemFromPrefs(
          practicePrefs,
          'You are a careful Japanese conjugation coach. Explain classification decisions with practical clues and avoid overclaiming. Keep it concise.',
        ),
      );
      if (!controller.signal.aborted) setAiText(reply);
    } catch (e) {
      if (!controller.signal.aborted) setAiErr(e.message || 'AI explanation failed.');
    }
    if (!controller.signal.aborted) setAiLoading(false);
    aiAbortRef.current = null;
  }

  const realAcc = stats.attempted ? Math.round((stats.correct / stats.attempted) * 100) : 0;
  const currentView = promptDisplay(current, null, practicePrefs);
  const teaching = result ? classificationTeachingMoment(current) : null;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5 text-left">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-medium text-stone-950 dark:text-stone-50">Classification drill</h3>
            <p className="text-xs text-stone-500">
              Practice the group recognition step before conjugating.
            </p>
            <div className="text-[9px] text-stone-400 mt-1">JLPT {getWordMeta(current).jlpt}</div>
          </div>
          <div className="text-xs text-stone-500 text-right">
            <div>
              {stats.correct || 0}/{stats.attempted || 0}
            </div>
            <div>{realAcc}% accuracy</div>
            <div className="text-[9px] text-stone-400 mt-1">
              {[
                getWordMeta(current).lesson && `Genki L${getWordMeta(current).lesson}`,
                getWordMeta(current).minnaLesson && `Minna L${getWordMeta(current).minnaLesson}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        </div>
        <div className="text-center py-5">
          <ScriptDisplay
            view={currentView}
            className="text-5xl font-medium mb-2 text-stone-900 dark:text-stone-50"
            subClassName="text-stone-500"
          />
          <div className="text-sm text-stone-400 italic mt-2">{current.meaning}</div>
        </div>
        <div className="mb-4 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/55 dark:bg-indigo-950/20 px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-350">
            Group decoder
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {GROUP_DECODER_ROWS.map((row) => (
              <div key={row.id} className="min-w-0">
                <div className="text-xs font-semibold text-stone-850 dark:text-stone-150">
                  {row.label}
                </div>
                <div className="mt-0.5 text-xs text-stone-600 dark:text-stone-350">
                  {row.decoder}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          {allowed.map((o) => (
            <button
              key={o.id}
              onClick={() => choose(o.id)}
              disabled={!!result}
              className={`px-3 py-3 rounded-xl border text-sm font-medium transition ${
                result && o.id === correctCategory
                  ? 'bg-emerald-50 border-emerald-305 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-850 dark:text-emerald-300'
                  : result && o.id === result.chosen && !result.ok
                    ? 'bg-rose-50 border-rose-305 text-rose-800 dark:bg-rose-950/20 dark:border-rose-850 dark:text-rose-300'
                    : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-stone-750 dark:text-stone-250'
              }`}
            >
              <span className="block">{o.label}</span>
              {o.aliasText && (
                <span className="mt-0.5 block text-[11px] font-normal opacity-75">
                  {o.aliasText}
                </span>
              )}
            </button>
          ))}
        </div>
        {result && (
          <>
            <div
              className={`mt-4 rounded-xl border p-4 ${
                result.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/15 border-emerald-250 dark:border-emerald-900/50'
                  : 'bg-rose-50 dark:bg-rose-950/15 border-rose-250 dark:border-rose-900/50'
              }`}
            >
              <span role="status" aria-live="polite" className="sr-only">
                {result.ok ? 'Correct.' : 'Not quite.'} It is{' '}
                {teaching?.label || classifyOptionLabel(correctCategory)}.
              </span>
              <div
                className={`font-medium text-sm ${result.ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}
              >
                {result.ok ? 'Correct.' : 'Not quite.'}{' '}
                <span className="font-normal">
                  It is {teaching?.label || classifyOptionLabel(correctCategory)}.
                </span>
              </div>
              {teaching?.aliasText && (
                <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                  {teaching.aliasText}
                </div>
              )}
              <div className="mt-3 grid gap-2 text-sm text-stone-705 dark:text-stone-300">
                <div>
                  <span className="font-semibold text-stone-850 dark:text-stone-150">
                    Recognition clue:{' '}
                  </span>
                  {teaching?.clue || classifyHint(current)}
                </div>
                {teaching?.example && (
                  <div>
                    <span className="font-semibold text-stone-850 dark:text-stone-150">
                      Example:{' '}
                    </span>
                    <span lang="ja">{teaching.example}</span>
                  </div>
                )}
                {teaching?.trap && (
                  <div>
                    <span className="font-semibold text-stone-850 dark:text-stone-150">Trap: </span>
                    {teaching.trap}
                  </div>
                )}
                {teaching?.masuDiagnostic && (
                  <div className="border-l-2 border-indigo-300 dark:border-indigo-700 pl-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-indigo-650 dark:text-indigo-350">
                      Masu check
                    </div>
                    <div className="mt-1">
                      <span lang="ja" className="font-semibold text-stone-900 dark:text-stone-100">
                        {teaching.masuDiagnostic.dict}
                        {' -> '}
                        {teaching.masuDiagnostic.politeSurface}
                      </span>
                      <span className="ml-2">{teaching.masuDiagnostic.clue}</span>
                    </div>
                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                      {teaching.masuDiagnostic.contrast}
                    </div>
                  </div>
                )}
              </div>
              {!geminiKey && (
                <div className="mt-2 text-xs text-stone-400 text-center">
                  Gemini is not configured for classification coaching.
                </div>
              )}
              {aiErr && <div className="mt-2 text-sm text-rose-600">{aiErr}</div>}
              {aiText && (
                <div className="mt-3 rounded-xl border border-indigo-100 bg-white/70 dark:bg-stone-905 px-3 py-2 text-sm text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
                  {aiText}
                </div>
              )}
            </div>
            <StickyAction pad="-mx-5 px-5" className="mt-3">
              <div className="grid sm:grid-cols-2 gap-2">
                <button
                  onClick={explainClassificationWithAI}
                  disabled={!geminiKey}
                  className="py-2 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium inline-flex items-center justify-center gap-1.5 transition"
                >
                  <IconSpark className="w-4 h-4" />
                  {aiLoading ? 'Cancel' : 'AI why'}
                </button>
                <button
                  onClick={next}
                  autoFocus
                  className="py-2 px-3 bg-stone-850 hover:bg-stone-900 dark:bg-stone-200 dark:hover:bg-stone-150 text-white dark:text-stone-900 rounded-xl text-sm font-medium transition"
                >
                  Next
                </button>
              </div>
            </StickyAction>
          </>
        )}
      </div>
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5 text-left">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-medium text-stone-950 dark:text-stone-50">Group progress</h3>
            <p className="text-xs text-stone-500">
              Accuracy by class for the current word filters.
            </p>
          </div>
          <div className="text-xs text-stone-400 tabular-nums">
            {groupRows.filter((r) => r.attempted).length}/{groupRows.length} practiced
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {groupRows.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-stone-200 dark:border-stone-800 p-3 bg-stone-50 dark:bg-stone-955"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-stone-800 dark:text-stone-200">
                    {row.label}
                  </div>
                  <div className="text-xs text-stone-500">{row.hint}</div>
                </div>
                <div className="text-sm font-semibold tabular-nums text-stone-700 dark:text-stone-300">
                  {row.attempted ? `${row.accuracy}%` : 'new'}
                </div>
              </div>
              <div className="mt-2 h-2 bg-white dark:bg-stone-900 rounded-full overflow-hidden border border-stone-100 dark:border-stone-800">
                <div
                  className={`h-full ${row.accuracy >= 80 ? 'bg-emerald-500' : row.accuracy >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: (row.attempted ? row.accuracy : 0) + '%' }}
                />
              </div>
              <div className="mt-1 text-[11px] text-stone-400 tabular-nums">
                {row.correct || 0}/{row.attempted || 0} correct
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
