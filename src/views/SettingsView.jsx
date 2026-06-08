import React, { useState, useMemo } from 'react';
import { IconVolume, IconCloud, IconRefresh } from '../components/Icons.jsx';
import { mergeState, normalizeWordLists } from '../utils/storage.js';
import {
  mergePracticePrefs,
  resolveDisplayScripts,
  scriptModeFromDisplay,
} from '../utils/display.js';
import { speakJapanese } from '../utils/speech.js';
import { serializeBackup, parseBackup } from '../utils/backup.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { useApp } from '../state/AppStateContext.jsx';

const RESET_ACTIONS = [
  {
    id: 'progress',
    title: 'Reset practice progress',
    description: 'Clears card history, mistakes, streaks, weakness map, and tool stats.',
    clears: 'Practice history and weakness signals',
    keeps: 'Settings, category scope, Tools word exclusions, custom words, and lists',
    confirm: 'Reset progress',
    done: 'Practice progress reset.',
  },
  {
    id: 'settings',
    title: 'Restore default settings',
    description: 'Restores display, audio, and Practice defaults.',
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
    clears: 'Progress, settings, custom words, lists, and Tools exclusions',
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
    if (Array.isArray(data.wordLists)) setWordLists(normalizeWordLists(data.wordLists));
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

  const statusColor =
    syncStatus.kind === 'error'
      ? 'text-rose-700 bg-rose-50 border-rose-250 dark:bg-rose-955/20 dark:border-rose-900'
      : syncStatus.kind === 'syncing'
        ? 'text-amber-700 bg-amber-50 border-amber-250 dark:bg-amber-955/20 dark:border-amber-900'
        : syncStatus.kind === 'ok'
          ? 'text-emerald-700 bg-emerald-50 border-emerald-250 dark:bg-emerald-955/20 dark:border-emerald-900'
          : 'text-stone-600 bg-stone-50 border-stone-250 dark:bg-stone-950 dark:border-stone-850';

  const displayScripts = resolveDisplayScripts(practicePrefs);
  const theme = practicePrefs.theme || DEFAULT_PREFS.theme;
  const englishHints = practicePrefs.englishHints || DEFAULT_PREFS.englishHints;
  const showWordCategory = !!practicePrefs.showWordCategory;
  const furiganaEnabled =
    practicePrefs.furigana !== false && displayScripts.kanji && displayScripts.kana;
  const selectedVoiceAvailable =
    !practicePrefs.voiceURI || speechVoices.some((v) => v.voiceURI === practicePrefs.voiceURI);

  return (
    <div className="space-y-4 text-left">
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
            <label className="text-xs text-stone-500 block mb-1">English meaning</label>
            <div role="group" aria-label="English meaning" className="grid grid-cols-2 gap-2">
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
              Hidden mode hides the English meaning while answering. AI clues can still avoid the
              answer.
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
              Hides group labels during practice so identifying drop-ru, row-shift, irregular, or
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
