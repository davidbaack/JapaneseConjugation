// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, AuthClient } = vi.hoisted(() => {
  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  };
  return {
    auth,
    AuthClient: vi.fn(function AuthClientMock() {
      return auth;
    }),
  };
});

vi.mock('@supabase/supabase-js', () => ({ AuthClient }));

import { createSupabaseClient } from '../utils/supabaseClient.js';

beforeEach(() => {
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'session-token' } },
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('deferred Supabase client facade', () => {
  it('configures persisted PKCE auth with the standard project storage key', () => {
    const client = createSupabaseClient('https://project-ref.supabase.co', 'anon-key');

    expect(AuthClient).toHaveBeenCalledWith({
      url: 'https://project-ref.supabase.co/auth/v1',
      headers: { apikey: 'anon-key', Authorization: 'Bearer anon-key' },
      storageKey: 'sb-project-ref-auth-token',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    });
    expect(client.auth).toBe(auth);
  });

  it('performs the sync-row read with the current session token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([{ data: { cards: {} }, revision: 7 }]),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createSupabaseClient('https://project-ref.supabase.co', 'anon-key');

    const result = await client
      .from('srs_sync')
      .select('data, updated_at, revision')
      .eq('id', 'user-1')
      .maybeSingle();

    const [url, options] = fetchMock.mock.calls[0];
    expect(decodeURIComponent(url)).toContain('/rest/v1/srs_sync?');
    expect(decodeURIComponent(url)).toContain('id=eq.user-1');
    expect(options.headers.Authorization).toBe('Bearer session-token');
    expect(result).toEqual({ data: { data: { cards: {} }, revision: 7 }, error: null });
  });

  it('posts CAS RPC parameters and preserves conflict details', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: vi.fn().mockResolvedValue({ code: '40001', message: 'sync_revision_conflict' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createSupabaseClient('https://project-ref.supabase.co', 'anon-key');

    const result = await client.rpc('cas_srs_sync', {
      expected_revision: 3,
      next_data: { cards: {} },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/rest/v1/rpc/cas_srs_sync',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expected_revision: 3, next_data: { cards: {} } }),
      }),
    );
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({
      code: '40001',
      message: 'sync_revision_conflict',
      status: 409,
    });
  });
});

it('passes cancellation to the real REST read and CAS transports', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
  vi.stubGlobal('fetch', fetchMock);
  const client = createSupabaseClient('https://project-ref.supabase.co', 'anon-key');
  const controller = new AbortController();
  await client
    .from('srs_sync')
    .select('data')
    .eq('id', 'fixture')
    .maybeSingle()
    .abortSignal(controller.signal);
  await client.rpc('cas_srs_sync', { expected_revision: 1 }).abortSignal(controller.signal);
  expect(fetchMock.mock.calls.map((call) => call[1].signal)).toEqual([
    controller.signal,
    controller.signal,
  ]);
});

it('never begins a late write if auth resolves after its request was cancelled', async () => {
  let resolveAuth;
  auth.getSession.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveAuth = resolve;
    }),
  );
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const client = createSupabaseClient('https://project-ref.supabase.co', 'anon-key');
  const controller = new AbortController();
  const write = Promise.resolve(client.rpc('cas_srs_sync', {}).abortSignal(controller.signal));
  const rejected = expect(write).rejects.toThrow('Cancelled fixture');
  await Promise.resolve();
  controller.abort(new Error('Cancelled fixture'));
  resolveAuth({ data: { session: { access_token: 'fixture-only' } } });
  await rejected;
  expect(fetchMock).not.toHaveBeenCalled();
});
