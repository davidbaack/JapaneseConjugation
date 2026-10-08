import { useEffect, useLayoutEffect, useRef } from 'react';
import { cloudFetch, cloudUpsert, buildSyncPayload, mergeSyncPayload } from '../utils/storage.js';
import {
  assertPendingSyncResetOwner,
  bindPendingSyncReset,
  clearPendingSyncReset,
  rebaseSyncReset,
} from '../utils/syncMetadata.js';
import { assertCompatibleLocalSnapshot, persistLocalSnapshot } from '../utils/localPersistence.js';
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
    if (!options.resetDomains?.length) assertCompatibleLocalSnapshot(payload, userId);
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
    if (writePayload.state?.schemaVersion) validateLearnerBundle(writePayload);
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
  getCurrentSyncPayload,
  replacementEpochRef,
  forceCloudPushRef,
}) {
  const pushTimer = useRef(null);
  const baselineUserIdRef = useRef('');
  const applyPayloadRef = useRef(applySyncPayload);
  const currentPayloadRef = useRef(getCurrentSyncPayload);
  const acknowledgedPayloadRef = useRef(null);
  const recoveryErrorRef = useRef(onDataRecoveryError);
  useLayoutEffect(() => {
    applyPayloadRef.current = applySyncPayload;
    currentPayloadRef.current = getCurrentSyncPayload;
    recoveryErrorRef.current = onDataRecoveryError;
  }, [applySyncPayload, getCurrentSyncPayload, onDataRecoveryError]);

  useEffect(() => {
    if (!hydrated || !persistenceEnabled) return;
    let active = true;
    const generation = syncGenerationRef?.current;
    const generationIsCurrent = () =>
      generation === syncGenerationRef?.current &&
      (currentPayloadRef.current?.()?.localOwnerUserId ?? syncOwnerUserId) === syncOwnerUserId;
    const stillCurrent = () => active && generationIsCurrent();
    const sessionUserId = session?.user?.id || '';
    const syncConfig = { enabled: !!session, userId: syncOwnerUserId };
    const captured = buildSyncPayload(
      currentPayloadRef.current?.() || {
        state,
        customVerbs,
        customAdjectives,
        wordLists,
        practicePrefs,
        syncMeta,
      },
    );
    const canPush = !!(cloudPushEnabled && sessionUserId);
    const establishesBaseline = canPush && baselineUserIdRef.current !== sessionUserId;
    if (!canPush) {
      baselineUserIdRef.current = '';
      acknowledgedPayloadRef.current = null;
    } else if (establishesBaseline) {
      baselineUserIdRef.current = sessionUserId;
      acknowledgedPayloadRef.current = null;
    }

    const persist = (payload, at = lastSyncedAtRef.current) => {
      const replacement = replacementEpochRef?.current;
      return persistLocalSnapshot(
        { ...payload, syncConfig, lastSyncedAt: at },
        {
          shouldCommit: generationIsCurrent,
          ...(replacement
            ? {
                replace: true,
                expectedEpoch: replacement.from,
                expectedOwnerUserId: replacement.owner,
              }
            : {}),
        },
      ).then((saved) => {
        if (replacement && replacementEpochRef.current === replacement)
          replacementEpochRef.current = null;
        return saved;
      });
    };
    const reportFailure = (error, cloudWritten = false) => {
      if (!stillCurrent() || error?.code === 'SYNC_SUPERSEDED') return;
      if (['STALE_LEARNER_SNAPSHOT', 'LEARNER_DATA_INVALID'].includes(error?.code))
        recoveryErrorRef.current?.(error);
      setSyncStatus({
        kind: 'error',
        message: cloudWritten
          ? 'Cloud saved; browser storage needs retry'
          : 'Changes are not saved in this browser',
        detail: error?.message || 'Export your data before closing.',
        at: null,
      });
    };

    // Staging happens synchronously inside persistLocalSnapshot, before waiting
    // for the cross-tab write lock. A closed tab's answer remains recoverable.
    persist(captured)
      .then((saved) => {
        if (!stillCurrent()) return;
        const prepared = buildSyncPayload(saved);
        if (syncPayloadSignature(prepared) !== syncPayloadSignature(captured)) {
          applyPayloadRef.current?.(prepared);
          // The resulting render owns the next push; do not send an older
          // captured candidate while the merged local snapshot is being applied.
          if (currentPayloadRef.current) return;
        }
        if (!canPush || (establishesBaseline && !forceCloudPushRef?.current)) return;
        if (forceCloudPushRef) forceCloudPushRef.current = false;
        const signature = syncPayloadSignature(prepared);
        if (
          acknowledgedPayloadRef.current?.userId === sessionUserId &&
          acknowledgedPayloadRef.current.signature === signature
        )
          return;
        if (pushTimer.current) clearTimeout(pushTimer.current);
        pushTimer.current = setTimeout(async () => {
          pushTimer.current = null;
          if (!stillCurrent()) return;
          setSyncStatus((previous) => ({
            ...previous,
            kind: 'syncing',
            message: 'Saving to cloud…',
          }));
          let cloudWritten = false;
          try {
            const latest = () => currentPayloadRef.current?.() || prepared;
            let candidate = latest();
            for (let attempt = 0; attempt < 4; attempt += 1) {
              const committed = await commitCloudWithRetry(candidate, sessionUserId, {
                shouldCommit: stillCurrent,
              });
              if (!stillCurrent()) return;
              cloudWritten = true;
              const now = cloudCommitTimestamp(committed);
              const newest = latest();
              const acknowledged = currentPayloadRef.current
                ? mergeSyncPayload(newest, committed.payload, {
                    userId: sessionUserId,
                    skipPendingResetRebase: true,
                  })
                : committed.payload;
              const durable = buildSyncPayload(await persist(acknowledged, now));
              if (!stillCurrent()) return;
              applyPayloadRef.current?.(durable);
              lastSyncedAtRef.current = now;
              acknowledgedPayloadRef.current = {
                userId: sessionUserId,
                signature: syncPayloadSignature(committed.payload),
              };
              if (syncPayloadSignature(durable) === syncPayloadSignature(committed.payload)) {
                setSyncStatus({ kind: 'ok', message: 'Saved to cloud', at: now });
                return;
              }
              candidate = durable;
            }
            throw new Error('New answers are saved locally. Use Sync now to finish cloud sync.');
          } catch (error) {
            if (!stillCurrent() || error?.code === 'SYNC_SUPERSEDED') return;
            if (['STALE_LEARNER_SNAPSHOT', 'LEARNER_DATA_INVALID'].includes(error?.code))
              recoveryErrorRef.current?.(error);
            logWarn(error, { source: 'useCloudAutoSync.push' });
            setSyncStatus({
              kind: 'error',
              message: cloudWritten
                ? 'New changes saved locally; cloud sync needs retry'
                : 'Saved locally; cloud sync needs retry',
              detail: error.message || 'Push failed',
              at: null,
            });
          }
        }, PUSH_DEBOUNCE_MS);
      })
      .catch(reportFailure);

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
    replacementEpochRef,
    forceCloudPushRef,
  ]);
}
