# Strict persistence boundaries

`npm run typecheck:app` checks the strict leaf modules first, then the broader
JavaScript app with its existing nonstrict settings. `npm run ci:fast` includes
that command, so strict coverage is enforced without requiring the entire UI
to migrate in one change.

`src/utils/persistenceContracts.js` is dependency-free and checked with `strict`
and `noImplicitAny`. Its contracts cover:

- JSON parsing returns `unknown`. Snapshot admission calls the existing
  `validateLearnerBundle` before exposing schema 4 state, optional custom words,
  word lists, and preferences. It neither fills missing fields nor changes the
  snapshot. Nested learner domains, sync metadata, and account metadata remain
  unknown because their validators and normalizers own those details.
- Storage epochs compare the exact saved bytes, including an accepted `null`
  snapshot, and retain separate baselines for separate storage adapters.
- CAS arguments distinguish the `null` create-if-absent revision from an omitted
  revision, require typed account identifiers, and keep server acknowledgement
  data/timestamps unknown. Existing server numeric constraints still apply.
- Restore admission is checked before starting and after lazy imports yield.
  Completion ownership requires the same operation generation and account, and
  a tab that has not become stale. Rollback requires the exact committed bytes.

Storage loading, pending-journal loading, cloud writes, the app's restore path,
and restore rollback consume these helpers. The existing deep validators,
pending-reset ownership, quota recovery, write locks, and restore preview remain
the runtime authorities. The plain-object guard is shared with the deep
validator rather than duplicated. The single snapshot type assertion is confined
to admission after the supplied validator succeeds; it must not be used with a
callback that does not validate a learner bundle.

`src/utils/studySnapshot.js` strictly checks the word identity copied into the
session card. Optional display metadata remains opaque. It uses the previous
field list and truthiness rules and changes neither exercise selection nor
learner progress.

`src/typechecks/persistenceContracts.js` contains compile-only regression probes.
Expected errors demonstrate that raw JSON and acknowledged server data cannot be
read as learner state, optional legacy fields need checks, and incorrect
revisions, account owners, operation tickets, and word identities are rejected.
The file is included in the strict gate and is never imported into the app.

This is bounded coverage. `storage.js`, `localJournal.js`, `restorePersistence.js`,
`AppStateContext.jsx`, and `StudyView.jsx` still use the broader nonstrict app
check. Their imported graph, full React context, scheduling domains, sync
sidecar, and detailed progress types are not claimed to be strict. The separate
strict pass checks the leaf implementation and compile probes; it does not make
implicit types in existing callers strict. No backup/schema version, persisted
field, runtime brand, or migration is introduced. Deterministic tests do not
prove authenticated live-account sync or normal-profile restore behavior.
