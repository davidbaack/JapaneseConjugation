// Compile-only regression probes. This file is included in the existing strict
// app gate, never imported by the application or executed as a unit test.
import {
  admitLearnerSnapshot,
  cloudCasArguments,
  createStorageEpochTracker,
  ownsPersistenceOperation,
  parseSnapshotJson,
  readCloudCommitResult,
  requireCloudRevision,
} from '../utils/persistenceContracts.js';
import { snapshotStudyWord } from '../utils/studySnapshot.js';

/**
 * @param {string} raw
 * @param {import('../utils/persistenceContracts.js').LearnerSnapshotValidator} validate
 * @param {Storage} storage
 */
export function checkPersistenceBoundaryTypes(raw, validate, storage) {
  const untrusted = parseSnapshotJson(raw);
  // @ts-expect-error JSON has no learner fields until runtime admission.
  untrusted.state;
  const admitted = admitLearnerSnapshot(untrusted, validate);
  /** @type {4} */
  const schemaVersion = admitted.state.schemaVersion;
  // @ts-expect-error Nested progress is not declared safe by bundle admission.
  admitted.state.practiceStats.lifetime;
  // @ts-expect-error Optional legacy fields require presence checks.
  admitted.customVerbs.map((word) => word.dict);
  // @ts-expect-error Sync metadata has its own validation/normalization boundary.
  admitted.syncMeta.deviceId;

  const create = cloudCasArguments(admitted, 'account', null);
  const update = cloudCasArguments(admitted, 'account', requireCloudRevision(7));
  // @ts-expect-error An omitted revision cannot reach the CAS argument builder.
  cloudCasArguments(admitted, 'account', undefined);
  // @ts-expect-error A numeric-looking string is not a server revision.
  requireCloudRevision('7');
  // @ts-expect-error CAS ownership requires an account ID, not a session object.
  cloudCasArguments(admitted, { user: { id: 'account' } }, 7);
  const committed = readCloudCommitResult(untrusted);
  // @ts-expect-error An acknowledgement has not validated the returned learner data.
  committed.data.state;
  // @ts-expect-error Server timestamps are not assumed to be valid strings.
  committed.updated_at.toUpperCase();

  const epoch = createStorageEpochTracker();
  epoch.accept(storage, null);
  epoch.assertCurrent(storage, 'learner');
  // @ts-expect-error An in-memory object is not the exact durable byte baseline.
  epoch.accept(storage, admitted);
  ownsPersistenceOperation(
    { generation: 2, ownerUserId: 'account' },
    { generation: 2, ownerUserId: 'account', staleTab: false },
  );
  // @ts-expect-error A generation cannot be supplied without its account owner.
  ownsPersistenceOperation({ generation: 2 }, { generation: 2, ownerUserId: '', staleTab: false });

  snapshotStudyWord({ dict: '食べる', reading: 'たべる', meaning: 'eat', group: 'ichidan' });
  // @ts-expect-error Stored exercise identity must include the reading and group.
  snapshotStudyWord({ dict: '食べる', meaning: 'eat' });
  return { schemaVersion, create, update, committed };
}
