import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const SURFACES = [
  { tab: 'Practice', anchor: 'Practice run' },
  { tab: 'Guide', anchor: 'Build the conjugation step by step.' },
  { tab: 'Learn', anchor: 'Conjugation formation guide' },
  { tab: 'Tools', anchor: 'Lookup, check, word lists, and word management.' },
  { tab: 'Settings', anchor: 'Display & audio' },
];

function seriousOrCritical(violations) {
  return violations
    .filter(({ impact }) => impact === 'serious' || impact === 'critical')
    .map(({ id, impact, help, nodes }) => ({
      id,
      impact,
      help,
      targets: nodes.map(({ target }) => target.join(' ')),
    }));
}

async function expectNoSeriousViolations(page, surface, include) {
  const builder = new AxeBuilder({ page });
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  expect(seriousOrCritical(violations), `${surface} accessibility violations`).toEqual([]);
}

async function seriousViolations(page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return seriousOrCritical(violations);
}

test.describe('Serious and critical accessibility checks', () => {
  test.setTimeout(60_000);
  test.skip(({ browserName }) => browserName !== 'chromium', 'axe checks run in Chromium');

  test('primary learner surfaces', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const results = {};

    for (const { tab, anchor } of SURFACES) {
      await page.locator('nav').getByRole('tab', { name: tab, exact: true }).click();
      await expect(
        page.getByText(anchor, { exact: typeof anchor === 'string' }).first(),
      ).toBeVisible();
      results[tab] = await seriousViolations(page);
    }

    expect(results).toEqual(Object.fromEntries(SURFACES.map(({ tab }) => [tab, []])));
  });

  test('answer feedback', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const answer = page.getByPlaceholder('Type romaji or kana...');
    await expect(answer).toBeVisible();
    await answer.fill('zzzz');
    await page.getByRole('button', { name: 'Check (Enter)' }).click();
    await expect(page.getByText('Not quite.').last()).toBeVisible();

    await expectNoSeriousViolations(page, 'answer feedback');
  });

  test('Check tool input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('nav').getByRole('tab', { name: 'Tools', exact: true }).click();
    await page.getByRole('tab', { name: /^Check/ }).click();
    await expect(page.getByLabel('Conjugated form')).toBeVisible();

    await expectNoSeriousViolations(page, 'Check tool input', '#check-conjugation-input');
  });

  test('authentication dialog when cloud sync is configured', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('nav').getByRole('tab', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('Display & audio', { exact: true })).toBeVisible();

    const openAuth = page.getByRole('button', { name: 'Sign In / Sign Up' });
    test.skip((await openAuth.count()) === 0, 'Cloud sync is not configured for this build');
    await openAuth.click();
    await expect(page.getByRole('dialog', { name: 'Sign In to Katachiya' })).toBeVisible();

    await expectNoSeriousViolations(page, 'authentication dialog');
  });
});
