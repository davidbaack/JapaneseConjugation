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

function abortableRequest(run) {
  let signal;
  let promise;
  const query = {
    abortSignal(nextSignal) {
      signal = nextSignal;
      return query;
    },
    then(resolve, reject) {
      promise ||= run(signal);
      return promise.then(resolve, reject);
    },
  };
  return query;
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
   * @param {{ method?: string, body?: any, headers?: Record<string, string>, signal?: AbortSignal }} [options]
   */
  async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
    signal?.throwIfAborted();
    const { data } = await auth.getSession();
    signal?.throwIfAborted();
    const token = data.session?.access_token || anonKey;
    const response = await fetch(`${url}/rest/v1/${path}`, {
      method,
      ...(signal ? { signal } : {}),
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
    } catch {
      signal?.throwIfAborted();
    }
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
                maybeSingle() {
                  const query = new globalThis.URLSearchParams({
                    select: columns,
                    [column]: `eq.${value}`,
                    limit: '1',
                  });
                  return abortableRequest(async (signal) => {
                    const result = await request(`${table}?${query}`, { signal });
                    return result.error
                      ? result
                      : {
                          data: Array.isArray(result.data) ? result.data[0] || null : null,
                          error: null,
                        };
                  });
                },
              };
            },
          };
        },
      };
    },
    rpc(name, params) {
      return abortableRequest((signal) =>
        request(`rpc/${name}`, { method: 'POST', body: params, signal }),
      );
    },
  };
}
