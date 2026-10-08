const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

const listeners = new Set();
let loadPromise = null;
let clientState = {
  configured: !!(supabaseUrl && supabaseAnonKey),
  status: supabaseUrl && supabaseAnonKey ? 'idle' : 'unconfigured',
  error: null,
  client: null,
};

function publish(next) {
  clientState = next;
  for (const listener of listeners) listener(clientState);
}

export function getSupabaseConfig() {
  return { url: supabaseUrl, anonKey: supabaseAnonKey };
}

export function isSupabaseConfigured() {
  return clientState.configured;
}

export function getSupabaseClientState() {
  return clientState;
}

export function getLoadedSupabaseClient() {
  return clientState.client;
}

export function subscribeSupabaseClient(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function persistedSessionKey() {
  if (!supabaseUrl) return '';
  try {
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    return projectRef ? `sb-${projectRef}-auth-token` : '';
  } catch {
    return '';
  }
}

export function hasPersistedSupabaseSession() {
  if (!clientState.configured || typeof localStorage === 'undefined') return false;
  try {
    const value = localStorage.getItem(persistedSessionKey());
    return !!value && value !== 'null';
  } catch {
    return false;
  }
}

export function shouldRestoreSupabaseSession() {
  const authCallback =
    typeof window !== 'undefined' &&
    (new globalThis.URLSearchParams(window.location.search || '').has('code') ||
      /(?:^|[#&])(?:access_token|error_description)=/.test(window.location.hash || ''));
  return hasPersistedSupabaseSession() || authCallback;
}

export async function loadSupabaseClient({ retry = false } = {}) {
  if (!clientState.configured) {
    throw new Error('Cloud sync is not configured for this build.');
  }
  if (clientState.client) return clientState.client;
  if (loadPromise && !retry) return loadPromise;
  if (retry) loadPromise = null;

  publish({ ...clientState, status: 'loading', error: null });
  loadPromise = import('./supabaseClient.js')
    .then(({ createSupabaseClient }) => {
      const client = createSupabaseClient(supabaseUrl, supabaseAnonKey);
      publish({ configured: true, status: 'ready', error: null, client });
      return client;
    })
    .catch((error) => {
      const normalized =
        error instanceof Error ? error : new Error('Cloud services failed to load.');
      loadPromise = null;
      publish({ configured: true, status: 'error', error: normalized, client: null });
      throw normalized;
    });
  return loadPromise;
}
