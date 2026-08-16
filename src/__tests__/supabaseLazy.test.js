// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const SUPABASE_URL = 'https://project-ref.supabase.co';

async function loadModule({ configured = true, createClient = vi.fn() } = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', configured ? SUPABASE_URL : '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', configured ? 'anon-key' : '');
  vi.doMock('../utils/supabaseClient.js', () => ({
    createSupabaseClient: createClient,
  }));
  return import('../utils/supabase.js');
}

afterEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  window.location.hash = '';
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('lazy Supabase client', () => {
  it('keeps an unconfigured build usable without loading a client', async () => {
    const createClient = vi.fn();
    const cloud = await loadModule({ configured: false, createClient });

    expect(cloud.getSupabaseClientState()).toMatchObject({
      configured: false,
      status: 'unconfigured',
      client: null,
    });
    await expect(cloud.loadSupabaseClient()).rejects.toThrow(/not configured/);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('stays idle until explicit first use, then publishes loading and ready states', async () => {
    const client = { auth: {} };
    const createClient = vi.fn(() => client);
    const cloud = await loadModule({ createClient });
    const states = [];
    cloud.subscribeSupabaseClient((state) => states.push(state.status));

    expect(cloud.getSupabaseClientState()).toMatchObject({ status: 'idle', client: null });
    expect(createClient).not.toHaveBeenCalled();

    const loading = cloud.loadSupabaseClient();
    expect(cloud.getSupabaseClientState().status).toBe('loading');
    await expect(loading).resolves.toBe(client);
    expect(states).toEqual(['loading', 'ready']);
  });

  it('exposes a load error and succeeds on an explicit retry', async () => {
    const client = { auth: {} };
    const createClient = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('SDK chunk unavailable');
      })
      .mockReturnValueOnce(client);
    const cloud = await loadModule({ createClient });

    await expect(cloud.loadSupabaseClient()).rejects.toThrow('SDK chunk unavailable');
    expect(cloud.getSupabaseClientState()).toMatchObject({ status: 'error', client: null });
    expect(cloud.getSupabaseClientState().error?.message).toBe('SDK chunk unavailable');

    await expect(cloud.loadSupabaseClient({ retry: true })).resolves.toBe(client);
    expect(cloud.getSupabaseClientState()).toMatchObject({ status: 'ready', client });
  });

  it('recognizes stored sessions plus implicit and PKCE auth callbacks', async () => {
    const cloud = await loadModule();

    expect(cloud.shouldRestoreSupabaseSession()).toBe(false);
    localStorage.setItem('sb-project-ref-auth-token', '{"access_token":"stored"}');
    expect(cloud.shouldRestoreSupabaseSession()).toBe(true);

    localStorage.clear();
    window.history.replaceState(null, '', '/?code=pkce-code');
    expect(cloud.shouldRestoreSupabaseSession()).toBe(true);

    window.history.replaceState(null, '', '/');
    window.location.hash = '#access_token=implicit-token';
    expect(cloud.shouldRestoreSupabaseSession()).toBe(true);
  });

  it('keeps the only static SDK import behind the deferred client boundary', () => {
    const sourceFiles = import.meta.glob('../**/*.{js,jsx}', {
      eager: true,
      query: '?raw',
      import: 'default',
    });
    for (const [path, source] of Object.entries(sourceFiles)) {
      if (path.endsWith('/supabaseLazy.test.js') || path.endsWith('/supabaseClient.js')) continue;
      expect(String(source), path).not.toMatch(
        /import\s+(?:[^('\n]+?\s+from\s+)?['"]@supabase\/supabase-js['"]/,
      );
    }

    const loader = sourceFiles['../utils/supabase.js'];
    const deferredClient = sourceFiles['../utils/supabaseClient.js'];
    expect(loader).toContain("import('./supabaseClient.js')");
    expect(deferredClient).toContain("from '@supabase/supabase-js'");
  });
});
