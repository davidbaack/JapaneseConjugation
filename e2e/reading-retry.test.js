import { test, expect } from '@playwright/test';
import { DEFAULT_PREFS, STORAGE_KEY } from '../src/data/defaults.js';
const selectionModule = '../src/utils/practiceSelection.js';
const { practiceSelectionForTypeIds } = await import(selectionModule);

test('Reading corrects only the matching source retry, including after reload', async ({
  page,
}) => {
  const types = ['plain-past', 'te-form'];
  await page.addInitScript(
    ({ key, selection, types, prefs }) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { schemaVersion: 4, cards: {}, enabledTypes: types, practiceSelection: selection },
          customVerbs: [],
          customAdjectives: [],
          wordLists: [{ id: 'reading-word', name: 'Reading word', wordKeys: ['ichidan:食べる'] }],
          practicePrefs: {
            ...prefs,
            wordListIds: ['reading-word'],
            reviewStyle: 'reading',
            kanaAssist: 'off',
            sentenceMode: false,
            autoSpeak: false,
            autoAdvanceCorrect: false,
            autoAdvanceCorrectUserSet: true,
            autoAiExplainErrors: false,
          },
        }),
      );
      const word = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
      sessionStorage.setItem(
        'jp-study-current',
        JSON.stringify({ ...word, word, type: 'dictionary', sourceType: 'plain-past' }),
      );
    },
    {
      key: STORAGE_KEY,
      selection: practiceSelectionForTypeIds(types),
      types,
      prefs: DEFAULT_PREFS,
    },
  );
  await page.goto('./');
  const active = page
    .getByRole('complementary', { name: 'Form strength' })
    .locator('[aria-current="true"]');
  const input = page.getByPlaceholder('Type dictionary form...');
  const readState = () =>
    page.evaluate((key) => {
      const saved = localStorage.getItem(key);
      if (!saved) throw new Error('Expected the seeded learner snapshot.');
      return JSON.parse(saved).state;
    }, STORAGE_KEY);
  await expect(active).toHaveAttribute('data-form-type', 'plain-past');
  await input.fill('zzz');
  await page.getByRole('button', { name: 'Check (Enter)' }).click();
  await expect.poll(async () => (await readState()).retryQueue.length).toBe(1);
  const missed = await readState();
  const pending = missed.retryQueue;
  expect(missed.mistakes[0]).toMatchObject({ promptType: 'plain-past', resolved: false });
  await page.getByRole('button', { name: 'Next card', exact: true }).click();
  await expect(active).toHaveAttribute('data-form-type', 'te-form');
  await input.fill('たべる');
  await page.getByRole('button', { name: 'Check (Enter)' }).click();
  await expect.poll(async () => (await readState()).session.reviewed).toBe(2);
  const afterOtherSource = await readState();
  expect(afterOtherSource.retryQueue).toEqual(pending);
  expect(afterOtherSource.mistakes[0].resolved).toBe(false);
  await page.getByRole('button', { name: 'Next card', exact: true }).click();
  await expect(active).toHaveAttribute('data-form-type', 'plain-past');
  await page.reload();
  await expect(active).toHaveAttribute('data-form-type', 'plain-past');
  expect((await readState()).retryQueue).toEqual(pending);
  await input.fill('たべる');
  await page.getByRole('button', { name: 'Check (Enter)' }).click();
  await expect.poll(async () => (await readState()).retryQueue).toEqual([]);
  const corrected = await readState();
  expect(corrected.mistakes[0].resolved).toBe(true);
  expect(corrected.cards['verb:ichidan:食べる:たべる|dictionary']).toMatchObject({
    correct: 2,
    incorrect: 1,
    sourceTypeStats: {
      'plain-past': { correct: 1, incorrect: 1 },
      'te-form': { correct: 1, incorrect: 0 },
    },
  });
});
