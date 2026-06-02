import { describe, it, expect, afterEach } from 'vitest';
import { saveAll, isQuotaExceeded, estimateStorageBytes, clearAICache } from '../utils/storage.js';

// A minimal in-memory localStorage that can be told to throw a quota error on
// the next N setItem calls — enough to exercise saveAll's evict-and-retry path.
function makeQuotaStore({ failTimes = 0 } = {}) {
  const map = new Map();
  let failsLeft = failTimes;
  return {
    get length() {
      return map.size;
    },
    key(i) {
      return Array.from(map.keys())[i] ?? null;
    },
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (failsLeft > 0) {
        failsLeft -= 1;
        throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
      }
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
    _map: map,
  };
}

const args = (state) => [state, [], [], [], { enabled: false }, 0, '', undefined];

afterEach(() => {
  delete globalThis.localStorage;
});

describe('isQuotaExceeded', () => {
  it('recognizes the browser quota-error variants', () => {
    expect(isQuotaExceeded({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaExceeded({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaExceeded({ code: 22 })).toBe(true);
    expect(isQuotaExceeded(new Error('something else'))).toBe(false);
  });
});

describe('saveAll quota handling', () => {
  it('writes normally when there is room', () => {
    const store = makeQuotaStore();
    globalThis.localStorage = store;
    saveAll(...args({ a: 1 }));
    expect(store._map.get('jp-verb-srs-v2')).toContain('"a":1');
  });

  it('evicts the AI cache and retries once when the first write hits quota', () => {
    const store = makeQuotaStore({ failTimes: 1 });
    // Seed the cache directly so the seeding write doesn't consume the quota fail.
    store._map.set('katachiya_ai_sentence_cache', JSON.stringify({ k: 'big' }));
    globalThis.localStorage = store;

    // Should not throw: it clears the cache, then the retry succeeds.
    expect(() => saveAll(...args({ a: 2 }))).not.toThrow();
    expect(store._map.get('jp-verb-srs-v2')).toContain('"a":2');
    expect(store._map.has('katachiya_ai_sentence_cache')).toBe(false);
  });

  it('throws a friendly quota error when eviction is not enough', () => {
    const store = makeQuotaStore({ failTimes: 2 }); // both attempts fail
    globalThis.localStorage = store;
    try {
      saveAll(...args({ a: 3 }));
      throw new Error('expected saveAll to throw');
    } catch (e) {
      expect(e.isQuotaError).toBe(true);
      expect(e.message).toMatch(/Storage full/);
    }
  });
});

describe('estimateStorageBytes', () => {
  it('sums the app keys in localStorage', () => {
    const store = makeQuotaStore();
    globalThis.localStorage = store;
    store.setItem('jp-verb-srs-v2', 'abcd');
    store.setItem('katachiya_ai_explanations_cache', 'ef');
    store.setItem('unrelated', 'should-not-count');
    // (4+12)*2 + (24+2)*2 ... we only assert it counts app keys and ignores others.
    const bytes = estimateStorageBytes();
    expect(bytes).toBeGreaterThan(0);
    // Removing the unrelated key should not change the estimate.
    const before = estimateStorageBytes();
    store.removeItem('unrelated');
    expect(estimateStorageBytes()).toBe(before);
  });
});

describe('clearAICache', () => {
  it('removes all AI cache keys but leaves other data', () => {
    const store = makeQuotaStore();
    globalThis.localStorage = store;
    store.setItem('katachiya_ai_explanations_cache', '1');
    store.setItem('katachiya_ai_sentence_cache', '3');
    store.setItem('jp-verb-srs-v2', 'keep');
    clearAICache();
    expect(store._map.has('katachiya_ai_explanations_cache')).toBe(false);
    expect(store._map.has('katachiya_ai_sentence_cache')).toBe(false);
    expect(store._map.get('jp-verb-srs-v2')).toBe('keep');
  });
});
