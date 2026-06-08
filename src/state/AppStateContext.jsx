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
  buildSyncPayload,
  mergeSyncPayload,
  saveAll,
  pruneAICache,
  localDateKey,
  normalizeWordLists,
} from '../utils/storage.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { FORM_GROUPS } from '../data/conjugationTypes.js';
import { getJapaneseVoices } from '../utils/speech.js';
import { mergePracticePrefs } from '../utils/display.js';
import { STARTER_VERBS, STARTER_ADJECTIVES } from '../data/starterWords.js';
import { loadVerbLexicon } from '../data/verbLexicon.js';
import { supabase } from '../utils/supabase.js';
import { useCloudAutoSync } from '../hooks/useCloudAutoSync.js';
import { buildLearnerResetPayload, commitLearnerResetPayload } from '../utils/learnerReset.js';
import {
  buildTodayDrillPlan,
  practicePrefsForTodayDrill,
  TODAY_DRILL_LIST_ID,
  upsertTodayDrillList,
} from '../utils/todayDrill.js';
import {
  includeFormFamilyInReviewState,
  includeTypeFamilyInReviewState,
  includeWordInReviewState,
  includeWordKeyInReviewState,
  removeReviewRecommendationState,
  upsertReviewRecommendationState,
} from '../utils/reviewScope.js';

// Centralized global app state (improvement #6). All the practice/customs/prefs
// state, the hydration + cloud-sync effects, theme/voice wiring, and the
// derived word lists live here instead of being lifted into App.jsx and
// prop-drilled into every view. Views read what they need via useApp(), and
// App is just the shell that renders them.
const AppStateContext = createContext(null);

function normalizeAppTab(tab) {
  if (tab === 'study') return 'practice';
  if (tab === 'lessons') return 'learn';
  if (tab === 'library') return 'tools';
  if (tab === 'lab') return 'drills';
  return ['practice', 'guide', 'stats', 'learn', 'drills', 'tools', 'settings'].includes(tab)
    ? tab
    : 'practice';
}

function isTodayDrillPractice(prefs = DEFAULT_PREFS) {
  return (
    !prefs.minimalPairSetId &&
    !prefs.reviewLimitSource &&
    (prefs.wordListIds || []).includes(TODAY_DRILL_LIST_ID)
  );
}

function useAppController() {
  const [tab, setRawTab] = useState('practice');
  const setTab = (nextTab) =>
    setRawTab((current) =>
      normalizeAppTab(typeof nextTab === 'function' ? nextTab(current) : nextTab),
    );
  const [state, setState] = useState(defaultState);
  const [customVerbs, setCustomVerbs] = useState([]);
  const [customAdjectives, setCustomAdjectives] = useState([]);
  const [wordLists, setWordLists] = useState([]);
  const [builtInVerbs, setBuiltInVerbs] = useState(STARTER_VERBS);
  const [builtInAdjectives, setBuiltInAdjectives] = useState(STARTER_ADJECTIVES);
  const [vocabStatus, setVocabStatus] = useState({
    kind: 'starter',
    count: STARTER_VERBS.length + STARTER_ADJECTIVES.length,
    message: '',
  });
  const [practicePrefs, setPracticePrefs] = useState(DEFAULT_PREFS);
  const [session, setSession] = useState(null);
  // A focused Practice launch requested by another view; consumed by Study.
  const [studyFocus, setStudyFocus] = useState(null);
  const [labFocus, setLabFocus] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ kind: 'idle', message: '', at: null });
  const [srsQueue, setSrsQueue] = useState(() => ({
    date: localDateKey(),
    dueRuleIds: [],
    completedDueRuleIds: [],
    startedAt: null,
  }));
  const activeGeminiKey = supabase ? 'proxy' : '';
  const [speechVoices, setSpeechVoices] = useState([]);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);
  const [hydrated, setHydrated] = useState(false);
  const lastSyncedAtRef = useRef(0);

  function currentSyncPayload() {
    return buildSyncPayload({ state, customVerbs, customAdjectives, wordLists, practicePrefs });
  }

  function applySyncPayload(payload) {
    if (!payload) return;
    if (payload.state) setState(mergeState(payload.state, { reviewed: 0, correct: 0 }));
    if (Array.isArray(payload.customVerbs)) setCustomVerbs(payload.customVerbs);
    if (Array.isArray(payload.customAdjectives)) setCustomAdjectives(payload.customAdjectives);
    if (Array.isArray(payload.wordLists)) setWordLists(normalizeWordLists(payload.wordLists));
    if (payload.practicePrefs) setPracticePrefs(mergePracticePrefs(payload.practicePrefs));
  }

  function applyLearnerResetPayload(payload, syncedAt = null) {
    if (!payload) return;
    if (typeof syncedAt === 'number') lastSyncedAtRef.current = syncedAt;
    setState(payload.state || defaultState());
    setCustomVerbs(Array.isArray(payload.customVerbs) ? payload.customVerbs : []);
    setCustomAdjectives(Array.isArray(payload.customAdjectives) ? payload.customAdjectives : []);
    setWordLists(normalizeWordLists(payload.wordLists));
    setPracticePrefs(mergePracticePrefs(payload.practicePrefs));
    setStudyFocus(null);
    setLabFocus(null);
    setSrsQueue({
      date: localDateKey(),
      dueRuleIds: [],
      completedDueRuleIds: [],
      startedAt: null,
    });
    try {
      sessionStorage.removeItem('jp-study-current');
    } catch {}
  }

  function saveResetPayload(payload, syncedAt = null) {
    const nextSyncedAt = typeof syncedAt === 'number' ? syncedAt : lastSyncedAtRef.current;
    saveAll(
      payload.state,
      payload.customVerbs,
      payload.customAdjectives,
      payload.wordLists,
      { enabled: !!session },
      nextSyncedAt,
      payload.practicePrefs,
    );
  }

  // Local storage hydration on mount + Supabase auth listener
  useEffect(() => {
    pruneAICache();
    const local = loadAll();
    if (local) {
      if (local.state) setState(mergeState(local.state, { reviewed: 0, correct: 0 }));
      if (Array.isArray(local.customVerbs)) setCustomVerbs(local.customVerbs);
      if (Array.isArray(local.customAdjectives)) setCustomAdjectives(local.customAdjectives);
      if (Array.isArray(local.wordLists)) setWordLists(normalizeWordLists(local.wordLists));
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

  useEffect(() => {
    if (typeof fetch !== 'function' || import.meta.env.MODE === 'test') return undefined;
    let cancelled = false;

    function startLoad() {
      const starterCount = STARTER_VERBS.length + STARTER_ADJECTIVES.length;
      setVocabStatus({ kind: 'loading', count: starterCount, message: '' });
      loadVerbLexicon()
        .then((data) => {
          if (cancelled) return;
          setBuiltInVerbs(data.verbs);
          setBuiltInAdjectives(data.adjectives);
          setVocabStatus({
            kind: 'ready',
            count: data.verbs.length + data.adjectives.length,
            message: '',
          });
        })
        .catch((error) => {
          if (cancelled) return;
          setVocabStatus({
            kind: 'fallback',
            count: starterCount,
            message: error?.message || 'Using starter vocabulary',
          });
        });
    }

    const idleId =
      typeof window !== 'undefined' && window.requestIdleCallback
        ? window.requestIdleCallback(startLoad, { timeout: 1500 })
        : null;
    const timerId = idleId === null ? setTimeout(startLoad, 750) : null;

    return () => {
      cancelled = true;
      if (idleId !== null) window.cancelIdleCallback?.(idleId);
      if (timerId !== null) clearTimeout(timerId);
    };
  }, []);

  // Cloud sync trigger on login / session restoration
  useEffect(() => {
    if (!hydrated || !supabase) return;

    if (session?.user) {
      setSyncStatus({ kind: 'syncing', message: 'Checking cloud…', at: null });
      cloudFetch()
        .then((cloud) => {
          const localPayload = currentSyncPayload();
          const action = resolveSyncAction(cloud, lastSyncedAtRef.current, localPayload);
          if (action === 'merge') {
            // Both local and cloud have learner data, so resolve one payload
            // before applying React state or writing anything back to cloud.
            const cloudAt = cloudTimestamp(cloud);
            const mergedPayload = mergeSyncPayload(localPayload, cloud.data);
            applySyncPayload(mergedPayload);
            // Upload the merged result so the cloud reflects the combined state.
            setSyncStatus({ kind: 'syncing', message: 'Merging devices…', at: null });
            cloudUpsert(mergedPayload)
              .then(() => {
                const now = Date.now();
                lastSyncedAtRef.current = now;
                setSyncStatus({ kind: 'ok', message: 'Merged from cloud', at: cloudAt });
              })
              .catch((e) =>
                setSyncStatus({
                  kind: 'error',
                  message: e.message || 'Merge push failed',
                  at: null,
                }),
              );
          } else if (action === 'pull') {
            const cloudAt = cloudTimestamp(cloud);
            applySyncPayload(cloud.data);
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
            cloudUpsert(localPayload)
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
      const localPayload = currentSyncPayload();
      const action = resolveSyncAction(cloud, lastSyncedAtRef.current, localPayload);
      if (action === 'merge') {
        const mergedPayload = mergeSyncPayload(localPayload, cloud.data);
        applySyncPayload(mergedPayload);
        await cloudUpsert(mergedPayload);
        const now = Date.now();
        lastSyncedAtRef.current = now;
        setSyncStatus({ kind: 'ok', message: 'Merged from cloud', at: now });
      } else if (action === 'pull') {
        const cloudAt = cloudTimestamp(cloud);
        applySyncPayload(cloud.data);
        lastSyncedAtRef.current = cloudAt;
        setSyncStatus({ kind: 'ok', message: 'Pulled from cloud', at: cloudAt });
      } else {
        await cloudUpsert(localPayload);
        const now = Date.now();
        lastSyncedAtRef.current = now;
        setSyncStatus({ kind: 'ok', message: 'Pushed to cloud', at: now });
      }
    } catch (e) {
      setSyncStatus({ kind: 'error', message: e.message || 'Sync failed', at: null });
    }
  }

  async function resetLearnerData(kind) {
    const payload = buildLearnerResetPayload(
      { state, customVerbs, customAdjectives, wordLists, practicePrefs },
      kind,
    );
    const writesCloud = !!(session?.user && supabase);
    if (writesCloud) {
      setSyncStatus({ kind: 'syncing', message: 'Saving reset to cloud...', at: null });
    }

    try {
      const result = await commitLearnerResetPayload({
        payload,
        session: writesCloud ? session : null,
        writeCloud: writesCloud ? cloudUpsert : null,
        saveLocal: saveResetPayload,
        applyLocal: applyLearnerResetPayload,
      });
      if (writesCloud) {
        setSyncStatus({ kind: 'ok', message: 'Reset saved to cloud', at: result.at });
      }
      return result;
    } catch (e) {
      setSyncStatus({ kind: 'error', message: e.message || 'Reset failed', at: null });
      throw e;
    }
  }

  const allVerbs = useMemo(() => [...builtInVerbs, ...customVerbs], [builtInVerbs, customVerbs]);
  const allAdjectives = useMemo(
    () => [...builtInAdjectives, ...customAdjectives],
    [builtInAdjectives, customAdjectives],
  );
  const builtInWords = useMemo(
    () => [...builtInVerbs, ...builtInAdjectives],
    [builtInVerbs, builtInAdjectives],
  );
  const allWords = useMemo(() => [...allVerbs, ...allAdjectives], [allVerbs, allAdjectives]);
  const todayKey = localDateKey();
  const daily = state.daily || defaultState().daily;
  const dailyPct = Math.min(100, Math.round((daily.count / (practicePrefs.dailyGoal || 30)) * 100));
  const todayPlan = useMemo(
    () => buildTodayDrillPlan(state, allWords, practicePrefs, wordLists, { builtInWords }),
    [state, allWords, practicePrefs, wordLists, builtInWords],
  );
  const todayGoalHit = daily.date === todayKey && !!daily.goalHit;
  const todayDrillActive = isTodayDrillPractice(practicePrefs);
  const activeSrsQueue = useMemo(() => {
    if (srsQueue.date !== todayKey) {
      return { date: todayKey, dueRuleIds: [], completedDueRuleIds: [], startedAt: null };
    }
    const dueRuleIds = [...new Set(srsQueue.dueRuleIds || [])];
    const completedDueRuleIds = [...new Set(srsQueue.completedDueRuleIds || [])].filter((id) =>
      dueRuleIds.includes(id),
    );
    return { ...srsQueue, dueRuleIds, completedDueRuleIds };
  }, [srsQueue, todayKey]);

  useEffect(() => {
    if (!hydrated || !todayDrillActive) return;
    setSrsQueue((prev) => {
      const today = localDateKey();
      if (prev.date === today && prev.startedAt) return prev;
      return {
        date: today,
        dueRuleIds: [...(todayPlan.dueRuleIds || [])],
        completedDueRuleIds: [],
        startedAt: Date.now(),
      };
    });
  }, [hydrated, todayDrillActive, todayPlan]);

  // Cross-view actions, so views don't need ad-hoc callback props.
  function practiceWord(word, type, options = {}) {
    if (word || type) {
      setState((prev) =>
        includeTypeFamilyInReviewState(includeWordInReviewState(prev, word), type),
      );
    }
    if (options.launchMode === 'word-sweep') {
      try {
        sessionStorage.removeItem('jp-study-current');
      } catch {}
    }
    setStudyFocus({ word, type, ...options });
    setTab('practice');
  }
  function practiceFormGroup({ familyId, launchPrefs = {} } = {}) {
    const family = FORM_GROUPS.find((item) => item.id === familyId);
    if (!family?.typeIds?.length) return false;
    setState((prev) => {
      const restored = includeFormFamilyInReviewState(prev, familyId);
      return {
        ...restored,
        enabledTypes: [...new Set([...(restored.enabledTypes || []), ...family.typeIds])],
        session: { ...(restored.session || {}), mistakePatterns: {} },
      };
    });
    setPracticePrefs((prev) => ({
      ...prev,
      ...launchPrefs,
      minimalPairSetId: '',
      minimalPairReturn: null,
      reviewLimit: 0,
      reviewLimitSource: '',
      practicePath: '',
      wordListIds: [],
    }));
    try {
      sessionStorage.removeItem('jp-study-current');
    } catch {}
    setStudyFocus({ formGroupId: familyId, source: 'stats', launchMode: 'form-group' });
    setTab('practice');
    return true;
  }
  const clearStudyFocus = () => setStudyFocus(null);
  // Open a specific Drills exercise from another view (e.g. the dashboard
  // routing a detected weakness into the matching drill).
  function openLabTool(tool) {
    setLabFocus(tool ? { tool } : null);
    setTab('drills');
  }
  const clearLabFocus = () => setLabFocus(null);
  const showAuth = () => setShowAuthModal(true);
  const addReviewRecommendation = (recommendation) =>
    setState((prev) => upsertReviewRecommendationState(prev, recommendation));

  function startReviewRecommendation(recommendation) {
    if (!recommendation) return false;
    const wordKeys = Array.isArray(recommendation.wordKeys) ? recommendation.wordKeys : [];
    const typeIds = Array.isArray(recommendation.typeIds) ? recommendation.typeIds : [];
    const suggestedCount = Math.max(0, Number(recommendation.suggestedCount || 0));
    const listId = `list-review-rec-${recommendation.id}`;
    setState((prev) => {
      let next = { ...prev };
      for (const key of wordKeys) next = includeWordKeyInReviewState(next, key);
      for (const typeId of typeIds) next = includeTypeFamilyInReviewState(next, typeId);
      next = removeReviewRecommendationState(next, recommendation.id);
      return {
        ...next,
        ...(typeIds.length ? { enabledTypes: typeIds } : {}),
        session: { ...(next.session || {}), mistakePatterns: {} },
      };
    });
    if (wordKeys.length) {
      setWordLists((prev) => {
        const list = {
          id: listId,
          name: recommendation.label || 'Recommended practice',
          wordKeys,
        };
        return (prev || []).some((item) => item.id === listId)
          ? prev.map((item) => (item.id === listId ? list : item))
          : [...(prev || []), list];
      });
    }
    setPracticePrefs((prev) => ({
      ...prev,
      reviewStyle: 'auto',
      minimalPairSetId: '',
      minimalPairReturn: null,
      reviewLimit: suggestedCount,
      reviewLimitSource: suggestedCount ? 'recommendation' : '',
      practicePath: '',
      wordListIds: wordKeys.length ? [listId] : [],
    }));
    try {
      sessionStorage.removeItem('jp-study-current');
    } catch {}
    setStudyFocus({
      source: recommendation.source || 'recommendation',
      launchMode: 'recommendation',
      recommendation: {
        id: recommendation.id,
        source: recommendation.source || '',
        label: recommendation.label || 'Recommended practice',
        detail: recommendation.detail || '',
        suggestedCount,
        wordCount: wordKeys.length,
        typeCount: typeIds.length,
      },
    });
    setTab('practice');
    return true;
  }

  function startTodayDrill(plan = todayPlan) {
    const drillPlan = plan || todayPlan;
    if (!drillPlan?.available) return false;
    try {
      sessionStorage.removeItem('jp-study-current');
    } catch {}
    setWordLists((prev) => upsertTodayDrillList(prev, drillPlan));
    setState((prev) => ({
      ...prev,
      session: { ...(prev.session || {}), mistakePatterns: {} },
    }));
    setPracticePrefs((prev) => practicePrefsForTodayDrill(prev, drillPlan));
    setSrsQueue({
      date: localDateKey(),
      dueRuleIds: [...(drillPlan.dueRuleIds || [])],
      completedDueRuleIds: [],
      startedAt: Date.now(),
    });
    setStudyFocus(null);
    setTab('practice');
    return true;
  }

  function markSrsQueueCompleted(ruleId) {
    if (!ruleId) return;
    setSrsQueue((prev) => {
      const today = localDateKey();
      const dueRuleIds = prev.date === today ? prev.dueRuleIds || [] : [];
      if (!dueRuleIds.includes(ruleId)) return prev;
      const completedDueRuleIds = prev.completedDueRuleIds || [];
      if (completedDueRuleIds.includes(ruleId)) return prev;
      return {
        ...prev,
        completedDueRuleIds: [...completedDueRuleIds, ruleId],
      };
    });
  }

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
    practiceFormGroup,
    clearStudyFocus,
    labFocus,
    openLabTool,
    clearLabFocus,
    addReviewRecommendation,
    startReviewRecommendation,
    showAuthModal,
    setShowAuthModal,
    showAuth,
    syncStatus,
    vocabStatus,
    syncNow,
    resetLearnerData,
    activeGeminiKey,
    speechVoices,
    resolvedTheme,
    hydrated,
    supabase,
    allVerbs,
    allAdjectives,
    builtInWords,
    allWords,
    daily,
    dailyPct,
    todayPlan,
    todayGoalHit,
    todayDrillActive,
    srsQueue: activeSrsQueue,
    startTodayDrill,
    markSrsQueueCompleted,
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
