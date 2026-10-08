import { defaultState, mergeState } from './storage.js';
import { mergePracticePrefs } from './display.js';
import {
  isRecord,
  validateBackupContent,
  validateLearnerState,
  validateSafeJson,
  validateSnapshotShape,
  validatePreservedSnapshot,
} from './learnerStateValidation.js';

export const BACKUP_FORMAT = 'jp-verb-srs';
export const BACKUP_VERSION = 43;
const LEGACY_FIELDS = [
  'cards',
  'enabledTypes',
  'practiceSelection',
  'practiceStats',
  'verbStats',
  'mistakes',
  'shadow',
  'ambient',
  'game',
  'onbin',
  'meaning',
  'mock',
  'reader',
  'production',
  'guide',
  'reference',
  'classify',
];
const ENVELOPE_FIELDS = [
  'format',
  'version',
  'exportedAt',
  'state',
  'customVerbs',
  'customAdjectives',
  'wordLists',
  'practicePrefs',
];

// The whole state is intentional: a new learning area must not silently vanish
// from backups. Explicit envelope fields exclude credentials, sync and caches.
export function buildBackup({
  state,
  customVerbs = [],
  customAdjectives = [],
  wordLists = [],
  practicePrefs = {},
}) {
  return JSON.parse(
    JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      state,
      customVerbs,
      customAdjectives,
      wordLists,
      practicePrefs: mergePracticePrefs(practicePrefs),
    }),
  );
}

export function serializeBackup(parts) {
  return JSON.stringify(buildBackup(parts));
}

export function parseBackup(text) {
  let data;
  try {
    if (String(text).length > 20 * 1024 * 1024)
      throw new Error('Backup exceeds the 20 MB import limit.');
    data = JSON.parse(String(text).trim());
  } catch (error) {
    return {
      ok: false,
      error: error.message.includes('limit')
        ? error.message
        : 'Could not read JSON. Paste the complete backup file.',
    };
  }
  try {
    validateSafeJson(data);
    if (!isRecord(data) || data.format !== BACKUP_FORMAT)
      throw new Error('This does not look like a JapaneseConjugation backup.');
    if (![42, BACKUP_VERSION].includes(data.version))
      throw new Error(
        `Unsupported backup version ${data.version ?? '(missing)'}. Your data has not changed.`,
      );
    if (!isRecord(data.state) || !isRecord(data.state.cards))
      throw new Error('Backup is missing card data.');
    if (typeof data.exportedAt !== 'string' || !Number.isFinite(Date.parse(data.exportedAt)))
      throw new Error('Backup has no valid export date.');
    if (Object.keys(data).some((key) => !ENVELOPE_FIELDS.includes(key)))
      throw new Error('Backup contains unsupported account or metadata fields.');
    const warnings = [];
    if (data.version === 42) {
      if (
        Object.hasOwn(data.state, 'schemaVersion') ||
        Object.keys(data.state).some((key) => !LEGACY_FIELDS.includes(key)) ||
        LEGACY_FIELDS.some((key) => !Object.hasOwn(data.state, key))
      )
        throw new Error('This is not a recognized app-generated version 42 backup.');
      const missing = Object.keys(defaultState()).filter(
        (key) => !LEGACY_FIELDS.includes(key) && key !== 'schemaVersion',
      );
      const labels = {
        retryQueue: 'retry queue',
        register: 'register practice',
        readiness: 'readiness estimates',
        transformation: 'Transform progress',
        minimalPairs: 'Minimal Pair progress',
        reviewScope: 'practice exclusions and recommendations',
        weakness: 'weakness history',
        session: 'session totals',
      };
      warnings.push(
        `Version 42 did not export these areas: ${missing.map((key) => labels[key] || key).join(', ')}. They will start empty; this file cannot recover their earlier progress.`,
      );
      data.state = { ...defaultState(), ...data.state, schemaVersion: 4 };
    }
    validateLearnerState(data.state, { allowMissingFields: false });
    validateSnapshotShape(data.state, defaultState());
    validateBackupContent(data);
    if (data.version === BACKUP_VERSION)
      validateSnapshotShape(data.practicePrefs, mergePracticePrefs({}), 'practicePrefs');
    const restoredState = mergeState(data.state);
    validatePreservedSnapshot(data.state, restoredState);
    data = {
      ...data,
      state: restoredState,
      practicePrefs: mergePracticePrefs(data.practicePrefs),
    };
    return {
      ok: true,
      data,
      warnings,
      summary: {
        cards: Object.keys(data.state.cards).length,
        practiceAttempts: data.state.practiceStats.lifetime.attempted,
        guideAttempts: data.state.guide.attempted,
        customWords: data.customVerbs.length + data.customAdjectives.length,
        lists: data.wordLists.length,
        exportedAt: data.exportedAt,
      },
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
