# Conjugation Dojo · 動詞と形容詞

Japanese verb and adjective conjugation practice with spaced repetition, reference tables, and AI coaching.

## Features

- **SRS Study** — spaced-repetition flash cards covering 30+ conjugation forms for ichidan, godan, suru, kuru verbs and i/na adjectives
- **Rush Mode** — timed drill with rapid-fire prompts and a live score counter
- **Classification Drill** — identify verb/adjective groups from dictionary form
- **Endings Reference** — conjugation pattern tables and a searchable rulebook
- **Mistakes Tracker** — review and resolve past errors with targeted re-drilling
- **SRS Levels** — visual breakdown of card maturity across your whole vocabulary
- **Stats** — session history, daily goal streak, and performance charts
- **Library** — browse built-in words or add custom verbs and adjectives; organize into named word lists
- **AI Coaching** — Gemini-powered explanations, conjugation breakdowns, and sentence context (sign in to unlock)
- **Speech Synthesis** — hear any conjugated form read aloud using the browser's Web Speech API
- **Flexible Input** — type romaji (auto-converts to hiragana), kana directly, or use the on-screen kana pad
- **Answer Modes** — free input, guided kana, multiple choice, or self-check
- **Drill Modes** — word-only or sentence context; forward (conjugate) or reverse (identify dictionary form)
- **Script Modes** — toggle kanji, kana, romaji, furigana, and color-coded conjugation highlighting
- **JLPT / Genki / Minna Filtering** — limit drills to specific proficiency levels, Genki lessons, or みんなの日本語 lessons
- **Cloud Sync** — sign in to sync progress, custom words, and word lists across devices
- **Dark / Light Theme** — respects system preference or override in settings

## Stack

| Layer | Tech |
|---|---|
| UI | React 19 + Tailwind CSS 4 |
| Build | Vite 8 |
| Unit tests | Vitest |
| E2E smoke tests | Playwright (Chromium) |

## Getting started

```bash
npm install
npm run dev          # dev server at http://localhost:5173
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright smoke tests (builds first) |

## AI coaching

AI coaching is powered by Gemini and enabled automatically when you sign in — no API key setup required. Sign in via **Settings → Cloud Sync** to unlock AI miss coaching, conjugation breakdowns, and sentence context explanations.

To self-host with your own Gemini key, set `VITE_GEMINI_API_KEY` in your environment before building.

## Cloud sync

Cloud sync keeps your progress, custom vocabulary, and word lists in sync across devices. Open the **Settings** tab and click **Sign In / Sign Up**.

To self-host, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your environment and create a `srs_sync` table in Supabase with columns `id` (text, primary key) and `data` (jsonb).

## Project structure

```
src/
  components/   Reusable UI components (kana pad, script display, AI panels)
  data/         Static word lists, conjugation type definitions, app defaults
  utils/        Pure logic — conjugator, SRS grading, storage, romaji, display
  views/        Top-level tab views (Study, Rush, Library, Settings, …)
e2e/            Playwright smoke tests
src/__tests__/  Vitest unit tests
```
