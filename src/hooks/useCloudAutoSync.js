import { useEffect, useRef } from 'react';
import {
  saveAll,
  cloudFetch,
  cloudUpsert,
  buildSyncPayload,
  mergeSyncPayload,
  assertCurrentStorageEpoch,
} from '../utils/storage.js';
import {
  assertPendingSyncResetOwner,
  bindPendingSyncReset,
  clearPendingSyncReset,
  rebaseSyncReset,
} from '../utils/syncMetadata.js';
import { logWarn } from '../utils/logger.js';
import { validateLearnerBundle } from '../utils/learnerStateValidation.js';

// How long to wait after the last change before pushing to the cloud. Rapid
// edits (e.g. grading several cards in a row) keep resetting this timer so they
// coalesce into a single upsert instead of one request per keystroke/grade.
export const PUSH_DEBOUNCE_MS = 2000;

function syncPayloadSignature(payload) {
  if (Array.isArray(payload)) {
    return `[${payload.map((value) => syncPayloadSignature(value)).join(',')}]`;
  }
  if (!payload || typeof payload !== 'object') return JSON.stringify(payload);
  return `{${Object.keys(payload)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${syncPayloadSignature(payload[key])}`)
    .join(',')}}`;
}

export function cloudCommitTimestamp(committed) {
  const at = new Date(committed?.row?.updated_at || '').getTime();
  if (!Number.isFinite(at) || !Number.isFinite(Number(committed?.row?.revision))) {
    throw new Error('Cloud compare-and-set acknowledgement is incomplete');
  }
  return at;
}

export async function commitCloudWithRetry(payload, userId, options = {}) {
  const fetchCloud = options.fetchCloud || cloudFetch;
  const writeCloud = options.writeCloud || cloudUpsert;
  const attempts = Math.max(1, Number(options.attempts) || 4);
  let conflict = null;
  let initialCloud = options.initialCloud;
  const ownerSafePayload = bindPendingSyncReset(payload, userId);
  const pendingReset = assertPendingSyncResetOwner(ownerSafePayload, userId);
  const resetDomains = pendingReset?.domains || options.resetDomains || [];
  const assertCurrent = () => {
    assertCurrentStorageEpoch();
    if (options.shouldCommit && !options.shouldCommit()) {
      throw Object.assign(new Error('This sync was superseded by a newer restore or account.'), {
        code: 'SYNC_SUPERSEDED',
      });
    }
  };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    assertCurrent();
    const cloud = initialCloud === undefined ? await fetchCloud(userId) : initialCloud;
    initialCloud = undefined;
    assertCurrent();
    if (cloud?.data) validateLearnerBundle(cloud.data);
    const candidate =
      cloud?.data && resetDomains.length
        ? rebaseSyncReset(ownerSafePayload, cloud.data, resetDomains)
        : ownerSafePayload;
    const merged = cloud?.data
      ? mergeSyncPayload(candidate, cloud.data, {
          userId,
          skipPendingResetRebase: resetDomains.length > 0,
        })
      : candidate;
    const writePayload = pendingReset
      ? clearPendingSyncReset(merged, pendingReset.eventId)
      : merged;
    try {
      assertCurrent();
      const row = await writeCloud(writePayload, userId, cloud?.revision ?? null);
      return { payload: writePayload, row };
    } catch (error) {
      if (error?.code !== 'SYNC_REVISION_CONFLICT') throw error;
      conflict = error;
    }
  }
  throw conflict || new Error('Cloud changed repeatedly; sync needs retry');
}

// Persists the app state bundle to localStorage on every change and, when the
// user is signed in, debounces a push of the full payload to Supabase. The
// lastSyncedAtRef and setSyncStatus are owned by App so this hook stays in
// agreement with the login and manual-sync paths about the last sync time.
export function useCloudAutoSync({
  hydrated,
  session,
  cloudPushEnabled,
  state,
  customVerbs,
  customAdjectives,
  wordLists,
  practicePrefs,
  syncMeta,
  syncOwnerUserId = '',
  persistenceEnabled = true,
  syncGenerationRef,
  onDataRecoveryError,
  lastSyncedAtRef,
  setSyncStatus,
  applySyncPayload,
}) {
  const pushTimer = useRef(null);
  const baselineUserIdRef = useRef('');
  const applyPayloadRef = useRef(applySyncPayload);
  const acknowledgedPayloadRef = useRef(null);
  const recoveryErrorRef = useRef(onDataRecoveryError);

  useEffect(() => {
    applyPayloadRef.current = applySyncPayload;
    recoveryErrorRef.current = onDataRecoveryError;
  }, [applySyncPayload, onDataRecoveryError]);

  useEffect(() => {
    if (!hydrated || !persistenceEnabled) return;
    let active = true;
    const generation = syncGenerationRef?.current;
    const stillCurrent = () => active && generation === syncGenerationRef?.current;
    const sessionUserId = session?.user?.id || '';
    const dummySync = { enabled: !!session, userId: syncOwnerUserId };
    const syncPayload = buildSyncPayload({
      state,
      customVerbs,
      customAdjectives,
      wordLists,
      practicePrefs,
      syncMeta,
    });
    try {
      saveAll(
        syncPayload.state,
        syncPayload.customVerbs,
        syncPayload.customAdjectives,
        syncPayload.wordLists,
        dummySync,
        lastSyncedAtRef.current,
        syncPayload.practicePrefs,
        syncPayload.syncMeta,
      );
    } catch (error) {
      if (['STALE_LEARNER_SNAPSHOT', 'LEARNER_DATA_INVALID'].includes(error?.code)) {
        recoveryErrorRef.current?.(error);
      }
      setSyncStatus({
        kind: 'error',
        message: 'Changes are not saved in this browser',
        detail:
          error?.message || 'Browser storage is unavailable. Export your data before closing.',
        at: null,
      });
      return;
    }

    const canPush = !!(cloudPushEnabled && sessionUserId);
    if (!canPush) {
      baselineUserIdRef.current = '';
      acknowledgedPayloadRef.current = null;
    } else if (baselineUserIdRef.current !== sessionUserId) {
      // Opening the gate establishes the post-hydration payload as the cloud
      // baseline. The restore path already resolved or uploaded that payload,
      // so only later learner changes should schedule an automatic write.
      baselineUserIdRef.current = sessionUserId;
      acknowledgedPayloadRef.current = null;
    } else {
      const signature = syncPayloadSignature(syncPayload);
      const acknowledged = acknowledgedPayloadRef.current;
      if (acknowledged?.userId === sessionUserId && acknowledged.signature === signature) {
        acknowledgedPayloadRef.current = null;
        return () => {
          active = false;
        };
      }
      if (acknowledged?.userId !== sessionUserId) acknowledgedPayloadRef.current = null;
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(async () => {
        pushTimer.current = null;
        if (!stillCurrent()) return;
        acknowledgedPayloadRef.current = null;
        setSyncStatus((s) => ({ ...s, kind: 'syncing', message: 'Saving to cloud…' }));
        let cloudWritten = false;
        try {
          const committed = await commitCloudWithRetry(syncPayload, sessionUserId, {
            shouldCommit: stillCurrent,
          });
          if (!stillCurrent()) return;
          const now = cloudCommitTimestamp(committed);
          cloudWritten = true;
          saveAll(
            committed.payload.state,
            committed.payload.customVerbs,
            committed.payload.customAdjectives,
            committed.payload.wordLists,
            dummySync,
            now,
            committed.payload.practicePrefs,
            committed.payload.syncMeta,
          );
          if (syncPayloadSignature(committed.payload) !== signature) {
            const applied = applyPayloadRef.current?.(committed.payload);
            acknowledgedPayloadRef.current = {
              userId: sessionUserId,
              signature: syncPayloadSignature(applied?.payload || committed.payload),
            };
          }
          lastSyncedAtRef.current = now;
          setSyncStatus({ kind: 'ok', message: 'Saved to cloud', at: now });
        } catch (e) {
          if (!stillCurrent()) return;
          if (['STALE_LEARNER_SNAPSHOT', 'LEARNER_DATA_INVALID'].includes(e?.code)) {
            recoveryErrorRef.current?.(e);
          }
          logWarn(e, { source: 'useCloudAutoSync.push' });
          setSyncStatus({
            kind: 'error',
            message: cloudWritten
              ? 'Cloud saved; browser storage needs retry'
              : 'Saved locally; cloud sync needs retry',
            detail: e.message || 'Push failed',
            at: null,
          });
        }
      }, PUSH_DEBOUNCE_MS);
    }

    return () => {
      active = false;
      if (pushTimer.current) {
        clearTimeout(pushTimer.current);
        pushTimer.current = null;
      }
    };
  }, [
    state,
    customVerbs,
    customAdjectives,
    wordLists,
    session,
    cloudPushEnabled,
    practicePrefs,
    syncMeta,
    syncOwnerUserId,
    hydrated,
    persistenceEnabled,
    syncGenerationRef,
    lastSyncedAtRef,
    setSyncStatus,
  ]);
}
