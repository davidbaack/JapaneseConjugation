# Backup and restore

Settings > Data & account > Backup & restore exports learner data as JSON.
Keep a downloaded copy outside this browser: the automatic recovery copy is
stored in the same browser and does not survive clearing browser storage.

## What the backup contains

Version 43 exports the whole schema 4 learner state, custom words, word lists,
and practice/display/audio preferences. This includes card schedules, retry
queue, mistakes, Practice and Guide history, readiness, weakness, Transform,
Minimal Pairs, practice exclusions/recommendations and session totals.

Account credentials, sync ownership/device clocks, generated AI caches,
device-local recent Check inputs, and the currently displayed exercise are
excluded. A restored file uses the currently signed-in account; it cannot log
in as the account that created the file.

## Restore flow

1. Paste the JSON and select **Check backup**. Checking does not change data.
2. Review the export date, progress/custom-content counts and any limitations.
3. Select **Replace learner data** to explicitly replace the current snapshot,
   or **Cancel restore**. Editing the pasted text invalidates its preview.
4. The app first stages and verifies a recovery copy, then writes and verifies
   the complete replacement and recovery pointer in one localStorage bundle.
   React state changes after this local commit succeeds.
5. Download **Backup before last restore** if you need to undo the replacement.
   It remains available after reloading. A successful subsequent restore
   replaces that recovery copy. Unsupported original saved data is retained as
   a raw recovery copy and may require repair before it can be imported.

Cloud synchronization follows local persistence. A signed-in restore uses the
existing compare-and-set/reset protocol so the replacement does not union old
cards/custom content back into the snapshot. Offline or failed requests leave
local data and the replacement intent intact; **Sync now** retries it. Pending
cloud status survives reloading. New answers remain saved locally while cloud
synchronization is unfinished. Cloud reads/writes have a 15-second deadline and
an AbortSignal; a timed-out write can have reached the server, so retry uses the
normal revision check rather than assuming it never committed.

## Compatibility and protection

- The exact app-generated version 42 schema-less export is recognized and
  recovered using current word/form identities. Areas omitted by that exporter
  cannot be reconstructed from the file; the preview names them before
  confirmation. Their defaults replace current values with the rest of the
  snapshot.
- Version 3 learner state, future versions, ambiguous legacy files, unsafe JSON
  keys and malformed nested data are rejected before mutation. No heuristic
  migration or silent reset is performed.
- Unsupported/corrupt saved local or cloud data pauses persistence/sync and
  displays a recovery message. Existing local bytes remain available.
- A changed durable snapshot from another tab invalidates stale saves and
  restores. The stale tab pauses and requests a reload. This is optimistic
  cross-tab protection; localStorage and the remote server are separate
  persistence systems, so the app reports local success and cloud success
  independently.
- A quota/security/recovery-copy failure rejects replacement. An ambiguous
  verification failure retains recovery data and requests reload; rollback
  never overwrites a divergent snapshot written by another tab.

## Verification

`src/__tests__/fixtures/learnerSnapshot.js` seeds every learner state area with
nonzero, internally coherent progress and actual word/form identities.
Backup, persistence, Settings, sync-metadata and provider tests exercise the
real parse/merge/apply/save boundaries. `e2e/backup-restore.test.js` covers the
visible Settings export/replacement/reload/download, exact v42 recovery,
rejected input and stale-preview cancellation in isolated browser profiles.
Mocked cloud tests verify request deadlines, revision retries, account/race
protection and pending-restore recovery. These are not evidence of a live
signed-in two-account or two-device Supabase recovery run.

Concurrent progress now uses protocol 2 writer contributions. See
[Concurrent learner progress](concurrent-progress.md) for counting, local tab
coordination, upgrade limits and the authenticated convergence regression.
