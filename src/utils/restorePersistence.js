import { STORAGE_KEY } from '../data/defaults.js';
import { acceptCurrentStorageSnapshot, assertCurrentStorageEpoch, saveAll } from './storage.js';

const RECOVERY_PREFIX = 'jp-backup-recovery:';
export { getRecoveryBackup } from './storage.js';

// Stage a unique recovery copy, then switch the entire learner bundle and its
// recovery pointer with a single atomic localStorage write. A failed stage or
// commit never replaces the previous recovery pointer.
export function persistBackupRestore(parts, beforeBackupJson) {
  assertCurrentStorageEpoch();
  const beforeRaw = localStorage.getItem(STORAGE_KEY);
  const recoveryBackup = beforeBackupJson ?? beforeRaw;
  if (typeof recoveryBackup !== 'string')
    throw new Error('Could not secure a recovery copy. Your saved data has not changed.');
  const recoveryBackupKey = `${RECOVERY_PREFIX}${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  let committed = false;
  let committedRaw;
  try {
    localStorage.setItem(recoveryBackupKey, recoveryBackup);
    if (localStorage.getItem(recoveryBackupKey) !== recoveryBackup)
      throw new Error('Could not verify the recovery copy.');
    const payload = saveAll(
      parts.state,
      parts.customVerbs,
      parts.customAdjectives,
      parts.wordLists,
      parts.syncConfig,
      parts.lastSyncedAt,
      parts.practicePrefs,
      parts.syncMeta,
      { recoveryBackupKey },
    );
    committed = true;
    committedRaw = payload;
    if (localStorage.getItem(STORAGE_KEY) !== payload)
      throw new Error('Could not verify the restored learner data.');
    // Best effort: only the previously referenced recovery slot is obsolete.
    try {
      const oldKey = JSON.parse(beforeRaw || '{}').recoveryBackupKey;
      if (
        typeof oldKey === 'string' &&
        oldKey.startsWith(RECOVERY_PREFIX) &&
        oldKey !== recoveryBackupKey
      )
        localStorage.removeItem(oldKey);
    } catch {
      /* Retaining an older recovery copy is safe. */
    }
    return { recoveryBackupKey, recoveryBackup, payload: JSON.parse(payload) };
  } catch (error) {
    if (committed) {
      try {
        if (localStorage.getItem(STORAGE_KEY) !== committedRaw) {
          throw new Error('Another tab changed saved data during verification.', { cause: error });
        }
        if (beforeRaw === null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, beforeRaw);
        acceptCurrentStorageSnapshot();
      } catch (rollbackError) {
        throw Object.assign(
          new Error(
            'Storage stopped responding after the restore was written. Reload Settings before trying again; the recovery copy is retained.',
            { cause: rollbackError },
          ),
          { restoreMayHaveCommitted: true },
        );
      }
    }
    try {
      localStorage.removeItem(recoveryBackupKey);
    } catch {
      /* Keep the copy if storage is unavailable. */
    }
    throw error;
  }
}
