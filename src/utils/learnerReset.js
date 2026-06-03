import { DEFAULT_PREFS } from '../data/defaults.js';
import { buildSyncPayload, defaultState } from './storage.js';
import { mergePracticePrefs } from './display.js';

export const LEARNER_RESET_KINDS = ['progress', 'settings', 'custom-content', 'factory'];

export function buildLearnerResetPayload(parts = {}, kind) {
  if (!LEARNER_RESET_KINDS.includes(kind)) {
    throw new Error(`Unknown learner reset kind: ${kind}`);
  }

  const current = buildSyncPayload(parts);
  const base = defaultState();

  if (kind === 'factory') {
    return buildSyncPayload({
      state: base,
      customVerbs: [],
      customAdjectives: [],
      wordLists: [],
      practicePrefs: DEFAULT_PREFS,
    });
  }

  if (kind === 'progress') {
    return {
      ...current,
      state: {
        ...base,
        enabledTypes: Array.isArray(current.state.enabledTypes)
          ? [...current.state.enabledTypes]
          : [...base.enabledTypes],
        reviewScope: current.state.reviewScope || base.reviewScope,
      },
    };
  }

  if (kind === 'settings') {
    return {
      ...current,
      state: {
        ...current.state,
        enabledTypes: [...base.enabledTypes],
      },
      practicePrefs: mergePracticePrefs(DEFAULT_PREFS),
    };
  }

  return {
    ...current,
    customVerbs: [],
    customAdjectives: [],
    wordLists: [],
    practicePrefs: mergePracticePrefs({
      ...current.practicePrefs,
      wordListIds: [],
    }),
  };
}

export async function commitLearnerResetPayload({
  payload,
  session,
  writeCloud,
  applyLocal,
  saveLocal,
  now = Date.now,
} = {}) {
  if (!payload) throw new Error('Missing reset payload');

  const writesCloud = !!(session?.user && writeCloud);
  let syncedAt = null;
  if (writesCloud) {
    await writeCloud(payload);
    syncedAt = now();
  }

  if (saveLocal) saveLocal(payload, syncedAt);
  if (applyLocal) applyLocal(payload, syncedAt);

  return { cloud: writesCloud, at: syncedAt };
}
