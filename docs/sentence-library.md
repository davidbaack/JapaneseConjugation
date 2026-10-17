# Reviewed Sentence Library

Sentence mode publishes reviewed Japanese/English pairs. A conjugatable word and
syntactically valid JSON do not establish a natural sentence or a faithful
translation. Missing approved context continues ordinary Practice while keeping
Sentence enabled.

## Current editorial repair

The October 17 repair closes the source-bound October 13 exhaustive AI review.
The current counts and corpus revision are recorded in
`data/sentence-reviews/2026-10-17-teaching-repair.json`; its compressed ledger
accounts for every original pair as retained, repaired, or withheld. Every
changed or previously flagged pair requires an exact-target editorial decision.
Unchanged prior accepts retain their original AI-review provenance. This is not
native-speaker signoff or a promise that arbitrary custom words or future AI
coaching are error-free.

Corrections belong in the lexical identities, conjugator eligibility, bilingual
profiles/frames, and context readings before corpus regeneration. Imported nouns,
adverbs, malformed forms, and bound-only senses must not become ordinary Practice
targets just because sentence mode already withholds them. Valid colloquial or
alternative forms remain distinct from confirmed errors and optional polish.

Contexts with unresolved suitability remain unavailable. Sentence mode continues
ordinary word Practice using its existing explanation and records no progress
event for that fallback. Withholding does not label every possible use of the
expression ungrammatical.

Automatic honorific/humble word Practice also requires a reviewed lexical identity,
reading, and sense. The current register overlay reviews all 1,354 verbs and offers
100 transforms across 27 identities. Existing register-marked words, ambiguous
aliases, and unreviewed combinations receive no automatic register target; their
ordinary conjugations remain available. This restriction does not claim that every
possible contextual use is ungrammatical.

The content hash namespace is now `sentence-review-v2`. Metadata `version: 1`
remains compatible with the existing database RLS schema; the namespace change
retires every previous content hash in bundled, database, and cached admission.
An old accepted database row cannot restore a corrected or withheld example.
Reviewed current rows receive new content-bound hashes and publication uses
exact current-row compare-and-set expectations.

Run `node scripts/repair-teaching-corpus.js --check` to verify the complete
resolution ledger against current lexical/engine/profile sources and published
rows. Candidate generation does not grant semantic approval. The separate
`publish-teaching-repair.js --prepare` command reads only the original reviewed
identities and freezes their CAS expectations; `--publish` revalidates the
package against the current reviewed targets, updates only those identities,
and rereads every resulting row. It never deletes source evidence or writes
learner data.

The October 7 and October 13 packages below remain immutable historical evidence.
Their source-check commands deliberately reject later changed content and hash
policies; use the current complete-ledger check for the repaired corpus.

## Historical review

The October 7, 2026 pass accounted for all 153,764 original word/form pairs.
23,075 compatible pairs were rebuilt from explicitly authored bilingual lexical
profiles and paired grammar frames. 128,961 pairs remain pending review and
1,728 are unsuitable for their current identity/context. They are not served.
All N5/N4 lexical entries were classified: 466 supported, 38 unsuitable. Some
forms for supported words are deliberately unavailable. All 126 grammar types
have reviewed examples; this is not complete word-by-form coverage.

This is AI-authored bilingual profile/frame review plus exhaustive automated
composition/integrity verification. It is not native-speaker editorial approval.
The source ledger and its limitations remain visible:

- `data/sentence-reviews/2026-10-07-summary.json`
- `data/sentence-reviews/2026-10-07-ledger.jsonl.gz`
- The immutable live-source backup and publication package are in the local
  `tmp/sentence-trust-reviewed-2026-10-07-04/` directory. Original bundled data
  also remains recoverable from Git commit `ce83612`.

An independent AI editorial sample on October 13, 2026 reviewed 32 actual completed
Japanese/English pairs from the tracked 23,075-row bundled corpus. It used fixed,
purposeful selectors covering all six word groups, exceptional conjugations,
positive/negative and past/nonpast forms, ongoing/resulting-state aspect,
causative/passive roles, conditionals, and plain/polite/honorific/humble speech.
The artifact records a separate translation of the actual Japanese, actor/object
and particle analysis, reading and sense checks, and an explicit decision for
every pair. This is a bounded independent AI review, not native-speaker signoff or
whole-corpus clearance.

- `data/sentence-reviews/2026-10-13-editorial-sample.json` contains exact source
  paths/zero-based row indices, word identities, completed forms/readings,
  row/chunk/manifest digests, content-bound approval hashes, and editorial reasoning.
  It is the recorded sample after the two definite metadata repairs: 30 accept,
  2 edit, and 0 block decisions. The original 28 accept / 4 edit audit is preserved
  unchanged in `2026-10-13-editorial-sample-baseline.json` as historical evidence.
- The two definite repairs are exact word/form overrides: `ichidan:褒める` /
  `passive-polite-past` now binds `be praised by the teacher`, and `godan:飲む` /
  `humble` now binds `drink tea received from the teacher`. Their Japanese, English,
  readings, and conjugated forms are unchanged. Other forms retain their previous
  sense metadata pending their own review; this is not family-wide reapproval.
- The two remaining edits are optional standalone Japanese clarity recommendations
  for the `negative-zuni` regret/anaphora frame and adjective negative-te reporting
  frame, distinguished from proven mistranslations. Their wording remains unchanged
  pending the user's decision. Recording an editorial recommendation does not
  automatically quarantine a row.
- `node scripts/sample-sentence-editorial.js --check` reproduces the fixed
  selection from tracked files and verifies that the recorded review still binds
  the same source content and explicit decisions. `--snapshot` prints source facts
  for a new review; it never translates, grants approval, changes files, contacts a
  provider, or publishes. Run from the repository root. A changed row, lexical or
  engine identity, or profile/frame source fails the recorded-source check rather
  than silently reusing the old verdict. Passing this command establishes source
  correspondence and mechanical integrity, not correctness of AI judgment.

`node scripts/repair-sentence-editorial-senses.js --prepare` prepares/resumes only
the two approved metadata repairs. The immutable
`data/sentence-reviews/2026-10-13-exact-sense-repair.json` package preserves original
rows, approval hashes, and affected chunk/manifest bodies; it stores exact targets
and later-publication signatures. The existing corpus generator rebuilds only the
two affected type files and the manifest. The remaining 23,073 rows are checked as
unchanged. `--check` verifies the applied bundled result. These commands make no
live reads, provider calls, or publication requests. The pure
`bindExactSenseRepairPublication` helper takes exactly two separately fetched live
rows and builds CAS expectations from their actual DB fields, refusing changed
content or identity. Live RPC publication and verification are a separate step;
the offline package alone does not establish that shared content was published.

On October 13, 2026, the two exact live rows were bound to this package and
published in one atomic RPC batch. Both resulting signatures and approval hashes
were reread and verified. Bundled publication revision is
`2941ca5b6bd47a101c741bf6c7d78b3d8d9c086d459fd314ee79ab34d0932d37`.
The historical review and offline preparation package remain immutable evidence
of the earlier stages; their flags describe those stages, not this later live check.

## Acceptance contract

An approved row has structured `review` metadata: accepted status, policy
version, SHA-256 content hash, intended sense, and approval basis. The hash binds
word key, dictionary form, reading, group, meaning, exercise meaning, current
engine surface/kana, Japanese, English, segments, sense, and policy version.
Changing any bound value invalidates approval.

- Exactly one `{w}` marker and one segment sentinel must tile the same template.
- Word readings and engine kana must be kana, not imported kanji or romaji.
- Japanese and English must express the same actors, objects, time, polarity,
  aspect, register, and intended sense. The completed Japanese must be natural.
- Curated profiles are sealed to explicit source identities. Changed custom
  homographs and unsupported word/form combinations receive no invented context.
- Future manual sentence review may approve a different genuine pair with the
  same contract. Do not give approval merely because the mechanical checks pass.

The current shared code is in `sentenceTrust.js`; Node tools use the identical
canonical serialization. `reviewedSentenceProfiles.js` and
`reviewedSentenceFrames.js` hold the explicitly authored composition decisions.

## Runtime and publication

The app tries schema2 bundled content, then the shared sentence table. Both
sources and local caches verify the same approval hash. Legacy schema1 chunks,
unreviewed database rows, old caches, malformed readings, and modified pairs
are rejected. Generic offline templates are not used in automatic Practice.
Reviewed chunks remain available offline after caching; cold offline cards use
ordinary word Practice when reviewed context is unavailable.

Each type chunk has a SHA-256 revision over its rows. The manifest revision binds
all sorted type revisions. Workbox sentence caches use v2, and local database
caches include the review policy and publication revision. The active exercise
stays stable; later exercises refresh expired cached context. Listening remains
silent while pending, then uses reviewed sentence audio or ordinary word audio.

Public SELECT is restricted to accepted structured review metadata. Publication
uses a service-role-only RPC that locks and compares every affected content and
approval field, rejecting concurrent edits/deletions/insertions atomically per
batch. It never changes learner progress or deletes sentence rows.

## Review and repair workflow

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` without putting secrets in
source files, reports, or logs. The tooling makes no LLM API calls.

1. Review or extend the explicit lexical profiles and compatible paired frames,
   or perform an independent bilingual review of generated Japanese/English.
   Translate the actual Japanese. Never independently synthesize English from
   a word/form identifier. Word-sense, pronoun, subject, particle, aspect, and
   social-viewpoint decisions need review together.
2. Prepare a new immutable audit/publication package:

   ```powershell
   npm run sentences:review -- --out tmp/sentence-trust-next
   ```

   This reads the live table, backs it up before changes, classifies every current
   word/form pair, validates composed outputs, and writes a gzipped ledger,
   publication package, summary, and digests. Existing package artifacts are
   never overwritten. Pending and unsuitable rows stay quarantined.
3. Inspect the complete summary and samples, run targeted content tests, and
   check that every accepted example has a defensible bilingual review basis.
   Keep automated verification and human editorial review distinct.
4. Publish that exact package:

   ```powershell
   npm run sentences:review -- --publish --out tmp/sentence-trust-next
   ```

   Backup, ledger, and publication digests are checked before mutation. The
   script preflights current rows and uses atomic compare-and-swap RPC batches.
   Each completed batch is journaled; rerunning permits original or exact target
   content, refusing unrelated edits. Final verification rereads the entire table.
   Verification uses key-based pagination. If transport fails after all writes,
   resume the read-only verification without republishing:

   ```powershell
   npm run sentences:review -- --verify --out tmp/sentence-trust-next
   ```
5. Export and check the canonical reviewed table:

   ```powershell
   npm run sentences:export-corpus
   npm run sentences:check-corpus
   npm run sentences:quality-report
   ```

   Pending/unsuitable/missing contexts are permitted and reported as unavailable.
   Invalid purportedly accepted rows fail export. Do not hand-edit generated
   `public/data/sentences` files. The schema2 manifest and chunks are deterministic.
6. Run `npm run ci:fast` and `npm run ci`, inspect served `/JapaneseConjugation/`
   output with fresh/returning/cold-offline profiles, and commit/push only intended
   changes. The deployed unit suite checks the full published corpus and ledger.

## New generated suggestions

`npm run sentences:batches` emits word meanings and expected engine forms. It
skips only currently verified accepted rows; pending/quarantined/changed content
remains eligible for work. Known invalid lexical identities are excluded until
their source spelling, reading, or part of speech is repaired.
`sentences:import` validates JSONL/engine/segments, but
structural validity without a separate valid review remains pending. Stale
claimed approval is rejected. Furigana is derived with kuromoji; its output must
also be checked for the actual sentence and reading.

`sentences:english` now refuses missing/boilerplate translations. It cannot safely
repair English by guessing an unrelated sentence. Write a faithful translation
of the actual Japanese and obtain a new content-bound review instead.

## Evidence and regression gates

`npm run sentences:quality-report` verifies the entire shipped corpus, manifest,
chunk revisions, approval hashes, current lexical identities, and known quality
patterns. A green result establishes these checks, not universal linguistic
correctness. The published-corpus tests also ensure authored profile/frame rows
match their reviewed Japanese, English, and exact sense metadata, and that the
ledger accounts for every original pair without claiming human review.

Focused suites cover stale approval, changed sense/reading/engine output,
placeholder/segment integrity, same-length publication changes, cache withdrawal,
immutable backups, tampered artifacts, atomic concurrent edits, missing-context
continuation, reverse/listening, filled answer review, and exact-card retries.
Native PostgreSQL publication/access checks were exercised in a rollback-only
transaction before live publication. Use qualified Japanese editorial review for
additional assurance and difficult pending content.
