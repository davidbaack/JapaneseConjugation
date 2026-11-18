import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { DEFAULT_PREFS, STORAGE_KEY } from '../src/data/defaults.js';
import { PRACTICE_CATEGORIES } from '../src/data/practiceTaxonomy.js';
const selectionModule = '../src/utils/practiceSelection.js';
const { practiceSelectionForTypeIds } = await import(selectionModule);

const TYPES = ['plain-past', 'plain-negative', 'te-form'];
const ANSWERS = { 'plain-past': 'たべた', 'plain-negative': 'たべない', 'te-form': 'たべて' };

async function seedPractice(page, types = TYPES, overrides = {}) {
  await page.addInitScript(
    ({ key, selection, types, prefs }) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { schemaVersion: 4, cards: {}, enabledTypes: types, practiceSelection: selection },
          customVerbs: [],
          customAdjectives: [],
          wordLists: [{ id: 'meter-word', name: 'Meter word', wordKeys: ['ichidan:食べる'] }],
          practicePrefs: {
            ...prefs,
            wordListIds: ['meter-word'],
            kanaAssist: 'off',
            autoAdvanceCorrect: false,
            autoAdvanceCorrectUserSet: true,
            autoAiExplainErrors: false,
          },
        }),
      );
    },
    {
      key: STORAGE_KEY,
      selection: practiceSelectionForTypeIds(types),
      types,
      prefs: { ...DEFAULT_PREFS, ...overrides },
    },
  );
  await page.goto('./');
  await expect(page.getByRole('complementary', { name: 'Form strength' })).toBeVisible();
}

test('saved exact-form meters rise and fall, survive reload, and follow filters', async ({
  page,
}) => {
  await seedPractice(page);
  const panel = page.getByRole('complementary', { name: 'Form strength' });
  await expect(panel.getByRole('meter')).toHaveCount(3);
  const current = panel.locator('[aria-current="true"]');
  const type = await current.getAttribute('data-form-type');
  const meter = current.getByRole('meter');
  const before = Number(await meter.getAttribute('aria-valuenow'));
  await page.getByPlaceholder('Type romaji or kana...').fill(ANSWERS[type]);
  await page.getByRole('button', { name: 'Check (Enter)' }).click();
  await expect(panel.getByRole('status')).toContainText('increased');
  const raised = Number(await meter.getAttribute('aria-valuenow'));
  expect(raised).toBeGreaterThan(before);
  await page.reload();
  const savedMeter = panel.locator(`[data-form-type="${type}"]`).getByRole('meter');
  await expect(savedMeter).toHaveAttribute('aria-valuenow', String(raised));
  await page.getByPlaceholder('Type romaji or kana...').fill('zzz');
  await page.getByRole('button', { name: 'Check (Enter)' }).click();
  await expect(panel.getByRole('status')).toContainText('decreased');
  expect(Number(await savedMeter.getAttribute('aria-valuenow'))).toBeLessThan(raised);
  await page.getByRole('button', { name: 'Next card', exact: true }).click();
  await expect(panel.getByRole('status')).toBeEmpty();
  const time = page.getByRole('radiogroup', { name: 'Time', exact: true });
  await time.getByRole('radio', { name: 'Past', exact: true }).click();
  await expect(panel.getByRole('meter')).toHaveCount(1);
  await time.getByRole('radio', { name: 'All', exact: true }).click();
  await expect(panel.getByRole('meter')).toHaveCount(3);
  expect(Number(await savedMeter.getAttribute('aria-valuenow'))).toBeLessThan(raised);
});

test('filtering the current reading source replaces it without recording an answer', async ({
  page,
}) => {
  await seedPractice(page, ['plain-past', 'plain-negative'], { reviewStyle: 'reading' });
  const panel = page.getByRole('complementary', { name: 'Form strength' });
  await expect(panel.locator('[aria-current="true"]')).toHaveAttribute(
    'data-form-type',
    'plain-past',
  );
  await page
    .getByRole('radiogroup', { name: 'Time', exact: true })
    .getByRole('radio', { name: 'Non-past', exact: true })
    .click();
  await expect(panel.getByRole('meter')).toHaveCount(1);
  await expect(panel.locator('[aria-current="true"]')).toHaveAttribute(
    'data-form-type',
    'plain-negative',
  );
  await expect(page.getByPlaceholder('Type dictionary form...')).toBeVisible();
  expect(
    await page.evaluate(
      (key) =>
        JSON.parse(localStorage.getItem(key) || 'null')?.state.practiceStats?.lifetime?.attempted ||
        0,
      STORAGE_KEY,
    ),
  ).toBe(0);
});

test('desktop meters stay beside the exercise and expose accessible values', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedPractice(page);
  const panel = page.getByRole('complementary', { name: 'Form strength' });
  const panelBox = await panel.boundingBox();
  const inputBox = await page.getByPlaceholder('Type romaji or kana...').boundingBox();
  if (!panelBox || !inputBox) throw new Error('The panel and answer field must have layout boxes');
  expect(panelBox.x).toBeGreaterThan(inputBox.x + inputBox.width);
  const axe = await new AxeBuilder({ page }).include('aside[aria-label="Form strength"]').analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: 'tmp/form-strength-desktop.png', fullPage: true });
});

test('320px meters scroll without page overflow and keep answer actions reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await seedPractice(page);
  const panel = page.getByRole('complementary', { name: 'Form strength' });
  const rail = page.getByTestId('form-strength-rail');
  for (const category of PRACTICE_CATEGORIES) {
    const chip = page
      .getByRole('group', { name: 'Practice categories', exact: true })
      .getByRole('button')
      .filter({ has: page.getByText(category.label, { exact: true }) });
    if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
  }
  expect(await panel.getByRole('meter').count()).toBeGreaterThan(100);
  expect(await rail.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const input = page.getByPlaceholder('Type romaji or kana...');
  await input.scrollIntoViewIfNeeded();
  await input.focus();
  await page.getByRole('button', { name: 'Hint', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Check (Enter)' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'tmp/form-strength-mobile.png', fullPage: true });
});
