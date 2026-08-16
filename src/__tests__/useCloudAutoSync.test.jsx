// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';

// The hook only mutates through two storage helpers and the Supabase client;
// replace those with spies while keeping the real payload normalizer.
const { saveAll, cloudFetch, cloudUpsert } = vi.hoisted(() => ({
  saveAll: vi.fn(),
  cloudFetch: vi.fn(() => Promise.resolve(null)),
  cloudUpsert: vi.fn(() =>
    Promise.resolve({ updated_at: '2026-08-15T12:00:00.000Z', revision: 1 }),
  ),
}));

vi.mock('../utils/supabase.js', () => ({ supabase: { _fake: true } }));
vi.mock('../utils/storage.js', async () => {
  const actual = await vi.importActual('../utils/storage.js');
  return { ...actual, saveAll, cloudFetch, cloudUpsert };
});

import {
  commitCloudWithRetry,
  useCloudAutoSync,
  PUSH_DEBOUNCE_MS,
} from '../hooks/useCloudAutoSync.js';
import { buildSyncPayload, defaultState } from '../utils/storage.js';
import { adoptSyncMetadata } from '../utils/syncMetadata.js';

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
    cloudPushEnabled: true,
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
  cloudFetch.mockResolvedValue(null);
  cloudUpsert.mockResolvedValue({ updated_at: '2026-08-15T12:00:00.000Z', revision: 1 });
  vi.useFakeTimers();
  lastSyncedAtRef = { current: 0 };
  setSyncStatus = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCloudAutoSync', () => {
  it('refetches and retries after a compare-and-set race', async () => {
    const conflict = Object.assign(new Error('revision conflict'), {
      code: 'SYNC_REVISION_CONFLICT',
    });
    const fetchCloud = vi
      .fn()
      .mockResolvedValueOnce({ data: null, revision: 3 })
      .mockResolvedValueOnce({ data: null, revision: 4 });
    const writeCloud = vi
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ updated_at: '2026-08-15T12:00:00.000Z', revision: 5 });

    const committed = await commitCloudWithRetry({ state: { v: 1 } }, 'user-123', {
      fetchCloud,
      writeCloud,
    });

    expect(fetchCloud).toHaveBeenCalledTimes(2);
    expect(writeCloud.mock.calls.map((call) => call[2])).toEqual([3, 4]);
    expect(committed.row.revision).toBe(5);
  });

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
      null,
    );
  });

  it('does not re-save forever after applying a merge from an existing cloud row', async () => {
    const cloudState = defaultState();
    cloudState.cards = { 'remote-card': { reps: 1, nextReview: 1 } };
    const cloudPayload = adoptSyncMetadata(
      buildSyncPayload({ state: cloudState, practicePrefs: { theme: 'dark' } }),
      'device-cloud',
    );
    cloudFetch.mockResolvedValue({
      data: cloudPayload,
      updated_at: '2026-08-15T11:00:00.000Z',
      revision: 3,
    });
    cloudUpsert.mockResolvedValue({
      updated_at: '2026-08-15T12:00:00.000Z',
      revision: 4,
    });
    const initial = adoptSyncMetadata(
      buildSyncPayload({ state: defaultState(), practicePrefs: { theme: 'dark' } }),
      'device-local',
    );

    const { result } = renderHook(() => {
      const [snapshot, setSnapshot] = useState({
        state: initial.state,
        syncMeta: initial.syncMeta,
        practicePrefs: initial.practicePrefs,
      });
      useCloudAutoSync(
        props({
          state: snapshot.state,
          syncMeta: snapshot.syncMeta,
          practicePrefs: snapshot.practicePrefs,
          applySyncPayload: (payload) => {
            setSnapshot({
              state: payload.state,
              syncMeta: payload.syncMeta,
              practicePrefs: payload.practicePrefs,
            });
            return { payload };
          },
        }),
      );
      return { snapshot, setSnapshot };
    });

    act(() => {
      result.current.setSnapshot((current) => ({
        ...current,
        state: {
          ...current.state,
          cards: { ...current.state.cards, 'local-card': { reps: 1, nextReview: 1 } },
        },
      }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });

    expect(result.current.snapshot.state.cards).toEqual(
      expect.objectContaining({
        'local-card': expect.any(Object),
        'remote-card': expect.any(Object),
      }),
    );
    expect(cloudUpsert).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 3);
    });
    expect(cloudUpsert).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setSnapshot((current) => ({
        ...current,
        state: {
          ...current.state,
          cards: { ...current.state.cards, 'next-local-card': { reps: 1, nextReview: 2 } },
        },
      }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });
    expect(cloudUpsert).toHaveBeenCalledTimes(2);
  });

  it('normalizes legacy kana answer preferences before cloud upsert', async () => {
    const { rerender } = renderHook((p) => useCloudAutoSync(p), {
      initialProps: props(),
    });
    rerender(
      props({
        state: { v: 2 },
        practicePrefs: {
          answerMode: 'guided',
          kanaMatchDisplay: 'none',
        },
      }),
    );

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
    const { rerender } = renderHook((p) => useCloudAutoSync(p), { initialProps: props() });
    rerender(props({ state: { v: 2 } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS - 1);
    });
    expect(cloudUpsert).not.toHaveBeenCalled();
  });

  it('cancels a pending cloud push when the user signs out before debounce completes', async () => {
    const { rerender } = renderHook((p) => useCloudAutoSync(p), {
      initialProps: props({ state: { v: 1 } }),
    });

    rerender(props({ state: { v: 2 } }));
    rerender(props({ session: null, cloudPushEnabled: false, state: { v: 2 } }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });

    expect(cloudUpsert).not.toHaveBeenCalled();
  });

  it('establishes a fresh baseline before pushing under a switched account', async () => {
    const { rerender } = renderHook((p) => useCloudAutoSync(p), {
      initialProps: props({ state: { user: 'old' } }),
    });

    rerender(props({ session: OTHER_SESSION, state: { user: 'new-baseline' } }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });
    expect(cloudUpsert).not.toHaveBeenCalled();

    rerender(props({ session: OTHER_SESSION, state: { user: 'new-change' } }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });

    expect(cloudUpsert).toHaveBeenCalledTimes(1);
    expect(cloudUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ state: { user: 'new-change' } }),
      'user-456',
      null,
    );
  });

  it('ignores an in-flight push result after the user signs out', async () => {
    const pending = deferred();
    cloudUpsert.mockReturnValueOnce(pending.promise);
    const { rerender } = renderHook((p) => useCloudAutoSync(p), { initialProps: props() });
    rerender(props({ state: { v: 2 } }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });
    expect(cloudUpsert).toHaveBeenCalledTimes(1);

    rerender(props({ session: null, cloudPushEnabled: false }));

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
    const { rerender } = renderHook((p) => useCloudAutoSync(p), { initialProps: props() });
    rerender(props({ state: { v: 2 } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });

    expect(cloudUpsert).toHaveBeenCalledTimes(1);
    expect(cloudUpsert.mock.calls[0][1]).toBe('user-123');
    expect(lastSyncedAtRef.current).toBeGreaterThan(0);
    // Persisted again with the new sync time after the push.
    expect(saveAll).toHaveBeenCalledTimes(3);
    expect(setSyncStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'ok', message: 'Saved to cloud' }),
    );
  });

  it('surfaces a push failure as an error status without crashing', async () => {
    cloudUpsert.mockRejectedValueOnce(new Error('network down'));
    const { rerender } = renderHook((p) => useCloudAutoSync(p), { initialProps: props() });
    rerender(props({ state: { v: 2 } }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });

    expect(setSyncStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: 'Saved locally; cloud sync needs retry',
        detail: 'network down',
      }),
    );
    // A failed push must not advance the last-synced marker.
    expect(lastSyncedAtRef.current).toBe(0);
  });

  it('saves locally but never pushes when signed out', async () => {
    renderHook((p) => useCloudAutoSync(p), {
      initialProps: props({ session: null, cloudPushEnabled: false }),
    });
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

  it('keeps local saves active while cloud hydration has the push gate closed', async () => {
    const { rerender } = renderHook((p) => useCloudAutoSync(p), {
      initialProps: props({ cloudPushEnabled: false }),
    });
    rerender(props({ cloudPushEnabled: false, state: { v: 2 } }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });

    expect(saveAll).toHaveBeenCalledTimes(2);
    expect(cloudUpsert).not.toHaveBeenCalled();
  });

  it('uses the first payload after hydration as a baseline instead of pushing it', async () => {
    const { rerender } = renderHook((p) => useCloudAutoSync(p), {
      initialProps: props({ cloudPushEnabled: false }),
    });
    rerender(props({ cloudPushEnabled: true, state: { v: 2 } }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });
    expect(cloudUpsert).not.toHaveBeenCalled();

    rerender(props({ cloudPushEnabled: true, state: { v: 3 } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });

    expect(cloudUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ state: { v: 3 } }),
      'user-123',
      null,
    );
  });
});
