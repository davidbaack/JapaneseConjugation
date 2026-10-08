import { test, expect } from '@playwright/test';
import {
  answerPractice,
  emptyPracticeSnapshot,
  expectPracticeTotals,
  openSyncSettings,
  publicCloudConfig,
  readPracticeStats,
  seedPracticeContext,
  syncPractice,
} from './helpers/practiceSync.js';

const FIXTURE_USER_ID = 'a23adf44-c2b2-40ac-aa9a-bf41fcc0444e';

function mockSession() {
  return {
    access_token: 'fixture-header.fixture-payload.fixture-signature',
    refresh_token: 'fixture-refresh-token',
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    token_type: 'bearer',
    user: {
      id: FIXTURE_USER_ID,
      email: 'practice-sync-fixture@example.invalid',
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: '2026-10-08T00:00:00Z',
    },
  };
}

function controlledCloud() {
  let row = {
    data: emptyPracticeSnapshot(FIXTURE_USER_ID),
    updated_at: new Date().toISOString(),
    revision: 1,
  };
  const offline = new Set();
  let heldReads = null;
  let conflicts = 0;
  const fulfill = (route, body, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers':
          'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
      },
      body: JSON.stringify(body),
    });
  return {
    get row() {
      return row;
    },
    get conflicts() {
      return conflicts;
    },
    disconnect(device) {
      offline.add(device);
    },
    reconnect(device) {
      offline.delete(device);
    },
    raceNextReads() {
      heldReads = [];
    },
    async install(context, url, device) {
      await context.route(`${url}/**`, async (route) => {
        if (offline.has(device)) return route.abort('internetdisconnected');
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.method() === 'OPTIONS') return fulfill(route, {});
        if (path.endsWith('/auth/v1/user')) return fulfill(route, mockSession().user);
        if (path.endsWith('/rest/v1/srs_sync')) {
          if (heldReads) {
            heldReads.push({ route, snapshot: JSON.parse(JSON.stringify(row)) });
            if (heldReads.length < 2) return;
            const reads = heldReads;
            heldReads = null;
            return Promise.all(reads.map((read) => fulfill(read.route, [read.snapshot])));
          }
          return fulfill(route, [row]);
        }
        if (path.endsWith('/rest/v1/rpc/cas_srs_sync')) {
          const body = request.postDataJSON();
          expect(body.expected_user_id).toBe(FIXTURE_USER_ID);
          if (body.expected_revision !== row.revision) {
            conflicts += 1;
            return fulfill(route, { code: 'PT409', message: 'sync_revision_conflict' }, 409);
          }
          row = {
            data: body.next_data,
            updated_at: new Date().toISOString(),
            revision: row.revision + 1,
          };
          return fulfill(route, [
            { sync_data: row.data, sync_updated_at: row.updated_at, sync_revision: row.revision },
          ]);
        }
        // No fixture browser may reach the real cloud, including unrelated AI
        // and sentence requests. This test is deliberately a transport fixture.
        return fulfill(route, []);
      });
    },
  };
}

test.describe('Practice evidence across replicas', () => {
  for (const fallback of [false, true])
    test(`reconciles two same-browser tabs using ${fallback ? 'IndexedDB fallback' : 'available browser locks'}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      try {
        if (fallback)
          await context.addInitScript(() => {
            Object.defineProperty(navigator, 'locks', { configurable: true, get: () => undefined });
          });
        await seedPracticeContext(context);
        const first = await context.newPage();
        const second = await context.newPage();
        await first.goto('/');
        await first.waitForLoadState('networkidle');
        if (fallback) expect(await first.evaluate(() => navigator.locks)).toBeUndefined();
        await second.goto('/');
        await second.waitForLoadState('networkidle');
        await Promise.all([
          first.getByRole('button', { name: 'Reveal answer', exact: true }).click(),
          second.getByRole('button', { name: 'Reveal answer', exact: true }).click(),
        ]);
        await Promise.all([
          first.getByRole('button', { name: 'Remembered', exact: true }).click(),
          second.getByRole('button', { name: 'Missed', exact: true }).click(),
        ]);
        await expectPracticeTotals(first, 2, 1);
        await expectPracticeTotals(second, 2, 1);
        await Promise.all([first.reload(), second.reload()]);
        await expectPracticeTotals(first, 2, 1);
        await expectPracticeTotals(second, 2, 1);
        expect((await readPracticeStats(first)).recent).toHaveLength(2);
      } finally {
        await context.close();
      }
    });

  test('retains offline answers through a real browser CAS conflict and repeated retries', async ({
    browser,
  }) => {
    test.setTimeout(90000);
    const config = publicCloudConfig();
    test.skip(
      !config.url || !config.anonKey,
      'The served build needs public Supabase configuration; no service role is used.',
    );
    const contexts = await Promise.all([
      browser.newContext({ serviceWorkers: 'block' }),
      browser.newContext({ serviceWorkers: 'block' }),
    ]);
    const cloud = controlledCloud();
    try {
      for (let index = 0; index < contexts.length; index += 1) {
        await cloud.install(contexts[index], config.url, index);
        await seedPracticeContext(contexts[index], { session: mockSession(), url: config.url });
      }
      const pages = await Promise.all(contexts.map((context) => context.newPage()));
      await Promise.all(pages.map((page) => page.goto('/')));
      await Promise.all(pages.map((page) => page.waitForLoadState('networkidle')));
      await Promise.all(pages.map((page) => openSyncSettings(page)));
      cloud.disconnect(0);
      cloud.disconnect(1);
      await Promise.all([answerPractice(pages[0], true), answerPractice(pages[1], false)]);
      await expectPracticeTotals(pages[0], 1, 1);
      await expectPracticeTotals(pages[1], 1, 0);
      // Let automatic pushes finish failing before reconnecting. The explicit
      // retry must start from the durable offline snapshots.
      await Promise.all(pages.map((page) => syncPractice(page)));
      for (const page of pages)
        await expect(page.getByRole('button', { name: 'Retry Sync', exact: true })).toBeVisible();
      cloud.reconnect(0);
      cloud.reconnect(1);
      cloud.raceNextReads();
      await Promise.all(pages.map((page) => syncPractice(page)));
      expect(cloud.conflicts).toBeGreaterThan(0);
      expect(cloud.row.data.state.practiceStats.lifetime).toMatchObject({
        attempted: 2,
        correct: 1,
      });
      // Both contexts pull the winning commit. Replayed sends must not count a
      // third answer or change the first-answer outcomes.
      for (const page of pages) await syncPractice(page);
      for (const page of pages) await expectPracticeTotals(page, 2, 1);
      for (const page of pages) {
        await page.reload();
        await syncPractice(page);
        await expectPracticeTotals(page, 2, 1);
        expect((await readPracticeStats(page)).recent).toHaveLength(2);
      }
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
