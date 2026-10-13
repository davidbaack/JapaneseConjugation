// @ts-check
// Exponential backoff with jitter for transient failures (improvement #14).
//
// Used to protect cloud sync (so a flaky network doesn't drop a user's
// progress) and AI calls (so a momentary 429/5xx doesn't surface as a hard
// error). Only *transient* failures are retried — auth/validation errors fail
// fast so the user gets immediate, actionable feedback.

/** @param {number} ms @param {AbortSignal} [signal] */
const DEFAULT_SLEEP = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(undefined);
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

// Pull an HTTP-ish status code out of an error if one is present.
/** @param {any} error */
function statusOf(error) {
  if (!error) return 0;
  if (typeof error.status === 'number') return error.status;
  if (typeof error.statusCode === 'number') return error.statusCode;
  const m = String(error.message || '').match(/\bHTTP (\d{3})\b/);
  return m ? Number(m[1]) : 0;
}

/** @param {any} error */
function retryAfterOf(error) {
  return typeof error?.retryAfterMs === 'number' && Number.isFinite(error.retryAfterMs)
    ? Math.max(0, error.retryAfterMs)
    : 0;
}

// Heuristic: is this error worth retrying? Network blips, timeouts, rate limits
// (429), and server errors (5xx) are transient; everything else (bad request,
// auth, validation) is not and should fail immediately.
/** @param {any} error */
export function isTransientError(error) {
  if (!error) return false;
  if (error.name === 'AbortError' || error.retryable === false) return false;
  const msg = String(error.message || error).toLowerCase();
  if (
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('connection') ||
    msg.includes('unreachable')
  ) {
    return true;
  }
  const status = statusOf(error);
  return status === 429 || (status >= 500 && status < 600);
}

// Run `fn` (which may be async), retrying on transient failure with exponential
// backoff + jitter. Resolves with fn's value, or rejects with the last error
// once retries are exhausted or the error is deemed non-transient.
/**
 * @typedef {Object} RetryOptions
 * @property {number} [retries]      Max retries after the first attempt.
 * @property {number} [baseDelay]    Base backoff delay in ms.
 * @property {number} [maxDelay]     Maximum backoff delay in ms.
 * @property {number} [factor]       Exponential growth factor.
 * @property {boolean} [jitter]      Apply [50%,100%] jitter to each delay.
 * @property {(error: any) => boolean} [shouldRetry]
 * @property {(error: any, attempt: number, delay: number) => void} [onRetry]
 * @property {(ms: number, signal?: AbortSignal) => Promise<void>} [sleep]
 * @property {AbortSignal} [signal]
 */
/**
 * @template T
 * @param {(attempt: number) => Promise<T> | T} fn
 * @param {RetryOptions} [options]
 * @returns {Promise<T>}
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    retries = 3,
    baseDelay = 500,
    maxDelay = 8000,
    factor = 2,
    jitter = true,
    shouldRetry = isTransientError,
    onRetry,
    sleep = DEFAULT_SLEEP,
    signal,
  } = options;

  let attempt = 0;
  for (;;) {
    signal?.throwIfAborted();
    try {
      const result = await fn(attempt);
      signal?.throwIfAborted();
      return result;
    } catch (error) {
      signal?.throwIfAborted();
      attempt += 1;
      if (attempt > retries || !shouldRetry(error)) throw error;
      const retryAfter = retryAfterOf(error);
      if (retryAfter > maxDelay) throw error;
      let delay = Math.min(maxDelay, baseDelay * factor ** (attempt - 1));
      // Full jitter in the [50%, 100%] band so concurrent clients don't
      // synchronize their retries into a thundering herd.
      if (jitter) delay = Math.round(delay * (0.5 + Math.random() * 0.5));
      // Retry-After is a lower bound; jitter must never retry admission early.
      delay = Math.max(delay, retryAfter);
      if (onRetry) onRetry(error, attempt, delay);
      await sleep(delay, signal);
    }
  }
}
