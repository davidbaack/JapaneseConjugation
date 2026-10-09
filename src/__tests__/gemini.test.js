// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const contents = [{ role: 'user', parts: [{ text: 'Help me practice te-form.' }] }];
const geminiResponse = {
  candidates: [{ content: { parts: [{ text: 'Proxy works.' }] } }],
};

function stubGeminiFetch(response = geminiResponse) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(response),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Gemini request deadlines', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.doMock('../utils/supabase.js', () => ({ getLoadedSupabaseClient: () => null }));
    vi.stubEnv('VITE_SUPABASE_URL', 'https://katachiya.example.supabase.co');
  });

  it.each(['transport', 'body'])('bounds stalled %s even when it ignores abort', async (stage) => {
    const fetchMock = vi.fn(() =>
      stage === 'transport'
        ? new Promise(() => {})
        : Promise.resolve({ ok: true, json: () => new Promise(() => {}) }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { callGemini } = await import('../utils/gemini.js');
    const rejected = expect(callGemini(contents, 'proxy')).rejects.toThrow(/Request timed out/);

    await vi.advanceTimersByTimeAsync(92000);
    await rejected;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, options] of fetchMock.mock.calls) expect(options.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds authentication and prevents a late session from starting expired requests', async () => {
    let resolveSession;
    const session = new Promise((resolve) => {
      resolveSession = resolve;
    });
    const getSession = vi.fn(() => session);
    vi.doMock('../utils/supabase.js', () => ({
      getLoadedSupabaseClient: () => ({ auth: { getSession } }),
    }));
    const fetchMock = stubGeminiFetch();
    const { callGemini } = await import('../utils/gemini.js');
    const rejected = expect(callGemini(contents, 'proxy')).rejects.toThrow(/Request timed out/);

    await vi.advanceTimersByTimeAsync(92000);
    await rejected;
    resolveSession({ data: { session: { access_token: 'late-session' } } });
    await vi.advanceTimersByTimeAsync(0);

    expect(getSession).toHaveBeenCalledTimes(3);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries a body timeout successfully with a fresh signal', async () => {
    const fetchMock = stubGeminiFetch();
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => new Promise(() => {}) });
    const { callGemini } = await import('../utils/gemini.js');
    const reply = callGemini(contents, 'proxy');

    await vi.advanceTimersByTimeAsync(31000);
    await expect(reply).resolves.toBe('Proxy works.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows a delayed body within the deadline and clears its timer', async () => {
    let resolveBody;
    const body = new Promise((resolve) => {
      resolveBody = resolve;
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => body });
    vi.stubGlobal('fetch', fetchMock);
    const { callGemini } = await import('../utils/gemini.js');
    const reply = callGemini(contents, 'proxy');

    await vi.advanceTimersByTimeAsync(29999);
    resolveBody(geminiResponse);
    await expect(reply).resolves.toBe('Proxy works.');
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves non-transient HTTP failures without retrying', async () => {
    const fetchMock = stubGeminiFetch({ error: 'Invalid coaching request' });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid coaching request' }),
    });
    const { callGemini } = await import('../utils/gemini.js');

    await expect(callGemini(contents, 'proxy')).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Gemini requests', () => {
  it('uses the Supabase proxy without requiring a signed-in session', async () => {
    const getSession = vi.fn().mockResolvedValue({ data: { session: null } });
    vi.doMock('../utils/supabase.js', () => ({
      getLoadedSupabaseClient: () => ({ auth: { getSession } }),
    }));
    vi.stubEnv('VITE_SUPABASE_URL', 'https://katachiya.example.supabase.co');
    const fetchMock = stubGeminiFetch();

    const { callGemini } = await import('../utils/gemini.js');

    await expect(callGemini(contents, 'proxy')).resolves.toBe('Proxy works.');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://katachiya.example.supabase.co/functions/v1/gemini-proxy',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('includes the Supabase access token when a session exists', async () => {
    vi.doMock('../utils/supabase.js', () => ({
      getLoadedSupabaseClient: () => ({
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { access_token: 'session-token' } },
          }),
        },
      }),
    }));
    vi.stubEnv('VITE_SUPABASE_URL', 'https://katachiya.example.supabase.co');
    const fetchMock = stubGeminiFetch();

    const { callGemini } = await import('../utils/gemini.js');

    await expect(callGemini(contents, 'proxy')).resolves.toBe('Proxy works.');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer session-token');
  });

  it('does not use client-provided Gemini API keys', async () => {
    vi.doMock('../utils/supabase.js', () => ({ getLoadedSupabaseClient: () => null }));
    const fetchMock = stubGeminiFetch();

    const { callGemini } = await import('../utils/gemini.js');

    await expect(callGemini(contents, 'local-dev-key')).rejects.toThrow(/cloud proxy/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
