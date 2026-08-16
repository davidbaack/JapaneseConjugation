import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
} from 'react';
import {
  defaultState,
  getSystemTheme,
  resolveThemePreference,
  loadAll,
  cloudFetch,
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
import {
  adoptSyncMetadata,
  bindPendingSyncReset,
  createSyncMeta,
  getLocalSyncDeviceId,
  stampSyncChanges,
  stripPendingSyncReset,
} from '../utils/syncMetadata.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { FORM_GROUPS } from '../data/conjugationTypes.js';
import { getJapaneseVoices } from '../utils/speech.js';
import { mergePracticePrefs } from '../utils/display.js';
import { STARTER_VERBS, STARTER_ADJECTIVES } from '../data/starterWords.js';
import { loadVerbLexicon } from '../data/verbLexicon.js';
import * as supabaseClientModule from '../utils/supabase.js';
import {
  cloudCommitTimestamp,
  commitCloudWithRetry,
  useCloudAutoSync,
} from '../hooks/useCloudAutoSync.js';
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
import { updateStatePracticeScope } from '../utils/practiceScope.js';
import { reconcileDerivedProgressState } from '../utils/derivedProgress.js';

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

function cloudRetryStatus(error, fallback) {
  return {
    kind: 'error',
    message: 'Saved locally; cloud sync needs retry',
    detail: error?.message || fallback,
    at: null,
  };
}

function resetCloudFailureStatus(error) {
  return {
    kind: 'error',
    message: 'Reset not saved; cloud sync needs retry',
    detail: error?.message || 'Reset failed',
    at: null,
  };
}

function initialSupabaseState() {
  return supabaseClientModule.getSupabaseClientState();
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
  const [syncMeta, setSyncMeta] = useState(() => createSyncMeta(getLocalSyncDeviceId()));
  const [session, setSession] = useState(null);
  // A focused Practice launch requested by another view; consumed by Study.
  const [studyFocus, setStudyFocus] = useState(null);
  const [learnFocus, setLearnFocus] = useState(null);
  const [guideFocus, setGuideFocus] = useState(null);
  const [labFocus, setLabFocus] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ kind: 'idle', message: '', at: null });
  const [cloudReadyUserId, setCloudReadyUserId] = useState('');
  const [syncOwnerUserId, setSyncOwnerUserId] = useState('');
  const [srsQueue, setSrsQueue] = useState(() => ({
    date: localDateKey(),
    dueRuleIds: [],
    completedDueRuleIds: [],
    startedAt: null,
  }));
  const [supabaseState, setSupabaseState] = useState(initialSupabaseState);
  const supabase = supabaseState.client;
  const activeGeminiKey = supabaseState.configured ? 'proxy' : '';
  const [speechVoices, setSpeechVoices] = useState([]);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);
  const [hydrated, setHydrated] = useState(false);
  const lastSyncedAtRef = useRef(0);
  const latestSyncPayloadRef = useRef(null);
  const previousLocalPayloadRef = useRef(null);
  const incomingSyncMetaRef = useRef(null);
  const diagnosticRepairPendingRef = useRef(false);
  const authEventVersionRef = useRef(0);
  const activeAuthUserIdRef = useRef('');

  useLayoutEffect(() => {
    const payload = buildSyncPayload({
      state,
      customVerbs,
      customAdjectives,
      wordLists,
      practicePrefs,
      syncMeta,
    });
    if (incomingSyncMetaRef.current) {
      const incoming = incomingSyncMetaRef.current;
      incomingSyncMetaRef.current = null;
      previousLocalPayloadRef.current = { ...payload, syncMeta: incoming };
      latestSyncPayloadRef.current = { ...payload, syncMeta: incoming };
      if (incoming !== syncMeta) setSyncMeta(incoming);
      return;
    }
    const previous = previousLocalPayloadRef.current;
    const nextMeta = previous ? stampSyncChanges(syncMeta, previous, payload) : syncMeta;
    previousLocalPayloadRef.current = { ...payload, syncMeta: nextMeta };
    latestSyncPayloadRef.current = { ...payload, syncMeta: nextMeta };
    if (nextMeta !== syncMeta) setSyncMeta(nextMeta);
  }, [state, customVerbs, customAdjectives, wordLists, practicePrefs, syncMeta]);

  function currentSyncPayload() {
    return (
      latestSyncPayloadRef.current ||
      buildSyncPayload({
        state,
        customVerbs,
        customAdjectives,
        wordLists,
        practicePrefs,
        syncMeta,
      })
    );
  }

  function syncPayloadForUser(userId) {
    if (!syncOwnerUserId || syncOwnerUserId === userId) return currentSyncPayload();
    return buildSyncPayload({
      state: defaultState(),
      customVerbs: [],
      customAdjectives: [],
      wordLists: [],
      practicePrefs: DEFAULT_PREFS,
      syncMeta: createSyncMeta(getLocalSyncDeviceId()),
    });
  }

  function syncedAtForUser(userId) {
    return syncOwnerUserId && syncOwnerUserId !== userId ? 0 : lastSyncedAtRef.current;
  }

  function claimPendingResetForUser(userId) {
    const payload = syncPayloadForUser(userId);
    const claimed = bindPendingSyncReset(payload, userId);
    if (claimed !== payload) {
      setSyncOwnerUserId(userId);
      applySyncPayload(claimed);
    }
    return claimed;
  }

  function markCloudReady(userId) {
    setSyncOwnerUserId(userId);
    setCloudReadyUserId(userId);
  }

  function applySyncPayload(payload) {
    if (!payload) return { payload, repaired: false };
    const localPayload = adoptSyncMetadata(payload, getLocalSyncDeviceId());
    const repair = localPayload.state
      ? reconcileDerivedProgressState(localPayload.state)
      : { state: localPayload.state, repaired: false };
    const normalizedPayload = repair.repaired
      ? { ...localPayload, state: repair.state }
      : localPayload;
    if (normalizedPayload.syncMeta) incomingSyncMetaRef.current = normalizedPayload.syncMeta;
    if (repair.repaired) diagnosticRepairPendingRef.current = true;
    let appliedState = normalizedPayload.state;
    if (normalizedPayload.state) {
      appliedState = mergeState(normalizedPayload.state, { reviewed: 0, correct: 0 });
      setState(appliedState);
    }
    let appliedCustomVerbs = customVerbs;
    if (Array.isArray(normalizedPayload.customVerbs)) {
      appliedCustomVerbs = normalizedPayload.customVerbs;
      setCustomVerbs(appliedCustomVerbs);
    }
    let appliedCustomAdjectives = customAdjectives;
    if (Array.isArray(normalizedPayload.customAdjectives)) {
      appliedCustomAdjectives = normalizedPayload.customAdjectives;
      setCustomAdjectives(appliedCustomAdjectives);
    }
    let appliedWordLists = wordLists;
    if (Array.isArray(normalizedPayload.wordLists)) {
      appliedWordLists = normalizeWordLists(normalizedPayload.wordLists);
      setWordLists(appliedWordLists);
    }
    let appliedPracticePrefs = practicePrefs;
    if (normalizedPayload.practicePrefs) {
      appliedPracticePrefs = mergePracticePrefs(normalizedPayload.practicePrefs);
      setPracticePrefs(appliedPracticePrefs);
    }
    return {
      payload: {
        ...normalizedPayload,
        state: appliedState,
        customVerbs: appliedCustomVerbs,
        customAdjectives: appliedCustomAdjectives,
        wordLists: appliedWordLists,
        practicePrefs: appliedPracticePrefs,
      },
      repaired: repair.repaired,
    };
  }

  function applyLearnerResetPayload(payload, syncedAt = null) {
    if (!payload) return;
    if (payload.syncMeta) incomingSyncMetaRef.current = payload.syncMeta;
    if (typeof syncedAt === 'number') lastSyncedAtRef.current = syncedAt;
    setState(payload.state || defaultState());
    setCustomVerbs(Array.isArray(payload.customVerbs) ? payload.customVerbs : []);
    setCustomAdjectives(Array.isArray(payload.customAdjectives) ? payload.customAdjectives : []);
    setWordLists(normalizeWordLists(payload.wordLists));
    setPracticePrefs(mergePracticePrefs(payload.practicePrefs));
    setStudyFocus(null);
    setLearnFocus(null);
    setGuideFocus(null);
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
      { enabled: !!session, userId: syncOwnerUserId },
      nextSyncedAt,
      payload.practicePrefs,
      payload.syncMeta,
    );
  }

  // Local storage hydration stays independent from the optional cloud SDK.
  useEffect(() => {
    pruneAICache();
    const local = loadAll();
    if (local) {
      if (local.syncMeta) incomingSyncMetaRef.current = local.syncMeta;
      if (local.state) {
        const repair = reconcileDerivedProgressState(local.state);
        diagnosticRepairPendingRef.current = repair.repaired;
        setState(mergeState(repair.state, { reviewed: 0, correct: 0 }));
      }
      if (Array.isArray(local.customVerbs)) setCustomVerbs(local.customVerbs);
      if (Array.isArray(local.customAdjectives)) setCustomAdjectives(local.customAdjectives);
      if (Array.isArray(local.wordLists)) setWordLists(normalizeWordLists(local.wordLists));
      if (local.practicePrefs) setPracticePrefs(mergePracticePrefs(local.practicePrefs));
      if (typeof local.lastSyncedAt === 'number') lastSyncedAtRef.current = local.lastSyncedAt;
      if (local.syncConfig?.userId) setSyncOwnerUserId(local.syncConfig.userId);
    }
    setHydrated(true);
  }, []);

  // Keep the SDK out of local-only startup. A stored auth session (or OAuth
  // callback) restores it immediately; otherwise the auth modal loads it on
  // first cloud interaction.
  useEffect(() => {
    const unsubscribe = supabaseClientModule.subscribeSupabaseClient?.(setSupabaseState);
    if (supabaseClientModule.shouldRestoreSupabaseSession?.()) {
      void supabaseClientModule.loadSupabaseClient?.().catch(() => {});
    }
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    const sessionRequestVersion = authEventVersionRef.current;
    void supabase.auth
      .getSession()
      .then(({ data: { session: currentSession } }) => {
        if (authEventVersionRef.current !== sessionRequestVersion) return;
        activeAuthUserIdRef.current = currentSession?.user?.id || '';
        setSession(currentSession);
      })
      .catch(() => {});

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      authEventVersionRef.current += 1;
      activeAuthUserIdRef.current = currentSession?.user?.id || '';
      setSession(currentSession);
      if (_event === 'SIGNED_IN' && window.location.hash.includes('access_token')) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

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

  useEffect(() => {
    activeAuthUserIdRef.current = session?.user?.id || '';
  }, [session]);

  // Cloud sync trigger on login / session restoration
  useEffect(() => {
    if (!hydrated || !supabase) return;

    if (session?.user) {
      let cancelled = false;
      const syncUserId = session.user.id;
      const syncStillCurrent = () => !cancelled && activeAuthUserIdRef.current === syncUserId;
      setCloudReadyUserId('');
      setSyncStatus({ kind: 'syncing', message: 'Checking cloud…', at: null });
      cloudFetch(syncUserId)
        .then((cloud) => {
          if (!syncStillCurrent()) return;
          const localPayload = claimPendingResetForUser(syncUserId);
          const action = resolveSyncAction(cloud, syncedAtForUser(syncUserId), localPayload);
          if (action === 'merge') {
            // Both local and cloud have learner data, so resolve one payload
            // before applying React state or writing anything back to cloud.
            const cloudAt = cloudTimestamp(cloud);
            const mergedPayload = mergeSyncPayload(localPayload, cloud.data, {
              userId: syncUserId,
            });
            applySyncPayload(mergedPayload);
            // Upload the merged result so the cloud reflects the combined state.
            setSyncStatus({ kind: 'syncing', message: 'Merging devices…', at: null });
            commitCloudWithRetry(mergedPayload, syncUserId, { initialCloud: cloud })
              .then((committed) => {
                if (!syncStillCurrent()) return;
                applySyncPayload(committed.payload);
                const now = cloudCommitTimestamp(committed);
                lastSyncedAtRef.current = now;
                diagnosticRepairPendingRef.current = false;
                markCloudReady(syncUserId);
                setSyncStatus({ kind: 'ok', message: 'Merged from cloud', at: cloudAt });
              })
              .catch((e) => {
                if (!syncStillCurrent()) return;
                setSyncStatus(cloudRetryStatus(e, 'Merge push failed'));
              });
          } else if (action === 'pull') {
            const cloudAt = cloudTimestamp(cloud);
            const applied = applySyncPayload(stripPendingSyncReset(cloud.data));
            if (applied.repaired) {
              setSyncStatus({ kind: 'syncing', message: 'Repairing cloud progress…', at: null });
              commitCloudWithRetry(applied.payload, syncUserId, { initialCloud: cloud })
                .then((committed) => {
                  if (!syncStillCurrent()) return;
                  applySyncPayload(committed.payload);
                  const now = cloudCommitTimestamp(committed);
                  lastSyncedAtRef.current = now;
                  diagnosticRepairPendingRef.current = false;
                  markCloudReady(syncUserId);
                  setSyncStatus({ kind: 'ok', message: 'Repaired cloud progress', at: now });
                })
                .catch((e) => {
                  if (!syncStillCurrent()) return;
                  setSyncStatus(cloudRetryStatus(e, 'Progress repair push failed'));
                });
            } else {
              lastSyncedAtRef.current = cloudAt;
              markCloudReady(syncUserId);
              setSyncStatus({ kind: 'ok', message: 'Restored from cloud', at: cloudAt });
            }
          } else if (action === 'noop') {
            if (diagnosticRepairPendingRef.current) {
              setSyncStatus({ kind: 'syncing', message: 'Repairing cloud progress…', at: null });
              commitCloudWithRetry(localPayload, syncUserId, { initialCloud: cloud })
                .then((committed) => {
                  if (!syncStillCurrent()) return;
                  applySyncPayload(committed.payload);
                  const now = cloudCommitTimestamp(committed);
                  lastSyncedAtRef.current = now;
                  diagnosticRepairPendingRef.current = false;
                  markCloudReady(syncUserId);
                  setSyncStatus({ kind: 'ok', message: 'Repaired cloud progress', at: now });
                })
                .catch((e) => {
                  if (!syncStillCurrent()) return;
                  setSyncStatus(cloudRetryStatus(e, 'Progress repair push failed'));
                });
            } else {
              markCloudReady(syncUserId);
              setSyncStatus({ kind: 'ok', message: 'Up to date', at: lastSyncedAtRef.current });
            }
          } else {
            const hadCloud = !!(cloud && cloud.data);
            setSyncStatus({
              kind: 'syncing',
              message: hadCloud
                ? 'Uploading newer local progress…'
                : 'Syncing local progress to cloud…',
              at: null,
            });
            commitCloudWithRetry(localPayload, syncUserId, { initialCloud: cloud })
              .then((committed) => {
                if (!syncStillCurrent()) return;
                applySyncPayload(committed.payload);
                const now = cloudCommitTimestamp(committed);
                lastSyncedAtRef.current = now;
                diagnosticRepairPendingRef.current = false;
                markCloudReady(syncUserId);
                setSyncStatus({
                  kind: 'ok',
                  message: hadCloud ? 'Uploaded local progress' : 'Synced to cloud',
                  at: now,
                });
              })
              .catch((e) => {
                if (!syncStillCurrent()) return;
                setSyncStatus(
                  cloudRetryStatus(e, hadCloud ? 'Push failed' : 'Initial sync failed'),
                );
              });
          }
        })
        .catch((e) => {
          if (!syncStillCurrent()) return;
          setSyncStatus(cloudRetryStatus(e, 'Cloud unreachable'));
        });
      return () => {
        cancelled = true;
      };
    } else {
      setCloudReadyUserId('');
      setSyncStatus({ kind: 'idle', message: '', at: null });
    }
    // Triggered by login, not data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, hydrated, supabase]);

  // Local save on every change + debounced cloud push when signed in.
  useCloudAutoSync({
    hydrated,
    session,
    cloudPushEnabled: !!session?.user?.id && cloudReadyUserId === session.user.id,
    state,
    customVerbs,
    customAdjectives,
    wordLists,
    practicePrefs,
    syncMeta,
    syncOwnerUserId,
    lastSyncedAtRef,
    setSyncStatus,
    applySyncPayload,
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
    const syncUserId = session.user?.id || '';
    const syncStillCurrent = () => !!syncUserId && activeAuthUserIdRef.current === syncUserId;
    setSyncStatus({ kind: 'syncing', message: 'Syncing…', at: null });
    try {
      const cloud = await cloudFetch(syncUserId);
      if (!syncStillCurrent()) return;
      const localPayload = claimPendingResetForUser(syncUserId);
      const action = resolveSyncAction(cloud, syncedAtForUser(syncUserId), localPayload);
      if (action === 'merge') {
        const mergedPayload = mergeSyncPayload(localPayload, cloud.data, {
          userId: syncUserId,
        });
        applySyncPayload(mergedPayload);
        const committed = await commitCloudWithRetry(mergedPayload, syncUserId, {
          initialCloud: cloud,
        });
        if (!syncStillCurrent()) return;
        applySyncPayload(committed.payload);
        const now = cloudCommitTimestamp(committed);
        lastSyncedAtRef.current = now;
        diagnosticRepairPendingRef.current = false;
        setSyncStatus({ kind: 'ok', message: 'Merged from cloud', at: now });
      } else if (action === 'pull') {
        const cloudAt = cloudTimestamp(cloud);
        if (!syncStillCurrent()) return;
        const applied = applySyncPayload(stripPendingSyncReset(cloud.data));
        if (applied.repaired) {
          const committed = await commitCloudWithRetry(applied.payload, syncUserId, {
            initialCloud: cloud,
          });
          if (!syncStillCurrent()) return;
          applySyncPayload(committed.payload);
          const now = cloudCommitTimestamp(committed);
          lastSyncedAtRef.current = now;
          diagnosticRepairPendingRef.current = false;
          setSyncStatus({ kind: 'ok', message: 'Repaired cloud progress', at: now });
        } else {
          lastSyncedAtRef.current = cloudAt;
          setSyncStatus({ kind: 'ok', message: 'Pulled from cloud', at: cloudAt });
        }
      } else {
        const committed = await commitCloudWithRetry(localPayload, syncUserId, {
          initialCloud: cloud,
        });
        if (!syncStillCurrent()) return;
        applySyncPayload(committed.payload);
        const now = cloudCommitTimestamp(committed);
        lastSyncedAtRef.current = now;
        diagnosticRepairPendingRef.current = false;
        setSyncStatus({ kind: 'ok', message: 'Pushed to cloud', at: now });
      }
      markCloudReady(syncUserId);
    } catch (e) {
      if (!syncStillCurrent()) return;
      setCloudReadyUserId('');
      setSyncStatus(cloudRetryStatus(e, 'Sync failed'));
    }
  }

  async function resetLearnerData(kind) {
    const signedInUserId = session?.user?.id || '';
    if (
      signedInUserId &&
      (cloudReadyUserId !== signedInUserId || syncOwnerUserId !== signedInUserId)
    ) {
      throw new Error("Wait for this account's cloud restore before resetting learner data.");
    }
    const payload = buildLearnerResetPayload(
      { state, customVerbs, customAdjectives, wordLists, practicePrefs, syncMeta },
      kind,
      { ownerUserId: syncOwnerUserId },
    );
    const writesCloud = !!(session?.user && supabase);
    const resetUserId = writesCloud ? session.user.id : '';
    const resetStillCurrent = () => !writesCloud || activeAuthUserIdRef.current === resetUserId;
    if (writesCloud) {
      setSyncStatus({ kind: 'syncing', message: 'Saving reset to cloud...', at: null });
    }

    try {
      const result = await commitLearnerResetPayload({
        payload,
        kind,
        session: writesCloud ? session : null,
        writeCloud: writesCloud
          ? (nextPayload, options) => commitCloudWithRetry(nextPayload, resetUserId, options)
          : null,
        shouldCommit: resetStillCurrent,
        saveLocal: saveResetPayload,
        applyLocal: applyLearnerResetPayload,
      });
      if (result.stale || !resetStillCurrent()) return { ...result, stale: true };
      if (writesCloud) {
        setSyncStatus({ kind: 'ok', message: 'Reset saved to cloud', at: result.at });
      }
      return result;
    } catch (e) {
      if (writesCloud && !resetStillCurrent()) return { cloud: true, at: null, stale: true };
      setCloudReadyUserId('');
      setSyncStatus(resetCloudFailureStatus(e));
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
  /**
   * @param {{ familyId?: string, launchPrefs?: Record<string, any> }} [options]
   */
  function practiceFormGroup({ familyId, launchPrefs = {} } = {}) {
    const family = FORM_GROUPS.find((item) => item.id === familyId);
    if (!family?.typeIds?.length) return false;
    const returnEnabledTypes = Array.isArray(state.enabledTypes) ? [...state.enabledTypes] : [];
    const returnPracticePrefs = mergePracticePrefs(practicePrefs);
    setState((prev) => {
      const restored = includeFormFamilyInReviewState(prev, familyId);
      const scoped = updateStatePracticeScope(restored, {
        type: 'enable-family',
        familyId,
      });
      return {
        ...scoped,
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
    setStudyFocus({
      formGroupId: familyId,
      source: 'stats',
      launchMode: 'form-group',
      returnEnabledTypes,
      returnPracticePrefs,
    });
    setTab('practice');
    return true;
  }
  const clearStudyFocus = () => setStudyFocus(null);
  function openLearnFocus(focus) {
    if (!focus?.lessonGroupId) return false;
    setLearnFocus(focus);
    setTab('learn');
    return true;
  }
  const clearLearnFocus = () => setLearnFocus(null);
  const clearGuideFocus = () => setGuideFocus(null);
  function openGuideForRule(word, type, options = {}) {
    if (word || type) {
      setState((prev) =>
        includeTypeFamilyInReviewState(includeWordInReviewState(prev, word), type),
      );
    }
    setGuideFocus({ word, type, ...options });
    setTab('guide');
  }
  // Open a specific Drills exercise from another view (e.g. the dashboard
  // routing a detected weakness into the matching drill).
  function openLabTool(tool) {
    setLabFocus(tool ? { tool } : null);
    setTab('drills');
  }
  const clearLabFocus = () => setLabFocus(null);
  const showAuth = () => {
    setShowAuthModal(true);
    if (supabaseState.configured && !supabase) {
      void supabaseClientModule.loadSupabaseClient?.().catch(() => {});
    }
  };
  const retrySupabase = () =>
    supabaseClientModule.loadSupabaseClient?.({ retry: true }).catch(() => null);
  const addReviewRecommendation = (recommendation) =>
    setState((prev) => upsertReviewRecommendationState(prev, recommendation));

  function startReviewRecommendation(recommendation) {
    if (!recommendation) return false;
    const wordKeys = Array.isArray(recommendation.wordKeys) ? recommendation.wordKeys : [];
    const typeIds = Array.isArray(recommendation.typeIds) ? recommendation.typeIds : [];
    const suggestedCount = Math.max(0, Number(recommendation.suggestedCount || 0));
    const listId = `list-review-rec-${recommendation.id}`;
    const returnEnabledTypes = Array.isArray(state.enabledTypes) ? [...state.enabledTypes] : [];
    const returnPracticePrefs = mergePracticePrefs(practicePrefs);
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
      returnPracticePrefs,
      recommendation: {
        id: recommendation.id,
        source: recommendation.source || '',
        label: recommendation.label || 'Recommended practice',
        detail: recommendation.detail || '',
        suggestedCount,
        wordCount: wordKeys.length,
        typeCount: typeIds.length,
        returnEnabledTypes,
        returnPracticePrefs,
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
    setPracticePrefs(
      (prev) => /** @type {typeof DEFAULT_PREFS} */ (practicePrefsForTodayDrill(prev, drillPlan)),
    );
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
    learnFocus,
    openLearnFocus,
    clearLearnFocus,
    guideFocus,
    openGuideForRule,
    clearGuideFocus,
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
    supabaseConfigured: supabaseState.configured,
    supabaseStatus: supabaseState.status,
    supabaseError: supabaseState.error,
    retrySupabase,
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
