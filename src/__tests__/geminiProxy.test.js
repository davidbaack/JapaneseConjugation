import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHmac } from 'node:crypto';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Execute the actual Edge Function with a captured Deno handler and mocked
// transport. No Supabase or provider credentials or network calls are used.
const source = readFileSync(
  new URL('../../supabase/functions/gemini-proxy/index.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const reply = { candidates: [{ content: { parts: [{ text: 'A focused explanation.' }] } }] };

function proxy(
  fetchImpl,
  quota = async () => ({ ok: true, json: async () => ({ allowed: true }) }),
) {
  let handler;
  runInNewContext(compiled, {
    Deno: {
      env: {
        get: (key) =>
          ({
            ALLOWED_ORIGIN: 'https://learner.invalid',
            GEMINI_API_KEY: 'fake-test-key',
            SUPABASE_URL: 'https://quota.invalid',
            SUPABASE_SERVICE_ROLE_KEY: 'fake-service-key',
          })[key],
      },
      serve: (callback) => {
        handler = callback;
      },
    },
    fetch: (url, options) =>
      url.startsWith('https://quota.invalid/') ? quota(url, options) : fetchImpl(url, options),
    crypto: {
      subtle: {
        importKey: async (_format, key) => key,
        sign: async (_algorithm, key, bytes) =>
          Uint8Array.from(createHmac('sha256', key).update(bytes).digest()).buffer,
      },
    },
    TextEncoder: globalThis.TextEncoder,
    Date,
    AbortController,
    Response: globalThis.Response,
    setTimeout,
    clearTimeout,
  });
  return handler;
}

function request(signal) {
  return new globalThis.Request('https://proxy.invalid', {
    method: 'POST',
    headers: { Origin: 'https://learner.invalid', 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Help with te-form.' }] }] }),
    ...(signal ? { signal } : {}),
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Gemini proxy deadlines', () => {
  it.each(['transport', 'body'])(
    'returns 504 for stalled provider %s and aborts it',
    async (stage) => {
      const fetchImpl = vi.fn(() =>
        stage === 'transport'
          ? new Promise(() => {})
          : Promise.resolve({ ok: true, json: () => new Promise(() => {}) }),
      );
      const response = proxy(fetchImpl)(request());

      await vi.advanceTimersByTimeAsync(30000);
      const result = await response;
      expect(result.status).toBe(504);
      expect(await result.json()).toEqual({ error: 'AI request timed out. Please try again.' });
      expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('bounds a stalled incoming body and never sends it to Gemini after timeout', async () => {
    let resolveBody;
    const body = new Promise((resolve) => {
      resolveBody = resolve;
    });
    const req = request();
    vi.spyOn(req, 'text').mockReturnValue(body);
    const fetchImpl = vi.fn();
    const response = proxy(fetchImpl)(req);

    await vi.advanceTimersByTimeAsync(30000);
    expect((await response).status).toBe(504);
    resolveBody(JSON.stringify({ contents: [{ parts: [{ text: 'Late input.' }] }] }));
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels provider work when the caller disconnects', async () => {
    const caller = new AbortController();
    const fetchImpl = vi.fn(() => new Promise(() => {}));
    const response = proxy(fetchImpl)(request(caller.signal));
    await vi.advanceTimersByTimeAsync(0);
    caller.abort();

    const result = await response;
    expect(await result.json()).toEqual({ error: 'AI request was cancelled.' });
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start provider work for an already disconnected caller', async () => {
    const caller = new AbortController();
    caller.abort();
    const fetchImpl = vi.fn();
    const response = await proxy(fetchImpl)(request(caller.signal));

    expect(await response.json()).toEqual({ error: 'AI request was cancelled.' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves provider output and cleans up the deadline and disconnect listener', async () => {
    const caller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => reply });
    const response = await proxy(fetchImpl)(request(caller.signal));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(reply);
    const [, options] = fetchImpl.mock.calls[0];
    expect(JSON.parse(options.body).generationConfig.thinkingConfig).toEqual({
      thinkingLevel: 'MINIMAL',
    });
    expect(vi.getTimerCount()).toBe(0);
    caller.abort();
    expect(options.signal.aborted).toBe(false);
  });

  it('preserves origin rejection without invoking the provider', async () => {
    const req = request();
    req.headers.set('Origin', 'https://unapproved.invalid');
    const fetchImpl = vi.fn();

    expect((await proxy(fetchImpl)(req)).status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('shared AI quota admission', () => {
  it.each(['burst', 'ip_daily', 'global_daily'])(
    'stops paid work when %s denies admission',
    async (reason) => {
      const paid = vi.fn();
      const quota = vi.fn(async () => ({
        ok: true,
        json: async () => ({ allowed: false, reason, retry_after_seconds: 60 }),
      }));
      const response = await proxy(paid, quota)(request());
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('60');
      expect(paid).not.toHaveBeenCalled();
    },
  );

  it.each(['http', 'json', 'malformed'])('fails closed on a quota %s error', async (mode) => {
    const paid = vi.fn();
    const quota = async () => ({
      ok: mode !== 'http',
      json: async () => {
        if (mode === 'json') throw new Error('private database detail');
        return { allowed: 'yes' };
      },
    });
    const response = await proxy(paid, quota)(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private');
    expect(paid).not.toHaveBeenCalled();
  });

  it('bounds stalled quota body reads and prevents late admission from starting paid work', async () => {
    let resolve;
    const body = new Promise((done) => {
      resolve = done;
    });
    const paid = vi.fn();
    const response = proxy(paid, async () => ({ ok: true, json: () => body }))(request());
    await vi.advanceTimersByTimeAsync(30000);
    expect((await response).status).toBe(504);
    resolve({ allowed: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(paid).not.toHaveBeenCalled();
  });

  it('uses a daily private client hash and server-bounded costs without requiring sign-in', async () => {
    const quota = vi.fn(async () => ({ ok: true, json: async () => ({ allowed: true }) }));
    const paid = vi.fn(async () => ({ ok: true, json: async () => reply }));
    const req = request();
    req.headers.set('x-forwarded-for', '203.0.113.25');
    expect(req.headers.has('Authorization')).toBe(false);
    expect((await proxy(paid, quota)(req)).status).toBe(200);
    const reservation = JSON.parse(quota.mock.calls[0][1].body);
    expect(reservation.client_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(reservation.input_token_bound).toBeGreaterThan(4096);
    expect(reservation.output_token_bound).toBe(600);
    expect(reservation.model).toBe('gemini-3.5-flash-lite');
    expect(JSON.stringify(reservation)).not.toContain('203.0.113.25');
    const again = request();
    again.headers.set('x-forwarded-for', '203.0.113.25');
    await proxy(paid, quota)(again);
    expect(JSON.parse(quota.mock.calls[1][1].body).client_hash).toBe(reservation.client_hash);
    await vi.advanceTimersByTimeAsync(86400000);
    const tomorrow = request();
    tomorrow.headers.set('x-forwarded-for', '203.0.113.25');
    await proxy(paid, quota)(tomorrow);
    expect(JSON.parse(quota.mock.calls[2][1].body).client_hash).not.toBe(reservation.client_hash);
    expect(quota.mock.calls[0][1].signal).toBe(paid.mock.calls[0][1].signal);
  });

  it('rejects external media and invalid input before quota or paid work', async () => {
    const paid = vi.fn(),
      quota = vi.fn();
    const req = new globalThis.Request('https://proxy.invalid', {
      method: 'POST',
      headers: { Origin: 'https://learner.invalid' },
      body: JSON.stringify({
        contents: [{ parts: [{ fileData: { fileUri: 'https://media.invalid/large.pdf' } }] }],
      }),
    });
    expect((await proxy(paid, quota)(req)).status).toBe(400);
    expect(quota).not.toHaveBeenCalled();
    expect(paid).not.toHaveBeenCalled();
  });

  it('enforces the input byte limit for multibyte text', async () => {
    const paid = vi.fn(),
      quota = vi.fn();
    const req = new globalThis.Request('https://proxy.invalid', {
      method: 'POST',
      headers: { Origin: 'https://learner.invalid' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'あ'.repeat(11000) }] }] }),
    });
    expect((await proxy(paid, quota)(req)).status).toBe(413);
    expect(quota).not.toHaveBeenCalled();
    expect(paid).not.toHaveBeenCalled();
  });
});
