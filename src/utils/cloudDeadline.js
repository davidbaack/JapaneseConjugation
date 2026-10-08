export const CLOUD_REQUEST_TIMEOUT_MS = 15000;

// Bound the complete read/write attempt, including authentication and retries.
// Promise.race handles transports that ignore abort; AbortSignal cancels the
// real PostgREST request so a stalled restore becomes a retryable local save.
export async function withCloudDeadline(run) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(
        new Error('Cloud request timed out. Your browser data is saved; try Sync now again.'),
        { code: 'CLOUD_REQUEST_TIMEOUT' },
      );
      reject(error);
      controller.abort(error);
    }, CLOUD_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export function abortableQuery(query, signal) {
  signal.throwIfAborted();
  return typeof query.abortSignal === 'function' ? query.abortSignal(signal) : query;
}
