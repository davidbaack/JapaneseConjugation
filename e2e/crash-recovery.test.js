import { test, expect } from '@playwright/test';
import { STORAGE_KEY } from '../src/data/defaults.js';

test('a failed Practice route offers a raw recovery download without deleting saved data', async ({
  page,
}) => {
  const saved = '{unreadable learner fixture';
  const pendingKey = `${STORAGE_KEY}:pending:crash-fixture`;
  await page.addInitScript(
    ({ key, raw, pending }) => {
      localStorage.setItem(key, raw);
      localStorage.setItem(pending, 'unreadable pending answer');
      localStorage.setItem('sb-crash-fixture-auth-token', 'private-auth-fixture');
    },
    { key: STORAGE_KEY, raw: saved, pending: pendingKey },
  );
  await page.route('**/assets/StudyView-*.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: "throw new Error('Fixture Practice module failure');",
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
  await expect(page.getByRole('button', { name: /reset/i })).toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download saved recovery data' }).click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Expected a recovery download');
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  expect(JSON.parse(text)).toMatchObject({
    saved,
    pending: [{ key: pendingKey, raw: 'unreadable pending answer' }],
  });
  expect(text).not.toContain('private-auth-fixture');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(saved);
  await expect(page.getByRole('status')).toContainText('Recovery download started');
});
