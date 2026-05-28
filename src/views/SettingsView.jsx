import React, { useState, useEffect, useMemo } from 'react';
import {
  IconVolume,
  IconRefresh,
  IconPen,
  IconSpark,
  IconChat,
  IconCloud
} from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import {
  STARTER_VERBS,
  STARTER_ADJECTIVES,
  JLPT_LEVELS,
  GENKI_LESSONS,
  MINNA_LESSONS,
  WORD_TYPE_OPTIONS,
  WORD_GROUP_OPTIONS
} from '../data/starterWords.js';
import {
  ALL_CARD_TYPES,
  TYPE_PACKS,
  CONJ_TYPES,
  ADJ_TYPES
} from '../data/conjugationTypes.js';
import {
  AI_FEEDBACK_LEVELS,
  AI_GUIDE_TONES
} from '../utils/gemini.js';
import {
  toHiragana,
  kanaToRomaji
} from '../utils/romaji.js';
import {
  typePreviewValues,
  isAdjective
} from '../utils/conjugator.js';
import {
  buildPracticePoolSummary,
  weakTypeIdsForState,
  defaultState,
  mergeState
} from '../utils/storage.js';
import {
  formDisplay,
  mergePracticePrefs,
  resolveDisplayScripts,
  scriptModeFromDisplay
} from '../utils/display.js';
import { speakJapanese } from '../utils/speech.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

const POLITE_FORM_IDS = ALL_CARD_TYPES.filter(t => t.id.includes('polite') || t.label.toLowerCase().includes('polite')).map(t => t.id);

function compactLookupText(s) {
  return String(s || '').normalize('NFKC').replace(/[、。！？\s'"「」『』（）()[\]{}]/g, '').toLowerCase();
}

export default function SettingsView({
  state,
  setState,
  customVerbs,
  setCustomVerbs,
  customAdjectives,
  setCustomAdjectives,
  wordLists,
  setWordLists,
  session,
  syncStatus,
  syncNow,
  geminiKey,
  practicePrefs,
  setPracticePrefs,
  speechVoices = [],
  resolvedTheme = 'light',
  supabase,
  onShowAuth
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErr, setImportErr] = useState('');
  const [msg, setMsg] = useState('');
  const [copyOk, setCopyOk] = useState(false);
  const [localGeminiKey, setLocalGeminiKey] = useState(geminiKey);
  const [geminiMsg, setGeminiMsg] = useState('');
  const [typeSearch, setTypeSearch] = useState('');

  useEffect(() => {
    setLocalGeminiKey(geminiKey);
  }, [geminiKey]);

  const exportData = useMemo(() => {
    return JSON.stringify({
      format: 'jp-verb-srs',
      version: 39,
      exportedAt: new Date().toISOString(),
      state: {
        cards: state.cards,
        enabledTypes: state.enabledTypes,
        verbStats: state.verbStats || {},
        mistakes: state.mistakes || [],
        shadow: state.shadow,
        ambient: state.ambient,
        game: state.game,
        onbin: state.onbin,
        meaning: state.meaning,
        mock: state.mock,
        reader: state.reader,
        production: state.production || defaultState().production,
        reference: state.reference,
        daily: state.daily,
        classify: state.classify
      },
      customVerbs,
      customAdjectives,
      wordLists,
      practicePrefs
    });
  }, [state, customVerbs, customAdjectives, wordLists, practicePrefs]);

  function toggle(id) {
    const has = state.enabledTypes.includes(id);
    setState({
      ...state,
      enabledTypes: has ? state.enabledTypes.filter(t => t !== id) : [...state.enabledTypes, id]
    });
  }

  function togglePref(key, id, allIds) {
    const cur = practicePrefs[key] || allIds;
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    setPracticePrefs({ ...practicePrefs, [key]: next.length ? next : allIds });
  }

  function setGenkiLessons(ids) {
    const clean = [...new Set(ids.map(Number))].filter(n => GENKI_LESSONS.includes(n)).sort((a, b) => a - b);
    setPracticePrefs({ ...practicePrefs, genkiLessons: clean.length === GENKI_LESSONS.length ? [] : clean });
  }

  function toggleGenkiLesson(n) {
    const selected = practicePrefs.genkiLessons === null
      ? []
      : (Array.isArray(practicePrefs.genkiLessons) && practicePrefs.genkiLessons.length ? practicePrefs.genkiLessons : GENKI_LESSONS);
    const next = selected.includes(n) ? selected.filter(x => x !== n) : [...selected, n];
    setGenkiLessons(next.length ? next : GENKI_LESSONS);
  }

  function setMinnaLessons(ids) {
    const clean = [...new Set(ids.map(Number))].filter(n => MINNA_LESSONS.includes(n)).sort((a, b) => a - b);
    setPracticePrefs({ ...practicePrefs, minnaLessons: clean.length === MINNA_LESSONS.length ? [] : clean });
  }

  function toggleMinnaLesson(n) {
    const selected = practicePrefs.minnaLessons === null
      ? []
      : (Array.isArray(practicePrefs.minnaLessons) && practicePrefs.minnaLessons.length ? practicePrefs.minnaLessons : MINNA_LESSONS);
    const next = selected.includes(n) ? selected.filter(x => x !== n) : [...selected, n];
    setMinnaLessons(next.length ? next : MINNA_LESSONS);
  }

  function toggleDisplayScript(id) {
    const current = resolveDisplayScripts(practicePrefs);
    const next = { ...current, [id]: !current[id] };
    if (!next.kanji && !next.kana && !next.romaji) next[id] = true;
    setPracticePrefs({ ...practicePrefs, displayScripts: next, scriptMode: scriptModeFromDisplay(next) });
  }

  function applyTypePack(ids) {
    const valid = new Set(ALL_CARD_TYPES.map(t => t.id));
    const clean = [...new Set((ids || []).filter(id => valid.has(id)))];
    if (clean.length) setState({ ...state, enabledTypes: clean });
  }

  function toggleAllPolite() {
    if (allPoliteOn) {
      setState({ ...state, enabledTypes: state.enabledTypes.filter(id => !POLITE_FORM_IDS.includes(id)) });
    } else {
      setState({ ...state, enabledTypes: [...new Set([...state.enabledTypes, ...POLITE_FORM_IDS])] });
    }
  }

  function reset() {
    setState({ ...defaultState(), enabledTypes: state.enabledTypes });
    setConfirmReset(false);
  }

  async function copyExport() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(exportData);
        setCopyOk(true);
        setTimeout(() => setCopyOk(false), 2000);
      }
    } catch (e) {}
  }

  function doImport() {
    setImportErr('');
    try {
      const data = JSON.parse(importText.trim());
      if (data.format !== 'jp-verb-srs') throw new Error("doesn't look like a verb-drill backup");
      if (!data.state || typeof data.state.cards !== 'object') throw new Error('missing card data');
      setState(mergeState(data.state, { reviewed: 0, correct: 0 }));
      if (Array.isArray(data.customVerbs)) setCustomVerbs(data.customVerbs);
      if (Array.isArray(data.customAdjectives)) setCustomAdjectives(data.customAdjectives);
      if (Array.isArray(data.wordLists)) setWordLists(data.wordLists);
      if (data.practicePrefs) setPracticePrefs(mergePracticePrefs(data.practicePrefs));
      setImportText('');
      setImportOpen(false);
      setMsg('Restored!');
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setImportErr('Invalid: ' + (e.message || 'parse failed'));
    }
  }

  const statusColor = syncStatus.kind === 'error'
    ? 'text-rose-700 bg-rose-50 border-rose-250 dark:bg-rose-955/20 dark:border-rose-900'
    : syncStatus.kind === 'syncing'
      ? 'text-amber-700 bg-amber-50 border-amber-250 dark:bg-amber-955/20 dark:border-amber-900'
      : syncStatus.kind === 'ok'
        ? 'text-emerald-700 bg-emerald-50 border-emerald-250 dark:bg-emerald-955/20 dark:border-emerald-900'
        : 'text-stone-600 bg-stone-50 border-stone-250 dark:bg-stone-950 dark:border-stone-850';

  const displayScripts = resolveDisplayScripts(practicePrefs);
  const selectedGenkiLessons = practicePrefs.genkiLessons === null ? [] : (Array.isArray(practicePrefs.genkiLessons) && practicePrefs.genkiLessons.length ? practicePrefs.genkiLessons : GENKI_LESSONS);
  const selectedMinnaLessons = practicePrefs.minnaLessons === null ? [] : (Array.isArray(practicePrefs.minnaLessons) && practicePrefs.minnaLessons.length ? practicePrefs.minnaLessons : MINNA_LESSONS);
  const selectedWordGroups = practicePrefs.wordGroups && practicePrefs.wordGroups.length ? practicePrefs.wordGroups : WORD_GROUP_OPTIONS.map(x => x.id);
  const selectedVoiceAvailable = !practicePrefs.voiceURI || speechVoices.some(v => v.voiceURI === practicePrefs.voiceURI);
  const weakPackIds = weakTypeIdsForState(state, state.enabledTypes);
  const typePacks = [...TYPE_PACKS, { id: 'weak', label: 'Weak mix', hint: 'Uses your misses and SRS history to pick forms worth isolating.', typeIds: weakPackIds }];
  const enabledKey = [...state.enabledTypes].sort().join('|');
  const settingsWords = useMemo(() => [...STARTER_VERBS, ...customVerbs, ...STARTER_ADJECTIVES, ...customAdjectives], [customVerbs, customAdjectives]);
  const poolSummary = useMemo(() => buildPracticePoolSummary(state, settingsWords, practicePrefs, wordLists), [state, settingsWords, practicePrefs, wordLists]);
  const typeNeedle = typeSearch.trim().toLowerCase();
  const typeNeedleKana = compactLookupText(toHiragana(typeSearch));
  const visibleCardTypes = ALL_CARD_TYPES.filter(t => {
    if (!typeNeedle) return true;
    const hay = [t.id, t.label, t.sub, t.hint].join(' ').toLowerCase();
    const kanaHay = compactLookupText(`${t.sub} ${t.hint}`);
    return hay.includes(typeNeedle) || kanaHay.includes(typeNeedleKana) || kanaToRomaji(t.sub || '').toLowerCase().includes(typeNeedle);
  });

  const enabledPoliteCount = POLITE_FORM_IDS.filter(id => state.enabledTypes.includes(id)).length;
  const allPoliteOn = enabledPoliteCount === POLITE_FORM_IDS.length;

  return (
    <div className="space-y-4 text-left">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
        <h3 className="font-medium mb-3 text-stone-800 dark:text-stone-200">Practice mode</h3>
        <div className={`mb-4 border-y py-3 ${poolSummary.prompts ? 'border-stone-100 dark:border-stone-850' : 'border-amber-200 bg-amber-50/60 dark:bg-amber-955/20 -mx-2 px-2 rounded-xl'}`}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="text-xs uppercase tracking-wider text-stone-500 font-medium">Question pool</div>
            {!poolSummary.prompts && <div className="text-xs text-amber-700 dark:text-amber-400">No available prompts</div>}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            {[
              ['Prompts', poolSummary.prompts],
              ['Words', poolSummary.words],
              ['Forms', poolSummary.forms],
              ['Due', poolSummary.due],
              ['New', poolSummary.fresh],
              ['Weak', poolSummary.weak],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <div className="text-lg font-semibold tabular-nums text-stone-800 dark:text-stone-200">{value}</div>
                <div className="text-[11px] text-stone-400">{label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Answer mode</label>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {[{ id: 'input', label: 'Free input' }, { id: 'guided', label: 'Guided kana' }, { id: 'choice', label: 'Choices' }, { id: 'self-check', label: 'Self-check' }].map(o => (
                <button
                  key={o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, answerMode: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    practicePrefs.answerMode === o.id
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Kana feedback while typing</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'none', label: 'None' },
                { id: 'color', label: 'Colors' },
                { id: 'color-count', label: 'Colors + count' }
              ].map(o => (
                <button
                  key={o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, kanaMatchDisplay: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    ((practicePrefs.kanaMatchDisplay || DEFAULT_PREFS.kanaMatchDisplay) === o.id)
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">Colors + count always shown after submitting.</p>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Drill mode</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ id: 'word', label: 'Word only' }, { id: 'sentence', label: 'Sentence context' }].map(o => (
                <button
                  key={o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, drillMode: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    ((practicePrefs.drillMode || 'word') === o.id)
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Study direction</label>
            <div className="grid grid-cols-3 gap-2">
              {[{ id: 'forward', label: 'Conjugate' }, { id: 'reverse', label: 'Reverse' }, { id: 'mixed', label: 'Mixed' }].map(o => (
                <button
                  key={o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, drillDirection: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    ((practicePrefs.drillDirection || DEFAULT_PREFS.drillDirection) === o.id)
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">Reverse shows a conjugated form and asks for the dictionary form.</p>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Practice focus</label>
            <div className="flex gap-2">
              {[{ id: 'balanced', label: 'Balanced' }, { id: 'weak', label: 'Weak spots' }].map(o => (
                <button
                  key={o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, practiceFocus: o.id })}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition ${
                    ((practicePrefs.practiceFocus || 'balanced') === o.id)
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Identical forms</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ id: true, label: 'Skip' }, { id: false, label: 'Keep' }].map(o => (
                <button
                  key={String(o.id)}
                  onClick={() => setPracticePrefs({ ...practicePrefs, skipDuplicateForms: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    ((practicePrefs.skipDuplicateForms !== false) === o.id)
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">English hints</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ id: 'show', label: 'Show' }, { id: 'hidden', label: 'Hide' }].map(o => (
                <button
                  key={o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, englishHints: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    ((practicePrefs.englishHints || DEFAULT_PREFS.englishHints) === o.id)
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">Hidden mode can still ask Gemini for a non-answer clue.</p>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Word category label</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ id: true, label: 'Show' }, { id: false, label: 'Hide' }].map(o => (
                <button
                  key={String(o.id)}
                  onClick={() => setPracticePrefs({ ...practicePrefs, showWordCategory: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    (!!practicePrefs.showWordCategory === o.id)
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">Hides う-verb / る-verb / な-adjective labels during review — identifying the category is part of the training.</p>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Theme</label>
            <div className="grid grid-cols-3 gap-2">
              {[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: `System${resolvedTheme === 'dark' ? ' dark' : ' light'}` }].map(o => (
                <button
                  key={o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, theme: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    ((practicePrefs.theme || 'system') === o.id)
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Display scripts</label>
            <div className="grid grid-cols-3 gap-2">
              {[{ id: 'kanji', label: 'Kanji' }, { id: 'kana', label: 'Kana' }, { id: 'romaji', label: 'Romaji' }].map(o => (
                <button
                  key={o.id}
                  onClick={() => toggleDisplayScript(o.id)}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    displayScripts[o.id]
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPracticePrefs({ ...practicePrefs, furigana: practicePrefs.furigana === false })}
              disabled={!(displayScripts.kanji && displayScripts.kana)}
              className={`mt-2 w-full px-3 py-2 rounded-lg text-sm border transition disabled:opacity-40 ${
                practicePrefs.furigana !== false && displayScripts.kanji && displayScripts.kana
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
              }`}
            >
              Furigana {practicePrefs.furigana !== false ? 'on' : 'off'}
            </button>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-stone-500 block mb-1">Prompt form</label>
            <select
              value={practicePrefs.promptForm || 'dictionary'}
              onChange={e => setPracticePrefs({ ...practicePrefs, promptForm: e.target.value })}
              className="w-full px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
            >
              <option value="dictionary">Dictionary form</option>
              <option value="random">Random compatible source form</option>
              <optgroup label="Verb source forms">
                {CONJ_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </optgroup>
              <optgroup label="Adjective source forms">
                {ADJ_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </optgroup>
            </select>
            <div className="mt-2 grid sm:grid-cols-[1fr_auto] gap-2 items-center">
              <p className="text-[11px] text-stone-400">Practice transformations like て-form → passive; incompatible sources fall back to dictionary form.</p>
              <button
                onClick={() => setPracticePrefs({ ...practicePrefs, trickQuestions: !practicePrefs.trickQuestions })}
                className={`px-3 py-2 rounded-lg text-sm border transition ${
                  practicePrefs.trickQuestions
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                }`}
              >
                Trick questions {practicePrefs.trickQuestions ? 'on' : 'off'}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Daily goal</label>
            <input
              type="number"
              min="1"
              max="200"
              value={practicePrefs.dailyGoal}
              onChange={e => setPracticePrefs({ ...practicePrefs, dailyGoal: Math.max(1, Number(e.target.value) || 10) })}
              className="w-full px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setPracticePrefs({ ...practicePrefs, autoSpeak: !practicePrefs.autoSpeak })}
              className={`w-full px-3 py-2 rounded-lg text-sm border transition ${
                practicePrefs.autoSpeak
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
              }`}
            >
              <IconVolume className="w-4 h-4 inline-block mr-1.5" />
              Speak answers
            </button>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setPracticePrefs({ ...practicePrefs, autoAdvanceCorrect: !practicePrefs.autoAdvanceCorrect })}
              className={`w-full px-3 py-2 rounded-lg text-sm border transition inline-flex items-center justify-center gap-1.5 ${
                practicePrefs.autoAdvanceCorrect
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
              }`}
            >
              <IconRefresh className="w-4 h-4" />
              Auto next
            </button>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setPracticePrefs({ ...practicePrefs, listeningPrompt: !practicePrefs.listeningPrompt })}
              className={`w-full px-3 py-2 rounded-lg text-sm border transition ${
                practicePrefs.listeningPrompt
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
              }`}
            >
              <IconVolume className="w-4 h-4 inline-block mr-1.5" />
              Listening prompt
            </button>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setPracticePrefs({ ...practicePrefs, colorCodeConjugations: practicePrefs.colorCodeConjugations === false })}
              className={`w-full px-3 py-2 rounded-lg text-sm border transition ${
                practicePrefs.colorCodeConjugations !== false
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
              }`}
            >
              <IconPen className="w-4 h-4 inline-block mr-1.5" />
              Color segments
            </button>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-stone-500 block mb-1">Japanese voice</label>
            <div className="flex gap-2">
              <select
                value={practicePrefs.voiceURI || ''}
                onChange={e => setPracticePrefs({ ...practicePrefs, voiceURI: e.target.value })}
                className="flex-1 min-w-0 px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Auto Japanese voice</option>
                {!selectedVoiceAvailable && <option value={practicePrefs.voiceURI}>Selected voice unavailable</option>}
                {speechVoices.map((v, i) => (
                  <option key={v.voiceURI || `${v.name}-${i}`} value={v.voiceURI}>
                    {v.name} - {v.lang}
                    {v.localService ? ' - local' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={() => speakJapanese('食べてください', 0.85, practicePrefs.voiceURI)}
                className="px-3 py-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-sm flex items-center gap-1.5"
              >
                <IconVolume className="w-4 h-4" />
                Test
              </button>
            </div>
            {speechVoices.length === 0 && <p className="text-[11px] text-stone-400 mt-1">Japanese voices appear after the browser loads speech voices.</p>}
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Timed drill</label>
            <select
              value={practicePrefs.durationSec || 0}
              onChange={e => setPracticePrefs({ ...practicePrefs, durationSec: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-205 rounded-lg focus:border-indigo-500 focus:outline-none"
            >
              <option value="0">Infinite</option>
              <option value="30">30 seconds</option>
              <option value="60">60 seconds</option>
              <option value="120">120 seconds</option>
              <option value="180">180 seconds</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Review set</label>
            <select
              value={practicePrefs.reviewLimit || 0}
              onChange={e => setPracticePrefs({ ...practicePrefs, reviewLimit: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-205 rounded-lg focus:border-indigo-500 focus:outline-none"
            >
              <option value="0">Open ended</option>
              <option value="10">10 cards</option>
              <option value="20">20 cards</option>
              <option value="30">30 cards</option>
              <option value="40">40 cards</option>
              <option value="50">50 cards</option>
            </select>
            <p className="text-[11px] text-stone-400 mt-1">Stops Study after a fixed set; timed drill can still run at the same time.</p>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">JLPT levels</label>
            <div className="flex gap-1">
              {JLPT_LEVELS.map(l => (
                <button
                  key={l}
                  onClick={() => togglePref('jlptLevels', l, JLPT_LEVELS)}
                  className={`flex-1 px-2 py-2 rounded-lg text-xs border transition ${
                    (practicePrefs.jlptLevels || JLPT_LEVELS).includes(l)
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between gap-3 mb-1">
              <label className="text-xs text-stone-500 block">Genki lessons</label>
              <div className="flex gap-1">
                <button onClick={() => setPracticePrefs({ ...practicePrefs, genkiLessons: null })} className={`px-2 py-1 rounded-md text-[11px] border transition ${practicePrefs.genkiLessons === null ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600' : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850'}`}>None</button>
                <button onClick={() => setGenkiLessons(GENKI_LESSONS)} className="px-2 py-1 rounded-md text-[11px] border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850">All</button>
                <button onClick={() => setGenkiLessons(GENKI_LESSONS.filter(n => n <= 12))} className="px-2 py-1 rounded-md text-[11px] border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850">I</button>
                <button onClick={() => setGenkiLessons(GENKI_LESSONS.filter(n => n >= 13))} className="px-2 py-1 rounded-md text-[11px] border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850">II</button>
              </div>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-[repeat(12,minmax(0,1fr))] gap-1">
              {GENKI_LESSONS.map(n => (
                <button
                  key={n}
                  onClick={() => toggleGenkiLesson(n)}
                  className={`px-2 py-2 rounded-lg text-xs border transition ${
                    selectedGenkiLessons.includes(n)
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  L{n}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <div className="flex-1 border-t border-stone-200 dark:border-stone-800" />
            <span className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 tracking-wide">OR</span>
            <div className="flex-1 border-t border-stone-200 dark:border-stone-800" />
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between gap-3 mb-1">
              <label className="text-xs text-stone-500 block">みんなの日本語 lessons</label>
              <div className="flex gap-1">
                <button onClick={() => setPracticePrefs({ ...practicePrefs, minnaLessons: null })} className={`px-2 py-1 rounded-md text-[11px] border transition ${practicePrefs.minnaLessons === null ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600' : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850'}`}>None</button>
                <button onClick={() => setMinnaLessons(MINNA_LESSONS)} className="px-2 py-1 rounded-md text-[11px] border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850">All</button>
                <button onClick={() => setMinnaLessons(MINNA_LESSONS.filter(n => n <= 25))} className="px-2 py-1 rounded-md text-[11px] border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850">I</button>
                <button onClick={() => setMinnaLessons(MINNA_LESSONS.filter(n => n >= 26))} className="px-2 py-1 rounded-md text-[11px] border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850">II</button>
              </div>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-[repeat(13,minmax(0,1fr))] gap-1">
              {MINNA_LESSONS.map(n => (
                <button
                  key={n}
                  onClick={() => toggleMinnaLesson(n)}
                  className={`px-2 py-2 rounded-lg text-xs border transition ${
                    selectedMinnaLessons.includes(n)
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  L{n}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">Words from Genki <span className="font-semibold">OR</span> Minna lessons are included. Textbook selection applies <span className="font-semibold">AND</span> JLPT, word type, and study-list filters.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-stone-500 block mb-1">Word types</label>
            <div className="grid grid-cols-3 gap-2">
              {WORD_TYPE_OPTIONS.map(o => (
                <button
                  key={o.id}
                  onClick={() => togglePref('wordTypes', o.id, WORD_TYPE_OPTIONS.map(x => x.id))}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    (practicePrefs.wordTypes || WORD_TYPE_OPTIONS.map(x => x.id)).includes(o.id)
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between gap-3 mb-1">
              <label className="text-xs text-stone-500 block">Word groups</label>
              <span className="text-[11px] text-stone-400">{selectedWordGroups.length}/{WORD_GROUP_OPTIONS.length}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
              {WORD_GROUP_OPTIONS.map(o => (
                <button
                  key={o.id}
                  onClick={() => togglePref('wordGroups', o.id, WORD_GROUP_OPTIONS.map(x => x.id))}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    selectedWordGroups.includes(o.id)
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">Refines every drill and review deck after JLPT, lesson, and word-list filters.</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
        <h3 className="font-medium mb-1 text-stone-850 dark:text-stone-200">Conjugation types in scope</h3>
        <p className="text-xs text-stone-500 mb-4">Toggle individual forms, or apply a form pack.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
          {typePacks.map(pack => {
            const packKey = [...pack.typeIds].sort().join('|');
            const active = packKey === enabledKey;
            return (
              <button
                key={pack.id}
                onClick={() => applyTypePack(pack.typeIds)}
                className={`text-left rounded-xl border px-3 py-3 transition ${
                  active
                    ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900 text-stone-900 dark:text-stone-100'
                    : 'bg-stone-50 dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-900 hover:border-indigo-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-stone-800 dark:text-stone-200">{pack.label}</div>
                  <div className={`text-[11px] px-1.5 py-0.5 rounded-full ${active ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700'}`}>
                    {pack.typeIds.length}
                  </div>
                </div>
                <div className="text-xs text-stone-500 mt-1">{pack.hint}</div>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            onClick={toggleAllPolite}
            title={allPoliteOn ? 'Disable all polite (ます/です) forms' : 'Enable all polite (ます/です) forms'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              allPoliteOn
                ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                : enabledPoliteCount > 0
                  ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-950/50'
                  : 'bg-white dark:bg-stone-950 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-800 hover:border-indigo-300 dark:hover:border-indigo-700'
            }`}
          >
            Polite forms
            <span className={`tabular-nums px-1.5 py-0.5 rounded-full text-xs ${
              allPoliteOn ? 'bg-white/20 text-white' : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
            }`}>
              {enabledPoliteCount}/{POLITE_FORM_IDS.length}
            </span>
          </button>
        </div>
        <div className="mb-3 grid sm:grid-cols-[1fr_auto] gap-2 items-center">
          <input
            value={typeSearch}
            onChange={e => setTypeSearch(e.target.value)}
            placeholder="Search forms, e.g. passive, たい, ba..."
            className="w-full px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
          />
          <div className="text-xs text-stone-400 tabular-nums text-right">{visibleCardTypes.length}/{ALL_CARD_TYPES.length} forms</div>
        </div>
        <div className="space-y-2">
          {visibleCardTypes.map(t => {
            const on = state.enabledTypes.includes(t.id);
            const previews = typePreviewValues(t.id);
            return (
              <div key={t.id} className="grid sm:grid-cols-[minmax(0,1fr)_minmax(14rem,auto)_auto] gap-3 items-center py-2 px-3 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-950">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-stone-850 dark:text-stone-200">{t.label}</div>
                  <div className="text-xs text-stone-500">{t.sub && (t.sub + ' · ')}{t.hint}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {previews.map(p => {
                    const view = formDisplay(p.answer, practicePrefs, p.item, t.id);
                    return (
                      <div key={`${t.id}-${p.item.dict}`} className="min-w-0 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-2 py-1.5">
                        <div className="text-[11px] text-stone-400 truncate" lang="ja">{p.item.dict}</div>
                        <ScriptDisplay view={view} className="text-sm font-medium truncate text-stone-800 dark:text-stone-200" subClassName="text-[11px] text-stone-400 truncate" />
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => toggle(t.id)}
                  className={`relative w-10 h-6 rounded-full transition flex-shrink-0 justify-self-end ${on ? 'bg-indigo-600' : 'bg-stone-300 dark:bg-stone-700'}`}
                  title={`${on ? 'Disable' : 'Enable'} ${t.label}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition ${on ? 'translate-x-4' : ''}`} />
                </button>
              </div>
            );
          })}
        </div>
        {!visibleCardTypes.length && (
          <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-4 text-sm text-stone-500 text-center">
            No forms match that search.
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
        <h3 className="font-medium mb-1 flex items-center gap-2 text-stone-850 dark:text-stone-200">
          <IconChat className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          AI Chat (Gemini)
        </h3>
        <p className="text-xs text-stone-500 mb-3">Powers AI miss coaching, "Ask Gemini why", and AI verb lookup. Free key at <span className="text-indigo-600 dark:text-indigo-400 font-medium">aistudio.google.com</span></p>
        
        {geminiKey ? (
          <div className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-955/20 border border-emerald-250 dark:border-emerald-900 rounded-xl px-3 py-2 mb-3">
            ✓ Gemini API is active (configured in environment).
          </div>
        ) : (
          <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-955/20 border border-amber-250 dark:border-amber-900 rounded-xl px-3 py-2 mb-3">
            ⚠️ Gemini API is not configured. Please set <code>VITE_GEMINI_API_KEY</code> in your environment variables to enable AI coaching.
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">AI feedback</label>
            <div className="grid grid-cols-2 gap-2">
              {AI_FEEDBACK_LEVELS.map(o => (
                <button
                  key={o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, aiFeedbackLevel: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    ((practicePrefs.aiFeedbackLevel || DEFAULT_PREFS.aiFeedbackLevel) === o.id)
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Guide tone</label>
            <div className="grid grid-cols-3 gap-2">
              {AI_GUIDE_TONES.map(o => (
                <button
                  key={o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, aiGuideTone: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    ((practicePrefs.aiGuideTone || DEFAULT_PREFS.aiGuideTone) === o.id)
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <button
              onClick={() => setPracticePrefs({ ...practicePrefs, autoAiExplainErrors: !practicePrefs.autoAiExplainErrors })}
              className={`w-full px-3 py-2 rounded-lg text-sm border transition inline-flex items-center justify-center gap-1.5 ${
                practicePrefs.autoAiExplainErrors
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-stone-955 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
              }`}
            >
              <IconSpark className="w-4 h-4" />
              AI on misses
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
        <h3 className="font-medium mb-1 flex items-center gap-2 text-stone-850 dark:text-stone-200">
          <IconCloud className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          Cloud Sync
        </h3>
        {!supabase ? (
          <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-955/20 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
            <p className="font-medium">Cloud sync is not configured</p>
            <p className="text-xs text-stone-500 mt-1">
              Please set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your environment variables to enable user logins and cloud sync.
            </p>
          </div>
        ) : !session ? (
          <div className="space-y-3">
            <p className="text-xs text-stone-500">
              Sync your progress, custom vocabulary, and word lists across all devices.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button 
                onClick={onShowAuth}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition"
              >
                Sign In / Sign Up
              </button>
              <button 
                onClick={async () => {
                  try {
                    const { error } = await supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options: { redirectTo: window.location.origin }
                    });
                    if (error) throw error;
                  } catch (e) {
                    alert(e.message || 'Failed to trigger Google login');
                  }
                }}
                className="flex-1 py-2 bg-white dark:bg-stone-955 border border-stone-250 dark:border-stone-850 hover:bg-stone-50 dark:hover:bg-stone-850 text-stone-700 dark:text-stone-300 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Continue with Google
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-stone-50 dark:bg-stone-955 rounded-xl border border-stone-200 dark:border-stone-850">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-semibold text-base uppercase">
                {session.user.email ? session.user.email.charAt(0) : 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
                  {session.user.email}
                </div>
                <div className="text-xs text-stone-500">
                  Logged in via {session.user.app_metadata?.provider === 'google' ? 'Google' : 'Email'}
                </div>
              </div>
            </div>
            {syncStatus.message && (
              <div className={`mb-3 text-xs rounded-lg border px-3 py-2 ${statusColor}`}>
                <div className="flex items-center justify-between">
                  <span>{syncStatus.message}</span>
                  {syncStatus.at && <span>{new Date(syncStatus.at).toLocaleTimeString()}</span>}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button 
                onClick={syncNow}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition"
              >
                Sync Now
              </button>
              <button 
                onClick={async () => {
                  if (confirm('Are you sure you want to sign out? Your local progress will be preserved.')) {
                    await supabase.auth.signOut();
                  }
                }}
                className="px-4 py-2 border border-stone-250 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-sm font-medium transition"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
        <h3 className="font-medium mb-1 text-stone-850 dark:text-stone-200">Backup & restore</h3>
        <p className="text-xs text-stone-500 mb-3">Manual JSON transfer without cloud sync.</p>
        {msg && <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-250 rounded-lg px-3 py-2">{msg}</div>}
        <div className="flex gap-2">
          <button
            onClick={() => { setExportOpen(!exportOpen); setImportOpen(false); }}
            className={`flex-1 px-3 py-1.5 border rounded-lg text-sm transition ${
              exportOpen
                ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                : 'border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-850'
            }`}
          >
            Export
          </button>
          <button
            onClick={() => { setImportOpen(!importOpen); setExportOpen(false); setImportErr(''); }}
            className={`flex-1 px-3 py-1.5 border rounded-lg text-sm transition ${
              importOpen
                ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                : 'border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-850'
            }`}
          >
            Import
          </button>
        </div>
        {exportOpen && (
          <div className="mt-3 space-y-2">
            <textarea
              readOnly
              value={exportData}
              onFocus={e => e.target.select()}
              className="w-full h-32 px-3 py-2 text-xs font-mono border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 text-stone-800 dark:text-stone-200 rounded-lg"
            />
            <button onClick={copyExport} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium">
              {copyOk ? '✓ Copied' : 'Copy to clipboard'}
            </button>
          </div>
        )}
        {importOpen && (
          <div className="mt-3 space-y-2">
            <textarea
              value={importText}
              onChange={e => { setImportText(e.target.value); setImportErr(''); }}
              placeholder="Paste backup JSON…"
              className="w-full h-32 px-3 py-2 text-xs font-mono border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-250 rounded-lg focus:border-indigo-500 focus:outline-none"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            {importErr && <div className="text-sm text-rose-600">{importErr}</div>}
            <p className="text-xs text-rose-600 dark:text-rose-400">⚠ Restoring replaces current progress.</p>
            <button
              onClick={doImport}
              disabled={!importText.trim()}
              className="w-full py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium"
            >
              Restore
            </button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
        <h3 className="font-medium mb-1 text-stone-850 dark:text-stone-200">Reset progress</h3>
        <p className="text-xs text-stone-500 mb-3">Clear all SRS state. Custom verbs and settings stay.</p>
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-sm text-stone-700 dark:text-stone-300"
          >
            <IconRefresh className="w-4 h-4" />
            Reset all progress
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={reset} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm">Yes, reset</button>
            <button onClick={() => setConfirmReset(false)} className="px-3 py-1.5 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-sm">Cancel</button>
          </div>
        )}
      </div>
      <div className="text-xs text-stone-400 text-center pt-2">Progress saves automatically to your browser.</div>
    </div>
  );
}
