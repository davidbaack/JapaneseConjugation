import { test, expect } from '@playwright/test';

async function openWords(page) {
  await page.goto('./');
  await page.getByRole('tab', { name: 'Tools', exact: true }).click();
  await page.getByRole('tab', { name: 'Words', exact: true }).click();
  return page.getByRole('tabpanel', { name: 'Words', exact: true });
}

for (const viewport of [null, { width: 390, height: 844 }]) {
  test(`Words search supports learner scripts and clear recovery (${viewport ? 'phone' : 'desktop'})`, async ({
    page,
  }) => {
    if (viewport) await page.setViewportSize(viewport);
    const panel = await openWords(page);
    const input = panel.getByRole('searchbox', { name: 'Search words', exact: true });
    const practiceButtons = panel.getByRole('button', { name: 'Practice this', exact: true });
    await expect(practiceButtons).toHaveCount(30);
    await panel.getByRole('button', { name: 'Load 30 more', exact: true }).click();
    await expect(practiceButtons).toHaveCount(60);

    for (const query of ['iku', '  IKU  ', 'ｉｋｕ', 'いく', 'イク', '  行く  ', 'to go']) {
      await input.fill(query);
      await expect(panel.getByText('行く', { exact: true })).toBeVisible();
      await expect(input).toHaveValue(query);
    }

    await input.fill('zzznomatch');
    await expect(panel.getByRole('status')).toContainText('zzznomatch');
    await expect(practiceButtons).toHaveCount(0);
    await panel.getByRole('button', { name: 'Clear search', exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await expect(practiceButtons).toHaveCount(30);
    await expect(panel.getByRole('status')).toHaveCount(0);

    await input.fill('   ');
    await expect(practiceButtons).toHaveCount(30);
    await expect(panel.getByRole('button', { name: 'Clear search', exact: true })).toHaveCount(0);
    if (viewport) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      );
    }
  });
}

test('a romaji Words result launches the selected dictionary word', async ({ page }) => {
  const panel = await openWords(page);
  await panel.getByRole('searchbox', { name: 'Search words', exact: true }).fill('iku');
  const goRow = panel
    .locator('div.flex.flex-col.gap-3')
    .filter({ has: page.getByText('行く', { exact: true }) });
  await goRow.getByRole('button', { name: 'Practice this', exact: true }).click();
  await expect(
    page
      .getByRole('tabpanel', { name: 'Practice', exact: true })
      .getByRole('heading', { name: '行く', exact: true }),
  ).toBeVisible();
});

test('the list picker retains romaji and conjugated-form search', async ({ page }) => {
  await openWords(page);
  await page.getByRole('tab', { name: 'Lists', exact: true }).click();
  await page.getByRole('textbox', { name: 'New list name', exact: true }).fill('Search regression');
  await page.getByRole('button', { name: 'Create list', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: 'Lists', exact: true });
  const input = panel.getByRole('textbox', { name: 'Search words for active list', exact: true });
  await input.fill('iku');
  await expect(panel.getByRole('button').filter({ hasText: '行く' }).first()).toBeVisible();
  await input.fill('tabemashita');
  await expect(panel.getByRole('button').filter({ hasText: '食べる' }).first()).toBeVisible();
});
