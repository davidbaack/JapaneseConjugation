import { STORAGE_KEY } from '../data/defaults.js';
import { adoptSyncMetadata, progressEpoch } from './syncMetadata.js';
import { acceptCurrentStorageSnapshot, mergeSyncPayload, saveAll } from './storage.js';
import { validateLearnerBundle } from './learnerStateValidation.js';
import {
  clearConsumedStagedSnapshots,
  mergeStagedLocalSnapshots,
  sameLocalLineage,
  stageLocalSnapshot,
} from './localJournal.js';
export { sameLocalLineage } from './localJournal.js';

const LOCK_NAME = `${STORAGE_KEY}:write`;
let fallbackQueue = Promise.resolve();
let lockDatabase;

async function withIndexedDbLock(action) {
  if (!lockDatabase) {
    lockDatabase = new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(`${STORAGE_KEY}:coordination`, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('writes');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        lockDatabase = null;
        reject(request.error);
      };
    });
  }
  const database = await lockDatabase;
  return new Promise((resolve, reject) => {
    // Read/write transactions on one store serialize across documents. Keep
    // the learner write synchronous inside the request callback, before this
    // transaction releases the mutex. No learner data is stored in this DB.
    const transaction = database.transaction('writes', 'readwrite');
    let result;
    let failure;
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(failure || transaction.error);
    transaction.onerror = () => reject(transaction.error);
    const request = transaction.objectStore('writes').put(1, 'mutex');
    request.onsuccess = () => {
      try {
        result = action();
        if (result?.then) throw new Error('A coordinated learner write must finish synchronously.');
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
  });
}

// Web Locks serialize independent tabs as well as one tab's queued saves.
// IndexedDB transactions provide the same serialization without Web Locks.
export function withLearnerStorageLock(action) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(LOCK_NAME, action);
  }
  if (typeof indexedDB !== 'undefined') return withIndexedDbLock(action);
  if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test')
    return Promise.reject(
      new Error('Safe browser storage is unavailable. Export your data before closing this page.'),
    );
  // Non-browser test adapters still get a serial queue.
  const result = fallbackQueue.then(action, action);
  fallbackQueue = result.catch(() => {});
  return result;
}

function owner(payload) {
  return String(payload?.syncConfig?.userId || '');
}

function staleSnapshot() {
  return Object.assign(
    new Error(
      'Learner data was replaced or its account changed in another tab. Reload before continuing; newer saved data is preserved.',
    ),
    { code: 'STALE_LEARNER_SNAPSHOT' },
  );
}

export function readStoredLearnerSnapshot() {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  validateLearnerBundle(parsed);
  return parsed;
}

export function assertCompatibleLocalSnapshot(payload, ownerUserId = '') {
  const stored = readStoredLearnerSnapshot();
  if (stored && !sameLocalLineage({ ...payload, syncConfig: { userId: ownerUserId } }, stored))
    throw staleSnapshot();
}

// Called inside the shared lock. Merge every observed compatible contribution
// before saving; an explicit replacement must name the lineage it replaces.
export function persistLocalSnapshotLocked(parts, options = {}) {
  if (options.shouldCommit && !options.shouldCommit())
    throw Object.assign(new Error('A newer operation superseded this save.'), {
      code: 'SYNC_SUPERSEDED',
    });
  const stored = readStoredLearnerSnapshot();
  let payload = parts;
  if (stored) {
    if (sameLocalLineage(parts, stored)) {
      payload = {
        ...parts,
        ...mergeSyncPayload(parts, stored, { userId: owner(parts), skipPendingResetRebase: true }),
      };
    } else if (
      !options.replace ||
      (options.expectedOwnerUserId !== undefined &&
        owner(stored) !== options.expectedOwnerUserId) ||
      (options.expectedEpoch !== undefined &&
        progressEpoch(stored.syncMeta) !== options.expectedEpoch)
    ) {
      throw staleSnapshot();
    }
  }
  const consumed = [];
  payload = mergeStagedLocalSnapshots(payload, consumed);
  acceptCurrentStorageSnapshot();
  const raw = saveAll(
    payload.state,
    payload.customVerbs,
    payload.customAdjectives,
    payload.wordLists,
    parts.syncConfig,
    parts.lastSyncedAt,
    payload.practicePrefs,
    payload.syncMeta,
  );
  if (typeof raw === 'string' && localStorage.getItem(STORAGE_KEY) !== raw)
    throw new Error('The learner save could not be verified. Pending answers have been preserved.');
  clearConsumedStagedSnapshots(consumed);
  return payload;
}

export function persistLocalSnapshot(parts, options = {}) {
  parts = adoptSyncMetadata(parts, parts.syncMeta?.deviceId);
  if (options.shouldCommit && !options.shouldCommit())
    return Promise.reject(
      Object.assign(new Error('A newer operation superseded this save.'), {
        code: 'SYNC_SUPERSEDED',
      }),
    );
  try {
    stageLocalSnapshot(parts);
  } catch (error) {
    return Promise.reject(error);
  }
  return withLearnerStorageLock(() => {
    const payload = persistLocalSnapshotLocked(parts, options);
    return payload;
  });
}
