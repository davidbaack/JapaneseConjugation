import React, { useState, useEffect, useMemo } from 'react';
import { IconSpark } from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import {
  filterWordsForPrefs,
  isAdjective,
  classifyGroupId,
  isIrregularAdjective,
  conjugate,
  conjugateAdjective,
  conjugateItem,
  getWordMeta
} from '../utils/conjugator.js';
import { defaultState, bumpDaily } from '../utils/storage.js';
import { promptDisplay } from '../utils/display.js';
import { TYPE_LABEL } from '../data/conjugationTypes.js';
import { callGemini, aiSystemFromPrefs } from '../utils/gemini.js';

export const CLASSIFY_OPTIONS = [
  { id: 'ichidan', label: 'る-verb', hint: 'Drop る and attach endings directly.' },
  { id: 'godan', label: 'う-verb', hint: 'The final kana shifts across あ/い/え/お rows.' },
  { id: 'suru', label: 'する', hint: 'Irregular する pattern.' },
  { id: 'kuru', label: '来る', hint: 'Irregular 来る pattern.' },
  { id: 'irregular-adjective', label: 'irregular い-adjective', hint: 'いい keeps its present form but conjugates from よい.' },
  { id: 'i-adjective', label: 'い-adjective', hint: 'Usually ends in い and conjugates like 高い → 高かった.' },
  { id: 'na-adjective', label: 'な-adjective', hint: 'Takes な before nouns and uses だ/です as a predicate.' }
];

export function classifyHint(word) {
  if (word.group === 'ichidan') return `${word.reading} is ichidan: remove る to make forms like ${conjugate(word, 'polite-present')}.`;
  if (word.group === 'godan') return `${word.reading} is godan: the final ${word.reading.slice(-1)} shifts rows, as in ${conjugate(word, 'plain-negative')}.`;
  if (word.group === 'suru') return 'する is irregular: する, した, しない, して, できる.';
  if (word.group === 'kuru') return '来る is irregular: くる, きた, こない, きて.';
  if (isIrregularAdjective(word)) {
    return `${word.reading} is an irregular い-adjective: present stays ${word.reading}, but other forms use よ, as in ${conjugateAdjective(word, 'adj-plain-past')} and ${conjugateAdjective(word, 'adj-plain-negative')}.`;
  }
  if (word.group === 'i-adjective') return `${word.reading} conjugates as an い-adjective: ${conjugateAdjective(word, 'adj-plain-past')}, ${conjugateAdjective(word, 'adj-plain-negative')}.`;
  return `${word.reading} is a な-adjective: ${conjugateAdjective(word, 'adj-attributive')} + noun, or ${conjugateAdjective(word, 'adj-polite-present')}.`;
}

export default function ClassificationView({ state, setState, words, practicePrefs, wordLists = [], geminiKey }) {
  const filtered = useMemo(() => filterWordsForPrefs(words, practicePrefs, wordLists), [words, practicePrefs, wordLists]);
  const [current, setCurrent] = useState(null);
  const [result, setResult] = useState(null);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState('');

  useEffect(() => {
    if (!current && filtered.length) {
      setCurrent(filtered[Math.floor(Math.random() * filtered.length)]);
    }
  }, [current, filtered]);

  useEffect(() => {
    if (current && filtered.length && !filtered.some(w => w.dict === current.dict && w.group === current.group)) {
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
        No words match the current filters.
      </div>
    );
  }

  if (!current) return null;

  const correctGroup = classifyGroupId(current);
  const allowed = CLASSIFY_OPTIONS.filter(o => filtered.some(w => classifyGroupId(w) === o.id) || o.id === correctGroup);
  const stats = state.classify || defaultState().classify;
  const groupRows = CLASSIFY_OPTIONS.map(o => {
    const row = stats.byGroup?.[o.id] || { attempted: 0, correct: 0 };
    const accuracy = row.attempted ? Math.round((row.correct / row.attempted) * 100) : 0;
    return { ...o, ...row, accuracy, inDeck: filtered.some(w => classifyGroupId(w) === o.id) };
  }).filter(row => row.inDeck);

  function choose(group) {
    if (result) return;
    const ok = group === correctGroup;
    const prev = stats.byGroup?.[correctGroup] || { attempted: 0, correct: 0 };
    setState({
      ...state,
      classify: {
        attempted: (stats.attempted || 0) + 1,
        correct: (stats.correct || 0) + (ok ? 1 : 0),
        byGroup: {
          ...(stats.byGroup || {}),
          [correctGroup]: { attempted: prev.attempted + 1, correct: prev.correct + (ok ? 1 : 0) }
        }
      },
      daily: bumpDaily(state.daily, ok, practicePrefs.dailyGoal || 10)
    });
    setResult({ ok, chosen: group });
  }

  function next() {
    setResult(null);
    const pool = filtered.length > 1 ? filtered.filter(w => w.dict !== current.dict || w.group !== current.group) : filtered;
    setCurrent(pool[Math.floor(Math.random() * pool.length)]);
  }

  async function explainClassificationWithAI() {
    if (!geminiKey || !current) return;
    setAiLoading(true);
    setAiErr('');
    setAiText('');
    try {
      const label = CLASSIFY_OPTIONS.find(o => o.id === correctGroup)?.label || correctGroup;
      const chosen = result?.chosen ? (CLASSIFY_OPTIONS.find(o => o.id === result.chosen)?.label || result.chosen) : 'not answered';
      const sampleTypes = isAdjective(current) ? ['adj-plain-past', 'adj-plain-negative'] : ['polite-present', 'plain-negative'];
      const samples = sampleTypes.map(id => `${TYPE_LABEL[id] || id}: ${conjugateItem(current, id)}`).join(', ');
      const prompt = `Explain why this Japanese word belongs to its conjugation class.\n\nWord: ${current.dict} (${current.reading}) — ${current.meaning}\nCorrect class: ${label}\nLearner chose: ${chosen}\nLocal hint: ${classifyHint(current)}\nSample forms: ${samples}\n\nGive a concise coaching note with the recognition clue, one common trap or contrast, and one tiny follow-up drill. If the word is an exception or the spelling can mislead learners, call that out.`;
      const reply = await callGemini(
        [{ role: 'user', parts: [{ text: prompt }] }],
        geminiKey,
        900,
        0.2,
        aiSystemFromPrefs(
          practicePrefs,
          'You are a careful Japanese conjugation coach. Explain classification decisions with practical clues and avoid overclaiming. Keep it concise.'
        )
      );
      setAiText(reply);
    } catch (e) {
      setAiErr(e.message || 'AI explanation failed.');
    }
    setAiLoading(false);
  }

  const realAcc = stats.attempted ? Math.round((stats.correct / stats.attempted) * 100) : 0;
  const currentView = promptDisplay(current, null, practicePrefs);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5 text-left">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-medium text-stone-950 dark:text-stone-50">Classification drill</h3>
            <p className="text-xs text-stone-500">Practice the group recognition step before conjugating.</p>
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
              ].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        <div className="text-center py-5">
          <ScriptDisplay view={currentView} className="text-5xl font-medium mb-2 text-stone-900 dark:text-stone-50" subClassName="text-stone-500" />
          <div className="text-sm text-stone-400 italic mt-2">{current.meaning}</div>
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          {allowed.map(o => (
            <button
              key={o.id}
              onClick={() => choose(o.id)}
              disabled={!!result}
              className={`px-3 py-3 rounded-xl border text-sm font-medium transition ${
                result && o.id === correctGroup
                  ? 'bg-emerald-50 border-emerald-305 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-850 dark:text-emerald-300'
                  : result && o.id === result.chosen && !result.ok
                    ? 'bg-rose-50 border-rose-305 text-rose-800 dark:bg-rose-950/20 dark:border-rose-850 dark:text-rose-300'
                    : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-stone-750 dark:text-stone-250'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {result && (
          <div
            className={`mt-4 rounded-xl border p-4 ${
              result.ok
                ? 'bg-emerald-50 dark:bg-emerald-950/15 border-emerald-250 dark:border-emerald-900/50'
                : 'bg-rose-50 dark:bg-rose-950/15 border-rose-250 dark:border-rose-900/50'
            }`}
          >
            <div className={`font-medium text-sm ${result.ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}>
              {result.ok ? 'Correct.' : 'Not quite.'}{' '}
              <span className="font-normal">
                It is {CLASSIFY_OPTIONS.find(o => o.id === correctGroup)?.label}.
              </span>
            </div>
            <div className="text-sm text-stone-705 dark:text-stone-300 mt-2">{classifyHint(current)}</div>
            <div className="grid sm:grid-cols-2 gap-2 mt-3">
              <button
                onClick={explainClassificationWithAI}
                disabled={!geminiKey || aiLoading}
                className="py-2 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium inline-flex items-center justify-center gap-1.5 transition"
              >
                <IconSpark className="w-4 h-4" />
                {aiLoading ? 'Explaining...' : 'AI why'}
              </button>
              <button
                onClick={next}
                autoFocus
                className="py-2 px-3 bg-stone-850 hover:bg-stone-900 dark:bg-stone-200 dark:hover:bg-stone-150 text-white dark:text-stone-900 rounded-xl text-sm font-medium transition"
              >
                Next
              </button>
            </div>
            {!geminiKey && (
              <div className="mt-2 text-xs text-stone-400 text-center">
                Add a Gemini key in Settings for classification coaching.
              </div>
            )}
            {aiErr && <div className="mt-2 text-sm text-rose-600">{aiErr}</div>}
            {aiText && (
              <div className="mt-3 rounded-xl border border-indigo-100 bg-white/70 dark:bg-stone-905 px-3 py-2 text-sm text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-wrap">
                {aiText}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5 text-left">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-medium text-stone-950 dark:text-stone-50">Group progress</h3>
            <p className="text-xs text-stone-500">Accuracy by class for the current word filters.</p>
          </div>
          <div className="text-xs text-stone-400 tabular-nums">
            {groupRows.filter(r => r.attempted).length}/{groupRows.length} practiced
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {groupRows.map(row => (
            <div key={row.id} className="rounded-xl border border-stone-200 dark:border-stone-800 p-3 bg-stone-50 dark:bg-stone-955">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-stone-800 dark:text-stone-200">{row.label}</div>
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
