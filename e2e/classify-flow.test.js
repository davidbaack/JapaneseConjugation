import { test, expect } from '@playwright/test';

// The Classification drill asks the learner to pick a word's group from a set
// of choice buttons, then shows a verdict and a "Next" control.
test.describe('Classification drill', () => {
  test('choosing a group shows a verdict and advances to the next word', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav').getByRole('tab', { name: 'Which Group?', exact: true }).click();
    await expect(page.getByText('Classification drill')).toBeVisible();

    // At least the godan/ichidan choices are always present for a verb deck.
    const ichidan = page.getByRole('button', { name: 'ichidan', exact: true });
    const godan = page.getByRole('button', { name: 'godan', exact: true });
    await expect(ichidan.or(godan).first()).toBeVisible();

    // Pick one — exactly one verdict appears regardless of correctness.
    await ichidan.or(godan).first().click();
    await expect(page.getByText(/Correct\.|Not quite\./).first()).toBeVisible();

    // The "It is <group>." explanation is part of the verdict block.
    await expect(page.getByText(/It is /).first()).toBeVisible();

    // Advance to the next word.
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Back to an interactive choice (verdict cleared).
    await expect(page.getByText(/Correct\.|Not quite\./)).toHaveCount(0);
    await expect(ichidan.or(godan).first()).toBeEnabled();
  });
});
