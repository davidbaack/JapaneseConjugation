import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
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

// Run explicitly against a configured build:
// LIVE_PRACTICE_SYNC=1 PW_PROJECT=chromium npm run test:e2e -- practice-sync-live
// The service role stays in the Node fixture, never in the browser/build.
// This is real authenticated browser-session/CAS coverage; it does not claim
// interactive sign-in coverage. Traces/video/screenshots must not capture tokens.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

function checked(result, operation) {
  if (result.error) {
    // SDK errors can include request details. Limit diagnostics to a safe code.
    throw new Error(
      `${operation} failed (${result.error.code || result.error.status || 'unknown'})`,
    );
  }
  return result.data;
}

test('authenticated independent browser sessions preserve offline Practice answers', async ({
  browser,
  browserName,
}) => {
  test.setTimeout(120000);
  test.skip(process.env.LIVE_PRACTICE_SYNC !== '1', 'Explicit live validation opt-in is required.');
  test.skip(browserName !== 'chromium', 'One explicitly isolated live auth fixture is sufficient.');
  const config = publicCloudConfig();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  test.skip(
    !config.url || !config.anonKey || !serviceRole,
    'Public build config and an admin key for temporary fixture lifecycle are required.',
  );
  expect(process.env.SUPABASE_URL).toBe(config.url);

  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: globalThis.AbortSignal.timeout(15000) }),
    },
  };
  const admin = createClient(config.url, serviceRole || '', options);
  const password = randomBytes(36).toString('base64url');
  const runTag = randomUUID();
  const email = `practice-sync-${runTag}@example.invalid`;
  const evidenceDirectory = resolve('tmp/practice-sync-2026-10-08');
  mkdirSync(evidenceDirectory, { recursive: true });
  const lifecyclePath = resolve(evidenceDirectory, `live-fixture-${runTag}.json`);
  const contexts = [];
  const networkEvents = [];
  let userId = '';
  let cleanupClient;
  const lifecycle = (phase, extra = {}) => {
    writeFileSync(
      lifecyclePath,
      JSON.stringify(
        {
          userId,
          runTag,
          purpose: 'isolated-practice-sync-regression',
          phase,
          at: new Date().toISOString(),
          ...extra,
        },
        null,
        2,
      ),
    );
    console.log(`Live fixture: ${phase}`);
  };
  try {
    const created = checked(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { purpose: 'isolated-practice-sync-regression' },
      }),
      'Create temporary auth fixture',
    );
    userId = created.user?.id || '';
    if (!userId) throw new Error('Temporary auth fixture did not return its identity');
    lifecycle('created');
    const clients = [
      createClient(config.url, config.anonKey, options),
      createClient(config.url, config.anonKey, options),
    ];
    const sessions = [];
    cleanupClient = clients[0];
    for (const client of clients) {
      const signedIn = checked(
        await client.auth.signInWithPassword({ email, password }),
        'Authenticate temporary fixture',
      );
      if (!signedIn.session)
        throw new Error('Temporary fixture authentication did not return a session');
      sessions.push(signedIn.session);
    }
    lifecycle('authenticated');
    const invalidFirstInsert = await clients[0].rpc('cas_srs_sync', {
      expected_revision: null,
      expected_user_id: userId,
      next_data: { ...emptyPracticeSnapshot(userId), syncMeta: { version: 2 } },
    });
    expect(invalidFirstInsert.error?.message).toBe('sync_progress_metadata_required');
    checked(
      await clients[0].rpc('cas_srs_sync', {
        expected_revision: null,
        expected_user_id: userId,
        next_data: emptyPracticeSnapshot(userId),
      }),
      'Initialize owned fixture row',
    );
    lifecycle('row initialized');
    const staleRevisionStarted = Date.now();
    const staleRevision = await clients[0].rpc('cas_srs_sync', {
      expected_revision: 0,
      expected_user_id: userId,
      next_data: emptyPracticeSnapshot(userId),
    });
    const staleRevisionElapsedMs = Date.now() - staleRevisionStarted;
    console.log(
      JSON.stringify({
        staleRevisionCode: staleRevision.error?.code,
        status: staleRevision.status,
        elapsedMs: staleRevisionElapsedMs,
      }),
    );
    expect(staleRevision.error?.code).toBe('PT409');
    expect(staleRevision.status).toBe(409);
    expect(staleRevisionElapsedMs).toBeLessThan(5000);

    for (const session of sessions) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      contexts.push(context);
      await seedPracticeContext(context, { session, url: config.url });
    }
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    for (const [index, page] of pages.entries()) {
      page.on('request', (request) => {
        if (request.url().startsWith(config.url) && networkEvents.length < 1000)
          networkEvents.push({
            page: index,
            phase: 'started',
            method: request.method(),
            path: new URL(request.url()).pathname,
            at: Date.now(),
          });
      });
      page.on('response', (response) => {
        if (response.url().startsWith(config.url) && networkEvents.length < 1000)
          networkEvents.push({
            page: index,
            path: new URL(response.url()).pathname,
            status: response.status(),
            at: Date.now(),
          });
      });
      page.on('requestfailed', (request) => {
        if (request.url().startsWith(config.url) && networkEvents.length < 1000)
          networkEvents.push({
            page: index,
            path: new URL(request.url()).pathname,
            failure: request.failure()?.errorText,
          });
      });
    }
    await Promise.all(pages.map((page) => page.goto('/')));
    await Promise.all(
      pages.map((page) =>
        expect(page.getByRole('button', { name: 'Reveal answer', exact: true })).toBeVisible({
          timeout: 15000,
        }),
      ),
    );
    lifecycle('practice ready');
    // This test isolates synchronization from cold offline route loading.
    // Service workers are blocked to prevent a retained profile/cache from
    // influencing the fixture, so warm the lazy Stats route before disconnect.
    for (const page of pages) {
      await page.locator('nav').getByRole('tab', { name: 'Stats', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Stats dashboard' })).toBeVisible();
    }
    await Promise.all(pages.map((page) => openSyncSettings(page)));
    await Promise.all(pages.map((page) => syncPractice(page)));
    for (const page of pages)
      await expect(page.getByRole('button', { name: 'Sync Now', exact: true })).toBeVisible();
    lifecycle('cloud ready');
    await Promise.all(contexts.map((context) => context.setOffline(true)));
    await Promise.all([answerPractice(pages[0], true), answerPractice(pages[1], false)]);
    await expectPracticeTotals(pages[0], 1, 1);
    await expectPracticeTotals(pages[1], 1, 0);
    lifecycle('offline answers saved');
    await Promise.all(pages.map((page) => syncPractice(page)));
    lifecycle('reconnected');
    for (const page of pages)
      await expect(page.getByRole('button', { name: 'Retry Sync', exact: true })).toBeVisible();
    await Promise.all(contexts.map((context) => context.setOffline(false)));
    await Promise.all(pages.map((page) => syncPractice(page)));
    await expect
      .poll(
        async () => {
          const result = await clients[0].from('srs_sync').select('data').eq('id', userId).single();
          const data = checked(result, 'Read owned fixture row');
          const totals = data.data?.state?.practiceStats?.lifetime;
          return { attempted: totals?.attempted, correct: totals?.correct };
        },
        { timeout: 25000 },
      )
      .toEqual({ attempted: 2, correct: 1 });
    for (const page of pages) await syncPractice(page);
    for (const page of pages) await expectPracticeTotals(page, 2, 1);
    for (const page of pages) {
      await page.reload();
      await syncPractice(page);
      await expectPracticeTotals(page, 2, 1);
      expect((await readPracticeStats(page)).recent).toHaveLength(2);
    }
    const beforeDowngrade = checked(
      await clients[0].from('srs_sync').select('data,revision').eq('id', userId).single(),
      'Read owned protocol fixture',
    );
    expect(beforeDowngrade.data.syncMeta.version).toBe(2);
    const oldPayload = JSON.parse(JSON.stringify(beforeDowngrade.data));
    oldPayload.syncMeta.version = 1;
    delete oldPayload.syncMeta.progressContributions;
    const downgrade = await clients[0].rpc('cas_srs_sync', {
      expected_revision: beforeDowngrade.revision,
      expected_user_id: userId,
      next_data: oldPayload,
    });
    expect(downgrade.error?.message).toBe('sync_client_upgrade_required');
    const missingLedgerPayload = JSON.parse(JSON.stringify(beforeDowngrade.data));
    delete missingLedgerPayload.syncMeta.progressContributions;
    const missingLedger = await clients[0].rpc('cas_srs_sync', {
      expected_revision: beforeDowngrade.revision,
      expected_user_id: userId,
      next_data: missingLedgerPayload,
    });
    expect(missingLedger.error?.message).toBe('sync_progress_metadata_required');
    const afterDowngrade = checked(
      await clients[0].from('srs_sync').select('data,revision').eq('id', userId).single(),
      'Read protected owned fixture',
    );
    expect(afterDowngrade.revision).toBe(beforeDowngrade.revision);
    expect(afterDowngrade.data).toEqual(beforeDowngrade.data);
    // Existing RPC ownership protection must still reject a mismatched account.
    const denied = await clients[0].rpc('cas_srs_sync', {
      expected_revision: null,
      expected_user_id: randomUUID(),
      next_data: emptyPracticeSnapshot(userId),
    });
    expect(denied.error?.code).toBe('42501');
    lifecycle('assertions passed');
  } catch (error) {
    const browserEvidence = [];
    for (const context of contexts)
      for (const page of context.pages()) {
        browserEvidence.push({
          errorDetails: await page
            .locator('pre')
            .allTextContents()
            .catch(() => []),
          uiStatus: await page
            .getByRole('status')
            .allTextContents()
            .catch(() => []),
          uiText: (
            await page
              .locator('body')
              .innerText()
              .catch(() => '')
          ).replaceAll(email, '[temporary fixture]'),
          learnerBundle: await page
            .evaluate(() => JSON.parse(localStorage.getItem('jp-verb-srs-v2') || 'null'))
            .catch(() => null),
        });
      }
    // Only this fixture's learner bundle is recorded. Auth storage, cookies,
    // headers and credentials are deliberately never inspected or serialized.
    writeFileSync(
      resolve(evidenceDirectory, `live-failure-${runTag}.json`),
      JSON.stringify({ browsers: browserEvidence, networkEvents }, null, 2),
    );
    console.log(
      JSON.stringify({
        liveFailureStatuses: browserEvidence.map((entry) => entry.uiStatus),
        recentCloudResponses: networkEvents.slice(-8),
      }),
    );
    throw error;
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    if (userId) {
      // Never enumerate or touch any real learner: both operations use only the
      // ID returned by this test's own createUser call, including on failure.
      /** @type {any} */
      let rowCleanup = { error: null };
      /** @type {any} */
      let rowVerification = { error: null, data: null };
      let authCleanup;
      try {
        if (cleanupClient) {
          rowCleanup = await cleanupClient.from('srs_sync').delete().eq('id', userId);
          rowVerification = await cleanupClient
            .from('srs_sync')
            .select('id')
            .eq('id', userId)
            .maybeSingle();
        }
      } finally {
        authCleanup = await admin.auth.admin.deleteUser(userId);
      }
      lifecycle('cleanup completed', {
        rowRemoved: !rowCleanup.error && !rowVerification.error && !rowVerification.data,
        authRemoved: !authCleanup.error,
      });
      checked(rowCleanup, 'Remove owned fixture row');
      checked(rowVerification, 'Verify owned fixture row removal');
      expect(rowVerification.data).toBeNull();
      checked(authCleanup, 'Remove temporary auth fixture');
    }
  }
});
