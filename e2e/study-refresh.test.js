import { test, expect } from '@playwright/test';

// Reloading the Study tab should resume the same card rather than drawing a
// fresh verb. The active card is persisted to sessionStorage and restored on
// mount, so both the stored descriptor and the visible prompt must be stable
// across a page reload.
test.describe('Study refresh persistence', () => {
  test('reloading resumes the same card instead of a new verb', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // A card is on screen in the default input drill.
    await expect(page.getByPlaceholder('Type romaji or kana...')).toBeVisible();

    // The active card is persisted to sessionStorage.
    const before = await page.evaluate(() => sessionStorage.getItem('jp-study-current'));
    expect(before).toBeTruthy();

    // The prompt block (word + meaning + task) is derived entirely from the
    // current card, so it doubles as a visible fingerprint of the verb shown.
    const promptBefore = await page.locator('.text-center.relative').first().innerText();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByPlaceholder('Type romaji or kana...')).toBeVisible();

    // Same descriptor and same visible prompt after the reload.
    const after = await page.evaluate(() => sessionStorage.getItem('jp-study-current'));
    expect(after).toBe(before);

    const promptAfter = await page.locator('.text-center.relative').first().innerText();
    expect(promptAfter).toBe(promptBefore);
  });
});
