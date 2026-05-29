// @ts-check
// Client-side rate limiting for AI calls (improvement #17).
//
// Gemini requests otherwise rely entirely on server-side quota, so a user
// hammering "Explain" / "Coach" / "Suggest" can fire a burst of requests that
// waste quota and degrade UX. A token bucket allows a small burst (responsive
// for normal use) then throttles sustained spamming with a clear, friendly
// error the UI can surface.

export class RateLimitError extends Error {
  constructor(retryAfterMs) {
    super('Too many AI requests in a short time — please wait a moment and try again.');
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

// A classic token bucket: `capacity` tokens, refilling at `refillPerMs` per ms.
// `take()` consumes one if available; `retryAfter()` reports how long until the
// next token. `now` is injectable for deterministic tests.
export function createTokenBucket({
  capacity = 5,
  refillPerMs = 1 / 2000, // one token every 2s → ~0.5 sustained req/s, burst of 5
  now = () => Date.now(),
} = {}) {
  let tokens = capacity;
  let last = now();

  function refill() {
    const t = now();
    if (t > last) {
      tokens = Math.min(capacity, tokens + (t - last) * refillPerMs);
      last = t;
    }
  }

  return {
    take(n = 1) {
      refill();
      if (tokens >= n) {
        tokens -= n;
        return true;
      }
      return false;
    },
    retryAfter(n = 1) {
      refill();
      const deficit = n - tokens;
      return deficit <= 0 ? 0 : Math.ceil(deficit / refillPerMs);
    },
    get available() {
      refill();
      return tokens;
    },
  };
}

// Shared bucket for all AI requests in the app.
const aiBucket = createTokenBucket();

// Consume one AI token or throw RateLimitError. Call this immediately before
// dispatching a Gemini request.
export function guardAIRequest(bucket = aiBucket) {
  if (!bucket.take()) {
    throw new RateLimitError(bucket.retryAfter());
  }
}
