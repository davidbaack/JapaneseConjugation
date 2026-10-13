import { describe, expect, it, vi } from 'vitest';
import {
  admitLearnerSnapshot,
  assertExpectedCloudOwner,
  assertRestoreCanStart,
  assertRestorePreparationCurrent,
  assertRestoreRollbackOwner,
  cloudCasArguments,
  createStorageEpochTracker,
  ownsPersistenceOperation,
  parseSnapshotJson,
  readCloudCommitResult,
  requireCloudRevision,
} from '../utils/persistenceContracts.js';
import { validateLearnerBundle } from '../utils/learnerStateValidation.js';
import { snapshotStudyWord } from '../utils/studySnapshot.js';
import { makeLearnerSnapshot } from './fixtures/learnerSnapshot.js';

describe('strict persistence boundary contracts', () => {
  it('admits the original snapshot only after the existing schema validator accepts it', () => {
    const snapshot = makeLearnerSnapshot();
    const validate = vi.fn(validateLearnerBundle);
    expect(admitLearnerSnapshot(snapshot, validate)).toBe(snapshot);
    expect(validate).toHaveBeenCalledExactlyOnceWith(snapshot);
    const parsed = parseSnapshotJson(JSON.stringify(snapshot));
    expect(admitLearnerSnapshot(parsed, validateLearnerBundle)).toEqual(snapshot);
    expect(() =>
      admitLearnerSnapshot({ state: { schemaVersion: 99 } }, validateLearnerBundle),
    ).toThrow(/supported version 4/);
    expect(() => admitLearnerSnapshot(null, validateLearnerBundle)).toThrow(/an object/);
  });

  it('retains optional current-schema fields without inventing defaults or nested guarantees', () => {
    const minimal = { state: { schemaVersion: 4 } };
    expect(admitLearnerSnapshot(minimal, validateLearnerBundle)).toBe(minimal);
    expect(minimal).not.toHaveProperty('customVerbs');
    expect(minimal).not.toHaveProperty('practicePrefs');
  });

  it('detects new, removed, and differently serialized durable bytes after a null baseline', () => {
    let raw = null;
    const storage = { getItem: vi.fn(() => raw) };
    const epoch = createStorageEpochTracker();
    epoch.assertCurrent(storage, 'learner');
    expect(storage.getItem).not.toHaveBeenCalled();
    epoch.accept(storage, raw);
    epoch.assertCurrent(storage, 'learner');
    raw = '{"state":{}}';
    expect(() => epoch.assertCurrent(storage, 'learner')).toThrow(
      expect.objectContaining({ code: 'STALE_LEARNER_SNAPSHOT' }),
    );
    epoch.accept(storage, raw);
    raw = '{ "state": {} }';
    expect(() => epoch.assertCurrent(storage, 'learner')).toThrow(/another tab/);
    raw = null;
    expect(() => epoch.assertCurrent(storage, 'learner')).toThrow(/another tab/);
    epoch.accept(storage, null);
    epoch.assertCurrent(storage, 'learner');
  });

  it('keeps independent storage adapters isolated', () => {
    const epoch = createStorageEpochTracker();
    const first = { getItem: () => 'changed' };
    const second = { getItem: () => 'second' };
    epoch.accept(first, 'first');
    epoch.accept(second, 'second');
    expect(() => epoch.assertCurrent(first, 'learner')).toThrow(/another tab/);
    expect(() => epoch.assertCurrent(second, 'learner')).not.toThrow();
  });

  it('distinguishes create-if-absent from an omitted revision and keeps CAS owner arguments', () => {
    const payload = { data: 'opaque' };
    expect(cloudCasArguments(payload, 'account', requireCloudRevision(null))).toEqual({
      expected_revision: null,
      next_data: payload,
      expected_user_id: 'account',
    });
    expect(requireCloudRevision(0)).toBe(0);
    expect(requireCloudRevision(9)).toBe(9);
    expect(() => requireCloudRevision(undefined)).toThrow(/revision is required/);
    expect(() => assertExpectedCloudOwner('old-account', 'account')).toThrow(/user changed/);
    expect(() => assertExpectedCloudOwner('account', 'account')).not.toThrow();
    expect(() => assertExpectedCloudOwner('account', '')).not.toThrow();
  });

  it('requires an acknowledgement revision without treating opaque server data as admitted', () => {
    const acknowledgement = { sync_revision: 4, sync_data: 'unvalidated', sync_updated_at: null };
    expect(readCloudCommitResult([acknowledgement])).toEqual({
      data: 'unvalidated',
      updated_at: null,
      revision: 4,
    });
    expect(readCloudCommitResult({ sync_revision: 0 })).toEqual({
      data: undefined,
      updated_at: undefined,
      revision: 0,
    });
    for (const invalid of [null, [], {}, { sync_revision: '4' }])
      expect(() => readCloudCommitResult(invalid)).toThrow(/did not return a revision/);
  });

  it('rechecks prepared restores and does not call the writer on stale/busy admission', () => {
    const canWrite = vi.fn(() => true);
    const ready = { hydrated: true, inFlight: false, staleTab: false, canWrite };
    expect(() => assertRestoreCanStart(ready)).not.toThrow();
    canWrite.mockClear();
    expect(() => assertRestoreCanStart({ ...ready, staleTab: true })).toThrow(/another tab/);
    expect(canWrite).not.toHaveBeenCalled();
    expect(() => assertRestorePreparationCurrent(ready, 1, 2)).toThrow(/preparing/);
    expect(canWrite).not.toHaveBeenCalled();
    expect(() => assertRestorePreparationCurrent({ ...ready, inFlight: true }, 2, 2)).toThrow(
      /preparing/,
    );
    expect(() => assertRestorePreparationCurrent(ready, 2, 2)).not.toThrow();
    expect(canWrite).toHaveBeenCalledOnce();
  });

  it('rejects ownership after a new generation, account switch, or stale-tab event', () => {
    const operation = { generation: 4, ownerUserId: 'account' };
    const current = { ...operation, staleTab: false };
    expect(ownsPersistenceOperation(operation, current)).toBe(true);
    expect(ownsPersistenceOperation(operation, { ...current, generation: 5 })).toBe(false);
    expect(ownsPersistenceOperation(operation, { ...current, ownerUserId: 'other' })).toBe(false);
    expect(ownsPersistenceOperation(operation, { ...current, staleTab: true })).toBe(false);
  });

  it('permits rollback only over the exact restore bytes and preserves the verification cause', () => {
    const cause = new Error('readback failed');
    expect(() => assertRestoreRollbackOwner('saved', 'saved', cause)).not.toThrow();
    expect(() => assertRestoreRollbackOwner('saved', 'newer', cause)).toThrow(
      expect.objectContaining({
        cause,
        message: 'Another tab changed saved data during verification.',
      }),
    );
  });

  it('keeps the same word identity and optional metadata without persisting unrelated lexicon fields', () => {
    const word = {
      dict: '食べる',
      reading: 'たべる',
      meaning: 'eat',
      group: 'ichidan',
      jlpt: 'N5',
      lesson: 3,
      lessons: [],
      minnaLesson: 0,
      pitchAccent: { accent: 2 },
      source: 'private fixture',
    };
    expect(snapshotStudyWord(word)).toEqual({
      dict: word.dict,
      reading: word.reading,
      meaning: word.meaning,
      group: word.group,
      jlpt: 'N5',
      lesson: 3,
      lessons: [],
      pitchAccent: { accent: 2 },
    });
  });
});
