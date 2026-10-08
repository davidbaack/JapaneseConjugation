import React, { useState, useMemo, useRef, useEffect } from 'react';
import { IconVolume, IconCloud, IconRefresh } from '../components/Icons.jsx';
import { resolveDisplayScripts, scriptModeFromDisplay } from '../utils/display.js';
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
    customVerbs,
    customAdjectives,
    wordLists,
    session,
    syncStatus,
    syncNow,
    resetLearnerData,
    restoreBackup,
    recoveryBackup,
    restoreBusy,
    restoreStatus,
    dataRecoveryError,
    practicePrefs,
    setPracticePrefs,
    speechVoices,
    resolvedTheme,
    supabase,
    supabaseConfigured,
    supabaseStatus,
    supabaseError,
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
  const [stagedBackup, setStagedBackup] = useState(null);
  const [msg, setMsg] = useState('');
  const [transferNotice, setTransferNotice] = useState('');
  const previewHeadingRef = useRef(null);
  const importInputRef = useRef(null);
  const restoreStatusRef = useRef(null);
  const finishedRestoreRef = useRef(false);

  useEffect(() => {
    if (stagedBackup) previewHeadingRef.current?.focus();
  }, [stagedBackup]);
  useEffect(() => {
    if (!importOpen && finishedRestoreRef.current && restoreStatusRef.current) {
      restoreStatusRef.current.focus();
      finishedRestoreRef.current = false;
    }
  }, [importOpen, restoreStatus]);

  const exportData = useMemo(
    () =>
      dataRecoveryError
        ? ''
        : serializeBackup({ state, customVerbs, customAdjectives, wordLists, practicePrefs }),
    [state, customVerbs, customAdjectives, wordLists, practicePrefs, dataRecoveryError],
  );
  const recoveryIsBackup = useMemo(
    () => !!recoveryBackup && parseBackup(recoveryBackup).ok,
    [recoveryBackup],
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

  async function copyBackup(text, recovery = false) {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(text);
      setTransferNotice(recovery ? 'Recovery backup copied.' : 'Backup copied.');
    } catch {
      setTransferNotice(
        recovery
          ? 'Clipboard is unavailable. Download the recovery copy instead.'
          : 'Clipboard is unavailable. Download the backup or select and copy the JSON.',
      );
    }
  }

  function downloadBackup(text, recovery = false) {
    let url;
    try {
      url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `katachiya-${recovery ? 'before-restore-' : 'backup-'}${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTransferNotice(
        recovery ? 'Recovery backup download started.' : 'Backup download started.',
      );
    } catch {
      setTransferNotice('Download could not start. Copy the backup instead.');
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function checkImport() {
    setImportErr('');
    const checked = parseBackup(importText);
    if (!checked.ok) {
      setStagedBackup(null);
      setImportErr(`Backup not accepted: ${checked.error}. Your learner data has not changed.`);
      return;
    }
    setStagedBackup({
      text: importText,
      summary: checked.summary,
      warnings: checked.warnings || [],
    });
  }

  async function doImport() {
    if (!stagedBackup || restoreBusy || stagedBackup.text !== importText) return;
    setImportErr('');
    try {
      await restoreBackup(stagedBackup.text);
      finishedRestoreRef.current = true;
      setStagedBackup(null);
      setImportText('');
      setImportOpen(false);
    } catch (error) {
      setImportErr(error.message || 'Restore did not complete. Your learner data has not changed.');
    }
  }

  async function runReset(action) {
    if (!action || resetBusy || restoreBusy) return;
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
      ? 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900'
      : syncStatus.kind === 'syncing'
        ? 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900'
        : syncStatus.kind === 'ok'
          ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900'
          : 'text-stone-600 bg-stone-50 border-stone-200 dark:bg-stone-950 dark:border-stone-800';

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
      <h2 className="sr-only">Settings</h2>
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
        <h3 className="font-medium mb-3 text-stone-800 dark:text-stone-200">Display & audio</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <fieldset className="min-w-0">
            <legend className="text-xs text-stone-600 block mb-1">Theme</legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
          </fieldset>
          <fieldset className="min-w-0">
            <legend className="text-xs text-stone-600 block mb-1">Display scripts</legend>
            <div className="grid grid-cols-3 gap-2">
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
          </fieldset>
          <fieldset className="min-w-0">
            <legend className="text-xs text-stone-600 block mb-1">English meaning</legend>
            <div className="grid grid-cols-2 gap-2">
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
            <p className="text-[11px] text-stone-600 mt-1">
              Hidden mode hides the English meaning while answering. AI clues can still avoid the
              answer.
            </p>
          </fieldset>
          <fieldset className="min-w-0">
            <legend className="text-xs text-stone-600 block mb-1">Word category label</legend>
            <div className="grid grid-cols-2 gap-2">
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
            <p className="text-[11px] text-stone-600 mt-1">
              Hides group labels during practice so identifying drop-ru, row-shift, irregular, or
              adjective category stays part of the training.
            </p>
          </fieldset>
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
            <label htmlFor="settings-japanese-voice" className="text-xs text-stone-600 block mb-1">
              Japanese voice
            </label>
            <div className="flex gap-2">
              <select
                id="settings-japanese-voice"
                value={practicePrefs.voiceURI || ''}
                onChange={(e) => setPracticePrefs({ ...practicePrefs, voiceURI: e.target.value })}
                className="flex-1 min-w-0 px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
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
                className="px-3 py-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg text-sm flex items-center gap-1.5"
              >
                <IconVolume className="w-4 h-4" />
                Test
              </button>
            </div>
            {speechVoices.length === 0 && (
              <p className="text-[11px] text-stone-600 mt-1">
                Japanese voices appear after the browser loads speech voices.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
        <h3 className="font-medium mb-1 flex items-center gap-2 text-stone-800 dark:text-stone-200">
          <IconCloud className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          Cloud Sync
        </h3>
        {!supabaseConfigured ? (
          <div className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
            <p className="font-medium">Cloud sync is not configured</p>
            <p className="text-xs text-stone-600 mt-1">
              Please set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in
              your environment variables to enable user logins and cloud sync.
            </p>
          </div>
        ) : !session ? (
          <div className="space-y-3">
            <p className="text-xs text-stone-600">
              Sync your progress, custom vocabulary, and word lists across all devices.
            </p>
            {supabaseStatus === 'error' && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300"
              >
                Cloud sign-in could not load.{' '}
                {supabaseError?.message || 'Check your connection and try again.'} Local practice is
                still available.
              </div>
            )}
            {supabaseStatus === 'loading' && (
              <p role="status" aria-live="polite" className="text-xs text-stone-600">
                Loading cloud sign-in... Local practice remains available.
              </p>
            )}
            <button
              onClick={onShowAuth}
              disabled={supabaseStatus === 'loading'}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition"
            >
              {supabaseStatus === 'loading'
                ? 'Loading Cloud Sign-in...'
                : supabaseStatus === 'error'
                  ? 'Retry Cloud Sign-in'
                  : 'Sign In / Sign Up'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-stone-50 dark:bg-stone-950 rounded-xl border border-stone-200 dark:border-stone-800">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-semibold text-base uppercase">
                {session.user.email ? session.user.email.charAt(0) : 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
                  {session.user.email}
                </div>
                <div className="text-xs text-stone-600">
                  Logged in via{' '}
                  {session.user.app_metadata?.provider === 'google' ? 'Google' : 'Email'}
                </div>
              </div>
            </div>
            {syncStatus.message && (
              <div
                role="status"
                aria-live="polite"
                className={`mb-3 text-xs rounded-lg border px-3 py-2 ${statusColor}`}
              >
                <div className="flex items-center justify-between">
                  <span>{syncStatus.message}</span>
                  {syncStatus.at && <span>{new Date(syncStatus.at).toLocaleTimeString()}</span>}
                </div>
                {syncStatus.detail && <div className="mt-1 opacity-80">{syncStatus.detail}</div>}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={syncNow}
                disabled={restoreBusy || syncStatus.kind === 'syncing'}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition"
              >
                {syncStatus.kind === 'error' ? 'Retry Sync' : 'Sync Now'}
              </button>
              {confirmSignOut ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-600">Local progress is preserved.</span>
                  <button
                    disabled={restoreBusy}
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
                    className="px-3 py-1.5 border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmSignOut(true)}
                  disabled={restoreBusy}
                  className="px-4 py-2 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg text-sm font-medium transition"
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <details
        open={dataRecoveryError ? true : undefined}
        className="rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
      >
        <summary className="cursor-pointer px-5 py-4">
          <span className="block font-medium text-stone-800 dark:text-stone-200">
            Data &amp; account
          </span>
          <span className="mt-1 block text-xs text-stone-600">
            Backup, restore, and reset controls
          </span>
        </summary>
        <div className="space-y-4 border-t border-stone-100 p-4 dark:border-stone-800">
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
            <h3 className="font-medium mb-1 text-stone-800 dark:text-stone-200">
              Backup & restore
            </h3>
            <p className="text-xs text-stone-600 mb-3">
              Save or replace your progress, preferences, custom words, and saved lists. Backups do
              not contain your login credentials or recent Check inputs.
            </p>
            {dataRecoveryError && (
              <div
                role="alert"
                className="mb-3 rounded-lg border border-rose-200 p-3 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300"
              >
                <p>{dataRecoveryError}</p>
                <p className="mt-1">
                  Export is unavailable while saved data cannot be read. Import can replace it after
                  securing a recovery copy of the original saved data.
                </p>
              </div>
            )}
            {restoreStatus?.kind && restoreStatus.kind !== 'idle' && (
              <div
                ref={restoreStatusRef}
                tabIndex={-1}
                role={restoreStatus.kind === 'error' ? 'alert' : 'status'}
                aria-live="polite"
                className={`mb-3 rounded-lg border p-3 text-sm ${
                  restoreStatus.kind === 'ok'
                    ? 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                    : 'border-amber-200 text-amber-800 dark:border-amber-900 dark:text-amber-300'
                }`}
              >
                <p>{restoreStatus.message}</p>
                {restoreStatus.detail && <p className="mt-1 text-xs">{restoreStatus.detail}</p>}
                {restoreStatus.kind === 'pending' && session && (
                  <button
                    type="button"
                    onClick={syncNow}
                    disabled={restoreBusy || syncStatus.kind === 'syncing'}
                    className="mt-2 rounded-lg border border-current px-3 py-1.5 text-sm font-medium disabled:opacity-40"
                  >
                    Retry cloud sync
                  </button>
                )}
              </div>
            )}
            <div role="status" aria-live="polite">
              {msg && (
                <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  {msg}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setExportOpen(!exportOpen);
                  setImportOpen(false);
                  setStagedBackup(null);
                }}
                disabled={restoreBusy || !!dataRecoveryError}
                aria-expanded={exportOpen}
                className={`flex-1 px-3 py-1.5 border rounded-lg text-sm transition ${
                  exportOpen
                    ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                    : 'border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800'
                }`}
              >
                Export
              </button>
              <button
                onClick={() => {
                  setImportOpen(!importOpen);
                  setExportOpen(false);
                  setImportErr('');
                  setStagedBackup(null);
                }}
                disabled={restoreBusy}
                aria-expanded={importOpen}
                className={`flex-1 px-3 py-1.5 border rounded-lg text-sm transition ${
                  importOpen
                    ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                    : 'border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800'
                }`}
              >
                Import
              </button>
            </div>
            {exportOpen && !dataRecoveryError && (
              <div className="mt-3 space-y-2">
                <textarea
                  aria-label="Backup export JSON"
                  readOnly
                  value={exportData}
                  onFocus={(e) => e.target.select()}
                  className="w-full h-32 px-3 py-2 text-xs font-mono border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 text-stone-800 dark:text-stone-200 rounded-lg"
                />
                <button
                  onClick={() => downloadBackup(exportData)}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
                >
                  Download backup
                </button>
                <button
                  onClick={() => copyBackup(exportData)}
                  className="w-full py-2 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-sm font-medium"
                >
                  Copy to clipboard
                </button>
              </div>
            )}
            {importOpen && (
              <div className="mt-3 space-y-2">
                <textarea
                  ref={importInputRef}
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setImportErr('');
                    setStagedBackup(null);
                  }}
                  disabled={restoreBusy}
                  placeholder="Paste backup JSON..."
                  aria-label="Paste backup JSON to restore"
                  className="w-full h-32 px-3 py-2 text-xs font-mono border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
                {importErr && (
                  <div role="alert" className="text-sm text-rose-600">
                    {importErr}
                  </div>
                )}
                {!stagedBackup && (
                  <button
                    onClick={checkImport}
                    disabled={!importText.trim() || restoreBusy}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium"
                  >
                    Check backup
                  </button>
                )}
                {stagedBackup && (
                  <section
                    aria-label="Backup preview"
                    className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950"
                  >
                    <h4
                      ref={previewHeadingRef}
                      tabIndex={-1}
                      className="font-medium text-stone-800 dark:text-stone-200"
                    >
                      Review backup
                    </h4>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-stone-700 dark:text-stone-300">
                      {[
                        [
                          'Exported',
                          stagedBackup.summary.exportedAt
                            ? new Date(stagedBackup.summary.exportedAt).toLocaleString()
                            : 'Date unavailable',
                        ],
                        ['Saved card histories', stagedBackup.summary.cards],
                        ['Practice attempts', stagedBackup.summary.practiceAttempts],
                        ['Guide attempts', stagedBackup.summary.guideAttempts],
                        ['Custom words', stagedBackup.summary.customWords],
                        ['Saved lists', stagedBackup.summary.lists],
                      ].map(([label, value]) => (
                        <React.Fragment key={label}>
                          <dt>{label}</dt>
                          <dd className="text-right break-words">{value}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                    {stagedBackup.warnings.length > 0 && (
                      <div className="text-xs text-amber-800 dark:text-amber-300">
                        <p className="font-medium">Older backup limitations</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4">
                          {stagedBackup.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-xs text-rose-700 dark:text-rose-300">
                      This replaces progress, preferences, custom words, and saved lists in this
                      browser.{' '}
                      {session
                        ? 'The replacement will also sync to your signed-in cloud account.'
                        : 'If you connect this browser to a cloud account later, the replacement will sync then.'}{' '}
                      Your login stays the same. A recovery backup of your current data is saved
                      before replacement.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        onClick={doImport}
                        disabled={restoreBusy || !!resetBusy}
                        className="flex-1 rounded-lg bg-rose-600 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-40"
                      >
                        {restoreBusy ? 'Restoring…' : 'Replace learner data'}
                      </button>
                      <button
                        onClick={() => {
                          setStagedBackup(null);
                          setImportErr('');
                          importInputRef.current?.focus();
                        }}
                        disabled={restoreBusy}
                        className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-800 disabled:opacity-40"
                      >
                        Cancel restore
                      </button>
                    </div>
                  </section>
                )}
              </div>
            )}
            {recoveryBackup && (
              <div className="mt-4 space-y-2 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
                <h4 className="text-sm font-medium text-stone-800 dark:text-stone-200">
                  {recoveryIsBackup ? 'Backup before last restore' : 'Saved data recovery copy'}
                </h4>
                <p className="text-xs text-stone-600 dark:text-stone-400">
                  {recoveryIsBackup
                    ? 'Download this recovery backup to return to the learner data saved before your last restore.'
                    : 'This copy preserves saved data that could not be read. Keep it for recovery; it may need repair before it can be imported.'}{' '}
                  Keep a separate file; this browser keeps only the most recent recovery copy.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => downloadBackup(recoveryBackup, true)}
                    className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-800"
                  >
                    {recoveryIsBackup ? 'Download recovery backup' : 'Download recovery copy'}
                  </button>
                  <button
                    onClick={() => copyBackup(recoveryBackup, true)}
                    className="rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-stone-800"
                  >
                    {recoveryIsBackup ? 'Copy recovery backup' : 'Copy recovery copy'}
                  </button>
                </div>
              </div>
            )}
            <div
              role="status"
              aria-live="polite"
              className="mt-2 text-xs text-stone-600 dark:text-stone-400"
            >
              {transferNotice}
            </div>
          </div>

          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
            <h3 className="font-medium mb-1 text-stone-800 dark:text-stone-200">Reset & cleanup</h3>
            <p className="text-xs text-stone-600 mb-4">
              Signed-in resets update this browser and your cloud account. Signed-out resets stay on
              this browser and sync if this local data is later connected to a cloud account.
            </p>
            <div role="status" aria-live="polite">
              {resetErr && (
                <div className="mb-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {resetErr}
                </div>
              )}
            </div>
            <div className="divide-y divide-stone-100 dark:divide-stone-800 border-y border-stone-100 dark:border-stone-800">
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
                          <div className="text-sm font-medium text-stone-800 dark:text-stone-200">
                            {action.title}
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                          {action.description}
                        </p>
                        <div className="mt-2 grid gap-1 text-[11px] text-stone-600 dark:text-stone-400">
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
                          disabled={!!resetBusy || restoreBusy}
                          className={`w-full sm:w-auto px-3 py-1.5 rounded-lg text-sm font-medium border transition disabled:opacity-50 ${
                            action.danger
                              ? 'border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/20'
                              : 'border-stone-200 text-stone-700 hover:bg-stone-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-800'
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
                                className="flex-1 px-3 py-1.5 border border-rose-200 dark:border-rose-900 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-200 rounded-lg text-sm focus:border-rose-500 focus:outline-none"
                              />
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <button
                                type="button"
                                onClick={() => runReset(action)}
                                disabled={!canFactoryReset || !!resetBusy || restoreBusy}
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
                                disabled={!!resetBusy || restoreBusy}
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
                              disabled={!!resetBusy || restoreBusy}
                              className="px-3 py-1.5 bg-stone-800 hover:bg-stone-950 dark:bg-indigo-600 dark:hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium"
                            >
                              {busy ? 'Resetting...' : `Yes, ${action.confirm.toLowerCase()}`}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingReset(null)}
                              disabled={!!resetBusy || restoreBusy}
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
        </div>
      </details>
      <div className="text-xs text-stone-600 text-center pt-2">
        Progress saves automatically to your browser.
      </div>
    </div>
  );
}
