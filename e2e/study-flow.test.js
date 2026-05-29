import { test, expect } from '@playwright/test';

// Exercises the core SRS loop on the default Study tab with the default
// answer mode ("input"): a card is shown, the learner submits an answer,
// review feedback appears, and advancing returns to the answering phase
// with the session counter incremented.
test.describe('Study flow', () => {
  test('answering a card shows feedback, advances, and counts the review', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Session counter starts at 0/0.
    await expect(page.getByText('0/0 this session')).toBeVisible();

    // Forward (conjugate) drill renders a free-text answer box.
    const input = page.getByPlaceholder('Type romaji or kana...');
    await expect(input).toBeVisible();

    // A deliberately wrong answer gives a deterministic "Not quite." verdict
    // without needing to know the expected conjugation.
    await input.fill('zzzz');
    await page.getByRole('button', { name: 'Check (Enter)' }).click();

    // Review phase: verdict + the canonical advance control.
    await expect(page.getByText('Not quite.').first()).toBeVisible();
    const next = page.getByRole('button', { name: 'Next (Enter)' });
    await expect(next).toBeVisible();

    // The review is recorded immediately (denominator goes 0 -> 1).
    await expect(page.getByText(/\/1 this session/)).toBeVisible();

    // Advancing returns to the answering phase with a fresh input.
    await next.click();
    await expect(page.getByPlaceholder('Type romaji or kana...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check (Enter)' })).toBeVisible();
  });

  test('Reveal exposes the answer and lets the learner continue', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByPlaceholder('Type romaji or kana...')).toBeVisible();
    await page.getByRole('button', { name: 'Reveal', exact: true }).click();

    // Revealing grades the card as missed and drops into the review phase.
    await expect(page.getByRole('button', { name: 'Next (Enter)' })).toBeVisible();
    await expect(page.getByText(/\/1 this session/)).toBeVisible();
  });
});
