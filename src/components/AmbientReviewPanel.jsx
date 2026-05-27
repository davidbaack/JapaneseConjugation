import React, { useState, useEffect, useRef, useMemo } from 'react';
import { IconVolume } from './Icons.jsx';
import ScriptDisplay from './ScriptDisplay.jsx';
import { speakJapanese } from '../utils/speech.js';
import { promptDisplay, formDisplay, shuffled } from '../utils/display.js';
import { RULES, filterWordsForPrefs, conjugateItem, isRedundantPracticeType, wordKey, contextSentenceFor } from '../utils/conjugator.js';
import { ruleWeakScore, defaultState } from '../utils/storage.js';
import { TYPE_LABEL, ALL_CARD_TYPES } from '../data/conjugationTypes.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

export function buildAmbientDeck(words, state, practicePrefs = DEFAULT_PREFS, wordLists = [], mode = 'smart', count = 18) {
  const filtered = filterWordsForPrefs(words, practicePrefs, wordLists);
  const enabled = state.enabledTypes && state.enabledTypes.length ? state.enabledTypes : ALL_CARD_TYPES.map(t => t.id);
  const cards = [];
  for (const rule of RULES) {
    if (!enabled.includes(rule.type)) continue;
    const pool = rule.verbFilter(filtered).filter(item => !isRedundantPracticeType(item, rule.type, enabled, practicePrefs));
    if (!pool.length) continue;
    const item = shuffled(pool)[0];
    const form = conjugateItem(item, rule.type);
    if (!form) continue;
    const card = state.cards?.[rule.id];
    const due = card && card.nextReview <= Date.now();
    const fresh = !card;
    const weak = ruleWeakScore(state, rule.id);
    const score = mode === 'all' ? Math.random() : weak * 3 + (due ? 4 : 0) + (fresh ? 1 : 0) + (card?.incorrect || 0);
    cards.push({
      id: `${rule.id}|${wordKey(item)}`,
      item,
      type: rule.type,
      ruleLabel: rule.label,
      form,
      example: contextSentenceFor(item, rule.type),
      score,
      due,
      fresh,
      weak
    });
  }
  const sorted = mode === 'all' ? shuffled(cards) : cards.sort((a, b) => b.score - a.score || a.ruleLabel.localeCompare(b.ruleLabel));
  return sorted.slice(0, count);
}

export default function AmbientReviewPanel({ state, setState, words, practicePrefs = DEFAULT_PREFS, wordLists = [] }) {
  const [mode, setMode] = useState('smart');
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(0.82);
  const [showEnglish, setShowEnglish] = useState(true);
  const timerRef = useRef(null);
  
  const ambient = state.ambient || defaultState().ambient;
  const deck = useMemo(
    () => buildAmbientDeck(words, state, practicePrefs, wordLists, mode, 18),
    [words, state.cards, state.mistakes, state.enabledTypes, state.verbStats, practicePrefs, wordLists, mode]
  );
  
  const current = deck[index % Math.max(1, deck.length)] || null;

  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [
    mode,
    practicePrefs.wordListIds,
    practicePrefs.jlptLevels,
    practicePrefs.wordTypes,
    practicePrefs.wordGroups,
    practicePrefs.genkiLessons,
    practicePrefs.skipDuplicateForms
  ]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!playing || !current) return undefined;
    let cancelled = false;
    speakJapanese(current.example.ja, rate, practicePrefs.voiceURI, () => {
      if (cancelled) return;
      bumpPlayed();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (!cancelled) setIndex(i => (i + 1) % deck.length);
      }, 1200);
    });
    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [playing, index, current?.id, rate, practicePrefs.voiceURI]);

  function bumpPlayed() {
    setState(s => {
      const a = s.ambient || defaultState().ambient;
      return {
        ...s,
        ambient: { ...a, played: (a.played || 0) + 1, lastAt: Date.now() }
      };
    });
  }

  function startStop() {
    if (!deck.length) return;
    if (playing) {
      setPlaying(false);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      return;
    }
    setState(s => {
      const a = s.ambient || defaultState().ambient;
      return {
        ...s,
        ambient: { ...a, sessions: (a.sessions || 0) + 1, lastAt: Date.now() }
      };
    });
    setPlaying(true);
  }

  function next() {
    if (!deck.length) return;
    bumpPlayed();
    setIndex(i => (i + 1) % deck.length);
  }

  if (!deck.length) {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5 text-center text-stone-500">
        No ambient review items match the current filters.
      </div>
    );
  }

  const view = current ? promptDisplay(current.item, null, practicePrefs) : null;
  const formView = current ? formDisplay(current.form, practicePrefs) : null;

  return (
    <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-medium flex items-center gap-2 text-stone-800 dark:text-stone-200">
            <IconVolume className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Ambient review playlist
          </h3>
          <p className="text-xs text-stone-500">
            {ambient.played || 0} exposures · {ambient.sessions || 0} sessions
          </p>
        </div>
        <button
          onClick={startStop}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
            playing
              ? 'bg-rose-600 hover:bg-rose-700 text-white'
              : 'bg-stone-800 hover:bg-stone-900 text-white dark:bg-stone-200 dark:hover:bg-stone-150 dark:text-stone-900'
          }`}
        >
          {playing ? 'Stop' : 'Play'}
        </button>
      </div>
      <div className="rounded-2xl bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-850 p-5 text-center">
        <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium mb-2">
          {current.ruleLabel} · {TYPE_LABEL[current.type]}
        </div>
        <ScriptDisplay view={view} className="text-3xl sm:text-4xl font-medium" subClassName="text-sm text-stone-500 mt-1" />
        <div className="mt-3 text-sm text-stone-500 italic">{current.item.meaning}</div>
        <div className="my-4 h-px bg-stone-250 dark:bg-stone-800" />
        <ScriptDisplay view={formView} className="text-2xl font-semibold" subClassName="text-xs text-stone-500 mt-1" />
        <div className="mt-3 text-lg leading-relaxed text-stone-800 dark:text-stone-200" lang="ja">
          {current.example.ja}
        </div>
        {showEnglish && <div className="mt-2 text-sm text-stone-500">{current.example.en}</div>}
      </div>
      <div className="grid sm:grid-cols-[1fr_auto] gap-3 mt-4 items-center">
        <div>
          <label className="text-xs text-stone-500 block mb-1">
            Playlist speed · {rate.toFixed(2)}x
          </label>
          <input
            type="range"
            min="0.55"
            max="1.1"
            step="0.05"
            value={rate}
            onChange={e => setRate(Number(e.target.value))}
            className="w-full cursor-pointer accent-indigo-600"
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <div className="grid grid-cols-2 gap-1 p-1 bg-stone-100 dark:bg-stone-950 rounded-lg">
            {[{ id: 'smart', label: 'Smart' }, { id: 'all', label: 'All' }].map(o => (
              <button
                key={o.id}
                onClick={() => setMode(o.id)}
                className={`px-2 py-1.5 rounded-md text-xs font-medium transition ${
                  mode === o.id
                    ? 'bg-white dark:bg-stone-600 text-indigo-700 dark:text-white shadow-sm'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => speakJapanese(current.example.ja, rate, practicePrefs.voiceURI)}
            className="px-3 py-2 rounded-lg text-sm border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-350"
          >
            Speak
          </button>
          <button
            onClick={() => setShowEnglish(!showEnglish)}
            className="px-3 py-2 rounded-lg text-sm border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-350"
          >
            {showEnglish ? 'Hide EN' : 'Show EN'}
          </button>
          <button
            onClick={next}
            className="px-3 py-2 rounded-lg text-sm border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-350"
          >
            Next
          </button>
        </div>
      </div>
      <div className="mt-3 text-xs text-stone-400 text-center">
        Smart mode prioritizes weak, due, and fresh conjugation cards from your current filters.
      </div>
    </div>
  );
}
