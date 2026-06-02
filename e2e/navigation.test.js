import { test, expect } from '@playwright/test';

const TABS = [
  { id: 'study', label: 'Practice' },
  { id: 'check', label: 'Check' },
  { id: 'library', label: 'Library' },
  { id: 'settings', label: 'Settings' },
];

const VIEW_ANCHORS = {
  library: () => /Lookup and words for practice/,
  settings: () => /Practice setup/,
};

test.describe('Tab navigation', () => {
  test('only the simplified tabs are reachable', async ({ page }) => {
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

    for (const removed of ['Which Group?', 'Endings', 'games', 'insights']) {
      await expect(
        page.locator('nav').getByRole('tab', { name: removed, exact: true }),
      ).toHaveCount(0);
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

  test('library exposes only lookup and words', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav').getByRole('tab', { name: 'Library', exact: true }).click();

    await expect(page.getByRole('tab', { name: /^Lookup/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Words/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Lessons', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Lists', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Custom words', exact: true })).toHaveCount(0);
    await expect(page.getByText('AI disambiguate')).toHaveCount(0);
    await expect(page.getByText('Scratch conjugator')).toHaveCount(0);
    await expect(page.getByText('Copy table')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Drill word' })).toBeVisible();

    await page.getByRole('tab', { name: /^Words/ }).click();
    await expect(page.getByRole('button', { name: /Add verb/ })).toBeVisible();
    await expect(page.getByText('AI list builder')).toHaveCount(0);
    await expect(page.getByText('WaniKani import')).toHaveCount(0);
  });

  test('settings keeps only core practice controls visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav').getByRole('tab', { name: 'Settings', exact: true }).click();

    await expect(page.getByText('Practice setup')).toBeVisible();
    await expect(page.getByText('Form scope')).toBeVisible();
    await expect(page.getByText('Display scripts')).toBeVisible();
    await expect(page.getByText('Review style')).toHaveCount(0);
    await expect(page.getByText('Source forms')).toHaveCount(0);
    await expect(page.getByText('New cards/day')).toHaveCount(0);
    await expect(page.getByText('Cloud Sync')).toHaveCount(0);
    await expect(page.getByText('Backup & restore')).toHaveCount(0);
  });
});
