# Katachiya - Japanese Conjugation Practice

Katachiya is a React/Vite progressive web app for learning Japanese verb and
adjective conjugation through a Practice-first continuous loop. The app is still in
active product development, so this README describes the current learner-facing
surface rather than preserving older navigation names.

The current app shape is:

- **Practice** - the landing page and main learner loop.
- **Guide** - scaffolded step-by-step conjugation practice.
- **Stats** - progress, recommendations, upcoming reviews, and readiness.
- **Learn** - formation lessons and guided tracks for every app form.
- **Drills** - focused exercises for endings, transformations, groups, and speed.
- **Tools** - lookup, word management, saved lists, and custom words.
- **Settings** - durable display, audio, sync, backup, and reset preferences.

## Current App Surface

### Practice

Practice opens directly into the next continuous card when cards are available.
The active card shows the current prompt, answer controls, a compact Practice
run strip with cards practiced, missed count, streak, and why the card appeared,
plus access to the persistent Practice map. Focused "Practice this" launches
from Learn, Drills, Guide, or Tools route straight into targeted cards and stay
focused until the learner exits the banner.

Default Practice is continuous: it has no 12-card target, daily-goal stop, or
completion summary. Selection favors the lowest-skill enabled families, delayed
retry of recent misses, and varied words in the same weak patterns. SRS review
data still exists for planning, but due cards do not drive the default queue.

Practice has a persistent map for form scope. It shows every form family,
including disabled and untried families, expanded exact-form toggles, lifetime
right/wrong counts, skill visualization, and subgroup weakness rows once there
is data. Word removal on the active card updates the same durable word-exclusion
state managed from Tools, and removed words can be restored there.

Active cards support typed answers, multiple choice, self-check, and spoken
answers; forward production, reading/reverse practice, and automatic mixing;
inline romaji-to-kana conversion in the text field; live kana help with
hide/show behavior and Reveal next kana controls; deterministic hints; optional
sentence-mode context prompts backed by a bundled all-form corpus with local
offline fallbacks; speech playback; and optional Gemini clue/chat support.

### Guide

Guide is a scaffolded practice mode for building one conjugation step by step.
Each card asks the learner to recover the base form, identify the word group,
and produce the target conjugation before one final submit. Hints and skips mark
assisted steps, the guided set tracks accuracy, and completed guided cards can
count toward Practice progress while recording step-level diagnostics.

### Stats

Stats keeps progress and planning information out of active Practice. It
shows the Practice pulse, ready cards, continuous cards practiced, recent
misses, recommended practice from Learn and Drills, upcoming review timing, and
form-family readiness once the learner has enough history. Readiness gaps can
launch focused Practice or route the learner to the matching Drill, such as
Ending Lab, Groups, or Rush.

### Learn

Learn is a searchable conjugation formation guide. It currently has 13 lesson
sections covering all 126 app card types, including core verb families, godan
row shifts, te/ta sound changes, ru-verb traps, potential, conditionals,
passive, causative, causative-passive, keigo, special forms, and adjective
forms.

Learn has guided tracks, a formation-key reference, searchable lesson sections,
and a Send all to Practice action. Individual lessons and tracks can hand a
focused recommended set back to Practice, but Learn does not gate Practice.

### Tools

Tools keeps lookup, durable word management, saved lists, custom vocabulary, and
word-level targeted Practice outside the main Practice loop.

- **Lookup / Check** searches dictionary words or real conjugated forms, accepts
  romaji/kana/kanji input, shows exact and near matches, displays form tables,
  plays pronunciation, and launches targeted Practice.
- **Words** removes or restores words from automatic Practice, shows excluded
  counts, searches the word inventory, and can launch "Practice now" for a
  selected word.
- **Lists** manages study lists, built-in packs, Gemini-built list suggestions,
  favorites, and weak-form lists as internal drill scopes.
- **Custom words** adds and manages custom verbs and adjectives, including
  optional Gemini lookup/suggestion support when AI is configured.

### Drills

Drills keeps specialized exercises outside the main Practice loop while still allowing
focused work to be sent back to Practice.

- **Ending Lab** drills te-form/plain-past sound changes and plain/polite
  register switching with hints, pattern maps, register maps, streaks, and
  optional AI memory hooks.
- **Transform** practices form-to-form transformations outside the main
  dictionary-form Practice loop.
- **Groups** drills group recognition before conjugation, including verb and
  adjective categories, decoder hints, per-group accuracy, and optional Gemini
  explanations.
- **Rush** opens Kotoba Rush, a timed typing game with filtered cards, score,
  combo, wave, best score, live answer checking, kana progress, and a rush log.

Tool attempts do not silently change word-form scheduling unless the learner
starts and completes the recommended work in Practice.

### Settings

Settings holds global preferences and account/data controls. Current controls
include theme, display scripts, furigana, English hints, word-category labels,
speech playback, auto-next, listening prompts, Japanese voice selection, cloud
sync sign-in/sync, manual backup/restore, and reset cleanup.

Workflow-specific controls stay on the active screen. For example, practice
direction, sentence mode, and live kana controls live on the Practice card rather
than in global Settings.

## Practice Scope And Data

- Starter data: 30 verbs and 25 adjectives.
- Generated lexicon: 2,162 practiceable words in `public/data/verb-lexicon.json`
  as of the current tracked build, including 1,374 verbs and 788 adjectives.
- Word filters: JLPT N5-N1, 23 Genki lessons, 50 Minna no Nihongo lessons, word
  types, word groups, and custom study lists.
- Card coverage: 126 selectable card types across 13 form families.
- Type packs: Textbook Core, Basics, Everyday Expansion, Advanced Patterns,
  Compound Challenge, All forms, Weak mix, and Custom.
- Minimal-pair support covers contrasts such as ichidan vs godan ru-verbs,
  i-adjective vs na-adjective, passive vs potential, godan sound-change
  clusters, and causative vs passive.

The default automatic Practice scope is verb-first plus common textbook
adjectives with Textbook Core forms enabled.

## Stack

| Layer | Tech |
| --- | --- |
| UI | React 19, Tailwind CSS 4 |
| Build | Vite 8 |
| PWA | vite-plugin-pwa with Workbox |
| Cloud / AI | Supabase Auth, Supabase table sync, Supabase Edge Function Gemini proxy |
| Unit tests | Vitest |
| E2E tests | Playwright across Chromium, Firefox, and WebKit |

## Getting Started

```bash
npm install
npm run dev
```

Vite serves the app with the `/JapaneseConjugation/` base path. For the
deterministic local dev page used by project agents, run:

```bash
npm run dev:page
```

The deterministic dev page listens at
`http://127.0.0.1:5173/JapaneseConjugation/`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with HMR. |
| `npm run dev:page` | Start Vite on `127.0.0.1:5173` with a strict port. |
| `npm run build` | Create the production build in `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm test` | Run the Vitest unit suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run test:e2e` | Run Playwright E2E tests. Set `PW_PROJECT=chromium` in PowerShell to scope a run. |
| `npm run lint` | Lint the project with ESLint. |
| `npm run typecheck` | Run app, tooling, and Supabase TypeScript checks. |
| `npm run typecheck:app` | Run strict TypeScript checking for the app seed surface. |
| `npm run typecheck:tooling` | Run TypeScript checking for scripts/tooling. |
| `npm run typecheck:supabase` | Run TypeScript checking for Supabase functions. |
| `npm run format` | Format source JavaScript/JSX, E2E, scripts, Supabase functions, and root JS/TS files with Prettier. |
| `npm run format:check` | Check source formatting. |
| `npm run vocab:build` | Regenerate `public/data/verb-lexicon.json`. |
| `npm run sentences:batches` | Emit batch files of pending `(word, conjugation)` pairs for the tailored sentence library. See [docs/sentence-library.md](docs/sentence-library.md). |
| `npm run sentences:english` | Rewrite legacy generated sentence-library outputs with natural English glosses. See [docs/sentence-library.md](docs/sentence-library.md). |
| `npm run sentences:import` | Validate generated sentences and upsert them to Supabase. See [docs/sentence-library.md](docs/sentence-library.md). |
| `npm run sentences:export-corpus` | Export the validated Supabase sentence table into chunked offline JSON under `public/data/sentences`. |
| `npm run size` | Check bundle budget after a build. |
| `npm run ci:fast` | Run format check, lint, typecheck, and unit tests. |
| `npm run ci` | Run the full local pipeline: fast CI, E2E, build, and size check. |

## AI Coaching

AI features use Gemini through `supabase/functions/gemini-proxy`; the browser
client does not support direct Gemini API keys. When `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are present, the app enables AI through the proxy. The
proxy accepts anonymous learner requests and can include the user's Supabase
auth token when signed in.

To self-host AI coaching:

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the app build.
2. Add `GEMINI_API_KEY` as a Supabase project secret.
3. Set `ALLOWED_ORIGIN` to the exact production app origin, such as
   `https://example.com`.
4. Keep `verify_jwt = false` for the proxy in `supabase/config.toml` if
   anonymous AI coaching should work.
5. Deploy `supabase/functions/gemini-proxy`.

The proxy fails closed when `ALLOWED_ORIGIN` is missing. To intentionally allow
every browser origin for a public anonymous AI deployment, set
`ALLOWED_ORIGIN=*` and `GEMINI_ALLOW_PUBLIC_ORIGIN=true`; keep rate limits and
provider spend alerts in place because origin checks are not authentication.

## Cloud Sync

Cloud sync is optional. Without Supabase configuration, progress saves locally in
the browser and manual backup/restore remains available in Settings.

With Supabase configured, signed-in users can sync practice progress, custom
vocabulary, word lists, and preferences across devices. The app expects
an `srs_sync` table with:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text | Primary key, set to the Supabase user id. |
| `data` | jsonb | Full app sync payload. |
| `updated_at` | timestamptz | Updated on every sync write and used for merge/pull decisions. |

The tracked migration in
`supabase/migrations/20260601133136_create_srs_sync.sql` creates this table,
enables row-level security, grants access to authenticated users, and adds
owner-only policies. Users can only select, insert, update, or delete the row
whose `id` matches `auth.uid()::text`; anonymous users have no table policy.

To self-host cloud sync:

1. Create or link a Supabase project.
2. Apply the migrations with `supabase db push`, or paste the migration SQL into
   the Supabase SQL editor.
3. Enable the auth providers you want learners to use in the Supabase dashboard.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the app build. Never
   ship a service-role key to the browser.
5. Sign in as a test user, complete one Practice card, then confirm `public.srs_sync`
   contains exactly one row with that user's id, a JSON `data` payload, and a
   fresh `updated_at`.

## PWA / Deployment

The app is configured for the `/JapaneseConjugation/` base path and uses
`VitePWA` in `vite.config.js` for install prompts, update prompts, offline asset
caching, app icons, iOS touch icon support, and navigation fallback. Large
sentence-corpus chunks are runtime-cached on first use instead of precached
during install.
Service-worker behavior is configured through VitePWA; do not edit generated
`dist/` output.

## Vocabulary Data

Built-in expanded vocabulary coverage lives in
`public/data/verb-lexicon.json` so it can be cached with the app without
inflating the main JavaScript bundle. Regenerate it with:

```bash
npm run vocab:build
```

The generated lexicon includes app-practiceable verbs and adjectives. It
combines JLPT level estimates and Genki lesson tags from `elzup/jlpt-word-list`,
Minna no Nihongo lesson tags from Mohammad Akhlaghi's public CSV, and JMdict
part-of-speech/commonness data to avoid guessing whether a row is a supported
practice word. JLPT vocabulary levels are learner-study estimates; the JLPT
organizers do not publish a complete official vocabulary list.

Pitch accent data in the generated lexicon uses Kanjium's `accents.txt`, which
is licensed under Creative Commons Attribution-ShareAlike 4.0 International.
Kanjium requests attribution for Uros O.'s pitch accent notation and other
additions to EDICT, KANJIDIC, and KRADFILE.

## Project Structure

```text
src/
  components/   Shared UI such as kana input, display, auth, AI, prompts, skeletons
  data/         Starter vocabulary, lesson data, form definitions, defaults, vocab packs
  hooks/        App hooks for AI sentences, cloud auto-sync, focus traps, virtual rows
  i18n/         String catalog and translation helper
  state/        Global app state provider and cloud/auth wiring
  utils/        Conjugation, scheduling, storage, display, romaji, AI, speech, backup, drill logic
  views/        Practice, Guide, Stats, Learn, Drills, Tools, Settings, and nested surfaces
  __tests__/    Vitest tests
e2e/            Playwright E2E tests
public/         PWA icons, Apple touch icon, and generated vocabulary data
scripts/        Build, dev-history, vocabulary, and bundle helper scripts
supabase/       Supabase config, database migrations, and Gemini proxy Edge Function
```
