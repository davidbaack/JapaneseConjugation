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

async function seedPractice(
  page,
  {
    types = ['plain-past'],
    word = MIRU,
    selectionOrigin = 'new',
    selectionReason = '',
    prefs = {},
  } = {},
) {
  const state = defaultState();
  state.practiceSelection = practiceSelectionForTypeIds(types);
  state.enabledTypes = types;
  await page.goto('./');
  await expect(page.getByRole('tab', { name: 'Practice', exact: true })).toBeVisible();
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
          ...prefs,
        },
      },
      card: { ...word, word, type: types[0], selectionOrigin, selectionReason },
    },
  );
  await page.reload();
  await expect(page.getByLabel('Current card source')).toBeVisible();
}

async function expectAbove(upper, lower) {
  const upperBox = await upper.boundingBox();
  const lowerBox = await lower.boundingBox();
  if (!upperBox || !lowerBox) throw new Error('Both elements must have a layout box');
  expect(upperBox.y + upperBox.height).toBeLessThanOrEqual(lowerBox.y);
}

async function expectChoiceFullyVisible(rail, choice) {
  await expect
    .poll(async () => {
      const railBox = await rail.boundingBox();
      const choiceBox = await choice.boundingBox();
      return (
        !!railBox &&
        !!choiceBox &&
        choiceBox.x >= railBox.x &&
        choiceBox.x + choiceBox.width <= railBox.x + railBox.width
      );
    })
    .toBe(true);
}

for (const viewport of [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
]) {
  test(`sentence fallback stays below source metadata at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const source of [
      { selectionOrigin: 'new', label: 'New' },
      { selectionOrigin: 'review', label: 'Review' },
      {
        selectionReason: 'Strengthening Humble forms with a longer Practice source explanation',
        label: 'Strengthening Humble forms with a longer Practice source explanation',
      },
    ]) {
      await seedPractice(page, {
        types: ['humble', 'humble-polite'],
        word: SURU,
        prefs: { sentenceMode: true },
        ...source,
      });
      const badge = page.getByLabel('Current card source');
      const notice = page.getByText(
        'No reviewed sentence for this word and form yet. Practice the word below.',
      );
      await expect(badge).toHaveText(source.label);
      await expect(notice).toBeVisible();
      await expectAbove(badge, notice);
      await expectAbove(notice, page.getByText('する', { exact: true }).first());
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      );
    }
  });
}

test('Humble lesson scope stays visible through resize without snapping manual category browsing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPractice(page);
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  await page.getByRole('textbox', { name: 'Find a rule', exact: true }).fill('Humble');
  await page
    .locator('#lesson-panel-humble')
    .getByRole('button', { name: 'Practice this', exact: true })
    .click();
  const rail = page.getByTestId('practice-category-rail');
  const keigo = rail.getByRole('button', { name: 'Keigo', exact: true });
  await expect(keigo).toHaveAttribute('aria-pressed', 'true');
  await expect(keigo).toContainText('2/4');
  await expectChoiceFullyVisible(rail, keigo);
  await expect(page.getByText('2 forms', { exact: true })).toBeVisible();

  // Resizing re-exposes the selected category without changing the active word or form.
  const activeBefore = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('jp-study-current') || 'null'),
  );
  await page.setViewportSize({ width: 320, height: 720 });
  await expectChoiceFullyVisible(rail, keigo);
  await rail.evaluate((element) => {
    element.scrollLeft = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect(rail.getByRole('button', { name: 'Core forms', exact: true })).toBeInViewport();
  const settings = page.getByText('Answer settings', { exact: true });
  await settings.click();
  await page.getByRole('button', { name: 'Auto next off', exact: true }).click();
  await settings.click();
  await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBe(0);
  expect(
    await page.evaluate(() => JSON.parse(sessionStorage.getItem('jp-study-current') || 'null')),
  ).toMatchObject({
    dict: activeBefore.dict,
    type: activeBefore.type,
  });
});

test('beginner help is collapsed between the target and answer and leaves mobile controls reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await seedPractice(page);
  const help = page.locator('details').filter({ hasText: 'New to conjugation?' });
  const answer = page.getByRole('textbox', { name: 'Answer', exact: true });
  await expect(help).toHaveCount(1);
  await expect(help).not.toHaveAttribute('open');
  await expectAbove(page.getByText('Plain Past', { exact: true }).first(), help);
  await expectAbove(help, answer);
  await answer.scrollIntoViewIfNeeded();
  await expect(answer).toBeInViewport({ ratio: 1 });
  await help.getByText('New to conjugation?', { exact: true }).click();
  await expect(help.getByRole('region', { name: 'Worked example: Plain Negative' })).toContainText(
    '食べない (たべない)',
  );
  await expect(help).not.toContainText('見た');
  await expectAbove(help, answer);
  await help.getByRole('button', { name: 'Learn Basics and Politeness', exact: true }).click();
  await expect(page.locator('#lesson-panel-basic-tenses')).toBeVisible();
  await page.getByRole('tab', { name: 'Drills', exact: true }).click();
  await page.getByRole('tab', { name: /^Transform/ }).click();
  await expect(page.getByRole('textbox', { name: 'Answer', exact: true })).toBeVisible();
  await expect(page.getByText('New to conjugation?', { exact: true })).toHaveCount(0);
});

test('answer-mode tips follow the visible controls while preserving the card and first-attempt counts', async ({
  page,
}) => {
  // Exercise the unavailable-speech fallback without opening a real microphone.
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'SpeechRecognition');
    Reflect.deleteProperty(window, 'webkitSpeechRecognition');
  });
  await seedPractice(page);
  const tip = page.getByTestId('practice-answer-tip');
  await expect(tip).toContainText('Type romaji like');
  await expect(page.getByText('1 form', { exact: true })).toBeVisible();
  const settings = page.getByText('Answer settings', { exact: true });
  await settings.click();
  const styles = page.getByRole('group', { name: 'Answer style', exact: true });
  await styles.getByRole('button', { name: 'Choose', exact: true }).click();
  await expect(tip).toContainText('Choose the matching answer');
  await expect(tip).not.toContainText('romaji');
  await styles.getByRole('button', { name: 'Self-check', exact: true }).click();
  await expect(tip).toContainText('Recall the answer, reveal it');
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  await expect(tip).toContainText('Compare your answer');
  await styles.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect(tip).toContainText(/Use Speak answer|Speech input is unavailable here/);
  await styles.getByRole('button', { name: 'Type', exact: true }).click();
  await settings.click();
  await expect(tip).toContainText('Type romaji like');
  expect(
    await page.evaluate(() => JSON.parse(sessionStorage.getItem('jp-study-current') || 'null')),
  ).toMatchObject({
    dict: '見る',
    type: 'plain-past',
  });
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key) || 'null')?.state?.practiceStats?.lifetime
            ?.attempted,
        STORAGE_KEY,
      ),
    )
    .toBe(0);
  await page.getByRole('textbox', { name: 'Answer', exact: true }).fill('mita');
  const progress = page.getByRole('region', { name: 'Stats for Plain Past' });
  await expect(progress).toContainText('1 right / 1 attempt');
  await expect(progress).not.toContainText('1 attempts');
  await expect(tip).toContainText('choose Next card');
});
