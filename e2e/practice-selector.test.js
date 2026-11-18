import { test, expect } from '@playwright/test';
import { DEFAULT_PREFS, STORAGE_KEY } from '../src/data/defaults.js';

const storageModule = '../src/utils/storage.js';
const selectionModule = '../src/utils/practiceSelection.js';
const [{ defaultState }, { practiceSelectionForTypeIds }] = await Promise.all([
  import(storageModule),
  import(selectionModule),
]);

async function seedPractice(page) {
  const state = defaultState();
  state.practiceSelection = practiceSelectionForTypeIds(['plain-past', 'te-form']);
  state.enabledTypes = ['plain-past', 'te-form'];
  await page.addInitScript(
    ({ key, state, prefs }) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          state,
          customVerbs: [],
          customAdjectives: [],
          wordLists: [],
          practicePrefs: prefs,
        }),
      );
      sessionStorage.clear();
      const word = { dict: '見る', reading: 'みる', meaning: 'to see', group: 'ichidan' };
      sessionStorage.setItem(
        'jp-study-current',
        JSON.stringify({ ...word, word, type: 'plain-past', selectionOrigin: 'new' }),
      );
    },
    {
      key: STORAGE_KEY,
      state,
      prefs: {
        ...DEFAULT_PREFS,
        kanaAssist: 'off',
        autoAdvanceCorrect: false,
        autoAdvanceCorrectUserSet: true,
        autoAiExplainErrors: false,
      },
    },
  );
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Practicing 2 forms' })).toBeVisible();
}

async function savedTypes(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || 'null')?.state.enabledTypes,
    STORAGE_KEY,
  );
}

async function activeCard(page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('jp-study-current') || 'null'));
}

test('exact edits retain eligible cards, replace ineligible cards, and persist without recording attempts', async ({
  page,
}) => {
  await seedPractice(page);
  const answer = page.getByRole('textbox', { name: 'Answer', exact: true });
  await answer.fill('m');
  await page.getByRole('button', { name: 'Choose forms', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Find a form' });
  await search.fill('potential');
  await page.getByRole('checkbox', { name: 'Potential · plain', exact: true }).check();
  await expect.poll(() => savedTypes(page)).toEqual(['plain-past', 'te-form', 'potential']);
  await expect(answer).toHaveValue('m');
  expect(await activeCard(page)).toMatchObject({ dict: '見る', type: 'plain-past' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Practicing 3 forms' })).toBeVisible();
  expect(await activeCard(page)).toMatchObject({ dict: '見る', type: 'plain-past' });
  await page.getByRole('button', { name: 'Choose forms', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Past · plain', exact: true }).uncheck();
  await expect.poll(() => savedTypes(page)).toEqual(['te-form', 'potential']);
  await expect.poll(async () => (await activeCard(page))?.type).not.toBe('plain-past');
  await expect(answer).toHaveValue('');
  await page.getByRole('checkbox', { name: 'Potential · plain', exact: true }).uncheck();
  await expect.poll(() => savedTypes(page)).toEqual(['te-form']);
  await page.getByRole('checkbox', { name: 'Te-form', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Te-form', exact: true })).toBeChecked();
  await expect(
    page.getByText(
      'Keep at least one form selected. Choose another form before removing this one.',
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) =>
        JSON.parse(localStorage.getItem(key) || 'null')?.state.practiceStats.lifetime.attempted,
      STORAGE_KEY,
    ),
  ).toBe(0);
});

for (const width of [320, 1280]) {
  test(`search and selection remain independent at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedPractice(page);
    await page.getByRole('button', { name: 'Choose forms', exact: true }).click();
    await page.getByRole('button', { name: 'Potential', exact: true }).click();
    const search = page.getByRole('searchbox', { name: 'Find a form' });
    await search.fill('書ける');
    await expect(
      page.getByRole('checkbox', { name: 'Potential · plain', exact: true }),
    ).toBeVisible();
    await search.fill('nonexistent-form');
    await expect(page.getByText(/No forms found/)).toBeVisible();
    await search.fill('');
    await expect(page.getByRole('button', { name: 'Potential', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(await savedTypes(page)).toEqual(['plain-past', 'te-form']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.getByRole('button', { name: 'Close form chooser', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Choose forms', exact: true })).toBeFocused();
  });
}
