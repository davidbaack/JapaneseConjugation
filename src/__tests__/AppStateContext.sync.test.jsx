// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';

const { mockSupabase, authCallbacks, cloudFetch, cloudUpsert, loadAll, saveAll, pruneAICache } =
  vi.hoisted(() => ({
    mockSupabase: {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(),
      },
    },
    authCallbacks: [],
    cloudFetch: vi.fn(),
    cloudUpsert: vi.fn(() => Promise.resolve()),
    loadAll: vi.fn(() => null),
    saveAll: vi.fn(),
    pruneAICache: vi.fn(),
  }));

vi.mock('../utils/supabase.js', () => ({ supabase: mockSupabase }));
vi.mock('../utils/storage.js', async () => {
  const actual = await vi.importActual('../utils/storage.js');
  return { ...actual, cloudFetch, cloudUpsert, loadAll, saveAll, pruneAICache };
});

import { AppStateProvider, useApp } from '../state/AppStateContext.jsx';
import { PUSH_DEBOUNCE_MS } from '../hooks/useCloudAutoSync.js';
import { cardIdFor, defaultState } from '../utils/storage.js';
import { weaknessLaneForCard } from '../utils/subcategoryWeakness.js';

const SESSION_A = { user: { id: 'user-a', email: 'a@example.com' } };
const SESSION_B = { user: { id: 'user-b', email: 'b@example.com' } };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function cloudRow(cardKey) {
  return {
    data: { state: { schemaVersion: 3, cards: { [cardKey]: { reps: 1 } } } },
    updated_at: '2030-01-01T00:00:00.000Z',
  };
}

function Probe() {
  const { state, setState, syncStatus, syncNow, resetLearnerData } = useApp();
  return (
    <div>
      <output data-testid="cards">{Object.keys(state.cards || {}).join(',')}</output>
      <output data-testid="sync">{syncStatus.message}</output>
      <button type="button" onClick={() => void resetLearnerData('factory')}>
        Reset learner
      </button>
      <button
        type="button"
        onClick={() =>
          setState((current) => ({
            ...current,
            cards: { ...current.cards, 'local-change': { reps: 1 } },
          }))
        }
      >
        Change learner data
      </button>
      <button type="button" onClick={() => void syncNow()}>
        Sync now
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AppStateProvider>
      <Probe />
    </AppStateProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authCallbacks.length = 0;
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
    authCallbacks.push(callback);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('AppStateProvider cloud session races', () => {
  it('writes a repaired diagnostic snapshot back after a cloud pull', async () => {
    const word = {
      dict: '書く',
      reading: 'かく',
      meaning: 'to write',
      group: 'godan',
    };
    const ruleId = cardIdFor(word, 'plain-past');
    const lane = weaknessLaneForCard(word, 'plain-past');
    cloudFetch.mockResolvedValueOnce({
      data: {
        state: {
          ...defaultState(),
          cards: {
            [ruleId]: { reps: 1, correct: 2, incorrect: 1, lastSeen: 2000 },
          },
          weakness: {
            byLane: {
              [lane.key]: {
                ...lane,
                attempted: Number('99999999999999990000'),
                correct: Number('33333333333333330000'),
                incorrect: Number('66666666666666660000'),
                totalResponseMs: Number('99999999999999990000'),
                lastAt: 2000,
                recent: [],
              },
            },
          },
        },
        customVerbs: [],
        customAdjectives: [],
        wordLists: [],
        practicePrefs: null,
      },
      updated_at: '2030-01-01T00:00:00.000Z',
    });
    renderProvider();

    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });

    await waitFor(() => expect(cloudUpsert).toHaveBeenCalledTimes(1));
    const repairedPayload = cloudUpsert.mock.calls[0][0];
    expect(repairedPayload.state.weakness.byLane[lane.key]).toMatchObject({
      attempted: 3,
      correct: 2,
      incorrect: 1,
    });
    expect(cloudUpsert).toHaveBeenCalledWith(repairedPayload, 'user-a');
    await waitFor(() =>
      expect(screen.getByTestId('sync').textContent).toBe('Repaired cloud progress'),
    );
  });

  it('does not auto-push while the initial cloud restore is pending', async () => {
    vi.useFakeTimers();
    const pending = deferred();
    cloudFetch.mockReturnValueOnce(pending.promise);
    renderProvider();

    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
      await Promise.resolve();
    });
    expect(cloudFetch).toHaveBeenCalledWith('user-a');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });
    expect(cloudUpsert).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(cloudRow('cloud-card'));
      await pending.promise;
      await Promise.resolve();
    });
    cloudUpsert.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Change learner data' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });

    expect(cloudUpsert).toHaveBeenCalledWith(expect.any(Object), 'user-a');
  });

  it('keeps autosync closed after restore failure until manual retry succeeds', async () => {
    vi.useFakeTimers();
    cloudFetch.mockRejectedValueOnce(new Error('cloud unavailable'));
    renderProvider();

    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('sync').textContent).toBe('cloud unavailable');

    fireEvent.click(screen.getByRole('button', { name: 'Change learner data' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });
    expect(cloudUpsert).not.toHaveBeenCalled();

    cloudFetch.mockResolvedValueOnce(null);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(cloudUpsert).toHaveBeenCalledWith(expect.any(Object), 'user-a');
    cloudUpsert.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Change learner data' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });
    expect(cloudUpsert).toHaveBeenCalledWith(expect.any(Object), 'user-a');
  });

  it('ignores a pending login restore when the user signs out before it resolves', async () => {
    const pendingA = deferred();
    cloudFetch.mockReturnValueOnce(pendingA.promise);
    renderProvider();

    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() => expect(cloudFetch).toHaveBeenCalledWith('user-a'));

    await act(async () => {
      authCallbacks[0]('SIGNED_OUT', null);
    });
    await act(async () => {
      pendingA.resolve(cloudRow('stale-a-card'));
      await pendingA.promise;
    });

    expect(screen.getByTestId('cards').textContent).toBe('');
    expect(screen.getByTestId('sync').textContent).toBe('');
    expect(cloudUpsert).not.toHaveBeenCalled();
  });

  it('ignores an older account restore and applies only the active account result', async () => {
    const pendingA = deferred();
    const pendingB = deferred();
    cloudFetch.mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise);
    renderProvider();

    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() => expect(cloudFetch).toHaveBeenCalledWith('user-a'));

    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_B);
    });
    await waitFor(() => expect(cloudFetch).toHaveBeenCalledWith('user-b'));

    await act(async () => {
      pendingA.resolve(cloudRow('stale-a-card'));
      await pendingA.promise;
    });
    expect(screen.getByTestId('cards').textContent).toBe('');

    await act(async () => {
      pendingB.resolve(cloudRow('active-b-card'));
      await pendingB.promise;
    });

    await waitFor(() => expect(screen.getByTestId('cards').textContent).toBe('active-b-card'));
  });

  it('ignores a learner reset that resolves after sign-out', async () => {
    const initialState = {
      ...defaultState(),
      cards: { 'local-card': { reps: 3, correct: 2, incorrect: 1 } },
    };
    loadAll.mockReturnValueOnce({
      state: initialState,
      customVerbs: [],
      customAdjectives: [],
      wordLists: [],
      practicePrefs: null,
      lastSyncedAt: 0,
    });
    cloudFetch.mockResolvedValue(null);
    cloudUpsert.mockResolvedValue(undefined);
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('cards').textContent).toBe('local-card'));
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() => expect(cloudFetch).toHaveBeenCalledWith('user-a'));
    await waitFor(() => expect(cloudUpsert).toHaveBeenCalledWith(expect.any(Object), 'user-a'));

    const pendingReset = deferred();
    cloudUpsert.mockClear();
    saveAll.mockClear();
    cloudUpsert.mockReturnValueOnce(pendingReset.promise);

    fireEvent.click(screen.getByRole('button', { name: 'Reset learner' }));
    await waitFor(() => expect(cloudUpsert).toHaveBeenCalledWith(expect.any(Object), 'user-a'));

    await act(async () => {
      authCallbacks[0]('SIGNED_OUT', null);
    });
    await act(async () => {
      pendingReset.resolve();
      await pendingReset.promise;
    });

    expect(screen.getByTestId('cards').textContent).toBe('local-card');
    expect(screen.getByTestId('sync').textContent).toBe('');
    expect(
      saveAll.mock.calls.some(([savedState]) => Object.keys(savedState.cards || {}).length === 0),
    ).toBe(false);
  });
});
