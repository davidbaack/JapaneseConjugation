import { STORAGE_KEY } from '../data/defaults.js';
import { getProgressWriterId } from './progressContributions.js';
import { progressEpoch } from './syncMetadata.js';
import { mergeSyncPayload } from './storage.js';
import { learnerDataError, validateLearnerBundle } from './learnerStateValidation.js';

const PREFIX = `${STORAGE_KEY}:pending:`;
let stagingSequence = 0;

export function serializeSavedRecoveryData() {
  const pending = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(PREFIX)) pending.push({ key, raw: localStorage.getItem(key) });
  }
  return JSON.stringify(
    {
      format: 'katachiya-saved-recovery',
      version: 1,
      exportedAt: new Date().toISOString(),
      saved: localStorage.getItem(STORAGE_KEY),
      pending,
    },
    null,
    2,
  );
}

export function sameLocalLineage(left, right) {
  return (
    String(left?.syncConfig?.userId || '') === String(right?.syncConfig?.userId || '') &&
    progressEpoch(left?.syncMeta) === progressEpoch(right?.syncMeta)
  );
}

export function stageLocalSnapshot(parts) {
  // A small number of full snapshots protects an answer if its tab closes
  // while waiting for the shared write lock. Never stage credentials.
  const raw = JSON.stringify({
    state: parts.state,
    customVerbs: parts.customVerbs,
    customAdjectives: parts.customAdjectives,
    wordLists: parts.wordLists,
    practicePrefs: parts.practicePrefs,
    syncMeta: parts.syncMeta,
    syncConfig: parts.syncConfig,
    lastSyncedAt: parts.lastSyncedAt,
  });
  const key = `${PREFIX}${getProgressWriterId()}:${++stagingSequence}`;
  localStorage.setItem(key, raw);
  return { key, raw };
}

export function clearConsumedStagedSnapshots(consumed) {
  // Stage keys are immutable and unique. A later answer gets a different key,
  // so clearing these exact committed entries cannot erase a newer stage.
  for (const staged of consumed) {
    if (staged.key.startsWith(PREFIX) && localStorage.getItem(staged.key) === staged.raw)
      localStorage.removeItem(staged.key);
  }
}

export function mergeStagedLocalSnapshots(base, consumed = []) {
  let merged = base;
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  for (const key of keys.sort()) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    let staged;
    try {
      staged = JSON.parse(raw);
    } catch {
      throw learnerDataError(
        'A pending learner save needs recovery; the saved copy has been preserved.',
      );
    }
    if (merged && !sameLocalLineage(merged, staged)) continue;
    validateLearnerBundle(staged);
    merged = merged
      ? {
          ...merged,
          ...mergeSyncPayload(merged, staged, {
            userId: merged.syncConfig?.userId || '',
            skipPendingResetRebase: true,
          }),
        }
      : staged;
    consumed.push({ key, raw });
  }
  return merged;
}
