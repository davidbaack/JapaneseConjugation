// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, act } from '@testing-library/react';

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
  const { state, syncStatus } = useApp();
  return (
    <div>
      <output data-testid="cards">{Object.keys(state.cards || {}).join(',')}</output>
      <output data-testid="sync">{syncStatus.message}</output>
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
  cleanup();
});

describe('AppStateProvider cloud session races', () => {
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
});
