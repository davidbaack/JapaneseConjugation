import { test, expect } from '@playwright/test';

// Tab labels live in the <nav>; their accessible name is the lowercase id
// (CSS only capitalizes them visually). Scope to the nav so we never collide
// with same-named buttons elsewhere (e.g. the "check" answer button in Study).
const TABS = [
  'study', 'check', 'rush', 'classify', 'endings',
  'mistakes', 'levels', 'stats', 'library', 'settings',
];

// One stable, always-present anchor per view to confirm it actually rendered.
const VIEW_ANCHORS = {
  rush: () => /Kotoba Rush/,
  classify: () => /Classification drill/,
  endings: () => /Pattern map/,
  mistakes: () => /Mistake history/,
  levels: () => /Level breakdown/,
  stats: () => /Lifetime accuracy/,
};

async function gotoTab(page, name) {
  await page.locator('nav').getByRole('button', { name, exact: true }).click();
}

test.describe('Tab navigation', () => {
  test('every tab is reachable and switches the active view', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    for (const tab of TABS) {
      const button = page.locator('nav').getByRole('button', { name: tab, exact: true });
      await expect(button, `nav button "${tab}" should exist`).toBeVisible();
      await button.click();

      // The clicked tab becomes the highlighted/active one (font-semibold class).
      await expect(button).toHaveClass(/font-semibold/);

      // The Suspense fallback should resolve — "Loading…" must not linger.
      await expect(page.getByText('Loading…')).toHaveCount(0);

      const anchor = VIEW_ANCHORS[tab];
      if (anchor) {
        await expect(page.getByText(anchor()).first()).toBeVisible();
      }
    }
  });

  test('study is the default tab on first load', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const studyTab = page.locator('nav').getByRole('button', { name: 'study', exact: true });
    await expect(studyTab).toHaveClass(/font-semibold/);
  });
});
