import React, { useState, useMemo } from 'react';
import { IconVolume, IconRefresh, IconCloud } from '../components/Icons.jsx';
import {
  STARTER_VERBS,
  STARTER_ADJECTIVES,
  JLPT_LEVELS,
  GENKI_LESSONS,
  MINNA_LESSONS,
  WORD_TYPE_OPTIONS,
  WORD_GROUP_OPTIONS,
} from '../data/starterWords.js';
import { ALL_CARD_TYPES, TYPE_PACKS, FORM_GROUPS } from '../data/conjugationTypes.js';
import { normalizePromptFormSetting } from '../utils/conjugator.js';
import {
  buildPracticePoolSummary,
  weakTypeIdsForState,
  defaultState,
  mergeState,
} from '../utils/storage.js';
import {
  mergePracticePrefs,
  resolveDisplayScripts,
  scriptModeFromDisplay,
} from '../utils/display.js';
import { speakJapanese } from '../utils/speech.js';
import { serializeBackup, parseBackup } from '../utils/backup.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { useApp } from '../state/AppStateContext.jsx';

function jaccardSim(a, b) {
  const sa = new Set(a),
    sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

const PROMPT_FORM_OPTIONS = [
  { id: 'dictionary', label: 'Dictionary' },
  { id: 'polite-present', label: 'Masu' },
  { id: 'dict-masu', label: 'Dict + Masu' },
  { id: 'random', label: 'Mixed' },
];

export default function SettingsView() {
  const {
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
    practicePrefs,
    setPracticePrefs,
    speechVoices,
    resolvedTheme,
    supabase,
    showAuth: onShowAuth,
  } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErr, setImportErr] = useState('');
  const [msg, setMsg] = useState('');
  const [copyOk, setCopyOk] = useState(false);
  const [openLessons, setOpenLessons] = useState({ genki: false, minna: false });
  const [showCustom, setShowCustom] = useState(false);

  const exportData = useMemo(
    () => serializeBackup({ state, customVerbs, customAdjectives, wordLists, practicePrefs }),
    [state, customVerbs, customAdjectives, wordLists, practicePrefs],
  );

  function togglePref(key, id, allIds) {
    const cur = practicePrefs[key] || allIds;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setPracticePrefs({ ...practicePrefs, [key]: next.length ? next : allIds });
  }

  function setGenkiLessons(ids) {
    const clean = [...new Set(ids.map(Number))]
      .filter((n) => GENKI_LESSONS.includes(n))
      .sort((a, b) => a - b);
    setPracticePrefs({
      ...practicePrefs,
      genkiLessons: clean.length === GENKI_LESSONS.length ? [] : clean,
    });
  }

  function toggleGenkiLesson(n) {
    const selected =
      practicePrefs.genkiLessons === null
        ? []
        : Array.isArray(practicePrefs.genkiLessons) && practicePrefs.genkiLessons.length
          ? practicePrefs.genkiLessons
          : GENKI_LESSONS;
    const next = selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n];
    setGenkiLessons(next.length ? next : GENKI_LESSONS);
  }

  function setMinnaLessons(ids) {
    const clean = [...new Set(ids.map(Number))]
      .filter((n) => MINNA_LESSONS.includes(n))
      .sort((a, b) => a - b);
    setPracticePrefs({
      ...practicePrefs,
      minnaLessons: clean.length === MINNA_LESSONS.length ? [] : clean,
    });
  }

  function toggleMinnaLesson(n) {
    const selected =
      practicePrefs.minnaLessons === null
        ? []
        : Array.isArray(practicePrefs.minnaLessons) && practicePrefs.minnaLessons.length
          ? practicePrefs.minnaLessons
          : MINNA_LESSONS;
    const next = selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n];
    setMinnaLessons(next.length ? next : MINNA_LESSONS);
  }

  function toggleDisplayScript(id) {
    const current = resolveDisplayScripts(practicePrefs);
    const next = { ...current, [id]: !current[id] };
    if (!next.kanji && !next.kana && !next.romaji) next[id] = true;
    setPracticePrefs({
      ...practicePrefs,
      displayScripts: next,
      scriptMode: scriptModeFromDisplay(next),
    });
  }

  function applyTypePack(ids) {
    const valid = new Set(ALL_CARD_TYPES.map((t) => t.id));
    const clean = [...new Set((ids || []).filter((id) => valid.has(id)))];
    if (clean.length) {
      setState({ ...state, enabledTypes: clean });
      setShowCustom(false);
    }
  }

  function toggleForm(typeId) {
    const next = state.enabledTypes.includes(typeId)
      ? state.enabledTypes.filter((id) => id !== typeId)
      : [...state.enabledTypes, typeId];
    if (next.length) setState({ ...state, enabledTypes: next });
  }

  function toggleGroup(groupTypeIds, allEnabled) {
    let next;
    if (allEnabled) {
      next = state.enabledTypes.filter((id) => !groupTypeIds.includes(id));
    } else {
      const cur = new Set(state.enabledTypes);
      for (const id of groupTypeIds) cur.add(id);
      next = [...cur];
    }
    if (next.length) setState({ ...state, enabledTypes: next });
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
    } catch {}
  }

  function doImport() {
    setImportErr('');
    const { ok, error, data } = parseBackup(importText);
    if (!ok) {
      setImportErr('Invalid: ' + error);
      return;
    }
    setState(mergeState(data.state, { reviewed: 0, correct: 0 }));
    if (Array.isArray(data.customVerbs)) setCustomVerbs(data.customVerbs);
    if (Array.isArray(data.customAdjectives)) setCustomAdjectives(data.customAdjectives);
    if (Array.isArray(data.wordLists)) setWordLists(data.wordLists);
    if (data.practicePrefs) setPracticePrefs(mergePracticePrefs(data.practicePrefs));
    setImportText('');
    setImportOpen(false);
    setMsg('Restored!');
    setTimeout(() => setMsg(''), 3000);
  }

  const statusColor =
    syncStatus.kind === 'error'
      ? 'text-rose-700 bg-rose-50 border-rose-250 dark:bg-rose-955/20 dark:border-rose-900'
      : syncStatus.kind === 'syncing'
        ? 'text-amber-700 bg-amber-50 border-amber-250 dark:bg-amber-955/20 dark:border-amber-900'
        : syncStatus.kind === 'ok'
          ? 'text-emerald-700 bg-emerald-50 border-emerald-250 dark:bg-emerald-955/20 dark:border-emerald-900'
          : 'text-stone-600 bg-stone-50 border-stone-250 dark:bg-stone-950 dark:border-stone-850';

  const displayScripts = resolveDisplayScripts(practicePrefs);
  const promptForm = normalizePromptFormSetting(practicePrefs.promptForm);
  const selectedGenkiLessons =
    practicePrefs.genkiLessons === null
      ? []
      : Array.isArray(practicePrefs.genkiLessons) && practicePrefs.genkiLessons.length
        ? practicePrefs.genkiLessons
        : GENKI_LESSONS;
  const selectedMinnaLessons =
    practicePrefs.minnaLessons === null
      ? []
      : Array.isArray(practicePrefs.minnaLessons) && practicePrefs.minnaLessons.length
        ? practicePrefs.minnaLessons
        : MINNA_LESSONS;
  const selectedWordGroups =
    practicePrefs.wordGroups && practicePrefs.wordGroups.length
      ? practicePrefs.wordGroups
      : WORD_GROUP_OPTIONS.map((x) => x.id);
  const selectedVoiceAvailable =
    !practicePrefs.voiceURI || speechVoices.some((v) => v.voiceURI === practicePrefs.voiceURI);
  const weakPackIds = weakTypeIdsForState(state, state.enabledTypes);
  const typePacks = [
    ...TYPE_PACKS,
    {
      id: 'weak',
      label: 'Weak mix',
      hint: 'Uses your misses and SRS history to pick forms worth isolating.',
      typeIds: weakPackIds,
    },
  ];
  const enabledKey = [...state.enabledTypes].sort().join('|');
  const settingsWords = useMemo(
    () => [...STARTER_VERBS, ...customVerbs, ...STARTER_ADJECTIVES, ...customAdjectives],
    [customVerbs, customAdjectives],
  );
  const poolSummary = useMemo(
    () => buildPracticePoolSummary(state, settingsWords, practicePrefs, wordLists),
    [state, settingsWords, practicePrefs, wordLists],
  );
  const activeTypeCount = state.enabledTypes.length;

  const isCustomMode = !typePacks.some((p) => [...p.typeIds].sort().join('|') === enabledKey);

  const closestPackId = useMemo(() => {
    if (!isCustomMode) return null;
    let best = null,
      bestSim = 0;
    for (const pack of TYPE_PACKS) {
      const sim = jaccardSim(state.enabledTypes, pack.typeIds);
      if (sim > bestSim) {
        bestSim = sim;
        best = pack.id;
      }
    }
    return bestSim > 0.1 ? best : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledKey, isCustomMode]);

  return (
    <div className="space-y-4 text-left">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
        <h3 className="font-medium mb-3 text-stone-800 dark:text-stone-200">Practice session</h3>
        <div
          className={`mb-4 border-y py-3 ${poolSummary.prompts ? 'border-stone-100 dark:border-stone-850' : 'border-amber-200 bg-amber-50/60 dark:bg-amber-955/20 -mx-2 px-2 rounded-xl'}`}
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="text-xs uppercase tracking-wider text-stone-500 font-medium">
              Question pool
            </div>
            {!poolSummary.prompts && (
              <div className="text-xs text-amber-700 dark:text-amber-400">No available prompts</div>
            )}
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
                <div className="text-lg font-semibold tabular-nums text-stone-800 dark:text-stone-200">
                  {value}
                </div>
                <div className="text-[11px] text-stone-400">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Answer mode</label>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                { id: 'input', label: 'Free input' },
                { id: 'guided', label: 'Guided kana' },
                { id: 'choice', label: 'Choices' },
                { id: 'self-check', label: 'Self-check' },
              ].map((o) => (
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
          <div className="sm:col-span-2">
            <label className="text-xs text-stone-500 block mb-1">Prompt form</label>
            <div role="group" aria-label="Prompt form" className="grid grid-cols-2 gap-2">
              {PROMPT_FORM_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() =>
                    setPracticePrefs({
                      ...practicePrefs,
                      promptForm: o.id,
                      trickQuestions: false,
                    })
                  }
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    promptForm === o.id
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <p className="text-[11px] text-stone-400">
                Choose the starting form for Transform. Masu uses the polite present when
                compatible; Dict + Masu alternates between the two; Mixed rotates all compatible
                source forms.
              </p>
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Daily goal</label>
            <input
              type="number"
              min="1"
              max="200"
              value={practicePrefs.dailyGoal}
              onChange={(e) =>
                setPracticePrefs({
                  ...practicePrefs,
                  dailyGoal: Math.max(1, Number(e.target.value) || 30),
                })
              }
              className="w-full px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
        <h3 className="font-medium mb-3 text-stone-800 dark:text-stone-200">Display & audio</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Theme</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'light', label: 'Light' },
                { id: 'dark', label: 'Dark' },
                { id: 'system', label: `System${resolvedTheme === 'dark' ? ' dark' : ' light'}` },
              ].map((o) => (
                <button
                  key={o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, theme: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    (practicePrefs.theme || 'system') === o.id
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
              {[
                { id: 'kanji', label: 'Kanji' },
                { id: 'kana', label: 'Kana' },
                { id: 'romaji', label: 'Romaji' },
              ].map((o) => (
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
              onClick={() =>
                setPracticePrefs({ ...practicePrefs, furigana: practicePrefs.furigana === false })
              }
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
          <div>
            <label className="text-xs text-stone-500 block mb-1">Kana feedback while typing</label>
            <div
              role="group"
              aria-label="Kana feedback while typing"
              className="grid grid-cols-3 gap-2"
            >
              {[
                { id: 'none', label: 'None' },
                { id: 'color', label: 'Colors' },
                { id: 'color-count', label: 'Colors + count' },
              ].map((o) => (
                <button
                  key={o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, kanaMatchDisplay: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    (practicePrefs.kanaMatchDisplay || DEFAULT_PREFS.kanaMatchDisplay) === o.id
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">
              Colors + count always shown after submitting.
            </p>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">English hints</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'show', label: 'Show' },
                { id: 'hidden', label: 'Hide' },
              ].map((o) => (
                <button
                  key={o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, englishHints: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    (practicePrefs.englishHints || DEFAULT_PREFS.englishHints) === o.id
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">
              Hidden mode can still ask Gemini for a non-answer clue.
            </p>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Word category label</label>
            <div role="group" aria-label="Word category label" className="grid grid-cols-2 gap-2">
              {[
                { id: true, label: 'Show' },
                { id: false, label: 'Hide' },
              ].map((o) => (
                <button
                  key={String(o.id)}
                  onClick={() => setPracticePrefs({ ...practicePrefs, showWordCategory: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    !!practicePrefs.showWordCategory === o.id
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">
              Hides う-verb / る-verb / な-adjective labels during review so identifying the
              category stays part of the training.
            </p>
          </div>
          <div className="flex items-end">
            <button
              onClick={() =>
                setPracticePrefs({ ...practicePrefs, autoSpeak: !practicePrefs.autoSpeak })
              }
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
              onClick={() =>
                setPracticePrefs({
                  ...practicePrefs,
                  autoAdvanceCorrect: !practicePrefs.autoAdvanceCorrect,
                })
              }
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
              onClick={() =>
                setPracticePrefs({
                  ...practicePrefs,
                  listeningPrompt: !practicePrefs.listeningPrompt,
                })
              }
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
          <div className="sm:col-span-2">
            <label className="text-xs text-stone-500 block mb-1">Japanese voice</label>
            <div className="flex gap-2">
              <select
                value={practicePrefs.voiceURI || ''}
                onChange={(e) => setPracticePrefs({ ...practicePrefs, voiceURI: e.target.value })}
                className="flex-1 min-w-0 px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Auto Japanese voice</option>
                {!selectedVoiceAvailable && (
                  <option value={practicePrefs.voiceURI}>Selected voice unavailable</option>
                )}
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
            {speechVoices.length === 0 && (
              <p className="text-[11px] text-stone-400 mt-1">
                Japanese voices appear after the browser loads speech voices.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
        <h3 className="font-medium mb-3 text-stone-800 dark:text-stone-200">Vocabulary filters</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">JLPT levels</label>
            <div className="flex gap-1">
              {JLPT_LEVELS.map((l) => (
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
          <div className="hidden sm:block"></div>
          <div className="sm:col-span-2 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-stone-50 dark:bg-stone-950">
              <button
                onClick={() => setOpenLessons((prev) => ({ ...prev, genki: !prev.genki }))}
                className="flex items-center gap-2 flex-1 text-left"
              >
                <svg
                  className={`w-3.5 h-3.5 text-stone-400 flex-shrink-0 transition-transform ${openLessons.genki ? 'rotate-90' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                  Genki lessons
                </span>
              </button>
              <div className="text-xs text-stone-500 font-medium">
                {selectedGenkiLessons.length === 0
                  ? 'None'
                  : selectedGenkiLessons.length === GENKI_LESSONS.length
                    ? 'All'
                    : `${selectedGenkiLessons.length} selected`}
              </div>
            </div>
            {openLessons.genki && (
              <div className="p-3 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800">
                <div className="flex gap-1 mb-2">
                  <button
                    onClick={() => setPracticePrefs({ ...practicePrefs, genkiLessons: null })}
                    className={`px-2 py-1 rounded-md text-[11px] border transition ${practicePrefs.genkiLessons === null ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600' : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850'}`}
                  >
                    None
                  </button>
                  <button
                    onClick={() => setGenkiLessons(GENKI_LESSONS)}
                    className="px-2 py-1 rounded-md text-[11px] border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850"
                  >
                    All
                  </button>
                  <button
                    onClick={() => setGenkiLessons(GENKI_LESSONS.filter((n) => n <= 12))}
                    className="px-2 py-1 rounded-md text-[11px] border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850"
                  >
                    I
                  </button>
                  <button
                    onClick={() => setGenkiLessons(GENKI_LESSONS.filter((n) => n >= 13))}
                    className="px-2 py-1 rounded-md text-[11px] border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850"
                  >
                    II
                  </button>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-[repeat(12,minmax(0,1fr))] gap-1">
                  {GENKI_LESSONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => toggleGenkiLesson(n)}
                      className={`px-2 py-2 rounded-lg text-xs border transition ${selectedGenkiLessons.includes(n) ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600' : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'}`}
                    >
                      L{n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <div className="flex-1 border-t border-stone-200 dark:border-stone-800" />
            <span className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 tracking-wide">
              OR
            </span>
            <div className="flex-1 border-t border-stone-200 dark:border-stone-800" />
          </div>
          <div className="sm:col-span-2 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-stone-50 dark:bg-stone-950">
              <button
                onClick={() => setOpenLessons((prev) => ({ ...prev, minna: !prev.minna }))}
                className="flex items-center gap-2 flex-1 text-left"
              >
                <svg
                  className={`w-3.5 h-3.5 text-stone-400 flex-shrink-0 transition-transform ${openLessons.minna ? 'rotate-90' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                  みんなの日本語 lessons
                </span>
              </button>
              <div className="text-xs text-stone-500 font-medium">
                {selectedMinnaLessons.length === 0
                  ? 'None'
                  : selectedMinnaLessons.length === MINNA_LESSONS.length
                    ? 'All'
                    : `${selectedMinnaLessons.length} selected`}
              </div>
            </div>
            {openLessons.minna && (
              <div className="p-3 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800">
                <div className="flex gap-1 mb-2">
                  <button
                    onClick={() => setPracticePrefs({ ...practicePrefs, minnaLessons: null })}
                    className={`px-2 py-1 rounded-md text-[11px] border transition ${practicePrefs.minnaLessons === null ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600' : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850'}`}
                  >
                    None
                  </button>
                  <button
                    onClick={() => setMinnaLessons(MINNA_LESSONS)}
                    className="px-2 py-1 rounded-md text-[11px] border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850"
                  >
                    All
                  </button>
                  <button
                    onClick={() => setMinnaLessons(MINNA_LESSONS.filter((n) => n <= 25))}
                    className="px-2 py-1 rounded-md text-[11px] border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850"
                  >
                    I
                  </button>
                  <button
                    onClick={() => setMinnaLessons(MINNA_LESSONS.filter((n) => n >= 26))}
                    className="px-2 py-1 rounded-md text-[11px] border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850"
                  >
                    II
                  </button>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-[repeat(13,minmax(0,1fr))] gap-1">
                  {MINNA_LESSONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => toggleMinnaLesson(n)}
                      className={`px-2 py-2 rounded-lg text-xs border transition ${selectedMinnaLessons.includes(n) ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600' : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'}`}
                    >
                      L{n}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-stone-400 mt-2">
                  Words from Genki <span className="font-semibold">OR</span> Minna lessons are
                  included. Textbook selection applies <span className="font-semibold">AND</span>{' '}
                  JLPT, word type, and study-list filters.
                </p>
              </div>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-stone-500 block mb-1">Word types</label>
            <div className="grid grid-cols-3 gap-2">
              {WORD_TYPE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() =>
                    togglePref(
                      'wordTypes',
                      o.id,
                      WORD_TYPE_OPTIONS.map((x) => x.id),
                    )
                  }
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    (practicePrefs.wordTypes || WORD_TYPE_OPTIONS.map((x) => x.id)).includes(o.id)
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
              <span className="text-[11px] text-stone-400">
                {selectedWordGroups.length}/{WORD_GROUP_OPTIONS.length}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
              {WORD_GROUP_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() =>
                    togglePref(
                      'wordGroups',
                      o.id,
                      WORD_GROUP_OPTIONS.map((x) => x.id),
                    )
                  }
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
            <p className="text-[11px] text-stone-400 mt-1">
              Refines every drill and review deck after JLPT, lesson, and word-list filters.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
        <h3 className="font-medium mb-1 text-stone-850 dark:text-stone-200">
          Conjugation types in scope
        </h3>
        <p className="text-xs text-stone-500 mb-4">
          Choose a focused pack instead of managing dozens of individual forms.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
          {typePacks.map((pack) => {
            const packKey = [...pack.typeIds].sort().join('|');
            const active = packKey === enabledKey;
            const isGhost = !active && isCustomMode && pack.id === closestPackId;
            return (
              <button
                key={pack.id}
                onClick={() => applyTypePack(pack.typeIds)}
                className={`text-left rounded-xl border px-3 py-3 transition ${
                  active
                    ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900 text-stone-900 dark:text-stone-100'
                    : isGhost
                      ? 'bg-indigo-50/40 dark:bg-indigo-950/10 border-indigo-200/50 dark:border-indigo-900/30 text-stone-800 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-900'
                      : 'bg-stone-50 dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-900 hover:border-indigo-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-stone-800 dark:text-stone-200">
                    {pack.label}
                  </div>
                  <div
                    className={`text-[11px] px-1.5 py-0.5 rounded-full ${active ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700'}`}
                  >
                    {pack.typeIds.length}
                  </div>
                </div>
                <div className="text-xs text-stone-500 mt-1">{pack.hint}</div>
              </button>
            );
          })}
          <button
            onClick={() => setShowCustom((v) => !v)}
            className={`text-left rounded-xl border px-3 py-3 transition ${
              isCustomMode
                ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900 text-stone-900 dark:text-stone-100'
                : 'bg-stone-50 dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-900 hover:border-indigo-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-stone-800 dark:text-stone-200">Custom</div>
              <div
                className={`text-[11px] px-1.5 py-0.5 rounded-full ${isCustomMode ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700'}`}
              >
                {state.enabledTypes.length}
              </div>
            </div>
            <div className="text-xs text-stone-500 mt-1">Pick exactly which forms to drill.</div>
          </button>
        </div>
        {showCustom && (
          <div className="mt-3 mb-4 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/30 dark:bg-indigo-950/10 overflow-y-auto max-h-[60vh]">
            {FORM_GROUPS.map((group) => {
              const enabledInGroup = group.typeIds.filter((id) => state.enabledTypes.includes(id));
              const allEnabled = enabledInGroup.length === group.typeIds.length;
              return (
                <div
                  key={group.id}
                  className="border-b border-indigo-100 dark:border-indigo-900/50 last:border-b-0"
                >
                  <div className="flex items-center justify-between px-3 py-2 bg-indigo-50/60 dark:bg-indigo-950/20">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                      {group.label}
                    </span>
                    <button
                      onClick={() => toggleGroup(group.typeIds, allEnabled)}
                      className="text-[11px] px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition"
                    >
                      {allEnabled ? 'None' : 'All'}
                    </button>
                  </div>
                  <div className="divide-y divide-stone-100 dark:divide-stone-800/50">
                    {group.typeIds.map((typeId) => {
                      const form = ALL_CARD_TYPES.find((t) => t.id === typeId);
                      if (!form) return null;
                      const checked = state.enabledTypes.includes(typeId);
                      return (
                        <button
                          key={typeId}
                          onClick={() => toggleForm(typeId)}
                          className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20 transition"
                        >
                          <div
                            className={`w-4 h-4 rounded flex-shrink-0 border transition ${checked ? 'bg-indigo-600 border-indigo-600' : 'bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-600'}`}
                          >
                            {checked && (
                              <svg
                                className="w-full h-full text-white p-0.5"
                                viewBox="0 0 10 10"
                                fill="none"
                              >
                                <path
                                  d="M1.5 5l2.5 2.5 4.5-5"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm text-stone-800 dark:text-stone-200">
                              {form.label}
                            </div>
                            {form.sub && (
                              <div className="text-xs text-stone-500 dark:text-stone-400">
                                {form.sub}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
          Current mix:{' '}
          <span className="font-semibold text-stone-700 dark:text-stone-200">
            {activeTypeCount}
          </span>{' '}
          forms selected.
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
              Please set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in
              your environment variables to enable user logins and cloud sync.
            </p>
          </div>
        ) : !session ? (
          <div className="space-y-3">
            <p className="text-xs text-stone-500">
              Sync your progress, custom vocabulary, and word lists across all devices.
            </p>
            <button
              onClick={onShowAuth}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition"
            >
              Sign In / Sign Up
            </button>
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
                  Logged in via{' '}
                  {session.user.app_metadata?.provider === 'google' ? 'Google' : 'Email'}
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
              {confirmSignOut ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-500">Local progress is preserved.</span>
                  <button
                    onClick={async () => {
                      setConfirmSignOut(false);
                      await supabase.auth.signOut();
                    }}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-medium transition"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmSignOut(false)}
                    className="px-3 py-1.5 border border-stone-250 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmSignOut(true)}
                  className="px-4 py-2 border border-stone-250 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-sm font-medium transition"
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
        <h3 className="font-medium mb-1 text-stone-850 dark:text-stone-200">Backup & restore</h3>
        <p className="text-xs text-stone-500 mb-3">Manual JSON transfer without cloud sync.</p>
        <div role="status" aria-live="polite">
          {msg && (
            <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-250 rounded-lg px-3 py-2">
              {msg}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setExportOpen(!exportOpen);
              setImportOpen(false);
            }}
            aria-expanded={exportOpen}
            className={`flex-1 px-3 py-1.5 border rounded-lg text-sm transition ${
              exportOpen
                ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                : 'border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-850'
            }`}
          >
            Export
          </button>
          <button
            onClick={() => {
              setImportOpen(!importOpen);
              setExportOpen(false);
              setImportErr('');
            }}
            aria-expanded={importOpen}
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
              onFocus={(e) => e.target.select()}
              className="w-full h-32 px-3 py-2 text-xs font-mono border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 text-stone-800 dark:text-stone-200 rounded-lg"
            />
            <button
              onClick={copyExport}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
            >
              {copyOk ? 'Copied' : 'Copy to clipboard'}
            </button>
          </div>
        )}
        {importOpen && (
          <div className="mt-3 space-y-2">
            <textarea
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                setImportErr('');
              }}
              placeholder="Paste backup JSON..."
              aria-label="Paste backup JSON to restore"
              className="w-full h-32 px-3 py-2 text-xs font-mono border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-250 rounded-lg focus:border-indigo-500 focus:outline-none"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            <div role="status" aria-live="polite">
              {importErr && <div className="text-sm text-rose-600">{importErr}</div>}
            </div>
            <p className="text-xs text-rose-600 dark:text-rose-400">
              Warning: Restoring replaces current progress.
            </p>
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
        <p className="text-xs text-stone-500 mb-3">
          Clear all SRS state. Custom verbs and settings stay.
        </p>
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
            <button
              onClick={reset}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm"
            >
              Yes, reset
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="px-3 py-1.5 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-sm"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      <div className="text-xs text-stone-400 text-center pt-2">
        Progress saves automatically to your browser.
      </div>
    </div>
  );
}
