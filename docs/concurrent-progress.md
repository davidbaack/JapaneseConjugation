# Concurrent learner progress

Protocol 2 records additive learner progress as a historical baseline plus
monotonic contributions from each running app instance. A browser/tab runtime
has a unique writer identity, including when a tab is duplicated or reloaded.
Merging takes the maximum for the same writer component and adds independent
writers. Repeated uploads, compare-and-set retries, and overlapping histories
therefore do not add the same contribution twice.

## Learner behavior

- Two concurrent answers, one right and one wrong, converge to two attempts and
  50% accuracy. Lifetime, exact form/topic, answer-mode, date, response time,
  card evidence, session, readiness, and weakness receive both contributions.
- Count and timing metrics in Guide and the other drills use the same model.
  Scheduling, last-answer fields, streaks, and personal bests keep their own
  latest/minimum/maximum rules; SRS intervals are not added together. A newer
  miss wins over an older card with a longer correct-answer streak.
- Each committed answer has one stable identity across its associated histories
  and diagnostics. Distinct answers at the same millisecond remain distinct.
  Guide captures its final identity/time before its React updater and guards
  double submission; correcting an original miss does not rewrite the result.
- Date buckets are captured when answering and survive synchronization with a
  device in another timezone. Recent histories remain bounded (120 Practice,
  30 weakness, 20 Guide); lifetime counts do not depend on those histories.

## Local and cloud persistence

Ordinary changes in another tab merge automatically when account and replacement
lineage match. Writes serialize through Web Locks, with a real IndexedDB
read/write transaction as the fallback. Before waiting for that lock, the app
stages an immutable, uniquely keyed learner snapshot in localStorage. Closing
that tab while queued therefore leaves recoverable evidence. Loaders merge
pending snapshots; a verified main write consumes only the exact immutable
stage keys it included. Newer stages use new keys and cannot be deleted by that
cleanup. Authentication tokens are never staged in this journal.

A different account or replacement epoch pauses the stale tab and requests a
reload. Cloud responses merge against the latest local snapshot; they cannot
replace answers recorded while the request was pending. Generation, account,
lineage, and ownership checks also run inside and after awaited local writes.
Local progress remains usable when cloud requests fail; Sync now retries the
existing compare-and-set protocol.

## Restore, reset, and upgrades

Restore and progress/factory reset establish a new epoch. Intentional restore
seeds the whole chosen backup as the new baseline; old-epoch writers cannot
revive cleared answers, even with newer clocks. A replica that observes the
new epoch contributes only its subsequent answers. Combined offline reset
intents preserve answers already recorded after the earlier reset.

Current protocol 1 snapshots are adopted conservatively, after canonical
repair of historical readiness/weakness evidence. The app preserves known
historical totals and does not claim to reconstruct previously lost answers.
If an older app copied newer totals without their contribution metadata, or a
different historical baseline overlaps newer contributions ambiguously, sync
stops with recovery guidance instead of inventing a total. Settings permits
exporting valid local progress and offers Download saved recovery data for
unreadable local state; the latter preserves raw main and pending snapshots
for repair. A chosen backup can then be explicitly restored as a replacement.

The server migration `20261008120000_protect_progress_contributions.sql`
requires contribution metadata for protocol 2 inserts/updates and prevents an
older client from downgrading a row that has adopted protocol 2. It preserves
existing account RLS, expected-user checks and revision compare-and-set rules.
Older open apps must reload to participate in the new protocol.

The companion migration `20261008123000_return_sync_conflicts_promptly.sql`
returns business conflicts as HTTP 409 (`PT409`). Live authenticated testing
proved the previous custom `40001` exception hung past 15 seconds; Supabase
[documents that PostgREST retry loop and the explicit HTTP status fix](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
The direct stale-revision test returned HTTP 409 in 104 ms after applying the
migration. Both migrations are recorded on the linked project; no account or
RLS rules were widened.

Writer components grow with app instances and touched counter dimensions, not
with every answer. They are not discarded based on time: doing so could lose
or resurrect work on offline devices. Browser quota failures preserve the saved
snapshot and pending journal and surface an error. Download backups remain
necessary; clearing browser storage removes its local recovery data too.

## Validation

Core tests use actual recorders and public adopt/stamp/merge boundaries, covering
three-replica permutations, repeated snapshots, identical millisecond answers,
long histories, all projections, reset/restore lineage, diagnostic repair,
malformed metadata, conservative upgrades and backup fidelity.

`e2e/practice-sync.test.js` exercises real app tabs through Web Locks and
IndexedDB, plus isolated browser contexts with a controlled CAS conflict and
offline reconnection. `e2e/practice-sync-live.test.js` is opt-in via
`LIVE_PRACTICE_SYNC=1`: it creates a uniquely tagged disposable confirmed user,
obtains two genuine password sessions, runs the app in isolated authenticated
browser contexts against the real database, and removes only that user's row
and account in finally. It never injects an admin key into a page or records
traces/videos containing session credentials. The live test also verifies RLS
ownership and server metadata/downgrade guards. It validates authenticated
browser sessions, rather than interactive login UI.

The isolated live run passed on October 8, 2026: both sessions converged to two
attempts and one correct answer after offline work, retries and reloads; Stats
showed 50%. The first failures were retained to distinguish a cold lazy-route
fixture issue from the actual backend conflict hang. All created test users
and their sync rows were verified removed. This evidence covers two genuine
browser sessions for one disposable account, rather than interactive login or
cold-offline PWA behavior.

A manual production-preview check on an isolated local origin also recorded one
Remembered and one Missed self-check answer in separate tabs. Both Stats views
showed two lifetime answers, 50% accuracy and matching date/topic/mode evidence;
reload preserved the result. The app emitted no sampled error logs. Proof is
retained in `tmp/practice-sync-2026-10-08/production-two-tab-stats.jpg`.

Final source validation passed: `npm run ci` (91 unit files / 1,170 tests,
94 browser cases passed / 14 expected skips, build and original bundle budgets).
A separate opt-in live run against that final source also passed, with a stale
revision returning HTTP 409 in 109 ms and verified test-account/row cleanup.
