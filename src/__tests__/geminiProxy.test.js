import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
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

function proxy(fetchImpl) {
  let handler;
  runInNewContext(compiled, {
    Deno: {
      env: {
        get: (key) =>
          ({ ALLOWED_ORIGIN: 'https://learner.invalid', GEMINI_API_KEY: 'fake-test-key' })[key],
      },
      serve: (callback) => {
        handler = callback;
      },
    },
    fetch: fetchImpl,
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
