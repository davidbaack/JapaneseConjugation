import { test, expect } from '@playwright/test';
import { DEFAULT_PREFS, STORAGE_KEY } from '../src/data/defaults.js';

const storageModule = '../src/utils/storage.js';
const selectionModule = '../src/utils/practiceSelection.js';
const [{ defaultState }, { practiceSelectionForTypeIds }] = await Promise.all([
  import(storageModule),
  import(selectionModule),
]);

const MIRU = { dict: '見る', reading: 'みる', meaning: 'to see', group: 'ichidan' };
const SURU = { dict: 'する', reading: 'する', meaning: 'to do', group: 'suru' };

async function seedPractice(page, { types = ['plain-past'], word = MIRU } = {}) {
  const state = defaultState();
  state.practiceSelection = practiceSelectionForTypeIds(types);
  state.enabledTypes = types;
  await page.goto('./');
  await expect(page.locator('#practice-answer')).toBeVisible();
  await page.evaluate(
    ({ key, snapshot, card }) => {
      localStorage.setItem(key, JSON.stringify(snapshot));
      sessionStorage.clear();
      sessionStorage.setItem('jp-study-current', JSON.stringify(card));
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
          autoAdvanceCorrectUserSet: true,
          autoAiExplainErrors: false,
        },
      },
      card: { ...word, word, type: types[0] },
    },
  );
  await page.reload();
  await expect(page.locator('#practice-answer')).toBeVisible();
}

async function savedState(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || 'null')?.state,
    STORAGE_KEY,
  );
}

async function openGenkiWord(page) {
  await page.getByRole('tab', { name: 'Tools', exact: true }).click();
  await page.getByRole('tab', { name: 'Words', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: 'Words', exact: true });
  await panel.getByRole('searchbox').fill('元気');
  await panel.getByRole('button', { name: 'Practice this', exact: true }).click();
}

test('beginner help stays optional and leads to readable lesson examples', async ({ page }) => {
  await seedPractice(page);
  const help = page.locator('details').filter({ hasText: 'New to conjugation?' });
  await expect(help).not.toHaveAttribute('open');
  await help.getByText('New to conjugation?', { exact: true }).click();
  await expect(help.getByRole('region', { name: 'Worked example: Plain Negative' })).toContainText(
    '食べない (たべない)',
  );
  await help.getByRole('button', { name: 'Learn Basics and Politeness', exact: true }).click();
  const lesson = page.locator('#lesson-panel-basic-tenses');
  await expect(lesson).toBeVisible();
  const writeRow = lesson.getByRole('row').filter({ hasText: 'to write' });
  await expect(writeRow).toContainText('かかない');
  await expect(writeRow).toContainText('かきます');
  await expect(lesson).toContainText('たべない');
  await expect(lesson).toBeInViewport();
  await expect.poll(async () => (await savedState(page)).enabledTypes).toEqual(['plain-past']);
  await expect.poll(async () => (await savedState(page)).practiceStats.lifetime.attempted).toBe(0);
});

test('open Hint follows empty, partial, wrong and revised input without a new click', async ({
  page,
}) => {
  await seedPractice(page);
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  const initial = page.getByText(/You have not typed anything yet/);
  await expect(initial).toBeVisible();
  const input = page.locator('#practice-answer');
  await input.fill('mi');
  await expect(initial).toHaveCount(0);
  await expect(page.getByText(/「み」 is correct so far/)).toBeVisible();
  await input.fill('zz');
  await expect(page.getByText(/The very beginning doesn't match yet/)).toBeVisible();
  await input.fill('mi');
  await expect(page.getByText(/「み」 is correct so far/)).toBeVisible();
  await input.fill('');
  await expect(initial).toBeVisible();
});

test('sentence review explains copied endings and marks only the blank', async ({ page }) => {
  await seedPractice(page);
  await page.getByRole('tab', { name: 'Tools', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Search for a word or conjugation form' })
    .fill('genkisou');
  await page.getByRole('button', { name: 'Practice this form', exact: true }).click();
  await page.getByText('Answer settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Sentence off', exact: true }).click();
  await page.getByText('Answer settings', { exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: 'Practice', exact: true });
  await expect(panel).toContainText(/この子は|No reviewed sentence/);
  if (await page.getByText(/No reviewed sentence for this word/).isVisible()) {
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
  }
  const input = page.getByRole('textbox', { name: 'Fill only the blank', exact: true });
  await expect(input).toBeVisible();
  await input.fill('genkisouda');
  await page.getByRole('button', { name: 'Check (Enter)', exact: true }).click();
  const review = page.getByRole('region', { name: 'Sentence blank review' });
  await expect(review).toContainText('The sentence already includes だ; enter 元気そう here.');
  await expect(review.locator('mark').last()).toHaveText('元気そう');
  await expect(panel.getByText('Not quite.', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Next card', exact: true }).click();
  await expect(input).toBeVisible();
  await input.fill('genkisou');
  await expect(panel.getByText('Correct.', { exact: true }).last()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sentence blank review' })).not.toContainText(
    'The sentence already includes',
  );
});

test('incompatible word launch previews a replacement and can retain the old selection', async ({
  page,
}) => {
  const types = ['humble', 'humble-polite'];
  await seedPractice(page, { types, word: SURU });
  await openGenkiWord(page);
  await expect(
    page.getByRole('heading', { name: 'Choose compatible forms for 元気' }),
  ).toBeVisible();
  await expect(page.getByText(/Your selected forms.*Humble/)).toBeVisible();
  await expect.poll(async () => (await savedState(page)).enabledTypes).toEqual(types);
  await page.getByRole('button', { name: 'Keep selected forms; choose another word' }).click();
  await expect(page.locator('#practice-answer')).toBeVisible();
  await expect.poll(async () => (await savedState(page)).enabledTypes).toEqual(types);
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(sessionStorage.getItem('jp-study-current') || 'null')?.dict),
    )
    .not.toBe('元気');
  await openGenkiWord(page);
  await expect(page.getByText(/will replace your selection with these 8 forms/)).toBeVisible();
  await page.getByRole('button', { name: 'Practice Adjective Core Forms', exact: true }).click();
  await expect(page.locator('#practice-answer')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(sessionStorage.getItem('jp-study-current') || 'null')?.dict),
    )
    .toBe('元気');
  await expect
    .poll(async () => (await savedState(page)).enabledTypes.every((id) => id.startsWith('adj-')))
    .toBe(true);
  await expect.poll(async () => (await savedState(page)).practiceStats.lifetime.attempted).toBe(0);
});

test('named list creation and keyboard tab navigation stay operable', async ({ page }) => {
  await seedPractice(page);
  await page.getByRole('tab', { name: 'Tools', exact: true }).click();
  await page.getByRole('tab', { name: 'Lists', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create list', exact: true })).toBeVisible();
  const lookup = page.getByRole('tab', { name: 'Lookup', exact: true });
  await lookup.click();
  await lookup.press('ArrowRight');
  await expect(page.getByRole('textbox', { name: 'Conjugated form', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Check', exact: true })).toBeFocused();
  const settings = page.getByRole('tab', { name: 'Settings', exact: true });
  await settings.click();
  await settings.press('ArrowRight');
  const practice = page.getByRole('tab', { name: 'Practice', exact: true });
  await expect(page.locator('#practice-answer')).toBeVisible();
  await expect(practice).toBeFocused();
  await practice.press('ArrowRight');
  const guide = page.getByRole('tab', { name: 'Guide', exact: true });
  await expect(guide).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: 'Plain form', exact: true })).toBeVisible();
  await expect(guide).toBeFocused();
  await guide.press('ArrowLeft');
  await expect(page.locator('#practice-answer')).toBeVisible();
  await expect(practice).toBeFocused();
  await page.locator('#practice-answer').fill('minai');
  await page.getByRole('button', { name: 'Check (Enter)', exact: true }).click();
  await page.getByRole('button', { name: 'Review grammar', exact: true }).click();
  const learn = page.getByRole('tab', { name: 'Learn', exact: true });
  await expect(learn).toHaveAttribute('aria-selected', 'true');
  await learn.press('Home');
  await expect(page.getByRole('button', { name: 'Next card', exact: true })).toBeVisible();
  await expect(practice).toBeFocused();
});
