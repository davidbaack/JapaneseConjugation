import { test, expect } from '@playwright/test';

// The Classification drill asks the learner to pick a word's group from a set
// of choice buttons, then shows a verdict and a "Next" control.
test.describe('Classification drill', () => {
  test('choosing a group shows a verdict and advances to the next word', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav').getByRole('tab', { name: 'Which Group?', exact: true }).click();
    await expect(page.getByText('Classification drill')).toBeVisible();
    await expect(page.getByText('Group decoder')).toBeVisible();

    // At least the godan/ichidan choices are always present for a verb deck.
    const ichidan = page.getByRole('button', { name: /ichidan: drop る/ });
    const godan = page.getByRole('button', { name: /godan: row-shift/ });
    await expect(ichidan.or(godan).first()).toBeVisible();

    // Pick one — exactly one verdict appears regardless of correctness.
    await ichidan.or(godan).first().click();
    await expect(page.getByText(/Correct\.|Not quite\./).first()).toBeVisible();

    // The verdict teaches the clue, an example, and a trap to remember.
    await expect(page.getByText(/It is /).first()).toBeVisible();
    await expect(page.getByText('Recognition clue:')).toBeVisible();
    await expect(page.getByText('Example:')).toBeVisible();

    // Advance to the next word.
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Back to an interactive choice (verdict cleared).
    await expect(page.getByText(/Correct\.|Not quite\./)).toHaveCount(0);
    await expect(ichidan.or(godan).first()).toBeEnabled();
  });
});
