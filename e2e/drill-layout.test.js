import { test, expect } from '@playwright/test';

async function seedLongDrill(page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'jp-verb-srs-v2',
      JSON.stringify({
        state: {
          schemaVersion: 4,
          cards: {},
          enabledTypes: ['causative'],
          practiceSelection: {
            version: 2,
            selectedCategoryIds: ['passive-causative'],
            selectedTypeIdsByCategory: { 'passive-causative': ['causative'] },
            filters: { time: 'all', polarity: 'all', style: 'all' },
          },
        },
        customVerbs: [],
        customAdjectives: [],
        wordLists: [{ id: 'drill-layout', name: 'Drill layout', wordKeys: ['godan:行く'] }],
        practicePrefs: {
          answerMode: 'input',
          wordListIds: ['drill-layout'],
          wordTypes: ['verb'],
          wordGroups: ['godan'],
          displayScripts: { kanji: false, kana: true, romaji: false },
          promptForm: 'dictionary',
          englishHints: 'always',
          kanaAssist: 'off',
          kanaMatchDisplay: 'color-count',
        },
      }),
    );
  });
  await page.goto('./');
  await page.locator('nav').getByRole('tab', { name: 'Drills', exact: true }).click();
}

async function expectAbove(first, second) {
  const upper = await first.boundingBox();
  const lower = await second.boundingBox();
  expect(upper).not.toBeNull();
  expect(lower).not.toBeNull();
  expect(upper.y + upper.height).toBeLessThanOrEqual(lower.y);
}

async function expectNoHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize().width,
  );
}

for (const viewport of [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
]) {
  test(`Transform keeps long prompts and instructions above its controls at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await seedLongDrill(page);
    await page.getByRole('tab', { name: /^Transform/ }).click();

    const startingForm = page.getByText('Starting form', { exact: true });
    const contract = page.getByText(/^Use the same dictionary word\./);
    const answer = page.getByRole('textbox', { name: 'Answer', exact: true });
    await expect(page.getByText('いかせられなければ', { exact: true })).toBeVisible();
    await expectAbove(page.getByLabel('Current card source'), startingForm);
    await expectAbove(contract, answer);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('transform.png'), fullPage: true });

    // A short viewport approximates the room left above a mobile keyboard.
    // Learners can scroll the whole dock into view without covering the task.
    await page.setViewportSize({ width: viewport.width, height: 420 });
    await answer.focus();
    const check = page.getByRole('button', { name: 'Check (Enter)', exact: true });
    await check.scrollIntoViewIfNeeded();
    await expect(answer).toBeInViewport({ ratio: 1 });
    await expect(check).toBeInViewport({ ratio: 1 });
    await expectAbove(contract, answer);
    await expectNoHorizontalOverflow(page);
  });

  test(`Rush keeps its paused prompt separate from its controls at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await seedLongDrill(page);
    await page.getByRole('tab', { name: /^Rush/ }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();

    const prompt = page.getByRole('group', { name: 'Rush prompt', exact: true });
    const answer = page.getByPlaceholder('Type answer');
    await expect(prompt).toContainText('いく');
    await expect(prompt).toContainText('go');
    await prompt.scrollIntoViewIfNeeded();
    await expect(prompt).toBeInViewport({ ratio: 1 });
    await expectAbove(prompt, answer);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('rush.png'), fullPage: true });

    await page.setViewportSize({ width: viewport.width, height: 420 });
    const submit = page.getByRole('button', { name: 'Submit', exact: true });
    await submit.scrollIntoViewIfNeeded();
    await expect(answer).toBeInViewport({ ratio: 1 });
    await expect(submit).toBeInViewport({ ratio: 1 });
    await expectAbove(prompt, answer);
    await expectNoHorizontalOverflow(page);
  });
}
