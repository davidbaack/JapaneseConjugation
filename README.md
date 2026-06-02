# Katachiya - Japanese Conjugation SRS

Katachiya is a React/Vite app for practicing Japanese verb and adjective conjugation. It combines SRS review, transformation drills, lookup/reference tools, timed practice, learner stats, optional Gemini coaching through Supabase, and installable PWA behavior.

## Current App Surface

The app is organized around these top-level tabs:

- **Practice** - SRS flashcards for word, sentence, and Transform practice. Supports forward, reverse, and mixed directions; input, choice, self-check, and speech answer modes; romaji-to-kana conversion; an on-screen kana pad; live kana feedback; deterministic hints; speech playback; and optional AI clue/chat support.
- **Check** - identifies typed conjugated verbs or adjectives from romaji, kana, or kanji input, then shows the dictionary word, matching form, near misses, pronunciation, and handoffs into targeted Practice.
- **Which Group?** - drills group recognition before conjugation, covering verb classes and adjective classes with per-group accuracy and optional AI explanations.
- **Endings** - the Ending Lab for rapid te-form/plain-past sound-change practice and plain/polite register switching, with pattern stats, hints, pronunciation, and optional AI memory hooks.
- **Games** - opens Kotoba Rush, a timed typing drill with rapid prompts, combo scoring, and the same configured vocabulary/form filters as the rest of practice.
- **Insights** - combines overview stats, skill radar, readiness/form accuracy, SRS level breakdowns, mistake history, retests, transformation accuracy, and minimal-pair progress.
- **Library** - includes reverse lookup, reference tables, lessons, favorites, weak-form drills, word lists, custom verbs/adjectives, vocab pack imports, AI list generation, Anki TSV export, vocab CSV export, and CSV/TSV bulk import.
- **Settings** - controls answer modes, prompt/source forms, review style, daily goals, theme, display scripts, furigana, English hints, speech voice, JLPT/Genki/Minna filters, word groups, word lists, form packs, cloud sync, backup/restore, and progress reset.

## Practice Scope

- Built-in starter vocabulary: 30 verbs and 25 adjectives.
- Word classes: ichidan, godan, suru, kuru, irregular adjective, i-adjective, and na-adjective.
- Lesson/filter lanes: JLPT N5-N1, 23 Genki lessons, and 50 Minna no Nihongo lessons.
- Conjugation coverage: 127 selectable form types grouped into packs such as Core, Basics, Everyday Expansion, Advanced Patterns, Compound Challenge, All forms, and Weak mix.
- Form groups include basic tenses, te-form/stem, volitional/desire, potential, conditionals, progressive, commands/requests, passive, causative, causative-passive, keigo, special forms, and adjectives.
- Minimal-pair/review support covers contrasts such as ichidan vs godan ru-verbs, i-adjective vs na-adjective, passive vs potential, godan sound-change clusters, and causative vs passive.

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

Vite serves the app with the `/JapaneseConjugation/` base path. For production-parity local checks, use the preview server after a build or run the Playwright E2E command, which builds and serves the app automatically.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with HMR. |
| `npm run build` | Create the production build in `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm test` | Run the Vitest unit suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run test:e2e` | Run Playwright E2E tests. Set `PW_PROJECT=chromium` in PowerShell to scope a run. |
| `npm run lint` | Lint `src/` with ESLint. |
| `npm run typecheck` | Run TypeScript checking with `tsc --noEmit`. |
| `npm run format` | Format source JavaScript/JSX with Prettier. |
| `npm run format:check` | Check source formatting. |
| `npm run size` | Check bundle budget after a build. |
| `npm run ci:fast` | Run format check, lint, typecheck, and unit tests. |
| `npm run ci` | Run the full local pipeline: fast CI, E2E, build, and size check. |

## AI Coaching

AI features use Gemini through `supabase/functions/gemini-proxy`; the browser client does not support direct Gemini API keys. When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are present, the app enables AI via the proxy. The proxy accepts anonymous learner requests and can include the user's Supabase auth token when signed in.

To self-host AI coaching:

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the app build.
2. Add `GEMINI_API_KEY` as a Supabase project secret.
3. Deploy `supabase/functions/gemini-proxy`.
4. Keep `verify_jwt = false` for the proxy in `supabase/config.toml` if anonymous AI coaching should work.
5. Set `ALLOWED_ORIGIN` to the production app origin.

## Cloud Sync

Cloud sync is optional. Without Supabase configuration, progress saves locally in the browser and manual backup/restore remains available in Settings.

With Supabase configured, signed-in users can sync SRS state, custom vocabulary, word lists, and practice preferences across devices. The app expects an `srs_sync` table with:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text | Primary key, set to the Supabase user id. |
| `data` | jsonb | Full app sync payload. |
| `updated_at` | timestamptz | Updated on every sync write and used for merge/pull decisions. |

The tracked migration in `supabase/migrations/20260601133136_create_srs_sync.sql` creates this table, enables row-level security, grants access to authenticated users, and adds owner-only policies. Users can only select, insert, update, or delete the row whose `id` matches `auth.uid()::text`; anonymous users have no table policy.

To self-host cloud sync:

1. Create or link a Supabase project.
2. Apply the migrations with `supabase db push`, or paste the migration SQL into the Supabase SQL editor.
3. Enable the auth providers you want learners to use in the Supabase dashboard.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the app build. Never ship a service-role key to the browser.
5. Sign in as a test user, complete one review, then confirm `public.srs_sync` contains exactly one row with that user's id, a JSON `data` payload, and a fresh `updated_at`.

## PWA / Deployment

The app is configured for the `/JapaneseConjugation/` base path and uses `VitePWA` in `vite.config.js` for install prompts, update prompts, offline asset caching, app icons, iOS touch icon support, and navigation fallback. Service-worker behavior is configured through VitePWA; do not edit generated `dist/` output.

## Vocabulary Data

Built-in expanded vocabulary coverage lives in `public/data/verb-lexicon.json` so it can be cached with the app without inflating the main JavaScript bundle. Regenerate it with `npm run vocab:build`.

The generated lexicon includes app-practiceable verbs, adjectives, and noun-copula items. It combines JLPT level estimates and Genki lesson tags from `elzup/jlpt-word-list`, Minna no Nihongo lesson tags from Mohammad Akhlaghi's public CSV, and JMdict part-of-speech/commonness data to avoid guessing whether a row is a verb, adjective, noun, or useful JLPT-only practice word. JLPT vocabulary levels are learner-study estimates; the JLPT organizers do not publish a complete official vocabulary list.

## Project Structure

```text
src/
  components/   Shared UI components such as kana input, script display, AI panels, prompts
  data/         Starter vocabulary, lesson data, form definitions, defaults, vocab packs
  hooks/        App hooks for AI sentences, cloud auto-sync, focus traps, virtual rows
  i18n/         String catalog and translation helper
  state/        Global app state provider and cloud/auth wiring
  utils/        Conjugation, SRS, storage, display, romaji, AI, speech, backup, drill logic
  views/        Top-level app tabs and subviews
  __tests__/    Vitest tests
e2e/            Playwright E2E tests
public/         PWA icons and Apple touch icon
scripts/        Build and bundle helper scripts
supabase/       Supabase config, database migrations, and Gemini proxy Edge Function
```
