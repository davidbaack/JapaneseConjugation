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
    cloudUpsert: vi.fn(() =>
      Promise.resolve({ updated_at: '2026-08-15T12:00:00.000Z', revision: 1 }),
    ),
    loadAll: vi.fn(() => null),
    saveAll: vi.fn(),
    pruneAICache: vi.fn(),
  }));

vi.mock('../utils/supabase.js', () => ({
  getSupabaseClientState: () => ({
    configured: true,
    status: 'ready',
    error: null,
    client: mockSupabase,
  }),
  subscribeSupabaseClient: () => () => {},
  shouldRestoreSupabaseSession: () => false,
  loadSupabaseClient: () => Promise.resolve(mockSupabase),
}));
vi.mock('../utils/storage.js', async () => {
  const actual = await vi.importActual('../utils/storage.js');
  return { ...actual, cloudFetch, cloudUpsert, loadAll, saveAll, pruneAICache };
});

import { AppStateProvider, useApp } from '../state/AppStateContext.jsx';
import { PUSH_DEBOUNCE_MS } from '../hooks/useCloudAutoSync.js';
import { cardIdFor, defaultState } from '../utils/storage.js';
import { weaknessLaneForCard } from '../utils/subcategoryWeakness.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

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

function settingsCloudRow({
  dailyGoal = 99,
  clockRevision = 50,
  rowRevision = 7,
  updatedAt = '2030-01-01T00:00:00.000Z',
  pendingReset = false,
} = {}) {
  const eventId = `remote-settings-${clockRevision}`;
  const clock = { deviceId: 'device-cloud', revision: clockRevision, eventId };
  return {
    data: {
      state: defaultState(),
      customVerbs: [],
      customAdjectives: [],
      wordLists: [],
      practicePrefs: { ...DEFAULT_PREFS, dailyGoal },
      syncMeta: {
        version: 1,
        deviceId: 'device-cloud',
        revision: clockRevision,
        clocks: { 'prefs.dailyGoal': clock },
        tombstones: {},
        resetEpochs: { settings: clock },
        guideCounters: {},
        guideCounterClocks: {},
        pendingReset: pendingReset
          ? { eventId, domains: ['settings'], clock, ownerUserId: 'user-a' }
          : null,
        legacyAdopted: true,
      },
    },
    updated_at: updatedAt,
    revision: rowRevision,
  };
}

function highClockSettingsCloudRow() {
  return settingsCloudRow();
}

function Probe() {
  const {
    state,
    setState,
    practicePrefs,
    setPracticePrefs,
    syncStatus,
    syncNow,
    resetLearnerData,
  } = useApp();
  return (
    <div>
      <output data-testid="cards">{Object.keys(state.cards || {}).join(',')}</output>
      <output data-testid="daily-goal">{practicePrefs.dailyGoal}</output>
      <output data-testid="sync">{syncStatus.message}</output>
      <button type="button" onClick={() => void resetLearnerData('factory').catch(() => {})}>
        Reset learner
      </button>
      <button type="button" onClick={() => void resetLearnerData('settings').catch(() => {})}>
        Reset settings
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
      <button
        type="button"
        onClick={() => setPracticePrefs((current) => ({ ...current, dailyGoal: 23 }))}
      >
        Set daily goal 23
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
  cloudUpsert.mockResolvedValue({ updated_at: '2026-08-15T12:00:00.000Z', revision: 1 });
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
  it('hydrates an unchanged metadata snapshot without a render loop', async () => {
    const renderProbe = vi.fn();
    loadAll.mockReturnValueOnce({
      state: defaultState(),
      customVerbs: [],
      customAdjectives: [],
      wordLists: [],
      practicePrefs: {},
      syncMeta: {
        version: 1,
        deviceId: 'device-test',
        revision: 0,
        clocks: {},
        tombstones: {},
        resetEpochs: {},
        guideCounters: {},
        legacyAdopted: true,
      },
    });
    function RenderProbe() {
      const { hydrated } = useApp();
      renderProbe();
      return <output>{hydrated ? 'ready' : 'loading'}</output>;
    }

    render(
      <AppStateProvider>
        <RenderProbe />
      </AppStateProvider>,
    );
    await screen.findByText('ready');
    await act(async () => Promise.resolve());

    expect(renderProbe).toHaveBeenCalledTimes(3);
  });

  it('commits a failed local-only change on the next login even when timestamps match', async () => {
    const updatedAt = '2030-01-01T00:00:00.000Z';
    const localState = defaultState();
    localState.cards = { 'pending-local': { reps: 2, nextReview: 1 } };
    loadAll.mockReturnValueOnce({
      state: localState,
      customVerbs: [],
      customAdjectives: [],
      wordLists: [],
      practicePrefs: DEFAULT_PREFS,
      lastSyncedAt: Date.parse(updatedAt),
      syncMeta: {
        version: 1,
        deviceId: 'device-test',
        revision: 2,
        clocks: {},
        tombstones: {},
        resetEpochs: {},
        guideCounters: {},
        legacyAdopted: true,
      },
    });
    cloudFetch.mockResolvedValueOnce({
      data: {
        state: defaultState(),
        customVerbs: [],
        customAdjectives: [],
        wordLists: [],
        practicePrefs: DEFAULT_PREFS,
        syncMeta: {
          version: 1,
          deviceId: 'device-test',
          revision: 1,
          clocks: {},
          tombstones: {},
          resetEpochs: {},
          guideCounters: {},
          legacyAdopted: true,
        },
      },
      updated_at: updatedAt,
      revision: 7,
    });
    renderProvider();

    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });

    await waitFor(() =>
      expect(cloudUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          state: expect.objectContaining({
            cards: expect.objectContaining({ 'pending-local': expect.any(Object) }),
          }),
        }),
        'user-a',
        7,
      ),
    );
  });

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
    expect(cloudUpsert).toHaveBeenCalledWith(repairedPayload, 'user-a', null);
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

    expect(cloudUpsert).toHaveBeenCalledWith(expect.any(Object), 'user-a', null);
  });

  it('preserves learner changes made while the initial cloud restore is pending', async () => {
    const pending = deferred();
    cloudFetch.mockReturnValueOnce(pending.promise);
    renderProvider();

    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() => expect(cloudFetch).toHaveBeenCalledWith('user-a'));

    fireEvent.click(screen.getByRole('button', { name: 'Change learner data' }));
    expect(screen.getByTestId('cards').textContent).toContain('local-change');

    await act(async () => {
      pending.resolve(cloudRow('cloud-card'));
      await pending.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId('cards').textContent).toContain('local-change');
      expect(screen.getByTestId('cards').textContent).toContain('cloud-card');
    });
    expect(cloudUpsert).toHaveBeenCalledTimes(1);
    expect(cloudUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          cards: expect.objectContaining({
            'local-change': expect.any(Object),
            'cloud-card': expect.any(Object),
          }),
        }),
      }),
      'user-a',
      null,
    );
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
    expect(screen.getByTestId('sync').textContent).toBe('Saved locally; cloud sync needs retry');

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
    expect(cloudUpsert).toHaveBeenCalledWith(expect.any(Object), 'user-a', null);
    cloudUpsert.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Change learner data' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    });
    expect(cloudUpsert).toHaveBeenCalledWith(expect.any(Object), 'user-a', null);
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

  it('does not merge a completed account restore into the next signed-in account', async () => {
    cloudFetch
      .mockResolvedValueOnce(cloudRow('account-a-card'))
      .mockResolvedValueOnce(cloudRow('account-b-card'));
    renderProvider();

    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() => expect(screen.getByTestId('cards').textContent).toBe('account-a-card'));

    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_B);
    });

    await waitFor(() => expect(screen.getByTestId('cards').textContent).toBe('account-b-card'));
    expect(screen.getByTestId('cards').textContent).not.toContain('account-a-card');
    const writesToB = cloudUpsert.mock.calls.filter((call) => call[1] === 'user-b');
    expect(writesToB.every(([payload]) => !payload.state?.cards?.['account-a-card'])).toBe(true);
  });

  it('blocks reset while the next account cloud restore is in flight', async () => {
    const pendingB = deferred();
    cloudFetch
      .mockResolvedValueOnce(cloudRow('account-a-card'))
      .mockReturnValueOnce(pendingB.promise);
    renderProvider();

    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() => expect(screen.getByTestId('cards').textContent).toBe('account-a-card'));
    cloudUpsert.mockClear();

    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_B);
    });
    await waitFor(() => expect(cloudFetch).toHaveBeenCalledWith('user-b'));

    fireEvent.click(screen.getByRole('button', { name: 'Reset settings' }));
    await act(async () => Promise.resolve());

    expect(cloudUpsert).not.toHaveBeenCalled();
    expect(screen.getByTestId('cards').textContent).toBe('account-a-card');

    await act(async () => {
      pendingB.resolve(cloudRow('account-b-card'));
      await pendingB.promise;
    });
    await waitFor(() => expect(screen.getByTestId('cards').textContent).toBe('account-b-card'));
  });

  it('persists a signed-out reset through a failed login CAS and clears it after retry acknowledgement', async () => {
    loadAll.mockReturnValueOnce({
      state: defaultState(),
      customVerbs: [],
      customAdjectives: [],
      wordLists: [],
      practicePrefs: { ...DEFAULT_PREFS, dailyGoal: 12 },
      lastSyncedAt: 0,
      syncConfig: { enabled: false, userId: 'user-a' },
    });
    renderProvider();

    await waitFor(() =>
      expect(saveAll.mock.calls.at(-1)?.[4]).toEqual({ enabled: false, userId: 'user-a' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset settings' }));
    await waitFor(() =>
      expect(screen.getByTestId('daily-goal').textContent).toBe(String(DEFAULT_PREFS.dailyGoal)),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set daily goal 23' }));

    let pendingEventId = '';
    await waitFor(() => {
      const saved = saveAll.mock.calls.at(-1);
      expect(saved?.[6]?.dailyGoal).toBe(23);
      expect(saved?.[7]?.pendingReset).toMatchObject({
        domains: ['settings'],
        ownerUserId: 'user-a',
      });
      pendingEventId = saved[7].pendingReset.eventId;
    });

    const remote = highClockSettingsCloudRow();
    cloudFetch.mockResolvedValueOnce(remote);
    cloudUpsert.mockRejectedValueOnce(new Error('network down'));
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });

    await waitFor(() =>
      expect(screen.getByTestId('sync').textContent).toBe('Saved locally; cloud sync needs retry'),
    );
    expect(screen.getByTestId('daily-goal').textContent).toBe('23');
    expect(cloudUpsert).toHaveBeenCalledTimes(1);
    expect(cloudUpsert.mock.calls[0][0]).toMatchObject({
      practicePrefs: { dailyGoal: 23 },
      syncMeta: {
        pendingReset: null,
        resetEpochs: { settings: expect.objectContaining({ revision: expect.any(Number) }) },
      },
    });
    expect(cloudUpsert.mock.calls[0][0].syncMeta.resetEpochs.settings.revision).toBeGreaterThan(50);
    await waitFor(() => {
      const saved = saveAll.mock.calls.at(-1);
      expect(saved?.[6]?.dailyGoal).toBe(23);
      expect(saved?.[7]?.pendingReset?.eventId).toBe(pendingEventId);
    });

    cloudFetch.mockResolvedValueOnce(remote);
    cloudUpsert.mockResolvedValueOnce({
      updated_at: '2030-01-01T00:00:01.000Z',
      revision: 8,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('Merged from cloud'));
    expect(screen.getByTestId('daily-goal').textContent).toBe('23');
    expect(cloudUpsert).toHaveBeenCalledTimes(2);
    expect(cloudUpsert.mock.calls[1][0].syncMeta.pendingReset).toBeNull();
    expect(cloudUpsert.mock.calls[1][0].syncMeta.resetEpochs.settings.revision).toBeGreaterThan(50);
    await waitFor(() => expect(saveAll.mock.calls.at(-1)?.[7]?.pendingReset).toBeNull());
  });

  it('discards a cloud-only pending marker and accepts the next remote settings epoch', async () => {
    const staleMarkerRow = settingsCloudRow({
      dailyGoal: 99,
      clockRevision: 10,
      rowRevision: 3,
      pendingReset: true,
    });
    const newerRow = settingsCloudRow({
      dailyGoal: 55,
      clockRevision: 50,
      rowRevision: 4,
      updatedAt: '2030-01-02T00:00:00.000Z',
    });
    cloudFetch.mockResolvedValueOnce(staleMarkerRow).mockResolvedValueOnce(newerRow);
    renderProvider();

    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('Restored from cloud'));
    expect(screen.getByTestId('daily-goal').textContent).toBe('99');
    expect(cloudUpsert).not.toHaveBeenCalled();
    await waitFor(() => expect(saveAll.mock.calls.at(-1)?.[7]?.pendingReset).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('Merged from cloud'));
    expect(screen.getByTestId('daily-goal').textContent).toBe('55');
    expect(cloudUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        practicePrefs: expect.objectContaining({ dailyGoal: 55 }),
        syncMeta: expect.objectContaining({
          pendingReset: null,
          resetEpochs: expect.objectContaining({
            settings: expect.objectContaining({ revision: 50 }),
          }),
        }),
      }),
      'user-a',
      4,
    );
  });

  it('binds an unowned reset to its first login attempt and does not carry it to the next account', async () => {
    loadAll.mockReturnValueOnce({
      state: defaultState(),
      customVerbs: [],
      customAdjectives: [],
      wordLists: [],
      practicePrefs: { ...DEFAULT_PREFS, dailyGoal: 12 },
      lastSyncedAt: 0,
    });
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'Reset settings' }));
    await waitFor(() =>
      expect(saveAll.mock.calls.at(-1)?.[7]?.pendingReset).toMatchObject({
        domains: ['settings'],
        ownerUserId: '',
      }),
    );

    cloudFetch.mockResolvedValueOnce(null);
    cloudUpsert.mockRejectedValueOnce(new Error('network down'));
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });

    await waitFor(() =>
      expect(screen.getByTestId('sync').textContent).toBe('Saved locally; cloud sync needs retry'),
    );
    await waitFor(() => {
      const saved = saveAll.mock.calls.at(-1);
      expect(saved?.[4]?.userId).toBe('user-a');
      expect(saved?.[7]?.pendingReset?.ownerUserId).toBe('user-a');
    });

    await act(async () => {
      authCallbacks[0]('SIGNED_OUT', null);
    });
    cloudFetch.mockResolvedValueOnce(highClockSettingsCloudRow());
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_B);
    });

    await waitFor(() => expect(screen.getByTestId('daily-goal').textContent).toBe('99'));
    expect(cloudUpsert.mock.calls.filter((call) => call[1] === 'user-b')).toEqual([]);
    await waitFor(() => {
      const saved = saveAll.mock.calls.at(-1);
      expect(saved?.[4]?.userId).toBe('user-b');
      expect(saved?.[7]?.pendingReset).toBeNull();
    });
  });

  it('reports that a signed-in reset was not saved when its cloud write fails', async () => {
    const initialState = {
      ...defaultState(),
      cards: { 'local-card': { reps: 3, correct: 2, incorrect: 1 } },
    };
    loadAll.mockReturnValueOnce({
      state: initialState,
      customVerbs: [],
      customAdjectives: [],
      wordLists: [],
      practicePrefs: DEFAULT_PREFS,
      lastSyncedAt: 0,
    });
    cloudFetch.mockResolvedValue(null);
    renderProvider();

    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('Synced to cloud'));

    cloudUpsert.mockRejectedValueOnce(new Error('network down'));
    fireEvent.click(screen.getByRole('button', { name: 'Reset learner' }));

    await waitFor(() =>
      expect(screen.getByTestId('sync').textContent).toBe(
        'Reset not saved; cloud sync needs retry',
      ),
    );
    expect(screen.getByTestId('cards').textContent).toBe('local-card');
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
    cloudUpsert.mockResolvedValue({ updated_at: '2026-08-15T12:00:00.000Z', revision: 1 });
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('cards').textContent).toBe('local-card'));
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() => expect(cloudFetch).toHaveBeenCalledWith('user-a'));
    await waitFor(() =>
      expect(cloudUpsert).toHaveBeenCalledWith(expect.any(Object), 'user-a', null),
    );

    const pendingReset = deferred();
    cloudUpsert.mockClear();
    saveAll.mockClear();
    cloudUpsert.mockReturnValueOnce(pendingReset.promise);

    fireEvent.click(screen.getByRole('button', { name: 'Reset learner' }));
    await waitFor(() =>
      expect(cloudUpsert).toHaveBeenCalledWith(expect.any(Object), 'user-a', null),
    );

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
