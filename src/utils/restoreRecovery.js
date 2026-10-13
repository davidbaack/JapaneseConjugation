import { serializeSavedRecoveryData } from './savedRecovery.js';
import { isRecord } from './persistenceContracts.js';

/** @param {unknown} value */
function assertRecoveryJson(value) {
  let nodes = 0;
  /** @param {unknown} item @param {number} depth */
  function visit(item, depth) {
    if (++nodes > 500000 || depth > 40)
      throw new Error('Current learner data must be bounded JSON data for lossless recovery.');
    if (item === null || ['string', 'boolean'].includes(typeof item)) return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (!Array.isArray(item) && !isRecord(item))
      throw new Error(
        'Current learner data contains a value that cannot be preserved as JSON data.',
      );
    for (const child of Object.values(item)) visit(child, depth + 1);
  }
  visit(value, 0);
}

/**
 * Restore-only capture stays lazy. The standalone crash reader retains its
 * minimal dependency graph; its saved/pending bytes are copied without parsing
 * learner data or touching auth storage. Reject lossy current values first.
 * @param {Record<string, unknown>} currentSnapshot
 */
export function serializeRestoreRecoveryData(currentSnapshot) {
  assertRecoveryJson(currentSnapshot);
  const recovery = JSON.parse(serializeSavedRecoveryData());
  return JSON.stringify({ ...recovery, current: currentSnapshot }, null, 2);
}
