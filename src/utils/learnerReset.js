import { DEFAULT_PREFS } from '../data/defaults.js';
import { buildSyncPayload, defaultState } from './storage.js';
import { mergePracticePrefs } from './display.js';
import {
  adoptSyncMetadata,
  getLocalSyncDeviceId,
  resetDomainsForKind,
  stampSyncChanges,
} from './syncMetadata.js';

export const LEARNER_RESET_KINDS = ['progress', 'settings', 'custom-content', 'factory'];

function withResetMetadata(current, payload, kind, options = {}) {
  return {
    ...payload,
    syncMeta: stampSyncChanges(current.syncMeta, current, payload, {
      resetDomains: resetDomainsForKind(kind),
      pendingResetOwnerUserId: options.ownerUserId,
    }),
  };
}

export function buildLearnerResetPayload(parts = {}, kind, options = {}) {
  if (!LEARNER_RESET_KINDS.includes(kind)) {
    throw new Error(`Unknown learner reset kind: ${kind}`);
  }

  const current = adoptSyncMetadata(
    buildSyncPayload(parts),
    parts.syncMeta?.deviceId || getLocalSyncDeviceId(),
  );
  const base = defaultState();

  if (kind === 'factory') {
    return withResetMetadata(
      current,
      buildSyncPayload({
        state: base,
        customVerbs: [],
        customAdjectives: [],
        wordLists: [],
        practicePrefs: DEFAULT_PREFS,
      }),
      kind,
      options,
    );
  }

  if (kind === 'progress') {
    return withResetMetadata(
      current,
      {
        ...current,
        state: {
          ...base,
          enabledTypes: Array.isArray(current.state.enabledTypes)
            ? [...current.state.enabledTypes]
            : [...base.enabledTypes],
          practiceScope: current.state.practiceScope || base.practiceScope,
          reviewScope: current.state.reviewScope || base.reviewScope,
        },
      },
      kind,
      options,
    );
  }

  if (kind === 'settings') {
    return withResetMetadata(
      current,
      {
        ...current,
        state: {
          ...current.state,
          practiceScope: base.practiceScope,
          enabledTypes: [...base.enabledTypes],
        },
        practicePrefs: mergePracticePrefs(DEFAULT_PREFS),
      },
      kind,
      options,
    );
  }

  return withResetMetadata(
    current,
    {
      ...current,
      customVerbs: [],
      customAdjectives: [],
      wordLists: [],
      practicePrefs: mergePracticePrefs({
        ...current.practicePrefs,
        wordListIds: [],
      }),
    },
    kind,
    options,
  );
}

/**
 * @param {{
 *   payload?: any,
 *   kind?: string,
 *   session?: any,
 *   writeCloud?: ((payload: any, options?: any) => Promise<any>) | null,
 *   shouldCommit?: (() => boolean) | null,
 *   applyLocal?: ((payload: any, syncedAt: number | null) => void) | null,
 *   saveLocal?: ((payload: any, syncedAt: number | null) => void) | null,
 * }} [options]
 */
export async function commitLearnerResetPayload({
  payload,
  kind,
  session,
  writeCloud,
  shouldCommit,
  applyLocal,
  saveLocal,
} = {}) {
  if (!payload) throw new Error('Missing reset payload');

  const writesCloud = !!(session?.user && writeCloud);
  let syncedAt = null;
  let committedPayload = payload;
  if (writesCloud) {
    const commitOptions = LEARNER_RESET_KINDS.includes(kind)
      ? { resetDomains: resetDomainsForKind(kind) }
      : undefined;
    const committed = commitOptions
      ? await writeCloud(payload, commitOptions)
      : await writeCloud(payload);
    if (shouldCommit && !shouldCommit()) return { cloud: true, at: null, stale: true };
    committedPayload = committed?.payload || payload;
    syncedAt = new Date(committed?.row?.updated_at || '').getTime();
    if (!Number.isFinite(syncedAt) || !Number.isFinite(Number(committed?.row?.revision))) {
      throw new Error('Cloud compare-and-set acknowledgement is incomplete');
    }
  }

  if (saveLocal) saveLocal(committedPayload, syncedAt);
  if (applyLocal) applyLocal(committedPayload, syncedAt);

  return { cloud: writesCloud, at: syncedAt };
}
