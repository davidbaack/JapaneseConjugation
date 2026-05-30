import { test, expect } from '@playwright/test';

// Conjugation Match is a tap-based memory board reached from the Games hub. It
// deals a grid of face-down tiles behind a Start button.
test.describe('Conjugation Match', () => {
  test('starting a board reveals tiles that can be flipped', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav').getByRole('tab', { name: 'games', exact: true }).click();

    // Pick Conjugation Match from the hub menu.
    await page.getByRole('button', { name: /Conjugation Match/ }).click();
    await expect(page.getByText('Conjugation Match').first()).toBeVisible();

    await page.getByRole('button', { name: 'Start', exact: true }).click();

    // A board of hidden tiles appears; flipping one faces it up (it stops being a
    // "Hidden tile").
    const hidden = page.getByRole('button', { name: 'Hidden tile' });
    const before = await hidden.count();
    expect(before).toBeGreaterThan(1);

    await hidden.first().click();
    await expect(page.getByRole('button', { name: 'Hidden tile' })).toHaveCount(before - 1);
  });
});
