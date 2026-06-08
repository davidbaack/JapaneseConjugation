import { test, expect } from '@playwright/test';

async function readStoredCurrent(page) {
  return page.evaluate(() => sessionStorage.getItem('jp-study-current'));
}

async function waitForStableStoredCurrent(page) {
  let last = await readStoredCurrent(page);
  for (let i = 0; i < 15; i += 1) {
    await page.waitForTimeout(100);
    const next = await readStoredCurrent(page);
    if (next && next === last) return next;
    last = next;
  }
  return last;
}

async function waitForPracticeCard(page) {
  await expect(page.getByText('Continuous practice')).toBeVisible();
  await expect(page.getByPlaceholder('Type romaji or kana...')).toBeVisible();
}

// Reloading the Practice tab should resume the same card rather than drawing a
// fresh verb. The active card is persisted to sessionStorage and restored on
// mount, so both the stored descriptor and the visible prompt must be stable
// across a page reload.
test.describe('Study refresh persistence', () => {
  test('reloading resumes the same card instead of a new verb', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await waitForPracticeCard(page);

    // The active card is persisted to sessionStorage.
    const before = await waitForStableStoredCurrent(page);
    expect(before).toBeTruthy();

    // The prompt block (word + meaning + task) is derived entirely from the
    // current card, so it doubles as a visible fingerprint of the verb shown.
    const promptBefore = await page.locator('.text-center.relative').first().innerText();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForPracticeCard(page);

    // Same descriptor and same visible prompt after the reload.
    await expect.poll(() => readStoredCurrent(page)).toBe(before);

    const promptAfter = await page.locator('.text-center.relative').first().innerText();
    expect(promptAfter).toBe(promptBefore);
  });
});
