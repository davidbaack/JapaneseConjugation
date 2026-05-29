import { test, expect } from '@playwright/test';

// Tab buttons live in the <nav>; their accessible name is the catalog label
// (CSS only capitalizes single words visually). Scope to the nav so we never
// collide with same-named buttons elsewhere (e.g. the "check" answer button in
// Study). `id` is only used to key the per-view anchor below.
const TABS = [
  { id: 'study', label: 'study' },
  { id: 'check', label: 'Conjugation Check' },
  { id: 'classify', label: 'Which Group?' },
  { id: 'endings', label: 'て Forms' },
  { id: 'games', label: 'games' },
  { id: 'mistakes', label: 'mistakes' },
  { id: 'levels', label: 'Progress' },
  { id: 'stats', label: 'stats' },
  { id: 'library', label: 'library' },
  { id: 'settings', label: 'settings' },
];

// One stable, always-present anchor per view to confirm it actually rendered.
const VIEW_ANCHORS = {
  games: () => /Kotoba Rush/,
  classify: () => /Classification drill/,
  endings: () => /Pattern map/,
  mistakes: () => /Mistake history/,
  levels: () => /Level breakdown/,
  stats: () => /Lifetime accuracy/,
};

test.describe('Tab navigation', () => {
  test('every tab is reachable and switches the active view', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    for (const { id, label } of TABS) {
      const button = page.locator('nav').getByRole('button', { name: label, exact: true });
      await expect(button, `nav button "${label}" should exist`).toBeVisible();
      await button.click();

      // The clicked tab becomes the highlighted/active one (font-semibold class).
      await expect(button).toHaveClass(/font-semibold/);

      // The Suspense fallback should resolve — "Loading…" must not linger.
      await expect(page.getByText('Loading…')).toHaveCount(0);

      const anchor = VIEW_ANCHORS[id];
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
