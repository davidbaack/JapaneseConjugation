import { AuthClient } from '@supabase/supabase-js';

function projectRef(url) {
  try {
    return new globalThis.URL(url).hostname.split('.')[0];
  } catch {
    return 'katachiya';
  }
}

function responseError(body, status) {
  return Object.assign(new Error(body?.message || `Cloud request failed (${status})`), body, {
    status,
  });
}

export function createSupabaseClient(url, anonKey) {
  const auth = new AuthClient({
    url: `${url}/auth/v1`,
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    storageKey: `sb-${projectRef(url)}-auth-token`,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  });

  /**
   * @param {string} path
   * @param {{ method?: string, body?: any, headers?: Record<string, string> }} [options]
   */
  async function request(path, { method = 'GET', body, headers = {} } = {}) {
    const { data } = await auth.getSession();
    const token = data.session?.access_token || anonKey;
    const response = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let value = null;
    try {
      value = await response.json();
    } catch {}
    return response.ok
      ? { data: value, error: null }
      : { data: null, error: responseError(value, response.status) };
  }

  return {
    auth,
    from(table) {
      return {
        select(columns) {
          return {
            eq(column, value) {
              return {
                async maybeSingle() {
                  const query = new globalThis.URLSearchParams({
                    select: columns,
                    [column]: `eq.${value}`,
                    limit: '1',
                  });
                  const result = await request(`${table}?${query}`);
                  return result.error
                    ? result
                    : {
                        data: Array.isArray(result.data) ? result.data[0] || null : null,
                        error: null,
                      };
                },
              };
            },
          };
        },
      };
    },
    rpc(name, params) {
      return request(`rpc/${name}`, { method: 'POST', body: params });
    },
  };
}
