import { test, expect } from '@playwright/test';

// Settings exposes a theme switch (Light / Dark / System). Changing it should
// immediately update the document body theme class and persist across reloads
// via localStorage — covering the practice-prefs persistence path.
test.describe('Settings — theme preference', () => {
  test('switching to Dark updates the body theme and persists', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav').getByRole('tab', { name: 'settings', exact: true }).click();
    await expect(page.getByText('Practice mode')).toBeVisible();

    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(/theme-dark/);

    // Preference is written to localStorage and rehydrated on reload.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toHaveClass(/theme-dark/);

    // Flip back to Light to confirm the toggle is bidirectional.
    await page.locator('nav').getByRole('tab', { name: 'settings', exact: true }).click();
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(/theme-light/);
  });
});
