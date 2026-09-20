import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'jp-verb-srs-v2';

// Rush mode is a timed drill that starts paused behind a "Start" button and,
// once running, shows a live answer box plus Pause/End controls.
test.describe('Rush mode', () => {
  test('starting a game reveals the timed drill controls', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav').getByRole('tab', { name: 'Drills', exact: true }).click();
    await page.getByRole('tab', { name: /^Rush/ }).click();

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

  test('auto-submits a completed correct answer', async ({ page }) => {
    await page.addInitScript(
      ({ key }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            state: {
              schemaVersion: 4,
              enabledTypes: ['plain-past'],
              practiceSelection: {
                mixed: false,
                selectedTopicIds: ['te-ta-sound-changes'],
                selectedTypeIdsByTopic: {
                  'te-ta-sound-changes': ['plain-past'],
                },
              },
            },
            customVerbs: [],
            customAdjectives: [],
            wordLists: [
              {
                id: 'rush-single',
                name: 'Rush single',
                wordKeys: ['ichidan:\u98df\u3079\u308b'],
              },
            ],
            practicePrefs: {
              wordListIds: ['rush-single'],
              wordTypes: ['verb'],
              wordGroups: ['ichidan'],
              promptForm: 'dictionary',
            },
          }),
        );
      },
      { key: STORAGE_KEY },
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav').getByRole('tab', { name: 'Drills', exact: true }).click();
    await page.getByRole('tab', { name: /^Rush/ }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();

    await page.getByPlaceholder('Type answer').fill('tabeta');

    await expect(page.getByText('Correct', { exact: true })).toBeVisible();
    await expect(
      page.getByText('\u98df\u3079\u308b \u2192 \u305f\u3079\u305f', { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate((key) => {
          const payload = JSON.parse(localStorage.getItem(key) || '{}');
          const state = payload.state || {};
          return {
            cards: Object.keys(state.cards || {}).length,
            verbStats: Object.keys(state.verbStats || {}).length,
            rushAttempts: state.game?.byType?.['plain-past']?.attempted || 0,
          };
        }, STORAGE_KEY),
      )
      .toEqual({ cards: 0, verbStats: 0, rushAttempts: 1 });
  });
});
