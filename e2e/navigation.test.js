import { test, expect } from '@playwright/test';

const TABS = [
  { id: 'practice', label: 'Practice' },
  { id: 'learn', label: 'Learn' },
  { id: 'tools', label: 'Tools' },
  { id: 'settings', label: 'Settings' },
];

const VIEW_ANCHORS = {
  practice: () => /Start with a 12-card workout|Practice map/,
  learn: () => /Conjugation formation guide/,
  tools: () => /Lookup, check, repair drills, and word management/,
  settings: () => /Display scripts/,
};

async function gotoFreshApp(page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    const registrations = navigator.serviceWorker
      ? await navigator.serviceWorker.getRegistrations()
      : [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const keys = window.caches ? await window.caches.keys() : [];
    await Promise.all(keys.map((key) => window.caches.delete(key)));
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

test.describe('Tab navigation', () => {
  test('restored tabs are reachable', async ({ page }) => {
    await gotoFreshApp(page);

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
    await gotoFreshApp(page);

    const practiceTab = page.locator('nav').getByRole('tab', { name: 'Practice', exact: true });
    await expect(practiceTab).toHaveClass(/font-semibold/);
    await expect(page.getByRole('region', { name: 'Practice dashboard' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Start workout|Continue workout/ }),
    ).toBeVisible();
  });

  test('tools exposes lookup, check, words, lists, and custom words', async ({ page }) => {
    await gotoFreshApp(page);

    await page.locator('nav').getByRole('tab', { name: 'Tools', exact: true }).click();

    await expect(page.getByRole('tab', { name: /^Lookup/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Check/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Words/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Groups/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Rush/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Lists/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Custom words/ })).toBeVisible();

    await page.getByRole('tab', { name: /^Words/ }).click();
    await expect(page.getByRole('button', { name: 'Practice now' }).first()).toBeVisible();

    await page.getByRole('tab', { name: /^Lookup/ }).click();
    await expect(page.getByText('Copy table')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Drill word' })).toBeVisible();
    await page.getByLabel('Search for a word or conjugation form').fill('tabeta');
    await expect(page.getByText('AI disambiguate')).toBeVisible();

    await page.getByRole('tab', { name: /^Check/ }).click();
    await expect(page.getByText('Check a conjugation')).toBeVisible();
    await page.getByPlaceholder(/tabeta/).fill('tabeta');
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(page.getByText('Correct conjugation', { exact: true })).toBeVisible();

    await page.getByRole('tab', { name: /^Custom words/ }).click();
    await expect(page.getByRole('button', { name: /Add verb/ })).toBeVisible();

    await page.getByRole('tab', { name: /^Lists/ }).click();
    await expect(page.getByText('AI list builder')).toBeVisible();
    await expect(page.getByText('WaniKani import')).toBeVisible();
  });

  test('settings keeps durable preferences and omits old practice controls', async ({ page }) => {
    await gotoFreshApp(page);

    await page.locator('nav').getByRole('tab', { name: 'Settings', exact: true }).click();

    await expect(page.getByText('Display scripts')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cloud Sync' })).toBeVisible();
    await expect(page.getByText('Backup & restore')).toBeVisible();
    await expect(page.getByText('Practice session')).toHaveCount(0);
    await expect(page.getByText('Conjugation types in scope')).toHaveCount(0);
    await expect(page.getByText('Review style')).toHaveCount(0);
    await expect(page.getByText('Source forms')).toHaveCount(0);
    await expect(page.getByText('New cards/day')).toHaveCount(0);
  });
});
