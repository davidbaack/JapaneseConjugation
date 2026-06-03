import { test, expect } from '@playwright/test';

const TABS = [
  { id: 'study', label: 'Reviews' },
  { id: 'lessons', label: 'Lessons' },
  { id: 'library', label: 'Library' },
  { id: 'lab', label: 'Practice Lab' },
  { id: 'settings', label: 'Settings' },
];

const VIEW_ANCHORS = {
  study: () => /Begin with the core forms|Start with what is ready now/,
  lessons: () => /Conjugation formation guide/,
  library: () => /What Reviews is allowed to show/,
  lab: () => /Check a conjugation/,
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

  test('reviews is the default tab on first load', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const reviewsTab = page.locator('nav').getByRole('tab', { name: 'Reviews', exact: true });
    await expect(reviewsTab).toHaveClass(/font-semibold/);
    await expect(page.getByRole('region', { name: 'Reviews dashboard' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Start Reviews|Start Core Warmup|Continue Reviews/ }),
    ).toBeVisible();
  });

  test('library exposes inventory, lookup, lists, and custom words', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav').getByRole('tab', { name: 'Library', exact: true }).click();

    await expect(page.getByRole('tab', { name: /^Inventory/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Lookup/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Lists/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Custom words/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review now' }).first()).toBeVisible();

    await page.getByRole('tab', { name: /^Lookup/ }).click();
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
    await expect(page.getByText('Display scripts')).toBeVisible();
    await expect(page.getByText('Review style')).toBeVisible();
    await expect(page.getByText('Source forms')).toBeVisible();
    await expect(page.getByText('New cards/day')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cloud Sync' })).toBeVisible();
    await expect(page.getByText('Backup & restore')).toBeVisible();
  });
});
