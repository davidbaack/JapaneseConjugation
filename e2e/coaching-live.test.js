import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { seedPracticeContext } from './helpers/practiceSync.js';

// Explicit spending opt-in. Uses one synthetic exercise in a disposable profile
// against deployed Pages and the actual proxy, with at most three admissions.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test('deployed coaching returns a readable reply within its bounded admission budget', async ({
  browser,
  browserName,
}) => {
  test.setTimeout(120000);
  test.skip(
    process.env.LIVE_COACHING !== '1',
    'Explicit paid coaching validation opt-in required.',
  );
  test.skip(browserName !== 'chromium', 'One isolated live provider check is sufficient.');
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const dir = resolve('tmp/approved-next-steps-2026-10-13');
  mkdirSync(dir, { recursive: true });
  let attempts = 0,
    reservationMicrousd = 0;
  try {
    await seedPracticeContext(context);
    const page = await context.newPage();
    await page.route('**/functions/v1/gemini-proxy', async (route) => {
      const raw = route.request().postData() || '';
      const payload = JSON.parse(raw);
      attempts += 1;
      const output = payload.generationConfig?.maxOutputTokens;
      expect(output).toBeLessThanOrEqual(600);
      const next = Math.ceil((Buffer.byteLength(raw, 'utf8') + 4096) * 0.3 + output * 2.5);
      if (attempts > 3 || reservationMicrousd + next > 20000) {
        await route.abort();
        throw new Error('Live coaching admission budget exceeded before dispatch');
      }
      reservationMicrousd += next;
      await route.continue();
    });
    await page.goto('https://davidbaack.github.io/JapaneseConjugation/');
    await page.getByRole('button', { name: 'Hint', exact: true }).click();
    await page.getByRole('button', { name: 'Discuss further', exact: true }).click();
    const started = Date.now();
    const log = page.getByRole('log');
    await expect(log).toHaveAttribute('aria-busy', 'false', { timeout: 100000 });
    const reply = (await log.innerText()).trim();
    expect(reply).not.toMatch(/^Error:/);
    expect(reply.length).toBeGreaterThan(20);
    expect(attempts).toBeGreaterThan(0);
    const evidence = {
      liveCoaching: 'passed',
      checkedAtUtc: new Date().toISOString(),
      attempts,
      reservationMicrousd,
      budgetMicrousd: 20000,
      elapsedMs: Date.now() - started,
      syntheticExercise: true,
      callerCredentialsRecorded: false,
      visibleReply: reply,
    };
    writeFileSync(resolve(dir, 'live-coaching.json'), JSON.stringify(evidence, null, 2));
    await page.screenshot({ path: resolve(dir, 'live-coaching.png') });
    console.log(
      JSON.stringify({
        liveCoaching: 'passed',
        attempts,
        reservationMicrousd,
        elapsedMs: evidence.elapsedMs,
        visibleCharacters: reply.length,
      }),
    );
  } finally {
    await context.close();
  }
});
