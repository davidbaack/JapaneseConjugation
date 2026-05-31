// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Gemini requests', () => {
  it('uses the Supabase proxy without requiring a signed-in session', async () => {
    const getSession = vi.fn().mockResolvedValue({ data: { session: null } });
    vi.doMock('../utils/supabase.js', () => ({ supabase: { auth: { getSession } } }));
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
      supabase: {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { access_token: 'session-token' } },
          }),
        },
      },
    }));
    vi.stubEnv('VITE_SUPABASE_URL', 'https://katachiya.example.supabase.co');
    const fetchMock = stubGeminiFetch();

    const { callGemini } = await import('../utils/gemini.js');

    await expect(callGemini(contents, 'proxy')).resolves.toBe('Proxy works.');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer session-token');
  });

  it('keeps direct Gemini keys limited to local development fallback', async () => {
    vi.doMock('../utils/supabase.js', () => ({ supabase: null }));
    const fetchMock = stubGeminiFetch();

    const { callGemini } = await import('../utils/gemini.js');

    await expect(callGemini(contents, 'local-dev-key')).resolves.toBe('Proxy works.');
    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
    expect(fetchMock.mock.calls[0][0]).toContain('key=local-dev-key');
  });
});
