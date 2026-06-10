// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// The hook only mutates through two storage helpers and the Supabase client;
// replace those with spies while keeping the real payload normalizer.
const { saveAll, cloudUpsert } = vi.hoisted(() => ({
  saveAll: vi.fn(),
  cloudUpsert: vi.fn(() => Promise.resolve()),
}));

vi.mock('../utils/supabase.js', () => ({ supabase: { _fake: true } }));
vi.mock('../utils/storage.js', async () => {
  const actual = await vi.importActual('../utils/storage.js');
  return { ...actual, saveAll, cloudUpsert };
});

import { useCloudAutoSync, PUSH_DEBOUNCE_MS } from '../hooks/useCloudAutoSync.js';

const SESSION = { user: { id: 'user-123' } };
const OTHER_SESSION = { user: { id: 'user-456' } };

// Stable ref + setter shared across rerenders, like App owns them; only `state`
// (and friends) vary to simulate the user making progress.
let lastSyncedAtRef;
let setSyncStatus;

function deferred() {
  /** @type {(value?: unknown) => void} */
  let resolve;
  /** @type {(reason?: unknown) => void} */
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function props(overrides = {}) {
  return {
    hydrated: true,
    session: SESSION,
    state: { v: 1 },
    customVerbs: [],
    customAdjectives: [],
    wordLists: [],
    geminiKey: '',
    practicePrefs: { theme: 'dark' },
    lastSyncedAtRef,
    setSyncStatus,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  lastSyncedAtRef = { current: 0 };
  setSyncStatus = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCloudAutoSync', () => {
  it('saves to localStorage synchronously on every change', () => {
    renderHook((p) => useCloudAutoSync(p), { initialProps: props() });
    // Local save is immediate, not debounced.
    expect(saveAll).toHaveBeenCalledTimes(1);
    expect(cloudUpsert).not.toHaveBeenCalled();
  });

  it('debounces rapid changes into a single cloud upsert with the latest payload', async () => {
    const { rerender } = renderHook((p) => useCloudAutoSync(p), {
      initialProps: props({ state: { v: 1 } }),
    });

    // Three quick edits, each resetting the timer before it can fire.
    rerender(props({ state: { v: 2 } }));
    rerender(props({ state: { v: 3 } }));
    rerender(props({ state: { v: 4 } }));
    expect(cloudUpsert).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });

    expect(cloudUpsert).toHaveBeenCalledTimes(1);
    expect(cloudUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ state: { v: 4 } }),
      'user-123',
    );
  });

  it('normalizes legacy kana answer preferences before cloud upsert', async () => {
    renderHook((p) => useCloudAutoSync(p), {
      initialProps: props({
        practicePrefs: {
          answerMode: 'guided',
          kanaMatchDisplay: 'none',
        },
      }),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });

    const payload = cloudUpsert.mock.calls[0][0];
    expect(cloudUpsert.mock.calls[0][1]).toBe('user-123');
    expect(payload.practicePrefs.answerMode).toBe('input');
    expect(payload.practicePrefs.kanaAssist).toBe('guided');
    expect(payload.practicePrefs).not.toHaveProperty('kanaMatchDisplay');
  });

  it('does not push before the debounce window elapses', async () => {
    renderHook((p) => useCloudAutoSync(p), { initialProps: props() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS - 1);
    });
    expect(cloudUpsert).not.toHaveBeenCalled();
  });

  it('cancels a pending cloud push when the user signs out before debounce completes', async () => {
    const { rerender } = renderHook((p) => useCloudAutoSync(p), {
      initialProps: props({ state: { v: 1 } }),
    });

    rerender(props({ session: null, state: { v: 2 } }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });

    expect(cloudUpsert).not.toHaveBeenCalled();
  });

  it('cancels the old timer and pushes under the new account after an account switch', async () => {
    const { rerender } = renderHook((p) => useCloudAutoSync(p), {
      initialProps: props({ state: { user: 'old' } }),
    });

    rerender(props({ session: OTHER_SESSION, state: { user: 'new' } }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });

    expect(cloudUpsert).toHaveBeenCalledTimes(1);
    expect(cloudUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ state: { user: 'new' } }),
      'user-456',
    );
  });

  it('ignores an in-flight push result after the user signs out', async () => {
    const pending = deferred();
    cloudUpsert.mockReturnValueOnce(pending.promise);
    const { rerender } = renderHook((p) => useCloudAutoSync(p), { initialProps: props() });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });
    expect(cloudUpsert).toHaveBeenCalledTimes(1);

    rerender(props({ session: null }));

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });

    expect(lastSyncedAtRef.current).toBe(0);
    expect(setSyncStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ok', message: 'Saved to cloud' }),
    );
  });

  it('records the sync time and an ok status after a successful push', async () => {
    renderHook((p) => useCloudAutoSync(p), { initialProps: props() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });

    expect(cloudUpsert).toHaveBeenCalledTimes(1);
    expect(cloudUpsert.mock.calls[0][1]).toBe('user-123');
    expect(lastSyncedAtRef.current).toBeGreaterThan(0);
    // Persisted again with the new sync time after the push.
    expect(saveAll).toHaveBeenCalledTimes(2);
    expect(setSyncStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'ok', message: 'Saved to cloud' }),
    );
  });

  it('surfaces a push failure as an error status without crashing', async () => {
    cloudUpsert.mockRejectedValueOnce(new Error('network down'));
    renderHook((p) => useCloudAutoSync(p), { initialProps: props() });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });

    expect(setSyncStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'error', message: 'network down' }),
    );
    // A failed push must not advance the last-synced marker.
    expect(lastSyncedAtRef.current).toBe(0);
  });

  it('saves locally but never pushes when signed out', async () => {
    renderHook((p) => useCloudAutoSync(p), { initialProps: props({ session: null }) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });
    expect(saveAll).toHaveBeenCalledTimes(1);
    expect(cloudUpsert).not.toHaveBeenCalled();
  });

  it('does nothing at all until local state has hydrated', async () => {
    renderHook((p) => useCloudAutoSync(p), { initialProps: props({ hydrated: false }) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });
    expect(saveAll).not.toHaveBeenCalled();
    expect(cloudUpsert).not.toHaveBeenCalled();
  });
});
