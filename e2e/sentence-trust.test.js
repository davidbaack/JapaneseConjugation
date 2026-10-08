import { test, expect } from '@playwright/test';

async function openGenkiPractice(page) {
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/data/verb-lexicon.json')),
    page.goto('./'),
  ]);
  await page.getByRole('tab', { name: 'Tools', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Search for a word or conjugation form', exact: true })
    .fill('genkisou');
  await page.getByRole('button', { name: 'Practice this form', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Answer', exact: true })).toBeVisible();
  await page.getByText('Answer settings', { exact: true }).click();
}

test.describe('Reviewed Sentence practice', () => {
  test('320px context stays visible and review fills the correct paired sentence', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await openGenkiPractice(page);
    await page.getByRole('button', { name: 'Sentence off', exact: true }).click();
    await page.getByText('Answer settings', { exact: true }).click();
    const panel = page.getByRole('tabpanel', { name: 'Practice', exact: true });
    // A first cold load may finalize ordinary Practice before the chunk arrives.
    // The next exact focused card must use the reviewed cached content.
    await expect(panel).toContainText(/この子は|No reviewed sentence/);
    if (
      await page
        .getByText('No reviewed sentence for this word and form yet. Practice the word below.', {
          exact: true,
        })
        .isVisible()
    ) {
      await page.getByRole('button', { name: 'Skip', exact: true }).click();
    }
    await expect(panel).toContainText('この子は');
    await expect(page.getByText('Sentence context', { exact: true })).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Answer', exact: true }).fill('zzzz');
    await page.getByRole('button', { name: 'Check (Enter)', exact: true }).click();
    await expect(panel).toContainText('この子は元気そうだ。');
    await expect(page.getByText('This child looks energetic.', { exact: true })).toBeVisible();
    await expect(panel).not.toContainText('The plan looks energetic.');
    await expect(panel).not.toContainText('[______]');
    await expect(page.getByText('Not quite.', { exact: true }).last()).toBeVisible();
  });

  test('cold offline context continues ordinary Practice and retains Sentence preference', async ({
    page,
    context,
  }) => {
    // Firefox may reuse an HTTP-cached approved response in offline mode.
    // Intercept both context sources before navigation to model a truly cold miss.
    await context.route('**/data/sentences/**', (route) => route.abort('internetdisconnected'));
    await context.route('**/rest/v1/sentences?**', (route) => route.abort('internetdisconnected'));
    await openGenkiPractice(page);
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Sentence off', exact: true }).click();
    await page.getByText('Answer settings', { exact: true }).click();
    await expect(
      page.getByText('No reviewed sentence for this word and form yet. Practice the word below.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Answer', exact: true })).toBeVisible();
    await expect(page.getByText(/Type · Kana on · Sentence on/)).toBeVisible();
    await page.getByRole('textbox', { name: 'Answer', exact: true }).fill('genkisou');
    await expect(page.getByText('Correct.', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('1 right / 1 attempts').first()).toBeVisible();
  });
});
