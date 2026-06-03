import React, { useState, useMemo } from 'react';
import { IconVolume, IconRefresh, IconCloud } from '../components/Icons.jsx';
import { ALL_CARD_TYPES, TYPE_PACKS, FORM_GROUPS } from '../data/conjugationTypes.js';
import {
  buildPracticePoolSummary,
  weakTypeIdsForState,
  mergeState,
  dailyNewCardLimit,
  bonusNewCardLimit,
} from '../utils/storage.js';
import {
  mergePracticePrefs,
  normalizeAnswerMode,
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

const REVIEW_STYLE_OPTIONS = [
  { id: 'auto', label: 'Auto' },
  { id: 'forms', label: 'Forms only' },
  { id: 'reading', label: 'Reading practice' },
];

const SOURCE_FORM_OPTIONS = [
  { id: 'auto', label: 'Auto' },
  { id: 'dictionary', label: 'Dictionary' },
  { id: 'masu', label: 'Masu' },
  { id: 'mixed', label: 'Mixed' },
];

const ANSWER_MODE_OPTIONS = [
  { id: 'input', label: 'Type answer' },
  { id: 'choice', label: 'Choices' },
  { id: 'self-check', label: 'Self-check' },
  { id: 'speak', label: 'Speak answer' },
];

const RESET_ACTIONS = [
  {
    id: 'progress',
    title: 'Reset review progress',
    description: 'Clears SRS cards, mistakes, streaks, and lab stats.',
    clears: 'Review history and practice stats',
    keeps: 'Settings, form scope, Library exclusions, custom words, and lists',
    confirm: 'Reset progress',
    done: 'Review progress reset.',
  },
  {
    id: 'settings',
    title: 'Restore default settings',
    description: 'Restores answer, display, goal, filter, and form-scope defaults.',
    clears: 'Non-default Settings choices',
    keeps: 'Progress, custom words, and lists',
    confirm: 'Restore settings',
    done: 'Default settings restored.',
  },
  {
    id: 'custom-content',
    title: 'Clear custom learner content',
    description: 'Removes custom verbs, custom adjectives, and saved word lists.',
    clears: 'Custom words, lists, and active list selections',
    keeps: 'Built-in progress and other settings',
    confirm: 'Clear custom content',
    done: 'Custom learner content cleared.',
  },
  {
    id: 'factory',
    title: 'Factory reset account',
    description: 'Wipes learner data and settings for a clean Katachiya start.',
    clears: 'Progress, settings, custom words, lists, and Library exclusions',
    keeps: 'Your login account',
    confirm: 'Factory reset',
    done: 'Factory reset complete.',
    danger: true,
  },
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
    resetLearnerData,
    practicePrefs,
    setPracticePrefs,
    speechVoices,
    resolvedTheme,
    supabase,
    allWords,
    showAuth: onShowAuth,
  } = useApp();
  const [pendingReset, setPendingReset] = useState(null);
  const [factoryConfirm, setFactoryConfirm] = useState('');
  const [resetBusy, setResetBusy] = useState('');
  const [resetErr, setResetErr] = useState('');
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErr, setImportErr] = useState('');
  const [msg, setMsg] = useState('');
  const [copyOk, setCopyOk] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  const exportData = useMemo(
    () => serializeBackup({ state, customVerbs, customAdjectives, wordLists, practicePrefs }),
    [state, customVerbs, customAdjectives, wordLists, practicePrefs],
  );

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

  async function runReset(action) {
    if (!action || resetBusy) return;
    setResetErr('');
    setResetBusy(action.id);
    try {
      const result = await resetLearnerData(action.id);
      setPendingReset(null);
      setFactoryConfirm('');
      setMsg(`${action.done}${result.cloud ? ' Saved to cloud.' : ''}`);
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setResetErr(e.message || 'Reset failed.');
    } finally {
      setResetBusy('');
    }
  }

  function setNounScope(enabled) {
    setPracticePrefs({
      ...practicePrefs,
      wordGroups: enabled ? [...DEFAULT_PREFS.wordGroups, 'noun'] : [...DEFAULT_PREFS.wordGroups],
    });
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
  const answerMode = normalizeAnswerMode(practicePrefs.answerMode);
  const reviewStyle = practicePrefs.reviewStyle || DEFAULT_PREFS.reviewStyle;
  const sourceFormStrategy = practicePrefs.sourceFormStrategy || DEFAULT_PREFS.sourceFormStrategy;
  const theme = practicePrefs.theme || DEFAULT_PREFS.theme;
  const englishHints = practicePrefs.englishHints || DEFAULT_PREFS.englishHints;
  const showWordCategory = !!practicePrefs.showWordCategory;
  const furiganaEnabled =
    practicePrefs.furigana !== false && displayScripts.kanji && displayScripts.kana;
  const nounsIncluded = Array.isArray(practicePrefs.wordGroups)
    ? practicePrefs.wordGroups.includes('noun')
    : DEFAULT_PREFS.wordGroups.includes('noun');
  const selectedVoiceAvailable =
    !practicePrefs.voiceURI || speechVoices.some((v) => v.voiceURI === practicePrefs.voiceURI);
  const weakPackIds = weakTypeIdsForState(state, state.enabledTypes);
  const typePacks = [
    ...TYPE_PACKS.filter((pack) => ['basics', 'core', 'advanced'].includes(pack.id)),
    {
      id: 'weak',
      label: 'Weak mix',
      hint: 'Uses your misses and SRS history to pick forms worth isolating.',
      typeIds: weakPackIds,
    },
  ];
  const enabledKey = [...state.enabledTypes].sort().join('|');
  const settingsWords = useMemo(() => allWords || [], [allWords]);
  const poolSummary = useMemo(
    () => buildPracticePoolSummary(state, settingsWords, practicePrefs, wordLists),
    [state, settingsWords, practicePrefs, wordLists],
  );
  const automaticNewCards = dailyNewCardLimit(practicePrefs);
  const automaticBonusNewCards = bonusNewCardLimit(practicePrefs);
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
          <div className="sm:col-span-2">
            <label className="text-xs text-stone-500 block mb-1">Answer mode</label>
            <div
              role="group"
              aria-label="Answer mode"
              className="grid grid-cols-2 sm:grid-cols-4 gap-2"
            >
              {ANSWER_MODE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  aria-pressed={answerMode === o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, answerMode: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    answerMode === o.id
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
            <label className="text-xs text-stone-500 block mb-1">Review style</label>
            <div role="group" aria-label="Review style" className="grid grid-cols-3 gap-2">
              {REVIEW_STYLE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  aria-pressed={reviewStyle === o.id}
                  onClick={() =>
                    setPracticePrefs({
                      ...practicePrefs,
                      reviewStyle: o.id,
                    })
                  }
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    reviewStyle === o.id
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
                Auto keeps daily review seamless. Forms only sticks to production prompts. Reading
                practice asks you to recover the dictionary form.
              </p>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-stone-500 block mb-1">Source forms</label>
            <div role="group" aria-label="Source forms" className="grid grid-cols-2 gap-2">
              {SOURCE_FORM_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  aria-pressed={sourceFormStrategy === o.id}
                  onClick={() =>
                    setPracticePrefs({
                      ...practicePrefs,
                      sourceFormStrategy: o.id,
                      promptForm:
                        o.id === 'mixed'
                          ? 'random'
                          : o.id === 'masu'
                            ? 'polite-present'
                            : 'dictionary',
                    })
                  }
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    sourceFormStrategy === o.id
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
            <label className="text-xs text-stone-500 block mb-1">New cards/day</label>
            <input
              type="number"
              min="0"
              max="100"
              value={practicePrefs.newCardsPerDay || 0}
              onChange={(e) =>
                setPracticePrefs({
                  ...practicePrefs,
                  newCardsPerDay: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="w-full px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
            />
            <p className="text-[11px] text-stone-400 mt-1">
              0 = Auto: {automaticNewCards}/day, then {automaticBonusNewCards} per bonus batch.
            </p>
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
            <div role="group" aria-label="Theme" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'light', label: 'Light' },
                { id: 'dark', label: 'Dark' },
                { id: 'system', label: `System${resolvedTheme === 'dark' ? ' dark' : ' light'}` },
              ].map((o) => (
                <button
                  key={o.id}
                  aria-pressed={theme === o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, theme: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    theme === o.id
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
            <div role="group" aria-label="Display scripts" className="grid grid-cols-3 gap-2">
              {[
                { id: 'kanji', label: 'Kanji' },
                { id: 'kana', label: 'Kana' },
                { id: 'romaji', label: 'Romaji' },
              ].map((o) => (
                <button
                  key={o.id}
                  aria-pressed={displayScripts[o.id]}
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
              aria-pressed={furiganaEnabled}
              className={`mt-2 w-full px-3 py-2 rounded-lg text-sm border transition disabled:opacity-40 ${
                furiganaEnabled
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
              }`}
            >
              Furigana {practicePrefs.furigana !== false ? 'on' : 'off'}
            </button>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">English hints</label>
            <div role="group" aria-label="English hints" className="grid grid-cols-2 gap-2">
              {[
                { id: 'show', label: 'Show' },
                { id: 'hidden', label: 'Hide' },
              ].map((o) => (
                <button
                  key={o.id}
                  aria-pressed={englishHints === o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, englishHints: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    englishHints === o.id
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
                  aria-pressed={showWordCategory === o.id}
                  onClick={() => setPracticePrefs({ ...practicePrefs, showWordCategory: o.id })}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    showWordCategory === o.id
                      ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                      : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">
              Hides group labels during review so identifying drop-る, row-shift, irregular, or
              adjective category stays part of the training.
            </p>
          </div>
          <div className="flex items-end">
            <button
              onClick={() =>
                setPracticePrefs({ ...practicePrefs, autoSpeak: !practicePrefs.autoSpeak })
              }
              aria-pressed={!!practicePrefs.autoSpeak}
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
              aria-pressed={!!practicePrefs.autoAdvanceCorrect}
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
              aria-pressed={!!practicePrefs.listeningPrompt}
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
        <h3 className="font-medium mb-1 text-stone-800 dark:text-stone-200">Vocabulary scope</h3>
        <p className="text-xs text-stone-500 mb-4">
          Reviews follow the automatic word ladder. Library lists and focused practice still set
          their own scope.
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-y border-stone-100 dark:border-stone-850 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-stone-800 dark:text-stone-200">
              Include nouns
            </div>
            <div className="text-xs text-stone-500 dark:text-stone-400">
              Adds noun-copula cards to automatic Reviews.
            </div>
          </div>
          <button
            type="button"
            aria-label="Include nouns"
            aria-pressed={nounsIncluded}
            onClick={() => setNounScope(!nounsIncluded)}
            className={`w-full sm:w-auto min-w-24 rounded-lg border px-4 py-2 text-sm font-medium transition ${
              nounsIncluded
                ? 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-600'
                : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300 dark:hover:border-stone-700'
            }`}
          >
            {nounsIncluded ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
        <h3 className="font-medium mb-1 text-stone-850 dark:text-stone-200">
          Conjugation types in scope
        </h3>
        <p className="text-xs text-stone-500 mb-4">
          Choose a focused pack instead of managing dozens of individual forms.
        </p>
        <div
          role="group"
          aria-label="Conjugation type packs"
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4"
        >
          {typePacks.map((pack) => {
            const packKey = [...pack.typeIds].sort().join('|');
            const active = packKey === enabledKey;
            const isGhost = !active && isCustomMode && pack.id === closestPackId;
            return (
              <button
                key={pack.id}
                aria-pressed={active}
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
            aria-pressed={isCustomMode}
            aria-expanded={showCustom}
            aria-controls="settings-custom-forms"
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
          <div
            id="settings-custom-forms"
            className="mt-3 mb-4 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/30 dark:bg-indigo-950/10 overflow-y-auto max-h-[60vh]"
          >
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
                          aria-pressed={checked}
                          onClick={() => toggleForm(typeId)}
                          className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20 transition"
                        >
                          <div
                            className={`w-4 h-4 rounded flex-shrink-0 border transition ${checked ? 'bg-indigo-600 border-indigo-600' : 'bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-600'}`}
                          >
                            {checked && (
                              <svg
                                aria-hidden="true"
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
        <h3 className="font-medium mb-1 text-stone-850 dark:text-stone-200">Reset & cleanup</h3>
        <p className="text-xs text-stone-500 mb-4">
          Signed-in resets update this browser and your cloud account. Signed-out resets are local.
        </p>
        <div role="status" aria-live="polite">
          {resetErr && (
            <div className="mb-3 text-sm text-rose-700 bg-rose-50 border border-rose-250 rounded-lg px-3 py-2">
              {resetErr}
            </div>
          )}
        </div>
        <div className="divide-y divide-stone-100 dark:divide-stone-850 border-y border-stone-100 dark:border-stone-850">
          {RESET_ACTIONS.map((action) => {
            const active = pendingReset === action.id;
            const busy = resetBusy === action.id;
            const canFactoryReset = factoryConfirm.trim().toUpperCase() === 'RESET';
            return (
              <div key={action.id} className="py-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <IconRefresh
                        className={`w-4 h-4 ${action.danger ? 'text-rose-600' : 'text-indigo-600 dark:text-indigo-400'}`}
                      />
                      <div className="text-sm font-medium text-stone-850 dark:text-stone-200">
                        {action.title}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                      {action.description}
                    </p>
                    <div className="mt-2 grid gap-1 text-[11px] text-stone-500 dark:text-stone-400">
                      <div>
                        <span className="font-semibold text-stone-600 dark:text-stone-300">
                          Clears:
                        </span>{' '}
                        {action.clears}
                      </div>
                      <div>
                        <span className="font-semibold text-stone-600 dark:text-stone-300">
                          Keeps:
                        </span>{' '}
                        {action.keeps}
                      </div>
                    </div>
                  </div>
                  {!active && (
                    <button
                      type="button"
                      onClick={() => {
                        setResetErr('');
                        setPendingReset(action.id);
                        setFactoryConfirm('');
                      }}
                      disabled={!!resetBusy}
                      className={`w-full sm:w-auto px-3 py-1.5 rounded-lg text-sm font-medium border transition disabled:opacity-50 ${
                        action.danger
                          ? 'border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/20'
                          : 'border-stone-200 text-stone-700 hover:bg-stone-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-850'
                      }`}
                    >
                      {action.confirm}
                    </button>
                  )}
                </div>
                {active && (
                  <div
                    className={`mt-3 rounded-xl border px-3 py-3 ${
                      action.danger
                        ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/20'
                        : 'border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-950'
                    }`}
                  >
                    {action.danger ? (
                      <div className="space-y-3">
                        <div className="text-xs text-rose-700 dark:text-rose-300">
                          This wipes Katachiya learner data and settings in this browser
                          {session ? ' and in cloud' : ''}.
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            value={factoryConfirm}
                            onChange={(e) => setFactoryConfirm(e.target.value)}
                            aria-label="Type RESET to confirm factory reset"
                            placeholder="Type RESET"
                            className="flex-1 px-3 py-1.5 border border-rose-200 dark:border-rose-900 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-200 rounded-lg text-sm focus:border-rose-500 focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            type="button"
                            onClick={() => runReset(action)}
                            disabled={!canFactoryReset || !!resetBusy}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium"
                          >
                            {busy ? 'Resetting...' : 'Factory reset'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingReset(null);
                              setFactoryConfirm('');
                            }}
                            disabled={!!resetBusy}
                            className="px-3 py-1.5 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 hover:bg-white dark:hover:bg-stone-900 rounded-lg text-sm font-medium disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <button
                          type="button"
                          onClick={() => runReset(action)}
                          disabled={!!resetBusy}
                          className="px-3 py-1.5 bg-stone-850 hover:bg-stone-950 dark:bg-indigo-600 dark:hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium"
                        >
                          {busy ? 'Resetting...' : `Yes, ${action.confirm.toLowerCase()}`}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingReset(null)}
                          disabled={!!resetBusy}
                          className="px-3 py-1.5 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-900 rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="text-xs text-stone-400 text-center pt-2">
        Progress saves automatically to your browser.
      </div>
    </div>
  );
}
