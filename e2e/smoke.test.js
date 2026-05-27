import { test, expect } from '@playwright/test';

test.describe('App page-load smoke tests', () => {
  test('loads the page with no console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known non-fatal browser warnings
    const fatalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('ERR_NAME_NOT_RESOLVED') // expected for blocked external resources
    );

    expect(fatalErrors, `Console errors: ${fatalErrors.join('\n')}`).toHaveLength(0);
    expect(pageErrors, `Page errors: ${pageErrors.join('\n')}`).toHaveLength(0);
  });

  test('renders the main UI container', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The app should render a root #app or body with content (not blank)
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
  });

  test('renders Japanese text on the page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const html = await page.content();
    // App should contain some Japanese characters (hiragana/katakana/kanji)
    const hasJapanese = /[\u3040-\u30FF\u4E00-\u9FFF]/.test(html);
    expect(hasJapanese).toBe(true);
  });

  test('page title is set', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('no network requests fail with 5xx errors', async ({ page }) => {
    const failedRequests = [];
    page.on('response', response => {
      if (response.status() >= 500) {
        failedRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(failedRequests, `Server errors: ${failedRequests.join('\n')}`).toHaveLength(0);
  });

  test('no same-origin static assets return 404', async ({ page }) => {
    // Catches wrong base paths, missing files, and broken asset references —
    // the class of bug that passes locally but breaks on a subdirectory deployment.
    const notFound = [];
    page.on('response', response => {
      if (response.status() === 404 && new URL(response.url()).hostname === 'localhost') {
        notFound.push(response.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(notFound, `404s: ${notFound.join('\n')}`).toHaveLength(0);
  });
});
