import { test, expect } from '@playwright/test';
import { STORAGE_KEY } from '../src/data/defaults.js';
// Load the shared application fixture at runtime so the tooling-only TypeScript
// project does not pull the entire app into its separate strict compilation.
const fixtureModule = '../src/__tests__/fixtures/learnerSnapshot.js';
const { makeLearnerSnapshot, makeLegacyV42Backup } = await import(fixtureModule);

async function openDataSettings(page) {
  await page.locator('nav').getByRole('tab', { name: 'Settings', exact: true }).click();
  const data = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Data & account' }) });
  if ((await data.getAttribute('open')) === null) await data.locator('summary').click();
  await expect(page.getByRole('heading', { name: 'Backup & restore', exact: true })).toBeVisible();
}

async function seedLearner(page, snapshot = makeLearnerSnapshot()) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Each Playwright test owns a fresh browser context. Seed only that isolated
  // context, once, so a reload exercises actual persistence rather than reseeding.
  await page.evaluate(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
      sessionStorage.clear();
    },
    { key: STORAGE_KEY, data: snapshot },
  );
  await page.reload();
  await openDataSettings(page);
  return snapshot;
}

async function readSaved(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY);
}

async function exportFromSettings(page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const text = await page
    .getByRole('textbox', { name: 'Backup export JSON', exact: true })
    .inputValue();
  return { text, data: JSON.parse(text) };
}

async function checkBackup(page, text) {
  const input = page.getByRole('textbox', { name: 'Paste backup JSON to restore', exact: true });
  if (!(await input.isVisible()))
    await page.getByRole('button', { name: 'Import', exact: true }).click();
  await input.fill(text);
  await page.getByRole('button', { name: 'Check backup', exact: true }).click();
}

async function previewCount(page, label, count) {
  const preview = page.getByRole('region', { name: 'Backup preview' });
  await expect(
    preview.getByText(label, { exact: true }).locator('xpath=following-sibling::dd[1]'),
  ).toHaveText(String(count));
}

async function downloadedJSON(page, buttonName) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: buttonName, exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Expected a readable backup download');
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function learnerParts(value) {
  return {
    state: value.state,
    customVerbs: value.customVerbs,
    customAdjectives: value.customAdjectives,
    wordLists: value.wordLists,
    practicePrefs: value.practicePrefs,
  };
}

test.describe('Backup and restore — learner data integrity', () => {
  test('round-trips every learner bucket through Settings and reload, retaining recovery download', async ({
    page,
  }) => {
    const seed = await seedLearner(page);
    const original = await exportFromSettings(page);
    expect(learnerParts(original.data)).toEqual(learnerParts(seed));
    expect(original.data.version).toBe(43);
    expect(original.data.state.schemaVersion).toBe(4);

    // Change real learner data through the current Settings controls.
    await page.getByRole('button', { name: 'Reset progress', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, reset progress', exact: true }).click();
    await expect
      .poll(async () => (await readSaved(page)).state.practiceStats.lifetime.attempted)
      .toBe(0);
    await page.getByRole('button', { name: 'Clear custom content', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, clear custom content', exact: true }).click();
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await expect.poll(async () => (await readSaved(page)).practicePrefs.theme).toBe('light');
    const beforeRestore = await readSaved(page);
    expect(beforeRestore.state.cards).toEqual({});
    expect(beforeRestore.wordLists).toEqual([]);

    await checkBackup(page, original.text);
    await previewCount(page, 'Saved card histories', 2);
    await previewCount(page, 'Practice attempts', 8);
    await previewCount(page, 'Guide attempts', 7);
    await previewCount(page, 'Custom words', 2);
    await previewCount(page, 'Saved lists', 1);
    expect(learnerParts(await readSaved(page))).toEqual(learnerParts(beforeRestore));

    await page.getByRole('button', { name: 'Replace learner data', exact: true }).click();
    await expect
      .poll(async () => learnerParts(await readSaved(page)))
      .toEqual(learnerParts(original.data));
    await expect(page.locator('body')).toHaveClass(/theme-dark/);
    await expect(
      page.getByRole('heading', { name: 'Backup before last restore', exact: true }),
    ).toBeVisible();
    const recovery = await downloadedJSON(page, 'Download recovery backup');
    expect(learnerParts(recovery)).toEqual(learnerParts(beforeRestore));

    await page.reload();
    await openDataSettings(page);
    const reloaded = await exportFromSettings(page);
    expect(learnerParts(reloaded.data)).toEqual(learnerParts(original.data));
    await expect(
      page.getByRole('button', { name: 'Download recovery backup', exact: true }),
    ).toBeVisible();
    const download = await downloadedJSON(page, 'Download backup');
    expect(learnerParts(download)).toEqual(learnerParts(original.data));
  });

  test('recovers all available v42 fields and explains unavailable history before replacement', async ({
    page,
  }) => {
    const seed = await seedLearner(page);
    const legacy = makeLegacyV42Backup(seed);
    legacy.practicePrefs = { ...legacy.practicePrefs, theme: 'light' };
    await checkBackup(page, JSON.stringify(legacy));
    const preview = page.getByRole('region', { name: 'Backup preview' });
    await expect(preview.getByText('Older backup limitations', { exact: true })).toBeVisible();
    await previewCount(page, 'Saved card histories', 2);
    await previewCount(page, 'Practice attempts', 8);
    await previewCount(page, 'Guide attempts', 7);
    await expect(page.locator('body')).toHaveClass(/theme-dark/);
    await page.getByRole('button', { name: 'Replace learner data', exact: true }).click();
    await expect.poll(async () => (await readSaved(page)).practicePrefs.theme).toBe('light');
    const saved = await readSaved(page);
    for (const [field, value] of Object.entries(legacy.state))
      expect(saved.state[field], field).toEqual(value);
    expect(saved.state.schemaVersion).toBe(4);
    expect(saved.customVerbs).toEqual(seed.customVerbs);
    expect(saved.customAdjectives).toEqual(seed.customAdjectives);
    expect(saved.wordLists).toEqual(seed.wordLists);
    // v42 never exported these. Recovery must not invent history or silently
    // merge the previous browser's counters into the imported learner.
    expect(saved.state.retryQueue).toEqual([]);
    expect(saved.state.readiness).toEqual({ byRule: {} });
    expect(saved.state.weakness).toEqual({ byLane: {} });
    await page.reload();
    await openDataSettings(page);
    const exported = await exportFromSettings(page);
    expect(exported.data.state.cards).toEqual(seed.state.cards);
    expect(exported.data.state.guide).toEqual(seed.state.guide);
    expect(exported.data.state.practiceStats).toEqual(seed.state.practiceStats);
  });

  test('rejects corrupt, unsupported, and future backups without changing stored learner data', async ({
    page,
  }) => {
    await seedLearner(page);
    const original = await exportFromSettings(page);
    const invalid = [
      { ...original.data, version: 999 },
      { ...original.data, state: { ...original.data.state, schemaVersion: 999 } },
      { ...original.data, state: { ...original.data.state, schemaVersion: 3 } },
      { ...original.data, state: { ...original.data.state, cards: null } },
      {
        ...original.data,
        state: {
          ...original.data.state,
          guide: { ...original.data.state.guide, attempted: 'seven' },
        },
      },
      { ...original.data, customVerbs: [null] },
    ];
    const before = await readSaved(page);
    for (const payload of invalid) {
      await checkBackup(page, JSON.stringify(payload));
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: /invalid|unsupported|newer|schema|card|guide|custom/i }),
      ).toBeVisible();
      await expect(page.getByRole('region', { name: 'Backup preview' })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Replace learner data', exact: true }),
      ).toHaveCount(0);
      expect(await readSaved(page)).toEqual(before);
    }
    await page.reload();
    await openDataSettings(page);
    const exported = await exportFromSettings(page);
    expect(learnerParts(exported.data)).toEqual(learnerParts(original.data));
  });

  test('cancelling or editing a checked backup cannot apply a stale preview', async ({ page }) => {
    await seedLearner(page);
    const original = await exportFromSettings(page);
    const before = await readSaved(page);
    await checkBackup(page, original.text);
    await page.getByRole('button', { name: 'Cancel restore', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Backup preview' })).toHaveCount(0);
    await expect(
      page.getByRole('textbox', { name: 'Paste backup JSON to restore', exact: true }),
    ).toBeFocused();
    expect(await readSaved(page)).toEqual(before);

    await checkBackup(page, original.text);
    const changed = {
      ...original.data,
      practicePrefs: { ...original.data.practicePrefs, theme: 'light' },
    };
    await page
      .getByRole('textbox', { name: 'Paste backup JSON to restore', exact: true })
      .fill(JSON.stringify(changed));
    await expect(page.getByRole('region', { name: 'Backup preview' })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Replace learner data', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Check backup', exact: true })).toBeVisible();
    expect(await readSaved(page)).toEqual(before);
    await expect(page.locator('body')).toHaveClass(/theme-dark/);
  });
});
