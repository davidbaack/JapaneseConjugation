import { test, expect } from '@playwright/test';
import { DEFAULT_PREFS, STORAGE_KEY } from '../src/data/defaults.js';

// Runtime imports keep application modules out of the tooling-only TS project.
const storageModule = '../src/utils/storage.js';
const selectionModule = '../src/utils/practiceSelection.js';
const [{ defaultState }, { practiceSelectionForTypeIds }] = await Promise.all([
  import(storageModule),
  import(selectionModule),
]);

async function activeCard(page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('jp-study-current') || 'null'));
}

async function savedTypes(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || 'null')?.state?.enabledTypes,
    STORAGE_KEY,
  );
}

for (const answerMode of ['input', 'choice']) {
  test(`Check replaces Causative with Plain Negative in ${answerMode} Practice`, async ({
    page,
  }) => {
    const state = defaultState();
    state.practiceSelection = practiceSelectionForTypeIds(['causative']);
    state.enabledTypes = ['causative'];
    await page.goto('./');
    await page.waitForLoadState('networkidle');
    await page.evaluate(
      ({ key, snapshot }) => {
        localStorage.setItem(key, JSON.stringify(snapshot));
        sessionStorage.clear();
      },
      {
        key: STORAGE_KEY,
        snapshot: {
          state,
          customVerbs: [],
          customAdjectives: [],
          wordLists: [],
          practicePrefs: {
            ...DEFAULT_PREFS,
            answerMode,
            autoAdvanceCorrect: false,
            autoAdvanceCorrectUserSet: true,
            autoAiExplainErrors: false,
          },
        },
      },
    );
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Passive & causative', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('tab', { name: 'Tools', exact: true }).click();
    await page.getByRole('tab', { name: /^Check/ }).click();
    await page.getByLabel('Conjugated form', { exact: true }).fill('yomunai');
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Practice this form', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Practice this form', exact: true }).click();

    await expect
      .poll(() => activeCard(page))
      .toMatchObject({ dict: '読む', type: 'plain-negative' });
    await expect.poll(() => savedTypes(page)).toEqual(['plain-negative']);
    await expect(page.getByText(/^1 forms?$/)).toBeVisible();
    if (answerMode === 'input') {
      await page.getByRole('textbox', { name: 'Answer', exact: true }).fill('yomanai');
    } else {
      await page.getByRole('button', { name: /^(読まない|よまない)$/ }).click();
    }
    await expect(page.getByText('Correct.', { exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: 'Next card', exact: true }).click();
    await expect
      .poll(() => activeCard(page))
      .toMatchObject({ dict: '読む', type: 'plain-negative' });

    await page.getByRole('button', { name: 'Exit focus', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Exit focus', exact: true })).toHaveCount(0);
    await expect.poll(() => savedTypes(page)).toEqual(['plain-negative']);
    await expect.poll(async () => (await activeCard(page))?.type).toBe('plain-negative');
    await page.reload();
    await expect.poll(async () => (await activeCard(page))?.type).toBe('plain-negative');
    await expect.poll(() => savedTypes(page)).toEqual(['plain-negative']);
    await expect(page.getByRole('button', { name: 'Exit focus', exact: true })).toHaveCount(0);
  });
}
