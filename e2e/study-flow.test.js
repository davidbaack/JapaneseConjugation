import { test, expect } from '@playwright/test';

// Exercises the core practice loop on the default Practice tab with the default
// answer mode ("input"): a card is shown, the learner submits an answer,
// feedback appears, and advancing returns to the answering phase.
test.describe('Study flow', () => {
  test('answering a card shows feedback and advances', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Sign in to save SRS progress')).toHaveCount(0);
    await expect(page.getByText('Continuous practice', { exact: true })).toBeVisible();

    // Forward (conjugate) drill renders a free-text answer box.
    const input = page.getByPlaceholder('Type romaji or kana...');
    await expect(input).toBeVisible();

    // A deliberately wrong answer gives a deterministic "Not quite." verdict
    // without needing to know the expected conjugation.
    await input.fill('zzzz');
    const checkBtn = page.getByRole('button', { name: 'Check (Enter)' });
    await expect(checkBtn).toBeEnabled();
    await checkBtn.click();

    // Review phase: verdict + the canonical advance control.
    await expect(page.getByText('Not quite.').last()).toBeVisible();
    const next = page.getByRole('button', { name: 'Next (Enter)' });
    await expect(next).toBeVisible();

    // Advancing returns to the answering phase with a fresh input.
    await next.click();
    await expect(page.getByPlaceholder('Type romaji or kana...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check (Enter)' })).toBeVisible();
  });

  test('Reveal exposes the answer and lets the learner continue', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Continuous practice', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Type romaji or kana...')).toBeVisible();
    await page.getByRole('button', { name: 'Reveal', exact: true }).click();

    // Revealing grades the card as missed and drops into the review phase.
    await expect(page.getByRole('button', { name: 'Next (Enter)' })).toBeVisible();
  });
});
