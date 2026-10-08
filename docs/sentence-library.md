# Reviewed Sentence Library

Sentence mode publishes reviewed Japanese/English pairs. A conjugatable word and
syntactically valid JSON do not establish a natural sentence or a faithful
translation. Missing approved context continues ordinary Practice while keeping
Sentence enabled.

## Current review

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
