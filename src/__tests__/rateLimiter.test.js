import { describe, it, expect } from 'vitest';
import { createTokenBucket, guardAIRequest, RateLimitError } from '../utils/rateLimiter.js';

describe('createTokenBucket', () => {
  it('allows a burst up to capacity then refuses', () => {
    let t = 0;
    const bucket = createTokenBucket({ capacity: 3, refillPerMs: 1 / 1000, now: () => t });
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false); // bucket empty
  });

  it('refills over time at the configured rate', () => {
    let t = 0;
    const bucket = createTokenBucket({ capacity: 2, refillPerMs: 1 / 1000, now: () => t });
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);
    t = 1000; // one token's worth of time passes
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);
  });

  it('never refills beyond capacity', () => {
    let t = 0;
    const bucket = createTokenBucket({ capacity: 2, refillPerMs: 1 / 1000, now: () => t });
    t = 10_000_000; // huge gap
    expect(bucket.available).toBeLessThanOrEqual(2);
  });

  it('reports how long until the next token', () => {
    let t = 0;
    const bucket = createTokenBucket({ capacity: 1, refillPerMs: 1 / 1000, now: () => t });
    expect(bucket.take()).toBe(true);
    expect(bucket.retryAfter()).toBe(1000); // need 1 token, 1ms per 1/1000 → 1000ms
  });
});

describe('guardAIRequest', () => {
  it('passes while tokens remain and throws RateLimitError once exhausted', () => {
    let t = 0;
    const bucket = createTokenBucket({ capacity: 2, refillPerMs: 1 / 1000, now: () => t });
    expect(() => guardAIRequest(bucket)).not.toThrow();
    expect(() => guardAIRequest(bucket)).not.toThrow();
    let thrown;
    try {
      guardAIRequest(bucket);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(RateLimitError);
    expect(thrown.retryAfterMs).toBeGreaterThan(0);
    expect(thrown.message).toMatch(/wait a moment/i);
  });
});
