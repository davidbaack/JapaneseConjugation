import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';

const storageModule = '../../src/utils/storage.js';
const defaultsModule = '../../src/data/defaults.js';
const selectionModule = '../../src/utils/practiceSelection.js';
// Runtime imports keep application code out of the tooling TypeScript project.
const [{ defaultState }, { DEFAULT_PREFS, STORAGE_KEY }, { practiceSelectionForTypeIds }] =
  await Promise.all([
    import(new URL(storageModule, import.meta.url).href),
    import(new URL(defaultsModule, import.meta.url).href),
    import(new URL(selectionModule, import.meta.url).href),
  ]);

export function publicCloudConfig() {
  let local = {};
  try {
    local = Object.fromEntries(
      readFileSync('.env', 'utf8')
        .split(/\r?\n/)
        .filter((line) => /^[A-Z_][A-Z_0-9]*=/.test(line))
        .map((line) => {
          const index = line.indexOf('=');
          return [
            line.slice(0, index),
            line
              .slice(index + 1)
              .trim()
              .replace(/^['"]|['"]$/g, ''),
          ];
        }),
    );
  } catch {}
  return {
    url: process.env.VITE_SUPABASE_URL || local.VITE_SUPABASE_URL || '',
    anonKey: process.env.VITE_SUPABASE_ANON_KEY || local.VITE_SUPABASE_ANON_KEY || '',
  };
}

export function emptyPracticeSnapshot(userId = '') {
  const state = defaultState();
  state.practiceSelection = practiceSelectionForTypeIds(['plain-past']);
  state.enabledTypes = ['plain-past'];
  return {
    state,
    customVerbs: [],
    customAdjectives: [],
    wordLists: [],
    practicePrefs: {
      ...DEFAULT_PREFS,
      answerMode: 'self-check',
      autoAdvanceCorrect: false,
      autoAdvanceCorrectUserSet: true,
      autoAiExplainErrors: false,
      sentenceMode: false,
    },
    syncConfig: { enabled: !!userId, userId },
    lastSyncedAt: null,
  };
}

/** @param {any} context @param {{ session?: any, url?: string }} [options] */
export async function seedPracticeContext(context, { session = null, url = '' } = {}) {
  const snapshot = emptyPracticeSnapshot(session?.user?.id || '');
  const authKey = url ? `sb-${new URL(url).hostname.split('.')[0]}-auth-token` : '';
  await context.addInitScript(
    ({ key, snapshot: initial, authKey: sessionKey, session: initialSession }) => {
      // Each context belongs to this test. Reloads must exercise the actual saved
      // learner snapshot rather than silently reseeding it.
      if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return;
      if (localStorage.getItem('practice-sync-fixture-seeded')) return;
      localStorage.setItem(key, JSON.stringify(initial));
      if (sessionKey && initialSession)
        localStorage.setItem(sessionKey, JSON.stringify(initialSession));
      localStorage.setItem('practice-sync-fixture-seeded', '1');
    },
    { key: STORAGE_KEY, snapshot, authKey, session },
  );
}

export async function readPracticeStats(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{}').state?.practiceStats,
    STORAGE_KEY,
  );
}

export async function readPracticeEvidence(page) {
  return page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || '{}').state || {};
    const sum = (rows, field) => rows.reduce((total, row) => total + (row?.[field] || 0), 0);
    const cards = Object.values(state.cards || {});
    const metrics = Object.values(state.readiness?.byRule || {});
    const lanes = Object.values(state.weakness?.byLane || {});
    const words = Object.values(state.verbStats || {}).flatMap((word) => Object.values(word));
    return {
      cards: { correct: sum(cards, 'correct'), incorrect: sum(cards, 'incorrect') },
      session: { reviewed: state.session?.reviewed, correct: state.session?.correct },
      readiness: {
        attempted: sum(
          metrics.map((metric) => metric.speed),
          'attempted',
        ),
        correct: sum(
          metrics.map((metric) => metric.speed),
          'correct',
        ),
        totalResponseMs: sum(
          metrics.map((metric) => metric.speed),
          'totalResponseMs',
        ),
        recognition: sum(
          metrics.map((metric) => metric.recognition),
          'attempted',
        ),
      },
      weakness: {
        attempted: sum(lanes, 'attempted'),
        correct: sum(lanes, 'correct'),
        incorrect: sum(lanes, 'incorrect'),
        totalResponseMs: sum(lanes, 'totalResponseMs'),
      },
      verbs: { seen: sum(words, 'seen'), incorrect: sum(words, 'incorrect') },
    };
  }, STORAGE_KEY);
}

export async function answerPractice(page, correct) {
  await page.locator('nav').getByRole('tab', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  await page.getByRole('button', { name: correct ? 'Remembered' : 'Missed', exact: true }).click();
}

export async function openSyncSettings(page) {
  await page.locator('nav').getByRole('tab', { name: 'Settings', exact: true }).click();
  const data = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Data & account' }) });
  if ((await data.getAttribute('open')) === null) await data.locator('summary').click();
  const sync = page.getByRole('button', { name: /^(Sync Now|Retry Sync)$/ });
  await expect(sync).toBeVisible();
  await expect(sync).toBeEnabled({ timeout: 25000 });
  return sync;
}

export async function syncPractice(page) {
  const sync = await openSyncSettings(page);
  await sync.click();
  await expect(page.getByRole('button', { name: /^(Sync Now|Retry Sync)$/ })).toBeEnabled({
    timeout: 25000,
  });
}

export async function expectPracticeTotals(page, attempted, correct) {
  await expect
    .poll(
      async () => {
        const stats = await readPracticeStats(page);
        return { attempted: stats?.lifetime?.attempted, correct: stats?.lifetime?.correct };
      },
      { timeout: 20000 },
    )
    .toEqual({ attempted, correct });
  const stats = await readPracticeStats(page);
  const evidence = await readPracticeEvidence(page);
  expect(evidence.cards).toEqual({ correct, incorrect: attempted - correct });
  expect(evidence.session).toEqual({ reviewed: attempted, correct });
  expect(evidence.readiness).toMatchObject({ attempted, correct, recognition: attempted });
  expect(evidence.weakness).toMatchObject({ attempted, correct, incorrect: attempted - correct });
  expect(evidence.verbs).toEqual({ seen: attempted, incorrect: attempted - correct });
  expect(evidence.readiness.totalResponseMs).toBe(stats.lifetime.responseMs);
  expect(evidence.weakness.totalResponseMs).toBe(stats.lifetime.responseMs);
  expect(stats.byType['plain-past']).toMatchObject({ attempted, correct });
  expect(stats.lifetime.byMode['self-check']).toMatchObject({ attempted, correct });
  expect(Object.values(stats.byDate).reduce((sum, row) => sum + row.attempted, 0)).toBe(attempted);
  expect(Object.values(stats.byDate).reduce((sum, row) => sum + row.correct, 0)).toBe(correct);
  await page.locator('nav').getByRole('tab', { name: 'Stats', exact: true }).click();
  const dashboard = page.getByRole('region', { name: 'Stats dashboard' });
  await expect(
    dashboard.getByText(`${Math.round((correct / attempted) * 100)}%`, { exact: true }).first(),
  ).toBeVisible();
}
