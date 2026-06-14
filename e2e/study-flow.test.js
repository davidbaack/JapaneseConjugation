import { test, expect } from '@playwright/test';

// Exercises the core practice loop on the default Practice tab with the default
// answer mode ("input"): a card is shown, the learner submits an answer,
// feedback appears, and the reveal ends with one primary next action plus a
// focused Guide link for walking through the same form.
test.describe('Study flow', () => {
  test('answering a card shows feedback with a next action and Guide link', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Sign in to save SRS progress')).toHaveCount(0);
    await expect(page.getByText('Practice run', { exact: true })).toBeVisible();

    // Forward (conjugate) drill renders a free-text answer box.
    const input = page.getByPlaceholder('Type romaji or kana...');
    await expect(input).toBeVisible();

    // A deliberately wrong answer gives a deterministic "Not quite." verdict
    // without needing to know the expected conjugation.
    await input.fill('zzzz');
    const checkBtn = page.getByRole('button', { name: 'Check (Enter)' });
    await expect(checkBtn).toBeEnabled();
    await checkBtn.click();

    // Review phase: verdict + exactly one concrete next action, with Guide as
    // an explicit focused repair link for the same form.
    await expect(page.getByText('Not quite.').last()).toBeVisible();
    await expect(page.getByText('Walk through this form in Guide')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Guide for this rule' })).toBeVisible();
    const primaryNextAction = page.getByRole('button', {
      name: /^(Next card|Drill the trap|Review lesson)$/,
    });
    await expect(primaryNextAction).toHaveCount(1);
    await expect(primaryNextAction.first()).toBeVisible();
  });

  test('Reveal exposes the answer and shows a next action and Guide link', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Practice run', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Type romaji or kana...')).toBeVisible();
    await page.getByRole('button', { name: 'Reveal', exact: true }).click();

    // Revealing grades the card as missed and drops into the review phase.
    await expect(page.getByText('Walk through this form in Guide')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Guide for this rule' })).toBeVisible();
    const primaryNextAction = page.getByRole('button', {
      name: /^(Next card|Drill the trap|Review lesson)$/,
    });
    await expect(primaryNextAction).toHaveCount(1);
    await expect(primaryNextAction.first()).toBeVisible();
  });
});
