import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { IconCloud } from './components/Icons.jsx';
import {
  defaultState,
  getSystemTheme,
  resolveThemePreference,
  loadAll,
  saveAll,
  cloudFetch,
  cloudUpsert,
  mergeState
} from './utils/storage.js';
import { DEFAULT_PREFS } from './data/defaults.js';
import { getJapaneseVoices } from './utils/speech.js';
import { mergePracticePrefs } from './utils/display.js';
import { STARTER_VERBS, STARTER_ADJECTIVES } from './data/starterWords.js';
import { supabase } from './utils/supabase.js';
import AuthModal from './components/AuthModal.jsx';

// Views — lazy-loaded so each gets its own chunk
const StudyView = React.lazy(() => import('./views/StudyView.jsx'));
const CheckView = React.lazy(() => import('./views/CheckView.jsx'));
const RushView = React.lazy(() => import('./views/RushView.jsx'));
const EndingsView = React.lazy(() => import('./views/EndingsView.jsx'));
const ClassificationView = React.lazy(() => import('./views/ClassificationView.jsx'));
const MistakesView = React.lazy(() => import('./views/MistakesView.jsx'));
const StatsView = React.lazy(() => import('./views/StatsView.jsx'));
const SRSLevelView = React.lazy(() => import('./views/SRSLevelView.jsx'));
const LibraryView = React.lazy(() => import('./views/LibraryView.jsx'));
const SettingsView = React.lazy(() => import('./views/SettingsView.jsx'));

export default function App() {
  const [tab, setTab] = useState('study');
  const [state, setState] = useState(defaultState);
  const [customVerbs, setCustomVerbs] = useState([]);
  const [customAdjectives, setCustomAdjectives] = useState([]);
  const [wordLists, setWordLists] = useState([]);
  const [practicePrefs, setPracticePrefs] = useState(DEFAULT_PREFS);
  const [session, setSession] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ kind: 'idle', message: '', at: null });
  const geminiKey = import.meta.env?.VITE_GEMINI_API_KEY || '';
  const activeGeminiKey = useMemo(() => geminiKey || (session ? 'proxy' : ''), [geminiKey, session]);
  const [speechVoices, setSpeechVoices] = useState([]);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);
  const [hydrated, setHydrated] = useState(false);
  const pushTimer = useRef(null);
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
      // Get initial session
      supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
        setSession(currentSession);
      });

      // Listen for auth state changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
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
      cloudFetch().then(cloud => {
        if (cloud && cloud.data) {
          const cloudAt = cloud.updated_at ? new Date(cloud.updated_at).getTime() : 0;
          if (cloudAt > lastSyncedAtRef.current) {
            if (cloud.data.state) setState(mergeState(cloud.data.state, { reviewed: 0, correct: 0 }));
            if (Array.isArray(cloud.data.customVerbs)) setCustomVerbs(cloud.data.customVerbs);
            if (Array.isArray(cloud.data.customAdjectives)) setCustomAdjectives(cloud.data.customAdjectives);
            if (Array.isArray(cloud.data.wordLists)) setWordLists(cloud.data.wordLists);
            if (cloud.data.practicePrefs) setPracticePrefs(mergePracticePrefs(cloud.data.practicePrefs));
            lastSyncedAtRef.current = cloudAt;
            setSyncStatus({ kind: 'ok', message: 'Restored from cloud', at: cloudAt });
          } else if (cloudAt < lastSyncedAtRef.current) {
            // Local is newer, upload to cloud
            setSyncStatus({ kind: 'syncing', message: 'Uploading newer local progress…', at: null });
            cloudUpsert({ state, customVerbs, customAdjectives, wordLists, practicePrefs }).then(() => {
              const now = Date.now();
              lastSyncedAtRef.current = now;
              setSyncStatus({ kind: 'ok', message: 'Uploaded local progress', at: now });
            }).catch(e => setSyncStatus({ kind: 'error', message: e.message || 'Push failed', at: null }));
          } else {
            setSyncStatus({ kind: 'ok', message: 'Up to date', at: lastSyncedAtRef.current });
          }
        } else {
          // New cloud account — upload current local data
          setSyncStatus({ kind: 'syncing', message: 'Syncing local progress to cloud…', at: null });
          cloudUpsert({ state, customVerbs, customAdjectives, wordLists, practicePrefs }).then(() => {
            const now = Date.now();
            lastSyncedAtRef.current = now;
            setSyncStatus({ kind: 'ok', message: 'Synced to cloud', at: now });
          }).catch(e => setSyncStatus({ kind: 'error', message: e.message || 'Initial sync failed', at: null }));
        }
      }).catch(e => setSyncStatus({ kind: 'error', message: e.message || 'Cloud unreachable', at: null }));
    } else {
      setSyncStatus({ kind: 'idle', message: '', at: null });
    }
  // state/customVerbs/etc intentionally omitted — this effect is triggered by login, not data changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, hydrated]);

  // Local save & cloud auto-upsert on progress changes
  useEffect(() => {
    if (!hydrated) return;
    const dummySync = { enabled: !!session };
    saveAll(state, customVerbs, customAdjectives, wordLists, dummySync, lastSyncedAtRef.current, geminiKey, practicePrefs);
    
    if (session?.user && supabase) {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(async () => {
        setSyncStatus(s => ({ ...s, kind: 'syncing', message: 'Saving to cloud…' }));
        try {
          await cloudUpsert({ state, customVerbs, customAdjectives, wordLists, practicePrefs });
          const now = Date.now();
          lastSyncedAtRef.current = now;
          saveAll(state, customVerbs, customAdjectives, wordLists, dummySync, now, geminiKey, practicePrefs);
          setSyncStatus({ kind: 'ok', message: 'Saved to cloud', at: now });
        } catch (e) {
          setSyncStatus({ kind: 'error', message: e.message || 'Push failed', at: null });
        }
      }, 2000);
    }
  }, [state, customVerbs, customAdjectives, wordLists, session, geminiKey, practicePrefs, hydrated]);

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
      const cloudAt = cloud && cloud.updated_at ? new Date(cloud.updated_at).getTime() : 0;
      if (cloud && cloud.data && cloudAt > lastSyncedAtRef.current) {
        if (cloud.data.state) setState(mergeState(cloud.data.state, state.session));
        if (Array.isArray(cloud.data.customVerbs)) setCustomVerbs(cloud.data.customVerbs);
        if (Array.isArray(cloud.data.customAdjectives)) setCustomAdjectives(cloud.data.customAdjectives);
        if (Array.isArray(cloud.data.wordLists)) setWordLists(cloud.data.wordLists);
        if (cloud.data.practicePrefs) setPracticePrefs(mergePracticePrefs(cloud.data.practicePrefs));
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
  const allAdjectives = useMemo(() => [...STARTER_ADJECTIVES, ...customAdjectives], [customAdjectives]);
  const allWords = useMemo(() => [...allVerbs, ...allAdjectives], [allVerbs, allAdjectives]);
  const daily = state.daily || defaultState().daily;
  const dailyPct = Math.min(100, Math.round((daily.count / (practicePrefs.dailyGoal || 10)) * 100));

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-800 dark:text-stone-200 transition-colors duration-200" style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif' }}>
      <div className="max-w-4xl mx-auto px-4 py-3 sm:py-6">
        <header className="mb-4 sm:mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              動詞と形容詞 <span className="text-stone-400 font-normal">·</span> Katachiya
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">Spaced repetition, reference tables, and AI coaching</p>
          </div>
          <div className="text-xs text-stone-500 text-right">
            <div>{state.session.correct}/{state.session.reviewed} this session</div>
            <div className="mt-1 flex items-center justify-end gap-2">
              <span>{daily.count}/{practicePrefs.dailyGoal} today</span>
              <span className="inline-block w-14 h-1.5 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden">
                <span className="block h-full bg-indigo-500" style={{ width: dailyPct + '%' }} />
              </span>
            </div>
            {!!daily.goalStreak && <div className="text-amber-600 dark:text-amber-400 mt-0.5">{daily.goalStreak} day goal streak</div>}
            {session && (
              <div className={`flex items-center justify-end gap-1 mt-0.5 ${syncStatus.kind === 'error' ? 'text-rose-500' : syncStatus.kind === 'syncing' ? 'text-amber-500' : 'text-emerald-600'}`}>
                <IconCloud className="w-3 h-3" />
                <span>{syncStatus.kind === 'syncing' ? 'syncing' : syncStatus.kind === 'error' ? 'sync error' : 'synced'}</span>
              </div>
            )}
          </div>
        </header>
        <nav className="flex flex-wrap gap-1 mb-4 sm:mb-6 p-1 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800">
          {['study', 'check', 'rush', 'classify', 'endings', 'mistakes', 'levels', 'stats', 'library', 'settings'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 min-w-[5.25rem] py-2 px-3 rounded-lg text-sm transition capitalize ${
                tab === t
                  ? 'bg-stone-800 dark:bg-indigo-700 text-white font-semibold'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
        <Suspense fallback={<div className="flex justify-center py-20 text-stone-400 text-sm">Loading…</div>}>
          {tab === 'study' && <StudyView state={state} setState={setState} verbs={allWords} geminiKey={activeGeminiKey} practicePrefs={practicePrefs} wordLists={wordLists} />}
          {tab === 'check' && <CheckView verbs={allWords} practicePrefs={practicePrefs} />}
          {tab === 'rush' && <RushView state={state} setState={setState} verbs={allWords} practicePrefs={practicePrefs} wordLists={wordLists} />}
          {tab === 'endings' && <EndingsView state={state} setState={setState} verbs={allVerbs} practicePrefs={practicePrefs} wordLists={wordLists} geminiKey={activeGeminiKey} />}
          {tab === 'classify' && <ClassificationView state={state} setState={setState} words={allWords} practicePrefs={practicePrefs} wordLists={wordLists} geminiKey={activeGeminiKey} />}
          {tab === 'mistakes' && <MistakesView state={state} setState={setState} practicePrefs={practicePrefs} />}
          {tab === 'stats' && <StatsView state={state} setState={setState} verbs={allWords} geminiKey={activeGeminiKey} practicePrefs={practicePrefs} setPracticePrefs={setPracticePrefs} setTab={setTab} wordLists={wordLists} setWordLists={setWordLists} />}
          {tab === 'levels' && <SRSLevelView state={state} verbs={allWords} />}
          {tab === 'library' && <LibraryView state={state} setState={setState} verbs={allVerbs} adjectives={allAdjectives} customVerbs={customVerbs} setCustomVerbs={setCustomVerbs} customAdjectives={customAdjectives} setCustomAdjectives={setCustomAdjectives} wordLists={wordLists} setWordLists={setWordLists} practicePrefs={practicePrefs} setPracticePrefs={setPracticePrefs} geminiKey={activeGeminiKey} setTab={setTab} />}
          {tab === 'settings' && <SettingsView state={state} setState={setState} customVerbs={customVerbs} setCustomVerbs={setCustomVerbs} customAdjectives={customAdjectives} setCustomAdjectives={setCustomAdjectives} wordLists={wordLists} setWordLists={setWordLists} session={session} syncStatus={syncStatus} syncNow={syncNow} geminiKey={activeGeminiKey} practicePrefs={practicePrefs} setPracticePrefs={setPracticePrefs} speechVoices={speechVoices} resolvedTheme={resolvedTheme} supabase={supabase} onShowAuth={() => setShowAuthModal(true)} />}
        </Suspense>
      </div>
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} supabase={supabase} />
    </div>
  );
}
