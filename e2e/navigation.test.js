import { test, expect } from '@playwright/test';

const TABS = [
  { id: 'practice', label: 'Practice' },
  { id: 'stats', label: 'Stats' },
  { id: 'learn', label: 'Learn' },
  { id: 'drills', label: 'Drills' },
  { id: 'tools', label: 'Tools' },
  { id: 'settings', label: 'Settings' },
];

const VIEW_ANCHORS = {
  practice: () => /Practicing \d+ forms?/,
  stats: () => /See what is getting easier/,
  learn: () => /Conjugation formation guide/,
  drills: () => /Pick a drill and start/,
  tools: () => /Lookup, check, word lists, and word management/,
  settings: () => /Display scripts/,
};

async function gotoFreshApp(page) {
  await page.goto('/');
  // Background service-worker traffic can outlast the usable app in Firefox.
  await expect(page.getByRole('button', { name: 'Choose forms', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Answer', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const registrations = navigator.serviceWorker
      ? await navigator.serviceWorker.getRegistrations()
      : [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const keys = window.caches ? await window.caches.keys() : [];
    await Promise.all(keys.map((key) => window.caches.delete(key)));
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose forms', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Answer', exact: true })).toBeVisible();
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
    const answer = page.getByPlaceholder('Type romaji or kana...');
    await expect(answer).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Practicing 8 forms' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose forms', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(page.getByText('Change', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Mixed practice/)).toHaveCount(0);
    await answer.scrollIntoViewIfNeeded();
    await expect(answer).toBeInViewport();
    await expect(page.getByRole('button', { name: /Start workout|Continue workout/ })).toHaveCount(
      0,
    );
  });

  test('practice controls remain reachable by scrolling at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFreshApp(page);

    const answer = page.getByPlaceholder('Type romaji or kana...');
    const settings = page.getByRole('region', { name: 'Answer settings', exact: true });
    await expect(settings.getByRole('group', { name: 'Answer style', exact: true })).toBeVisible();
    await expect(settings.getByRole('button', { name: 'Type', exact: true })).toBeVisible();

    const pageWidth = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(pageWidth.scrollWidth).toBe(pageWidth.clientWidth);

    await page.getByRole('button', { name: 'Choose forms', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Past · plain', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Past · polite', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.getByRole('button', { name: 'Hide form chooser', exact: true }).click();

    for (const height of [720, 400]) {
      // A short viewport approximates the space available above a phone keyboard.
      await page.setViewportSize({ width: 320, height });
      await page.getByRole('button', { name: 'Skip', exact: true }).scrollIntoViewIfNeeded();
      await expect(answer).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Check (Enter)' })).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Hint', exact: true })).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Reveal', exact: true })).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeInViewport();
    }
  });

  test('practice summary stays compact on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await gotoFreshApp(page);
    const selection = page.getByRole('region', { name: 'Practice selection' });
    await expect(selection.getByRole('heading', { name: 'Practicing 8 forms' })).toBeVisible();
    expect((await selection.boundingBox())?.height).toBeLessThan(160);
    await expect(selection.getByRole('checkbox')).toHaveCount(0);
  });

  test('tools exposes lookup, check, words, lists, and custom words', async ({ page }) => {
    await gotoFreshApp(page);

    await page.locator('nav').getByRole('tab', { name: 'Tools', exact: true }).click();

    await expect(page.getByRole('tab', { name: /^Lookup/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Check/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Words/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Ending Lab/ })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /^Groups/ })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /^Rush/ })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /^Lists/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Custom words/ })).toBeVisible();

    await page.getByRole('tab', { name: /^Words/ }).click();
    await expect(page.getByRole('button', { name: 'Practice this' }).first()).toBeVisible();

    await page.getByRole('tab', { name: /^Lookup/ }).click();
    await expect(page.getByText(/Search a dictionary word or any conjugated form/)).toBeVisible();
    await page.getByLabel('Search for a word or conjugation form').fill('taberu');
    await expect(page.getByText('Copy table')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Practice this' })).toBeVisible();
    await page.getByLabel('Search for a word or conjugation form').fill('tabeta');
    await expect(page.getByText('AI disambiguate')).toBeVisible();

    await page.getByRole('tab', { name: /^Check/ }).click();
    await expect(page.getByText('Check a conjugation')).toBeVisible();
    await page.getByLabel('Conjugated form').fill('tabeta');
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(page.getByText('Recognized form', { exact: true })).toBeVisible();

    await page.getByRole('tab', { name: /^Custom words/ }).click();
    await expect(page.getByRole('button', { name: /Add verb/ })).toBeVisible();

    await page.getByRole('tab', { name: /^Lists/ }).click();
    await expect(page.getByText('Built-in packs')).toBeVisible();
    await expect(page.getByText('AI list builder')).toBeVisible();
    await expect(page.getByText('WaniKani import')).toHaveCount(0);
    await expect(page.getByText('Bulk import into list')).toHaveCount(0);
    await expect(page.getByText('Export active list')).toHaveCount(0);
  });

  test('drills exposes ending, group, and rush exercises', async ({ page }) => {
    await gotoFreshApp(page);

    await page.locator('nav').getByRole('tab', { name: 'Drills', exact: true }).click();

    await expect(page.getByRole('tab', { name: /^Ending Lab/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Groups/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Rush/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Check/ })).toHaveCount(0);

    await expect(page.getByText('Ending Lab').first()).toBeVisible();
    await page.getByRole('tab', { name: /^Groups/ }).click();
    await expect(page.getByText('Classification drill')).toBeVisible();
    await page.getByRole('tab', { name: /^Rush/ }).click();
    await expect(page.getByText('Kotoba Rush').first()).toBeVisible();
  });

  test('settings keeps durable preferences and omits old practice controls', async ({ page }) => {
    await gotoFreshApp(page);

    await page.locator('nav').getByRole('tab', { name: 'Settings', exact: true }).click();

    await expect(page.getByText('Display scripts')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cloud Sync' })).toBeVisible();
    await expect(page.getByText('Data & account')).toBeVisible();
    await expect(page.getByText('Backup & restore')).toBeHidden();
    await page.getByText('Data & account').click();
    await expect(page.getByText('Backup & restore')).toBeVisible();
    await expect(page.getByText('Practice session')).toHaveCount(0);
    await expect(page.getByText('Conjugation types in scope')).toHaveCount(0);
    await expect(page.getByText('Review style')).toHaveCount(0);
    await expect(page.getByText('Source forms')).toHaveCount(0);
    await expect(page.getByText('New cards/day')).toHaveCount(0);
  });
});
