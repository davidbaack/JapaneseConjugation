import { test, expect } from '@playwright/test';

const practiceStatsModule = '../src/utils/practiceStats.js';
const { recordPracticeAnswer } = await import(practiceStatsModule);

const STORAGE_KEY = 'jp-verb-srs-v2';

function statsWith(answers) {
  return answers.reduce(
    (stats, answer, index) =>
      recordPracticeAnswer(stats, {
        ...answer,
        mode: 'input',
        at: Date.now() + index,
        id: `learner-review-${index}`,
      }),
    undefined,
  );
}

async function seedLearner(page, practiceStats) {
  await page.addInitScript(
    ({ key, practiceStats }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          state: {
            schemaVersion: 4,
            cards: {},
            practiceStats,
            enabledTypes: ['plain-past'],
            practiceSelection: {
              version: 2,
              selectedCategoryIds: ['core-forms'],
              selectedTypeIdsByCategory: { 'core-forms': ['plain-past'] },
              filters: { time: 'all', polarity: 'all', style: 'all' },
            },
          },
          customVerbs: [],
          customAdjectives: [],
          wordLists: [{ id: 'review-single', name: 'Review single', wordKeys: ['ichidan:食べる'] }],
          practicePrefs: {
            wordListIds: ['review-single'],
            wordTypes: ['verb'],
            wordGroups: ['ichidan'],
            promptForm: 'dictionary',
            kanaMatchDisplay: 'color-count',
            kanaAssist: 'live',
          },
        }),
      );
    },
    { key: STORAGE_KEY, practiceStats },
  );
  await page.goto('./');
}

test('Stats offers a continuation that preserves the current selection', async ({ page }) => {
  await seedLearner(page);
  await page.locator('nav').getByRole('tab', { name: 'Stats', exact: true }).click();
  const before = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || 'null')?.state.practiceSelection,
    STORAGE_KEY,
  );
  await page.getByRole('button', { name: 'Continue practice', exact: true }).click();
  await expect(
    page.locator('nav').getByRole('tab', { name: 'Practice', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  const after = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || 'null')?.state.practiceSelection,
    STORAGE_KEY,
  );
  expect(after).toEqual(before);
});

test('Stats places a recent-miss action above the chart before any topic qualifies', async ({
  page,
}) => {
  await seedLearner(
    page,
    statsWith([
      { typeId: 'plain-negative', correct: false },
      { typeId: 'volitional', correct: false },
    ]),
  );
  await page.locator('nav').getByRole('tab', { name: 'Stats', exact: true }).click();
  const action = page.getByRole('button', { name: 'Practice Volitional', exact: true });
  await expect(action).toContainText('recent misses');
  const actionBox = await action.boundingBox();
  const chartBox = await page.getByText('Accuracy over the last 14 days').boundingBox();
  if (!actionBox || !chartBox)
    throw new Error('Recommendation and chart must have visible bounds.');
  expect(actionBox.y + actionBox.height).toBeLessThan(chartBox.y);
  await action.click();
  await expect(
    page.locator('nav').getByRole('tab', { name: 'Practice', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('Stats explains the single eligible 80 percent topic recommendation', async ({ page }) => {
  await seedLearner(
    page,
    statsWith(
      Array.from({ length: 5 }, (_, index) => ({ typeId: 'adj-sou', correct: index !== 0 })),
    ),
  );
  await page.locator('nav').getByRole('tab', { name: 'Stats', exact: true }).click();
  const action = page.getByRole('button', { name: 'Practice Adjective Patterns', exact: true });
  await expect(action).toContainText('80% right across 5 attempts');
  await expect(action).toContainText('only topic with at least 3 attempts');
});

test('Ending Lab and Groups qualify sparse results and retain their answer counts', async ({
  page,
}) => {
  await seedLearner(page);
  await page.locator('nav').getByRole('tab', { name: 'Drills', exact: true }).click();
  await page.getByRole('tab', { name: /^Ending Lab/ }).click();
  const results = page.getByRole('region', { name: 'Ending Lab results', exact: true });
  await expect(results.getByText('New', { exact: true })).toBeVisible();
  await expect(page.getByText('Rule-supported practice', { exact: true })).toBeVisible();
  await expect(results).toContainText('the current exercise shows its rule');
  await page.getByRole('button', { name: 'て', exact: true }).last().click();
  await expect(results).toContainText('First attempt');
  await expect(results).toContainText('1 attempt');
  await expect(results).not.toContainText('100%');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'て', exact: true }).last().click();
  await expect(results).toContainText('Early estimate');
  await expect(results).toContainText('2 attempts');
  await page.getByRole('button', { name: 'ます', exact: true }).click();
  await expect(page.getByText('Rule-supported practice', { exact: true })).toHaveCount(0);
  await expect(results).not.toContainText('the current exercise shows its rule');
  await expect(results.getByText('New', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: /^Groups/ }).click();
  const classification = page.getByText('Classification drill', { exact: true }).locator('../..');
  await expect(classification).toContainText('New');
  await page.getByRole('button', { name: /^ichidan/ }).click();
  await expect(classification).toContainText('First attempt');
  await expect(classification).toContainText('1 right / 1 attempt');
  await expect(classification).not.toContainText('100%');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: /^ichidan/ }).click();
  await expect(classification).toContainText('Early estimate');
  await expect(classification).toContainText('2 right / 2 attempts');
});

test('Rush withholds untouched kana slots and resets them for each round', async ({ page }) => {
  await seedLearner(page);
  await page.locator('nav').getByRole('tab', { name: 'Drills', exact: true }).click();
  await page.getByRole('tab', { name: /^Rush/ }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const meter = page.getByRole('group', { name: 'Rush kana progress', exact: true });
  const answer = page.getByPlaceholder('Type answer');
  await expect(meter).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(meter).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await answer.fill('   ');
  await expect(meter).toHaveCount(0);
  await answer.fill('た');
  await expect(meter).toBeVisible();
  await answer.fill('なた');
  await expect(meter).toContainText('Kana 1 does not match yet.');
  await answer.fill('');
  await expect(meter).toHaveCount(0);
  await answer.fill('tabeta');
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  await expect(answer).toHaveValue('');
  await expect(answer).toBeEnabled();
  await expect(meter).toHaveCount(0);
  await page.getByRole('button', { name: 'End', exact: true }).click();
});
