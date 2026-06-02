import { test, expect } from '@playwright/test';

// Tab buttons live in the <nav>; their accessible name is the catalog label
// (CSS only capitalizes single words visually). Scope to the nav so we never
// collide with same-named buttons elsewhere (e.g. the "check" answer button in
// Study). `id` is only used to key the per-view anchor below.
const TABS = [
  { id: 'study', label: 'study' },
  { id: 'check', label: 'Conjugation Check' },
  { id: 'classify', label: 'Which Group?' },
  { id: 'endings', label: 'Endings' },
  { id: 'games', label: 'games' },
  { id: 'insights', label: 'insights' },
  { id: 'library', label: 'library' },
  { id: 'settings', label: 'settings' },
];

// One stable, always-present anchor per view to confirm it actually rendered.
const VIEW_ANCHORS = {
  games: () => /Kotoba Rush/,
  classify: () => /Classification drill/,
  endings: () => /Pattern map/,
  insights: () => /Overview/,
  library: () => /Rules and forms for the next drill/,
};

test.describe('Tab navigation', () => {
  test('every tab is reachable and switches the active view', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    for (const { id, label } of TABS) {
      const button = page.locator('nav').getByRole('tab', { name: label, exact: true });
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

    const studyTab = page.locator('nav').getByRole('tab', { name: 'study', exact: true });
    await expect(studyTab).toHaveClass(/font-semibold/);
  });

  test('lessons are reachable inside library', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav').getByRole('tab', { name: 'library', exact: true }).click();
    const lessonsTab = page.getByRole('tab', { name: /Lessons/ });
    await expect(lessonsTab).toBeVisible();
    await lessonsTab.click();

    await expect(page.getByRole('heading', { name: 'Conjugation formation guide' })).toBeVisible();
    await expect(page.getByText('127/127')).toBeVisible();
  });

  test('library lookup omits advanced reference tools', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav').getByRole('tab', { name: 'library', exact: true }).click();

    await expect(page.getByRole('tab', { name: /Lookup/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show tools' })).toHaveCount(0);
    await expect(page.getByText('Advanced reference tools')).toHaveCount(0);
    await expect(page.getByText('Dictionary & kanji')).toHaveCount(0);
    await expect(page.getByText('Handwriting & Stroke')).toHaveCount(0);
    await expect(page.getByText('Pronunciation lab')).toHaveCount(0);
    await expect(page.getByText('AI examples')).toHaveCount(0);
  });
});
