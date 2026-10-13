import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { STORAGE_KEY } from '../src/data/defaults.js';
const fixtureModule = '../src/__tests__/fixtures/learnerSnapshot.js';
const { makeLearnerSnapshot } = await import(fixtureModule);

// Explicit local evidence only. The input is an app export, never browser auth
// state. Default CI skips it; each target is a disposable Playwright profile.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
function learnerParts(value) {
  return {
    state: value.state,
    customVerbs: value.customVerbs,
    customAdjectives: value.customAdjectives,
    wordLists: value.wordLists,
    practicePrefs: value.practicePrefs,
  };
}
async function settings(page) {
  await page.locator('nav').getByRole('tab', { name: 'Settings', exact: true }).click();
  const disclosure = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Data & account' }) });
  if ((await disclosure.getAttribute('open')) === null) await disclosure.locator('summary').click();
  await expect(page.getByRole('heading', { name: 'Backup & restore', exact: true })).toBeVisible();
}
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY);

test('restores a real-profile export through Settings in a distinct disposable profile', async ({
  page,
}) => {
  test.skip(!process.env.PROFILE_BACKUP_PATH, 'Explicit real-profile export path is required.');
  const originalText = readFileSync(process.env.PROFILE_BACKUP_PATH || '', 'utf8');
  const original = JSON.parse(originalText);
  expect(original.version).toBe(43);
  const seed = makeLearnerSnapshot();
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Older builds could export an incomplete session from otherwise accepted
  // schema4 storage. Exercise the current load/export normalization in an
  // isolated copy, preserving every recorded source value before replacement.
  await page.evaluate(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
      sessionStorage.clear();
    },
    { key: STORAGE_KEY, data: learnerParts(original) },
  );
  await page.reload();
  await settings(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const text = await page
    .getByRole('textbox', { name: 'Backup export JSON', exact: true })
    .inputValue();
  const expected = JSON.parse(text);
  // Retry membership is merged as a sorted set by the replica protocol; its
  // storage order does not drive selection. Other histories retain exact order.
  expect({ ...expected.state, retryQueue: [...expected.state.retryQueue].sort() }).toMatchObject({
    ...original.state,
    retryQueue: [...original.state.retryQueue].sort(),
  });
  for (const field of ['customVerbs', 'customAdjectives', 'wordLists', 'practicePrefs'])
    expect(expected[field]).toEqual(original[field]);
  await page.evaluate(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
      sessionStorage.clear();
    },
    { key: STORAGE_KEY, data: seed },
  );
  await page.reload();
  await settings(page);
  const before = await saved(page);
  expect(learnerParts(before)).not.toEqual(learnerParts(expected));
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Paste backup JSON to restore', exact: true });
  await input.fill(text);
  await page.getByRole('button', { name: 'Check backup', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Backup preview' })).toBeVisible();
  expect(learnerParts(await saved(page))).toEqual(learnerParts(before));
  // Editing even harmless whitespace invalidates the explicit confirmation.
  await input.fill(text + ' ');
  await expect(page.getByRole('region', { name: 'Backup preview' })).toHaveCount(0);
  await input.fill(text);
  await page.getByRole('button', { name: 'Check backup', exact: true }).click();
  await page.getByRole('button', { name: 'Replace learner data', exact: true }).click();
  await expect.poll(async () => learnerParts(await saved(page))).toEqual(learnerParts(expected));
  const recovery = await page.evaluate((key) => {
    const bundle = JSON.parse(localStorage.getItem(key) || '{}');
    return JSON.parse(localStorage.getItem(bundle.recoveryBackupKey) || 'null');
  }, STORAGE_KEY);
  expect(learnerParts(recovery)).toEqual(learnerParts(before));
  await page.reload();
  await settings(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const exported = JSON.parse(
    await page.getByRole('textbox', { name: 'Backup export JSON', exact: true }).inputValue(),
  );
  expect(learnerParts(exported)).toEqual(learnerParts(expected));
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Download recovery backup', exact: true }),
  ).toBeVisible();
  if (process.env.PROFILE_RESTORE_SCREENSHOT)
    await page.screenshot({ path: process.env.PROFILE_RESTORE_SCREENSHOT });
  console.log(
    JSON.stringify({
      realProfileRestore: 'passed',
      version: exported.version,
      cards: Object.keys(exported.state.cards).length,
      attempts: exported.state.practiceStats.lifetime.attempted,
      correct: exported.state.practiceStats.lifetime.correct,
      customWords: exported.customVerbs.length + exported.customAdjectives.length,
      lists: exported.wordLists.length,
      recoveryPreserved: true,
      reloadPreserved: true,
    }),
  );
});
