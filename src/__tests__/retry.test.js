import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff, isTransientError } from '../utils/retry.js';

// A sleep stub that resolves immediately and records the requested delays, so
// tests run fast and can assert the backoff schedule.
function fakeSleep() {
  const delays = [];
  const sleep = (ms) => {
    delays.push(ms);
    return Promise.resolve();
  };
  return { sleep, delays };
}

describe('isTransientError', () => {
  it('treats timeouts, network failures, 429 and 5xx as transient', () => {
    expect(isTransientError(new Error('Request timed out'))).toBe(true);
    expect(isTransientError(new Error('network error'))).toBe(true);
    expect(isTransientError(new Error('Failed to fetch'))).toBe(true);
    expect(isTransientError(Object.assign(new Error('x'), { status: 429 }))).toBe(true);
    expect(isTransientError(Object.assign(new Error('x'), { status: 503 }))).toBe(true);
    expect(isTransientError(new Error('HTTP 502'))).toBe(true);
  });

  it('treats auth/validation/4xx (except 429) as non-transient', () => {
    expect(isTransientError(new Error('row level security'))).toBe(false);
    expect(isTransientError(Object.assign(new Error('x'), { status: 400 }))).toBe(false);
    expect(isTransientError(Object.assign(new Error('x'), { status: 403 }))).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });
});

describe('retryWithBackoff', () => {
  it('returns the result on first success without sleeping', async () => {
    const { sleep, delays } = fakeSleep();
    const fn = vi.fn(() => Promise.resolve('ok'));
    await expect(retryWithBackoff(fn, { sleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it('retries a transient failure then succeeds', async () => {
    const { sleep } = fakeSleep();
    let calls = 0;
    const fn = vi.fn(() => {
      calls += 1;
      if (calls < 3) return Promise.reject(new Error('network down'));
      return Promise.resolve('recovered');
    });
    await expect(retryWithBackoff(fn, { sleep, jitter: false })).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('gives up after `retries` attempts and throws the last error', async () => {
    const { sleep } = fakeSleep();
    const fn = vi.fn(() => Promise.reject(new Error('timeout')));
    await expect(retryWithBackoff(fn, { sleep, retries: 2 })).rejects.toThrow('timeout');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry a non-transient error', async () => {
    const { sleep, delays } = fakeSleep();
    const fn = vi.fn(() => Promise.reject(new Error('row level security')));
    await expect(retryWithBackoff(fn, { sleep })).rejects.toThrow('row level security');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it('applies exponential backoff (no jitter) between retries', async () => {
    const { sleep, delays } = fakeSleep();
    const fn = vi.fn(() => Promise.reject(new Error('timeout')));
    await expect(
      retryWithBackoff(fn, { sleep, retries: 3, baseDelay: 100, factor: 2, jitter: false }),
    ).rejects.toThrow();
    expect(delays).toEqual([100, 200, 400]);
  });

  it('caps the delay at maxDelay and keeps jitter within [50%,100%]', async () => {
    const { sleep, delays } = fakeSleep();
    const fn = vi.fn(() => Promise.reject(new Error('timeout')));
    await expect(
      retryWithBackoff(fn, { sleep, retries: 4, baseDelay: 1000, maxDelay: 2000, factor: 10 }),
    ).rejects.toThrow();
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(500); // >= 50% of capped 1000+ floor
      expect(d).toBeLessThanOrEqual(2000); // never above maxDelay
    }
  });
});
