import { test, expect } from '@playwright/test';

// Rush mode is a timed drill that starts paused behind a "Start" button and,
// once running, shows a live answer box plus Pause/End controls.
test.describe('Rush mode', () => {
  test('starting a game reveals the timed drill controls', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav').getByRole('tab', { name: 'games', exact: true }).click();

    // The Games tab opens on a hub; pick Kotoba Rush from the menu.
    await page.getByRole('button', { name: /Kotoba Rush/ }).click();
    await expect(page.getByText('Kotoba Rush').first()).toBeVisible();

    const start = page.getByRole('button', { name: 'Start', exact: true });
    await expect(start).toBeVisible();
    await start.click();

    // Once running, the answer box and Pause/End controls appear.
    await expect(page.getByPlaceholder('Type answer')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    // Pause toggles to Resume.
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  });
});
