import { test, expect } from '@playwright/test';

const TABS = [
  { id: 'study', label: 'Practice' },
  { id: 'check', label: 'Check' },
  { id: 'classify', label: 'Which Group?' },
  { id: 'endings', label: 'Endings' },
  { id: 'games', label: 'Games' },
  { id: 'insights', label: 'Insights' },
  { id: 'library', label: 'Library' },
  { id: 'settings', label: 'Settings' },
];

const VIEW_ANCHORS = {
  classify: () => /Classification drill/,
  endings: () => /Ending Lab/,
  games: () => /Kotoba Rush/,
  insights: () => /Overview/,
  library: () => /Rules and forms for the next drill/,
  settings: () => /Practice session/,
};

test.describe('Tab navigation', () => {
  test('restored tabs are reachable', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    for (const { id, label } of TABS) {
      const button = page.locator('nav').getByRole('tab', { name: label, exact: true });
      await expect(button, `nav button "${label}" should exist`).toBeVisible();
      await button.click();

      await expect(button).toHaveClass(/font-semibold|bg-stone-800/);
      await expect(page.getByText('Loading…')).toHaveCount(0);

      const anchor = VIEW_ANCHORS[id];
      if (anchor) await expect(page.getByText(anchor()).first()).toBeVisible();
    }
  });

  test('practice is the default tab on first load', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const practiceTab = page.locator('nav').getByRole('tab', { name: 'Practice', exact: true });
    await expect(practiceTab).toHaveClass(/font-semibold/);
    await expect(page.getByText('Practice progress')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retest misses' })).toBeVisible();
  });

  test('library exposes lookup, lessons, lists, and custom words', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav').getByRole('tab', { name: 'Library', exact: true }).click();

    await expect(page.getByRole('tab', { name: /^Lookup/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Lessons/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Lists/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Custom words/ })).toBeVisible();
    await expect(page.getByText('Copy table')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Drill word' })).toBeVisible();

    await page.getByLabel('Search for a word or conjugation form').fill('tabeta');
    await expect(page.getByText('AI disambiguate')).toBeVisible();

    await page.getByRole('tab', { name: /^Custom words/ }).click();
    await expect(page.getByRole('button', { name: /Add verb/ })).toBeVisible();

    await page.getByRole('tab', { name: /^Lists/ }).click();
    await expect(page.getByText('AI list builder')).toBeVisible();
    await expect(page.getByText('WaniKani import')).toBeVisible();
  });

  test('settings exposes restored learner controls', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav').getByRole('tab', { name: 'Settings', exact: true }).click();

    await expect(page.getByText('Practice session')).toBeVisible();
    await expect(page.getByText('Conjugation types in scope')).toBeVisible();
    await expect(page.getByText('Vocabulary filters')).toBeVisible();
    await expect(page.getByText('Display scripts')).toBeVisible();
    await expect(page.getByText('Review style')).toBeVisible();
    await expect(page.getByText('Source forms')).toBeVisible();
    await expect(page.getByText('New cards/day')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cloud Sync' })).toBeVisible();
    await expect(page.getByText('Backup & restore')).toBeVisible();
  });
});
