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
  normalizeWordLists,
  assertCurrentStorageEpoch,
  getRecoveryBackup,
} from '../utils/storage.js';
import {
  adoptSyncMetadata,
  bindPendingSyncReset,
  createSyncMeta,
  getLocalSyncDeviceId,
  stampSyncChanges,
  stripPendingSyncReset,
  buildRestoreSyncPayload,
  pendingSyncResetIntent,
} from '../utils/syncMetadata.js';
import { validateLearnerBundle } from '../utils/learnerStateValidation.js';
import { DEFAULT_PREFS, STORAGE_KEY } from '../data/defaults.js';
import { getJapaneseVoices } from '../utils/speech.js';
import { mergePracticePrefs } from '../utils/display.js';
import { STARTER_VERBS, STARTER_ADJECTIVES } from '../data/starterWords.js';
import { loadVerbLexicon } from '../data/verbLexicon.js';
import * as supabaseClientModule from '../utils/supabase.js';
import {
  cloudCommitTimestamp,
  commitCloudWithRetry as commitRawCloudWithRetry,
  useCloudAutoSync,
} from '../hooks/useCloudAutoSync.js';
import { buildLearnerResetPayload, commitLearnerResetPayload } from '../utils/learnerReset.js';
import {
  includeTypeFamilyInReviewState,
  includeWordInReviewState,
  removeReviewRecommendationState,
  upsertReviewRecommendationState,
} from '../utils/reviewScope.js';
import {
  effectiveTypeIdsForPracticeSelection,
  practiceSelectionForTopic,
  practiceSelectionForTypeIds,
  updateStatePracticeSelection,
} from '../utils/practiceSelection.js';
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
  const [supabaseState, setSupabaseState] = useState(initialSupabaseState);
  const supabase = supabaseState.client;
  const activeGeminiKey = supabaseState.configured ? 'proxy' : '';
  const [speechVoices, setSpeechVoices] = useState([]);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);
  const [hydrated, setHydrated] = useState(false);
  const [recoveryBackup, setRecoveryBackup] = useState(null);
  const [dataRecoveryError, setDataRecoveryError] = useState('');
  const [persistenceBlocked, setPersistenceBlocked] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState(
    /** @type {{ kind: string, message: string, at: number | null, detail?: string }} */ ({
      kind: 'idle',
      message: '',
      at: null,
    }),
  );
  const lastSyncedAtRef = useRef(0);
  const latestSyncPayloadRef = useRef(null);
  const previousLocalPayloadRef = useRef(null);
  const incomingSyncMetaRef = useRef(null);
  const diagnosticRepairPendingRef = useRef(false);
  const authEventVersionRef = useRef(0);
  const activeAuthUserIdRef = useRef('');
  const syncGenerationRef = useRef(0);
  const restoreInFlightRef = useRef(false);
  const staleTabRef = useRef(false);
  const cloudRecoveryUserIdRef = useRef('');

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

  function learnerPayloadSignature(payload) {
    return JSON.stringify([
      payload.state,
      payload.customVerbs,
      payload.customAdjectives,
      payload.wordLists,
      payload.practicePrefs,
    ]);
  }

  async function commitCloudWithRetry(payload, userId, options = {}) {
    const pending = pendingSyncResetIntent(payload);
    if (
      !pending?.domains.includes('factory') ||
      pendingSyncResetIntent(currentSyncPayload())?.eventId !== pending.eventId
    ) {
      return commitRawCloudWithRetry(payload, userId, options);
    }
    let candidate = payload;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const signature = learnerPayloadSignature(candidate);
      const committed = await commitRawCloudWithRetry(candidate, userId, {
        ...options,
        ...(attempt > 0 ? { initialCloud: undefined } : {}),
      });
      const latest = currentSyncPayload();
      if (pendingSyncResetIntent(latest)?.eventId !== pending.eventId) {
        throw Object.assign(new Error('A newer learner replacement superseded this sync.'), {
          code: 'SYNC_SUPERSEDED',
        });
      }
      if (learnerPayloadSignature(latest) === signature) return committed;
      candidate = latest;
    }
    throw new Error('New learner changes are saved locally. Use Sync now to finish cloud sync.');
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
    setRestoreStatus((current) =>
      current.kind === 'pending'
        ? {
            kind: 'ok',
            message: 'Restored in this browser and synced to cloud.',
            at: lastSyncedAtRef.current,
          }
        : current,
    );
  }

  function handleCloudFailure(error, fallback) {
    if (error?.code === 'SYNC_SUPERSEDED') return;
    if (error?.code === 'STALE_LEARNER_SNAPSHOT') {
      blockStaleTab();
      return;
    }
    if (error?.code === 'LEARNER_DATA_INVALID') {
      cloudRecoveryUserIdRef.current = activeAuthUserIdRef.current;
      setDataRecoveryError(`Cloud data needs recovery. Sync is paused. ${error.message}`);
      setCloudReadyUserId('');
    }
    setSyncStatus(cloudRetryStatus(error, fallback));
  }

  function blockStaleTab() {
    staleTabRef.current = true;
    syncGenerationRef.current += 1;
    restoreInFlightRef.current = false;
    setRestoreBusy(false);
    setPersistenceBlocked(true);
    setCloudReadyUserId('');
    setDataRecoveryError(
      'Learner data changed in another tab. Reload before continuing; newer saved data is preserved.',
    );
  }

  function currentTabCanWrite() {
    if (staleTabRef.current) return false;
    try {
      assertCurrentStorageEpoch();
      return true;
    } catch {
      blockStaleTab();
      return false;
    }
  }

  function applySyncPayload(payload) {
    if (!payload) return { payload, repaired: false };
    validateLearnerBundle(payload);
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
      appliedState = mergeState(normalizedPayload.state);
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
    const appliedPayload = {
      ...normalizedPayload,
      state: appliedState,
      customVerbs: appliedCustomVerbs,
      customAdjectives: appliedCustomAdjectives,
      wordLists: appliedWordLists,
      practicePrefs: appliedPracticePrefs,
    };
    latestSyncPayloadRef.current = appliedPayload;
    return {
      payload: appliedPayload,
      repaired: repair.repaired,
    };
  }

  function applyLearnerResetPayload(payload, syncedAt = null) {
    if (!payload) return;
    latestSyncPayloadRef.current = payload;
    previousLocalPayloadRef.current = payload;
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
    try {
      sessionStorage.removeItem('jp-study-current');
    } catch {}
  }

  function saveResetPayload(payload, syncedAt = null, ownerUserId = syncOwnerUserId) {
    const nextSyncedAt = typeof syncedAt === 'number' ? syncedAt : lastSyncedAtRef.current;
    saveAll(
      payload.state,
      payload.customVerbs,
      payload.customAdjectives,
      payload.wordLists,
      { enabled: !!session, userId: ownerUserId },
      nextSyncedAt,
      payload.practicePrefs,
      payload.syncMeta,
    );
  }

  // Local storage hydration stays independent from the optional cloud SDK.
  useEffect(() => {
    pruneAICache();
    try {
      const recovered = getRecoveryBackup();
      setRecoveryBackup(recovered);
      const local = loadAll();
      if (local?.recoveryError) throw new Error(local.recoveryError);
      if (local) {
        validateLearnerBundle(local);
        if (local.syncMeta) incomingSyncMetaRef.current = local.syncMeta;
        if (local.state) {
          const repair = reconcileDerivedProgressState(local.state);
          diagnosticRepairPendingRef.current = repair.repaired;
          setState(mergeState(repair.state));
        }
        if (Array.isArray(local.customVerbs)) setCustomVerbs(local.customVerbs);
        if (Array.isArray(local.customAdjectives)) setCustomAdjectives(local.customAdjectives);
        if (Array.isArray(local.wordLists)) setWordLists(normalizeWordLists(local.wordLists));
        if (local.practicePrefs) setPracticePrefs(mergePracticePrefs(local.practicePrefs));
        if (typeof local.lastSyncedAt === 'number') lastSyncedAtRef.current = local.lastSyncedAt;
        if (local.syncConfig?.userId) setSyncOwnerUserId(local.syncConfig.userId);
        if (recovered && local.syncMeta?.pendingReset?.domains?.includes('factory')) {
          const awaitingCloud = !!local.syncConfig?.enabled;
          setRestoreStatus({
            kind: awaitingCloud ? 'pending' : 'ok',
            message: awaitingCloud
              ? 'Restored in this browser. Cloud sync has not finished; keep this backup until sync succeeds.'
              : 'Restored in this browser. Sign in later to sync this replacement.',
            at: null,
          });
        }
      }
    } catch (error) {
      setPersistenceBlocked(true);
      setDataRecoveryError(
        `Saved data needs recovery. It has been kept unchanged. ${error.message}`,
      );
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.storageArea && event.storageArea !== localStorage) return;
      if (event.key === null || (event.key === STORAGE_KEY && event.oldValue !== event.newValue)) {
        blockStaleTab();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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

  function applyAuthSession(currentSession) {
    const nextUserId = currentSession?.user?.id || '';
    if (activeAuthUserIdRef.current !== nextUserId) {
      syncGenerationRef.current += 1;
      if (restoreInFlightRef.current) {
        // The old request may still receive a server response, but it no
        // longer owns this browser or blocks the new account's restore.
        restoreInFlightRef.current = false;
        setRestoreBusy(false);
        setRestoreStatus({ kind: 'idle', message: '', at: null });
      }
      if (cloudRecoveryUserIdRef.current && cloudRecoveryUserIdRef.current !== nextUserId) {
        cloudRecoveryUserIdRef.current = '';
        setDataRecoveryError('');
      }
    }
    activeAuthUserIdRef.current = nextUserId;
    setSession(currentSession);
  }

  useEffect(() => {
    if (!supabase) return undefined;
    const sessionRequestVersion = authEventVersionRef.current;
    void supabase.auth
      .getSession()
      .then(({ data: { session: currentSession } }) => {
        if (authEventVersionRef.current !== sessionRequestVersion) return;
        applyAuthSession(currentSession);
      })
      .catch(() => {});

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      authEventVersionRef.current += 1;
      applyAuthSession(currentSession);
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
    if (!hydrated || !supabase || dataRecoveryError || restoreInFlightRef.current) return;

    if (session?.user) {
      let cancelled = false;
      const syncUserId = session.user.id;
      const generation = syncGenerationRef.current;
      const syncStillCurrent = () =>
        !cancelled &&
        generation === syncGenerationRef.current &&
        activeAuthUserIdRef.current === syncUserId &&
        currentTabCanWrite();
      setCloudReadyUserId('');
      setSyncStatus({ kind: 'syncing', message: 'Checking cloud…', at: null });
      cloudFetch(syncUserId)
        .then((cloud) => {
          if (!syncStillCurrent()) return;
          if (cloud?.data) validateLearnerBundle(cloud.data);
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
            commitCloudWithRetry(mergedPayload, syncUserId, {
              initialCloud: cloud,
              shouldCommit: syncStillCurrent,
            })
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
                handleCloudFailure(e, 'Merge push failed');
              });
          } else if (action === 'pull') {
            const cloudAt = cloudTimestamp(cloud);
            const applied = applySyncPayload(stripPendingSyncReset(cloud.data));
            if (applied.repaired) {
              setSyncStatus({ kind: 'syncing', message: 'Repairing cloud progress…', at: null });
              commitCloudWithRetry(applied.payload, syncUserId, {
                initialCloud: cloud,
                shouldCommit: syncStillCurrent,
              })
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
                  handleCloudFailure(e, 'Progress repair push failed');
                });
            } else {
              lastSyncedAtRef.current = cloudAt;
              markCloudReady(syncUserId);
              setSyncStatus({ kind: 'ok', message: 'Restored from cloud', at: cloudAt });
            }
          } else if (action === 'noop') {
            if (diagnosticRepairPendingRef.current) {
              setSyncStatus({ kind: 'syncing', message: 'Repairing cloud progress…', at: null });
              commitCloudWithRetry(localPayload, syncUserId, {
                initialCloud: cloud,
                shouldCommit: syncStillCurrent,
              })
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
                  handleCloudFailure(e, 'Progress repair push failed');
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
            commitCloudWithRetry(localPayload, syncUserId, {
              initialCloud: cloud,
              shouldCommit: syncStillCurrent,
            })
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
                handleCloudFailure(e, hadCloud ? 'Push failed' : 'Initial sync failed');
              });
          }
        })
        .catch((e) => {
          if (!syncStillCurrent()) return;
          handleCloudFailure(e, 'Cloud unreachable');
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
  }, [session, hydrated, supabase, dataRecoveryError]);

  // Local save on every change + debounced cloud push when signed in.
  useCloudAutoSync({
    hydrated,
    session,
    cloudPushEnabled:
      !restoreBusy &&
      !dataRecoveryError &&
      !!session?.user?.id &&
      cloudReadyUserId === session.user.id,
    persistenceEnabled: !persistenceBlocked,
    syncGenerationRef,
    onDataRecoveryError: (error) => handleCloudFailure(error, 'Cloud data needs recovery'),
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
    if (!supabase || !session || persistenceBlocked || restoreInFlightRef.current) return;
    const syncUserId = session.user?.id || '';
    const generation = syncGenerationRef.current;
    const syncStillCurrent = () =>
      !!syncUserId &&
      generation === syncGenerationRef.current &&
      activeAuthUserIdRef.current === syncUserId &&
      currentTabCanWrite();
    setSyncStatus({ kind: 'syncing', message: 'Syncing…', at: null });
    try {
      const cloud = await cloudFetch(syncUserId);
      if (!syncStillCurrent()) return;
      if (cloud?.data) validateLearnerBundle(cloud.data);
      const localPayload = claimPendingResetForUser(syncUserId);
      const action = resolveSyncAction(cloud, syncedAtForUser(syncUserId), localPayload);
      if (action === 'merge') {
        const mergedPayload = mergeSyncPayload(localPayload, cloud.data, {
          userId: syncUserId,
        });
        applySyncPayload(mergedPayload);
        const committed = await commitCloudWithRetry(mergedPayload, syncUserId, {
          initialCloud: cloud,
          shouldCommit: syncStillCurrent,
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
            shouldCommit: syncStillCurrent,
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
          shouldCommit: syncStillCurrent,
        });
        if (!syncStillCurrent()) return;
        applySyncPayload(committed.payload);
        const now = cloudCommitTimestamp(committed);
        lastSyncedAtRef.current = now;
        diagnosticRepairPendingRef.current = false;
        setSyncStatus({ kind: 'ok', message: 'Pushed to cloud', at: now });
      }
      markCloudReady(syncUserId);
      setDataRecoveryError('');
      cloudRecoveryUserIdRef.current = '';
      setRestoreStatus((current) =>
        current.kind === 'pending'
          ? {
              kind: 'ok',
              message: 'Restored in this browser and synced to cloud.',
              at: lastSyncedAtRef.current,
            }
          : current,
      );
    } catch (e) {
      if (!syncStillCurrent()) return;
      setCloudReadyUserId('');
      handleCloudFailure(e, 'Sync failed');
    }
  }

  async function resetLearnerData(kind) {
    if (persistenceBlocked || restoreInFlightRef.current || !currentTabCanWrite()) {
      throw new Error('Resolve saved-data recovery before resetting learner data.');
    }
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
    const resetStillCurrent = () =>
      currentTabCanWrite() && (!writesCloud || activeAuthUserIdRef.current === resetUserId);
    if (writesCloud) {
      setSyncStatus({ kind: 'syncing', message: 'Saving reset to cloud...', at: null });
    }

    try {
      const result = await commitLearnerResetPayload({
        payload,
        kind,
        session: writesCloud ? session : null,
        writeCloud: writesCloud
          ? (nextPayload, options) =>
              commitCloudWithRetry(nextPayload, resetUserId, {
                ...options,
                shouldCommit: resetStillCurrent,
              })
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

  async function restoreBackup(text) {
    if (staleTabRef.current || !currentTabCanWrite()) {
      throw new Error('Learner data changed in another tab. Reload before restoring.');
    }
    if (!hydrated || restoreInFlightRef.current) {
      throw new Error('Wait for the current restore to finish.');
    }
    const importGeneration = syncGenerationRef.current;
    const [{ parseBackup, serializeBackup }, { persistBackupRestore }] = await Promise.all([
      import('../utils/backup.js'),
      import('../utils/restorePersistence.js'),
    ]);
    // Lazy loading can yield to another confirmation, a storage event, or an
    // account switch. Recheck ownership before beginning the atomic replace.
    if (!hydrated || restoreInFlightRef.current || importGeneration !== syncGenerationRef.current) {
      throw new Error(
        'Learner data changed while preparing this restore. Review the backup again.',
      );
    }
    if (staleTabRef.current || !currentTabCanWrite()) {
      throw new Error('Learner data changed in another tab. Reload before restoring.');
    }
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error || 'Invalid backup');
    const userId = session?.user?.id || '';
    if (
      userId &&
      !dataRecoveryError &&
      (cloudReadyUserId !== userId || syncOwnerUserId !== userId)
    ) {
      throw new Error("Wait for this account's cloud restore before replacing learner data.");
    }

    const before = currentSyncPayload();
    const replacement = buildRestoreSyncPayload(
      before,
      buildSyncPayload(parsed.data),
      userId || syncOwnerUserId,
    );
    const beforeBackupJson = persistenceBlocked ? null : serializeBackup(before);
    const generation = ++syncGenerationRef.current;
    const restoreStillCurrent = () =>
      generation === syncGenerationRef.current &&
      activeAuthUserIdRef.current === userId &&
      currentTabCanWrite();
    restoreInFlightRef.current = true;
    setRestoreBusy(true);
    setRestoreStatus({
      kind: 'idle',
      message: 'Saving the restored data in this browser…',
      at: null,
    });

    try {
      const persisted = persistBackupRestore(
        {
          ...replacement,
          syncConfig: { enabled: !!userId, userId: userId || syncOwnerUserId },
          lastSyncedAt: 0,
        },
        beforeBackupJson,
      );
      const recovery = persisted.recoveryBackup;
      setRecoveryBackup(recovery);
      lastSyncedAtRef.current = 0;
      setPersistenceBlocked(false);
      setDataRecoveryError('');
      setCloudReadyUserId('');
      setSyncOwnerUserId(userId || syncOwnerUserId);
      applyLearnerResetPayload(replacement, 0);

      if (!userId || !supabase) {
        setRestoreStatus({ kind: 'ok', message: 'Restored in this browser.', at: null });
        return { cloud: false, pending: false, recoveryBackup: recovery };
      }

      const pendingMessage =
        'Restored in this browser. Cloud sync has not finished; keep this backup until sync succeeds.';
      setRestoreStatus({ kind: 'pending', message: pendingMessage, at: null });
      setSyncStatus({ kind: 'syncing', message: 'Saving restored data to cloud…', at: null });
      try {
        const committed = await commitCloudWithRetry(replacement, userId, {
          shouldCommit: restoreStillCurrent,
        });
        if (!restoreStillCurrent()) return { cloud: false, pending: true, stale: true };
        const at = cloudCommitTimestamp(committed);
        saveResetPayload(committed.payload, at, userId);
        applyLearnerResetPayload(committed.payload, at);
        markCloudReady(userId);
        setRestoreStatus({
          kind: 'ok',
          message: 'Restored in this browser and synced to cloud.',
          at,
        });
        setSyncStatus({ kind: 'ok', message: 'Restored data saved to cloud', at });
        return { cloud: true, pending: false, recoveryBackup: recovery };
      } catch (error) {
        if (!restoreStillCurrent()) return { cloud: false, pending: true, stale: true };
        handleCloudFailure(error, 'Restore needs cloud retry');
        setRestoreStatus({
          kind: 'pending',
          message: pendingMessage,
          detail: error.message,
          at: null,
        });
        return { cloud: false, pending: true, recoveryBackup: recovery };
      }
    } catch (error) {
      if (error.restoreMayHaveCommitted) {
        setPersistenceBlocked(true);
        setDataRecoveryError(error.message);
        if (beforeBackupJson) setRecoveryBackup(beforeBackupJson);
      }
      setRestoreStatus({
        kind: 'error',
        message: error.restoreMayHaveCommitted
          ? 'Browser storage stopped responding. Reload Settings to inspect the saved data.'
          : 'Restore was not saved. Current data has been kept.',
        detail: error.message,
        at: null,
      });
      throw error;
    } finally {
      if (generation === syncGenerationRef.current) {
        restoreInFlightRef.current = false;
        setRestoreBusy(false);
      }
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
    setState((prev) => {
      const selection = practiceSelectionForTopic(familyId, prev.practiceSelection);
      if (!effectiveTypeIdsForPracticeSelection(selection).length) return prev;
      return updateStatePracticeSelection(prev, selection);
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
    setStudyFocus(null);
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
    const typeIds = Array.isArray(recommendation.typeIds) ? recommendation.typeIds : [];
    if (!typeIds.length) return false;
    setState((prev) => {
      let next = { ...prev };
      for (const typeId of typeIds) next = includeTypeFamilyInReviewState(next, typeId);
      next = removeReviewRecommendationState(next, recommendation.id);
      return updateStatePracticeSelection(
        next,
        practiceSelectionForTypeIds(typeIds, next.practiceSelection),
      );
    });
    setPracticePrefs((prev) => ({
      ...prev,
      reviewStyle: 'auto',
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
    setStudyFocus(null);
    setTab('practice');
    return true;
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
    restoreBackup,
    recoveryBackup,
    dataRecoveryError,
    restoreBusy,
    restoreStatus,
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
