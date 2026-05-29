import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import {
  defaultState,
  getSystemTheme,
  resolveThemePreference,
  loadAll,
  cloudFetch,
  cloudUpsert,
  cloudTimestamp,
  resolveSyncAction,
  mergeState,
} from '../utils/storage.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { getJapaneseVoices } from '../utils/speech.js';
import { mergePracticePrefs } from '../utils/display.js';
import { STARTER_VERBS, STARTER_ADJECTIVES } from '../data/starterWords.js';
import { supabase } from '../utils/supabase.js';
import { useCloudAutoSync } from '../hooks/useCloudAutoSync.js';

// Centralized global app state (improvement #6). All the SRS/customs/prefs
// state, the hydration + cloud-sync effects, theme/voice wiring, and the
// derived word lists live here instead of being lifted into App.jsx and
// prop-drilled into every view. Views read what they need via useApp(), and
// App is just the shell that renders them.
const AppStateContext = createContext(null);

function useAppController() {
  const [tab, setTab] = useState('study');
  const [state, setState] = useState(defaultState);
  const [customVerbs, setCustomVerbs] = useState([]);
  const [customAdjectives, setCustomAdjectives] = useState([]);
  const [wordLists, setWordLists] = useState([]);
  const [practicePrefs, setPracticePrefs] = useState(DEFAULT_PREFS);
  const [session, setSession] = useState(null);
  // A { word, type } the user asked to practise from Check; consumed by Study.
  const [studyFocus, setStudyFocus] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ kind: 'idle', message: '', at: null });
  const geminiKey = import.meta.env?.VITE_GEMINI_API_KEY || '';
  const activeGeminiKey = useMemo(
    () => geminiKey || (session ? 'proxy' : ''),
    [geminiKey, session],
  );
  const [speechVoices, setSpeechVoices] = useState([]);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);
  const [hydrated, setHydrated] = useState(false);
  const lastSyncedAtRef = useRef(0);

  // Local storage hydration on mount + Supabase auth listener
  useEffect(() => {
    const local = loadAll();
    if (local) {
      if (local.state) setState(mergeState(local.state, { reviewed: 0, correct: 0 }));
      if (Array.isArray(local.customVerbs)) setCustomVerbs(local.customVerbs);
      if (Array.isArray(local.customAdjectives)) setCustomAdjectives(local.customAdjectives);
      if (Array.isArray(local.wordLists)) setWordLists(local.wordLists);
      if (local.practicePrefs) setPracticePrefs(mergePracticePrefs(local.practicePrefs));
      if (typeof local.lastSyncedAt === 'number') lastSyncedAtRef.current = local.lastSyncedAt;
    }
    setHydrated(true);

    if (supabase) {
      supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
        setSession(currentSession);
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, currentSession) => {
        setSession(currentSession);
        if (_event === 'SIGNED_IN' && window.location.hash.includes('access_token')) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  // Cloud sync trigger on login / session restoration
  useEffect(() => {
    if (!hydrated || !supabase) return;

    if (session?.user) {
      setSyncStatus({ kind: 'syncing', message: 'Checking cloud…', at: null });
      cloudFetch()
        .then((cloud) => {
          const action = resolveSyncAction(cloud, lastSyncedAtRef.current);
          if (action === 'pull') {
            const cloudAt = cloudTimestamp(cloud);
            if (cloud.data.state)
              setState(mergeState(cloud.data.state, { reviewed: 0, correct: 0 }));
            if (Array.isArray(cloud.data.customVerbs)) setCustomVerbs(cloud.data.customVerbs);
            if (Array.isArray(cloud.data.customAdjectives))
              setCustomAdjectives(cloud.data.customAdjectives);
            if (Array.isArray(cloud.data.wordLists)) setWordLists(cloud.data.wordLists);
            if (cloud.data.practicePrefs)
              setPracticePrefs(mergePracticePrefs(cloud.data.practicePrefs));
            lastSyncedAtRef.current = cloudAt;
            setSyncStatus({ kind: 'ok', message: 'Restored from cloud', at: cloudAt });
          } else if (action === 'noop') {
            setSyncStatus({ kind: 'ok', message: 'Up to date', at: lastSyncedAtRef.current });
          } else {
            const hadCloud = !!(cloud && cloud.data);
            setSyncStatus({
              kind: 'syncing',
              message: hadCloud
                ? 'Uploading newer local progress…'
                : 'Syncing local progress to cloud…',
              at: null,
            });
            cloudUpsert({ state, customVerbs, customAdjectives, wordLists, practicePrefs })
              .then(() => {
                const now = Date.now();
                lastSyncedAtRef.current = now;
                setSyncStatus({
                  kind: 'ok',
                  message: hadCloud ? 'Uploaded local progress' : 'Synced to cloud',
                  at: now,
                });
              })
              .catch((e) =>
                setSyncStatus({
                  kind: 'error',
                  message: e.message || (hadCloud ? 'Push failed' : 'Initial sync failed'),
                  at: null,
                }),
              );
          }
        })
        .catch((e) =>
          setSyncStatus({ kind: 'error', message: e.message || 'Cloud unreachable', at: null }),
        );
    } else {
      setSyncStatus({ kind: 'idle', message: '', at: null });
    }
    // Triggered by login, not data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, hydrated]);

  // Local save on every change + debounced cloud push when signed in.
  useCloudAutoSync({
    hydrated,
    session,
    state,
    customVerbs,
    customAdjectives,
    wordLists,
    geminiKey,
    practicePrefs,
    lastSyncedAtRef,
    setSyncStatus,
  });

  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!synth) return;
    let cancelled = false;
    function loadVoices() {
      if (!cancelled) setSpeechVoices(getJapaneseVoices());
    }
    loadVoices();
    const retry = setTimeout(loadVoices, 400);
    synth.onvoiceschanged = loadVoices;
    return () => {
      cancelled = true;
      clearTimeout(retry);
      if (synth.onvoiceschanged === loadVoices) synth.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemTheme(mql.matches ? 'dark' : 'light');
    update();
    if (mql.addEventListener) mql.addEventListener('change', update);
    else if (mql.addListener) mql.addListener(update);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', update);
      else if (mql.removeListener) mql.removeListener(update);
    };
  }, []);

  const resolvedTheme = resolveThemePreference(practicePrefs.theme, systemTheme);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('theme-dark', resolvedTheme === 'dark');
    document.body.classList.toggle('theme-light', resolvedTheme !== 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolvedTheme === 'dark' ? '#11100f' : '#312e81');
  }, [resolvedTheme]);

  async function syncNow() {
    if (!supabase || !session) return;
    setSyncStatus({ kind: 'syncing', message: 'Syncing…', at: null });
    try {
      const cloud = await cloudFetch();
      if (resolveSyncAction(cloud, lastSyncedAtRef.current) === 'pull') {
        const cloudAt = cloudTimestamp(cloud);
        if (cloud.data.state) setState(mergeState(cloud.data.state, state.session));
        if (Array.isArray(cloud.data.customVerbs)) setCustomVerbs(cloud.data.customVerbs);
        if (Array.isArray(cloud.data.customAdjectives))
          setCustomAdjectives(cloud.data.customAdjectives);
        if (Array.isArray(cloud.data.wordLists)) setWordLists(cloud.data.wordLists);
        if (cloud.data.practicePrefs)
          setPracticePrefs(mergePracticePrefs(cloud.data.practicePrefs));
        lastSyncedAtRef.current = cloudAt;
        setSyncStatus({ kind: 'ok', message: 'Pulled from cloud', at: cloudAt });
      } else {
        await cloudUpsert({ state, customVerbs, customAdjectives, wordLists, practicePrefs });
        const now = Date.now();
        lastSyncedAtRef.current = now;
        setSyncStatus({ kind: 'ok', message: 'Pushed to cloud', at: now });
      }
    } catch (e) {
      setSyncStatus({ kind: 'error', message: e.message || 'Sync failed', at: null });
    }
  }

  const allVerbs = useMemo(() => [...STARTER_VERBS, ...customVerbs], [customVerbs]);
  const allAdjectives = useMemo(
    () => [...STARTER_ADJECTIVES, ...customAdjectives],
    [customAdjectives],
  );
  const allWords = useMemo(() => [...allVerbs, ...allAdjectives], [allVerbs, allAdjectives]);
  const daily = state.daily || defaultState().daily;
  const dailyPct = Math.min(100, Math.round((daily.count / (practicePrefs.dailyGoal || 10)) * 100));

  // Cross-view actions, so views don't need ad-hoc callback props.
  function practiceWord(word, type) {
    setStudyFocus({ word, type });
    setTab('study');
  }
  const clearStudyFocus = () => setStudyFocus(null);
  const showAuth = () => setShowAuthModal(true);

  return {
    tab,
    setTab,
    state,
    setState,
    customVerbs,
    setCustomVerbs,
    customAdjectives,
    setCustomAdjectives,
    wordLists,
    setWordLists,
    practicePrefs,
    setPracticePrefs,
    session,
    studyFocus,
    practiceWord,
    clearStudyFocus,
    showAuthModal,
    setShowAuthModal,
    showAuth,
    syncStatus,
    syncNow,
    activeGeminiKey,
    speechVoices,
    resolvedTheme,
    supabase,
    allVerbs,
    allAdjectives,
    allWords,
    daily,
    dailyPct,
  };
}

export function AppStateProvider({ children }) {
  const value = useAppController();
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

// Consume the central app state. Throws if used outside the provider so wiring
// mistakes fail loudly rather than silently reading undefined.
export function useApp() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useApp must be used within <AppStateProvider>');
  return ctx;
}
