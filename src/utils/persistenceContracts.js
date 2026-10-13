/**
 * Strict leaf contracts for persistence boundaries. Nested learner domains and
 * sync metadata stay unknown here; their existing validators/normalizers own
 * those schemas. No wire-format fields or runtime brands are added.
 *
 * @typedef {Record<string, unknown> & { schemaVersion: 4 }} LearnerStateSnapshot
 * @typedef {{ dict: string, reading: string, meaning: string, group: string } & Record<string, unknown>} CustomWordSnapshot
 * @typedef {{ id: string, name: string, wordKeys: string[] } & Record<string, unknown>} WordListSnapshot
 * @typedef {Record<string, unknown> & {
 *   state: LearnerStateSnapshot,
 *   customVerbs?: CustomWordSnapshot[],
 *   customAdjectives?: CustomWordSnapshot[],
 *   wordLists?: WordListSnapshot[],
 *   practicePrefs?: Record<string, unknown>
 * }} LearnerSnapshot
 * @typedef {(source: unknown) => void} LearnerSnapshotValidator
 * @typedef {number | null} CloudRevision
 * @typedef {{ data: unknown, updated_at: unknown, revision: number }} CloudCommitResult
 * @typedef {Pick<Storage, 'getItem'>} SnapshotStorage
 * @typedef {{ hydrated: boolean, inFlight: boolean, staleTab: boolean, canWrite: () => boolean }} RestoreAdmission
 * @typedef {{ generation: number, ownerUserId: string }} PersistenceOperation
 */

/**
 * Preserve the existing plain-object definition while narrowing unknown input.
 * The intersection retains more specific types for already typed callers.
 * @template T
 * @param {T} value
 * @returns {value is T & Record<string, unknown>}
 */
export function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

/** @param {string} raw @returns {unknown} */
export function parseSnapshotJson(raw) {
  return JSON.parse(raw);
}

/**
 * The supplied validator must be validateLearnerBundle (or an adapter that
 * calls it). This single assertion bridges that runtime schema to the minimal
 * static contract, only after the existing validator returns successfully.
 * Optional legacy fields remain optional; metadata is deliberately unknown.
 * @param {unknown} source
 * @param {LearnerSnapshotValidator} validate
 * @returns {LearnerSnapshot}
 */
export function admitLearnerSnapshot(source, validate) {
  validate(source);
  return /** @type {LearnerSnapshot} */ (source);
}

/**
 * Track exact durable bytes separately for each storage adapter. A missing
 * baseline permits first use; an accepted null baseline still detects a write.
 */
export function createStorageEpochTracker() {
  /** @type {WeakMap<SnapshotStorage, string | null>} */
  const baselines = new WeakMap();
  return {
    /** @param {SnapshotStorage} storage @param {string | null} raw */
    accept(storage, raw) {
      baselines.set(storage, raw);
    },
    /** @param {SnapshotStorage} storage @param {string} key */
    assertCurrent(storage, key) {
      if (baselines.has(storage) && baselines.get(storage) !== storage.getItem(key)) {
        throw Object.assign(
          new Error(
            'Learner data changed in another tab. Reload before saving or restoring; the newer saved data is preserved.',
          ),
          { code: 'STALE_LEARNER_SNAPSHOT' },
        );
      }
    },
  };
}

/**
 * null means create-if-absent; undefined means the caller omitted CAS safety.
 * Numeric constraints remain the server's responsibility, as before.
 * @param {CloudRevision | undefined} revision
 * @returns {CloudRevision}
 */
export function requireCloudRevision(revision) {
  if (revision === undefined) throw new Error('Cloud compare-and-set revision is required');
  return revision;
}

/** @param {string} actualUserId @param {string} expectedUserId */
export function assertExpectedCloudOwner(actualUserId, expectedUserId) {
  if (expectedUserId && actualUserId !== expectedUserId)
    throw new Error('Authenticated user changed before cloud sync completed');
}

/** @param {unknown} payload @param {string} userId @param {CloudRevision} revision */
export function cloudCasArguments(payload, userId, revision) {
  return { expected_revision: revision, next_data: payload, expected_user_id: userId };
}

/**
 * An RPC acknowledgement proves a revision, not learner-data validity. Data
 * and timestamps stay unknown until their existing downstream admission.
 * @param {unknown} result
 * @returns {CloudCommitResult}
 */
export function readCloudCommitResult(result) {
  const row = Array.isArray(result) ? /** @type {unknown} */ (result[0]) : result;
  if (
    row === null ||
    (typeof row !== 'object' && typeof row !== 'function') ||
    !('sync_revision' in row) ||
    typeof row.sync_revision !== 'number'
  )
    throw new Error('Cloud compare-and-set did not return a revision');
  return {
    data: 'sync_data' in row ? row.sync_data : undefined,
    updated_at: 'sync_updated_at' in row ? row.sync_updated_at : undefined,
    revision: row.sync_revision,
  };
}

/** @param {RestoreAdmission} admission */
export function assertRestoreCanStart(admission) {
  if (admission.staleTab || !admission.canWrite())
    throw new Error('Learner data changed in another tab. Reload before restoring.');
  if (!admission.hydrated || admission.inFlight)
    throw new Error('Wait for the current restore to finish.');
}

/**
 * Recheck after lazy imports yield to auth, storage, or another confirmation.
 * Keep the preparation failure ahead of the stale-tab check, as before.
 * @param {RestoreAdmission} admission
 * @param {number} expectedGeneration
 * @param {number} currentGeneration
 */
export function assertRestorePreparationCurrent(admission, expectedGeneration, currentGeneration) {
  if (!admission.hydrated || admission.inFlight || expectedGeneration !== currentGeneration)
    throw new Error('Learner data changed while preparing this restore. Review the backup again.');
  if (admission.staleTab || !admission.canWrite())
    throw new Error('Learner data changed in another tab. Reload before restoring.');
}

/**
 * A server response cannot own a newer generation or a different account.
 * @param {PersistenceOperation} operation
 * @param {PersistenceOperation & { staleTab: boolean }} current
 */
export function ownsPersistenceOperation(operation, current) {
  return (
    operation.generation === current.generation &&
    operation.ownerUserId === current.ownerUserId &&
    !current.staleTab
  );
}

/** @param {string} committedRaw @param {string | null} currentRaw @param {unknown} cause */
export function assertRestoreRollbackOwner(committedRaw, currentRaw, cause) {
  if (currentRaw !== committedRaw)
    throw new Error('Another tab changed saved data during verification.', { cause });
}
