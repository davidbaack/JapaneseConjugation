import React, { useMemo } from 'react';
import { IconVolume } from '../components/Icons.jsx';
import { ALL_CARD_TYPES, TYPE_PACKS } from '../data/conjugationTypes.js';
import { buildPracticePoolSummary, weakTypeIdsForState } from '../utils/storage.js';
import {
  normalizeAnswerMode,
  resolveDisplayScripts,
  scriptModeFromDisplay,
} from '../utils/display.js';
import { speakJapanese } from '../utils/speech.js';
import { useApp } from '../state/AppStateContext.jsx';

const ANSWER_MODE_OPTIONS = [
  { id: 'input', label: 'Type answer' },
  { id: 'choice', label: 'Choices' },
  { id: 'self-check', label: 'Self-check' },
  { id: 'speak', label: 'Speak answer' },
];

export default function SettingsView() {
  const {
    state,
    setState,
    wordLists,
    practicePrefs,
    setPracticePrefs,
    speechVoices,
    allWords,
    builtInWords,
  } = useApp();

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
    if (clean.length) setState({ ...state, enabledTypes: clean });
  }

  const displayScripts = resolveDisplayScripts(practicePrefs);
  const answerMode = normalizeAnswerMode(practicePrefs.answerMode);
  const selectedVoiceAvailable =
    !practicePrefs.voiceURI || speechVoices.some((v) => v.voiceURI === practicePrefs.voiceURI);
  const weakPackIds = weakTypeIdsForState(state, state.enabledTypes);
  const typePacks = [
    ...TYPE_PACKS.filter((pack) => ['basics', 'core', 'advanced'].includes(pack.id)),
    {
      id: 'weak',
      label: 'Weak mix',
      hint: 'Uses your misses and SRS history to isolate forms worth repairing.',
      typeIds: weakPackIds,
    },
  ];
  const enabledKey = [...state.enabledTypes].sort().join('|');
  const settingsWords = useMemo(() => allWords || [], [allWords]);
  const poolSummary = useMemo(
    () =>
      buildPracticePoolSummary(state, settingsWords, practicePrefs, wordLists, { builtInWords }),
    [state, settingsWords, practicePrefs, wordLists, builtInWords],
  );

  return (
    <div className="space-y-4 text-left">
      <section className="rounded-lg border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <h3 className="font-medium mb-3 text-stone-800 dark:text-stone-200">Practice setup</h3>
        <div
          className={`mb-4 border-y py-3 ${poolSummary.prompts ? 'border-stone-100 dark:border-stone-850' : 'border-amber-200 bg-amber-50/60 dark:bg-amber-955/20 -mx-2 px-2 rounded-lg'}`}
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

        <div className="grid sm:grid-cols-[1fr_12rem] gap-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Answer mode</label>
            <div
              role="group"
              aria-label="Answer mode"
              className="grid grid-cols-2 sm:grid-cols-4 gap-2"
            >
              {ANSWER_MODE_OPTIONS.map((o) => (
                <button
                  key={o.id}
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
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <h3 className="font-medium mb-3 text-stone-800 dark:text-stone-200">Display & sound</h3>
        <div className="grid sm:grid-cols-2 gap-3">
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
          <div className="grid gap-2">
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
                onClick={() => speakJapanese('たべてください', 0.85, practicePrefs.voiceURI)}
                className="px-3 py-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-sm flex items-center gap-1.5"
              >
                <IconVolume className="w-4 h-4" />
                Test
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <h3 className="font-medium mb-1 text-stone-850 dark:text-stone-200">Form scope</h3>
        <p className="text-xs text-stone-500 mb-4">
          Choose one focused pack for the practice loop.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {typePacks.map((pack) => {
            const packKey = [...pack.typeIds].sort().join('|');
            const active = packKey === enabledKey;
            const disabled = pack.id === 'weak' && !pack.typeIds.length;
            return (
              <button
                key={pack.id}
                onClick={() => applyTypePack(pack.typeIds)}
                disabled={disabled}
                className={`text-left rounded-lg border px-3 py-3 transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  active
                    ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900 text-stone-900 dark:text-stone-100'
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
        </div>
      </section>

      <div className="text-xs text-stone-400 text-center pt-2">
        Progress saves automatically to your browser.
      </div>
    </div>
  );
}
