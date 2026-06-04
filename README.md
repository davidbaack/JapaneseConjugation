# Katachiya - Japanese Conjugation SRS

Katachiya is a React/Vite progressive web app for learning Japanese verb and
adjective conjugation through a Reviews-first SRS flow. The app is still in
active product development, so this README describes the current learner-facing
surface rather than preserving older navigation names.

The current app shape is:

- **Reviews** - the landing page and main daily goal.
- **Lessons** - a complete formation guide for every app form.
- **Library** - the durable source of truth for words, form families, lookup,
  lists, and custom vocabulary.
- **Practice Lab** - focused tools that train specific skills and can hand work
  back to Reviews.
- **Settings** - global preferences, filters, sync, backup, and reset controls.

## Current App Surface

### Reviews

Reviews opens to a dashboard instead of auto-starting a card. It shows the due
queue, daily progress, Start/Continue Reviews, Start Core Warmup when nothing is
due, lesson/lab recommendations, upcoming review timing, and form-family
strength signals once the learner has history.

The review stream combines required due cards, weak cards, and a small trickle
of new word-form cards. Required due cards complete the progress bar; bonus
reviews can continue afterward and still update SRS. Reviews can also launch a
Retest misses session, a focused word drill, a focused form-family drill, or an
Ending Lab repair drill when sound-change weakness is detected.

Active review cards support typed answers, multiple choice, self-check, and
spoken answers; forward production, reading/reverse practice, and automatic
mixing; romaji-to-kana conversion; an on-screen kana pad; live kana help with
hide/show and reveal-next controls; deterministic hints; optional sentence-mode
cloze prompts; speech playback; and optional Gemini clue/chat support. Removing
a word or form family from Reviews updates the same durable Library state and
can be restored from Library.

### Lessons

Lessons is a searchable conjugation formation guide. It currently has 13 lesson
sections covering all 127 app card types, including core verb families, godan
row shifts, te/ta sound changes, ru-verb traps, potential, conditionals,
passive, causative, causative-passive, keigo, special forms, and adjective
forms.

Lessons can send one lesson or all forms to Reviews as an explicit recommended
review set. Lessons teach and recommend practice, but they do not gate Reviews.

### Library

Library owns the durable review inventory.

- **Inventory** turns words and form families on or off for automatic Reviews,
  shows excluded counts, searches the word inventory, and can launch "Review
  now" for a selected word.
- **Lookup / Check** searches dictionary words or real conjugated forms, accepts
  romaji/kana/kanji input, shows exact and near matches, displays form tables,
  plays pronunciation, and launches targeted Reviews.
- **Lists** manages study lists, built-in packs, WaniKani imports, Gemini-built
  list suggestions, favorites, weak-form lists, CSV/TSV bulk import, vocab CSV
  export, and Anki TSV export.
- **Custom words** adds and manages custom verbs and adjectives, including
  optional Gemini lookup/suggestion support when AI is configured.

Library is the source of truth for inclusion and exclusion. Excluded content is
suspended from automatic Reviews while SRS history and scheduling are preserved.

### Practice Lab

Practice Lab keeps specialized tools outside the main SRS loop while allowing
them to send focused recommendations back to Reviews.

- **Check** identifies typed conjugations and near misses, explains the matched
  word/form, shows related forms, plays audio, and can start targeted review for
  that word.
- **Ending Lab** drills te-form/plain-past sound changes and plain/polite
  register switching with hints, pattern maps, register maps, streaks, and
  optional AI memory hooks.
- **Groups** drills group recognition before conjugation, including verb and
  adjective categories, decoder hints, per-group accuracy, and optional Gemini
  explanations.
- **Rush** opens Kotoba Rush, a timed typing game with filtered cards, score,
  combo, wave, best score, live answer checking, kana progress, and a rush log.

Lab attempts do not silently change word-form SRS scheduling unless the learner
starts and completes the recommended work in Reviews.

### Settings

Settings holds global preferences and account/data controls. Current controls
include answer mode, review style, source forms, new cards per day, daily goal,
theme, display scripts, furigana, English hints, word-category labels, speech
playback, auto-next, listening prompts, Japanese voice selection,
conjugation-type packs or custom form selection, cloud sync sign-in/sync,
manual backup/restore, and progress reset.

Workflow-specific controls stay on the active screen. For example, practice
direction, sentence mode, and live kana controls live on the Reviews card rather
than in global Settings.

## Practice Scope And Data

- Starter data: 30 verbs and 25 adjectives.
- Generated lexicon: 2,163 practiceable words in `public/data/verb-lexicon.json`
  as of the current tracked build, including 1,376 verbs and 787 adjectives.
- Word filters: JLPT N5-N1, 23 Genki lessons, 50 Minna no Nihongo lessons, word
  types, word groups, and custom study lists.
- Card coverage: 127 selectable card types across 13 form families.
- Type packs: Textbook Core, Basics, Everyday Expansion, Advanced Patterns,
  Compound Challenge, All forms, Weak mix, and Custom.
- Minimal-pair support covers contrasts such as ichidan vs godan ru-verbs,
  i-adjective vs na-adjective, passive vs potential, godan sound-change
  clusters, and causative vs passive.

The default automatic review scope is verb-first plus common textbook
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
| `npm run typecheck:app` | Run TypeScript checking for the app config. |
| `npm run typecheck:tooling` | Run TypeScript checking for scripts/tooling. |
| `npm run typecheck:supabase` | Run TypeScript checking for Supabase functions. |
| `npm run format` | Format source JavaScript/JSX, E2E, scripts, Supabase functions, and root JS/TS files with Prettier. |
| `npm run format:check` | Check source formatting. |
| `npm run vocab:build` | Regenerate `public/data/verb-lexicon.json`. |
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
3. Deploy `supabase/functions/gemini-proxy`.
4. Keep `verify_jwt = false` for the proxy in `supabase/config.toml` if
   anonymous AI coaching should work.
5. Set `ALLOWED_ORIGIN` to the production app origin.

## Cloud Sync

Cloud sync is optional. Without Supabase configuration, progress saves locally in
the browser and manual backup/restore remains available in Settings.

With Supabase configured, signed-in users can sync SRS state, custom
vocabulary, word lists, and practice preferences across devices. The app expects
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
5. Sign in as a test user, complete one review, then confirm `public.srs_sync`
   contains exactly one row with that user's id, a JSON `data` payload, and a
   fresh `updated_at`.

## PWA / Deployment

The app is configured for the `/JapaneseConjugation/` base path and uses
`VitePWA` in `vite.config.js` for install prompts, update prompts, offline asset
caching, app icons, iOS touch icon support, and navigation fallback.
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

## Project Structure

```text
src/
  components/   Shared UI such as kana input, display, auth, AI, prompts, skeletons
  data/         Starter vocabulary, lesson data, form definitions, defaults, vocab packs
  hooks/        App hooks for AI sentences, cloud auto-sync, focus traps, virtual rows
  i18n/         String catalog and translation helper
  state/        Global app state provider and cloud/auth wiring
  utils/        Conjugation, SRS, storage, display, romaji, AI, speech, backup, drill logic
  views/        Reviews, Lessons, Library, Practice Lab, Settings, and nested tools
  __tests__/    Vitest tests
e2e/            Playwright E2E tests
public/         PWA icons, Apple touch icon, and generated vocabulary data
scripts/        Build, dev-history, vocabulary, and bundle helper scripts
supabase/       Supabase config, database migrations, and Gemini proxy Edge Function
```
