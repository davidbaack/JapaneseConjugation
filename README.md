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
- **AI Coaching** — Gemini-powered explanations, conjugation breakdowns, and sentence context (requires a free Gemini API key)
- **Speech Synthesis** — hear any conjugated form read aloud using the browser's Web Speech API
- **Flexible Input** — type romaji (auto-converts to hiragana), kana directly, or use the on-screen kana pad
- **Script Modes** — toggle kanji, kana, romaji, furigana, and color-coded conjugation highlighting
- **JLPT / Genki Filtering** — limit drills to specific proficiency levels or textbook lessons
- **Cloud Sync** — optional Supabase-backed sync across devices (bring your own project)
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

## AI coaching setup

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/)
2. Open the **Settings** tab in the app and paste it into the Gemini API Key field

The key is stored only in `localStorage` and is never sent anywhere except directly to the Gemini API.

## Cloud sync setup

Cloud sync uses a [Supabase](https://supabase.com) table to store your progress. To enable it:

1. Create a Supabase project and add a table named `srs_sync` with columns `id` (text, primary key) and `data` (jsonb)
2. Copy your project URL and anon key into **Settings → Cloud Sync**

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
