import { test, expect } from '@playwright/test';

test.describe('App page-load smoke tests', () => {
  test('loads the page with no console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known non-fatal browser warnings
    const fatalErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('ERR_NAME_NOT_RESOLVED'), // expected for blocked external resources
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

  test('exposes an installable PWA shell', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    if (!manifestHref) throw new Error('Missing web manifest link href');

    const manifestUrl = new URL(manifestHref, page.url()).toString();
    const manifestResponse = await page.request.get(manifestUrl);
    expect(manifestResponse.status()).toBe(200);

    const manifest = await manifestResponse.json();
    expect(manifest.name).toContain('Katachiya');
    expect(manifest.short_name).toBe('Katachiya');
    expect(manifest.start_url).toBe('/JapaneseConjugation/');
    expect(manifest.scope).toBe('/JapaneseConjugation/');
    expect(manifest.display).toBe('standalone');

    const icons = manifest.icons ?? [];
    expect(
      icons.some(
        (icon) =>
          icon.src === 'pwa-192x192.png' && icon.sizes === '192x192' && icon.type === 'image/png',
      ),
    ).toBe(true);
    expect(
      icons.some(
        (icon) =>
          icon.src === 'pwa-512x512.png' && icon.sizes === '512x512' && icon.type === 'image/png',
      ),
    ).toBe(true);
    expect(icons.some((icon) => icon.purpose?.includes('maskable'))).toBe(true);

    const swResponse = await page.request.get(new URL('sw.js', page.url()).toString());
    expect(swResponse.status()).toBe(200);
    expect(swResponse.headers()['content-type']).toContain('javascript');

    const appleTouchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    if (!appleTouchIcon) throw new Error('Missing apple touch icon link href');
    expect(new URL(appleTouchIcon, page.url()).pathname).toBe(
      '/JapaneseConjugation/apple-touch-icon.png',
    );
  });

  test('no network requests fail with 5xx errors', async ({ page }) => {
    const failedRequests = [];
    page.on('response', (response) => {
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
    page.on('response', (response) => {
      if (response.status() === 404 && new URL(response.url()).hostname === 'localhost') {
        notFound.push(response.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(notFound, `404s: ${notFound.join('\n')}`).toHaveLength(0);
  });
});
