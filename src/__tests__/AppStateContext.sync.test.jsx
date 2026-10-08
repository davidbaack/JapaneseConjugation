// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';

const {
  mockSupabase,
  authCallbacks,
  cloudFetch,
  cloudUpsert,
  loadAll,
  saveAll,
  pruneAICache,
  getRecoveryBackup,
} = vi.hoisted(() => ({
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
  getRecoveryBackup: vi.fn(() => null),
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
  return { ...actual, cloudFetch, cloudUpsert, loadAll, saveAll, pruneAICache, getRecoveryBackup };
});

import { AppStateProvider, useApp } from '../state/AppStateContext.jsx';
import { PUSH_DEBOUNCE_MS } from '../hooks/useCloudAutoSync.js';
import {
  cardIdFor,
  defaultState,
  buildSyncPayload,
  acceptCurrentStorageSnapshot,
} from '../utils/storage.js';
import { weaknessLaneForCard } from '../utils/subcategoryWeakness.js';
import { DEFAULT_PREFS, STORAGE_KEY } from '../data/defaults.js';
import { buildRestoreSyncPayload } from '../utils/syncMetadata.js';
import { serializeBackup } from '../utils/backup.js';
import { makeLearnerSnapshot, makeLegacyV42Backup } from './fixtures/learnerSnapshot.js';
import { persistBackupRestore } from '../utils/restorePersistence.js';

vi.mock('../utils/restorePersistence.js', () => ({
  persistBackupRestore: vi.fn((payload, beforeBackup) => ({
    payload,
    recoveryBackup: beforeBackup,
  })),
}));

let restoreInput;

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
    data: { state: { ...defaultState(), cards: { [cardKey]: { reps: 1 } } } },
    updated_at: '2030-01-01T00:00:00.000Z',
  };
}

function settingsCloudRow({
  autoSpeak = true,
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
      practicePrefs: { ...DEFAULT_PREFS, autoSpeak },
      syncMeta: {
        version: 1,
        deviceId: 'device-cloud',
        revision: clockRevision,
        clocks: { 'prefs.autoSpeak': clock },
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
    restoreBackup,
    restoreStatus,
    recoveryBackup,
    dataRecoveryError,
  } = useApp();
  return (
    <div>
      <output data-testid="cards">{Object.keys(state.cards || {}).join(',')}</output>
      <output data-testid="auto-speak">{String(practicePrefs.autoSpeak)}</output>
      <output data-testid="sync">{syncStatus.message}</output>
      <output data-testid="snapshot">{JSON.stringify(state)}</output>
      <output data-testid="restore-status">{restoreStatus.kind}</output>
      <output data-testid="recovery">{recoveryBackup || ''}</output>
      <output data-testid="recovery-error">{dataRecoveryError}</output>
      <button type="button" onClick={() => void restoreBackup(restoreInput).catch(() => {})}>
        Restore backup
      </button>
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
        onClick={() => setPracticePrefs((current) => ({ ...current, autoSpeak: true }))}
      >
        Enable auto speak
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
  localStorage.clear();
  acceptCurrentStorageSnapshot();
  cloudFetch.mockResolvedValue(null);
  restoreInput = serializeBackup(makeLearnerSnapshot());
  persistBackupRestore.mockImplementation((payload, beforeBackup) => ({
    payload,
    recoveryBackup: beforeBackup,
  }));
  getRecoveryBackup.mockReturnValue(null);
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
  it('restores the full snapshot before applying it and retains an independent recovery copy', async () => {
    renderProvider();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restore backup' }));
    });
    await waitFor(() => expect(screen.getByTestId('restore-status').textContent).toBe('ok'));
    expect(JSON.parse(screen.getByTestId('snapshot').textContent)).toEqual(
      makeLearnerSnapshot().state,
    );
    const [persisted, previous] = persistBackupRestore.mock.calls[0];
    expect(persisted.state.session.reviewed).toBe(8);
    expect(persisted.syncMeta.pendingReset.domains).toContain('factory');
    expect(screen.getByTestId('recovery').textContent).toBe(previous);
    expect(JSON.parse(previous).state.guide.attempted).toBe(0);
  });

  it('commits only one replacement when two confirmations race while restore helpers load', async () => {
    renderProvider();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restore backup' }));
      fireEvent.click(screen.getByRole('button', { name: 'Restore backup' }));
    });
    await waitFor(() => expect(screen.getByTestId('restore-status').textContent).toBe('ok'));
    expect(persistBackupRestore).toHaveBeenCalledTimes(1);
  });

  it('recovers the app-produced schema-less v42 backup without zeroing Guide or cards', async () => {
    restoreInput = JSON.stringify(makeLegacyV42Backup());
    renderProvider();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restore backup' }));
    });
    await waitFor(() => expect(screen.getByTestId('restore-status').textContent).toBe('ok'));
    const restored = JSON.parse(screen.getByTestId('snapshot').textContent);
    expect(restored.guide.attempted).toBe(7);
    expect(Object.keys(restored.cards)).toHaveLength(2);
    expect(restored.practiceStats.lifetime.attempted).toBe(8);
  });

  it('leaves live data unchanged when the strict local replacement cannot be saved', async () => {
    loadAll.mockReturnValueOnce(makeLearnerSnapshot());
    persistBackupRestore.mockImplementationOnce(() => {
      throw new Error('Storage denied');
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('cards').textContent).toContain('食べる'));
    const previous = screen.getByTestId('snapshot').textContent;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restore backup' }));
    });
    await waitFor(() => expect(screen.getByTestId('restore-status').textContent).toBe('error'));
    expect(screen.getByTestId('snapshot').textContent).toBe(previous);
    expect(cloudUpsert).not.toHaveBeenCalled();
  });

  it('keeps an unsupported saved schema untouched and pauses automatic persistence', async () => {
    loadAll.mockReturnValueOnce({
      ...makeLearnerSnapshot(),
      state: { ...defaultState(), schemaVersion: 99 },
    });
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('recovery-error').textContent).toMatch(/kept unchanged/),
    );
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    expect(saveAll).not.toHaveBeenCalled();
    expect(cloudFetch).not.toHaveBeenCalled();
  });

  it('keeps a durable local restore when cloud fails, then retries without resurrecting old progress', async () => {
    cloudFetch.mockResolvedValue(null);
    renderProvider();
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('Synced to cloud'));
    cloudUpsert.mockClear();
    const stale = makeLearnerSnapshot();
    stale.state.cards = { 'older-cloud-card': { reps: 9 } };
    stale.state.guide = { ...stale.state.guide, attempted: 20 };
    cloudFetch.mockResolvedValue({ data: stale, revision: 1 });
    cloudUpsert.mockRejectedValueOnce(new Error('network down'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restore backup' }));
    });
    await waitFor(() => expect(screen.getByTestId('restore-status').textContent).toBe('pending'));
    expect(JSON.parse(screen.getByTestId('snapshot').textContent).guide.attempted).toBe(7);
    expect(persistBackupRestore.mock.calls[0][0].syncMeta.pendingReset.ownerUserId).toBe('user-a');
    expect(screen.getByTestId('cards').textContent).not.toContain('older-cloud-card');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    });
    await waitFor(() => expect(screen.getByTestId('restore-status').textContent).toBe('ok'));
    expect(JSON.parse(screen.getByTestId('snapshot').textContent).guide.attempted).toBe(7);
    expect(screen.getByTestId('cards').textContent).not.toContain('older-cloud-card');
    expect(saveAll.mock.calls.at(-1)[7].pendingReset).toBeNull();
  });

  it('preserves answers made while the restored snapshot is being acknowledged by cloud', async () => {
    cloudFetch.mockResolvedValue(null);
    renderProvider();
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('Synced to cloud'));
    const pending = deferred();
    cloudUpsert.mockClear();
    cloudUpsert.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Restore backup' }));
    await waitFor(() => expect(cloudUpsert).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Change learner data' }));
    await act(async () => {
      pending.resolve({ updated_at: '2026-10-07T12:00:00.000Z', revision: 2 });
      await pending.promise;
    });
    await waitFor(() => expect(screen.getByTestId('restore-status').textContent).toBe('ok'));
    expect(screen.getByTestId('cards').textContent).toContain('local-change');
    expect(cloudUpsert).toHaveBeenCalledTimes(2);
    expect(cloudUpsert.mock.calls[1][0].state.cards['local-change']).toEqual({ reps: 1 });
  });

  it('saves new answers locally while cloud restoration remains in flight', async () => {
    cloudFetch.mockResolvedValue(null);
    renderProvider();
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('Synced to cloud'));
    const pending = deferred();
    cloudUpsert.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Restore backup' }));
    await waitFor(() => expect(screen.getByTestId('restore-status').textContent).toBe('pending'));
    saveAll.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Change learner data' }));
    await waitFor(() =>
      expect(saveAll.mock.calls.at(-1)[0].cards['local-change']).toEqual({ reps: 1 }),
    );
    await act(async () => {
      pending.resolve({ updated_at: '2026-10-07T12:00:00.000Z', revision: 2 });
      await pending.promise;
    });
  });

  it('keeps answers made during manual retry of a pending replacement', async () => {
    cloudFetch.mockResolvedValue(null);
    renderProvider();
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('Synced to cloud'));
    cloudUpsert.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restore backup' }));
    });
    await waitFor(() => expect(screen.getByTestId('restore-status').textContent).toBe('pending'));
    const pending = deferred();
    cloudUpsert.mockClear();
    cloudUpsert.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(cloudUpsert).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Change learner data' }));
    await act(async () => {
      pending.resolve({ updated_at: '2026-10-07T12:00:00.000Z', revision: 2 });
      await pending.promise;
    });
    await waitFor(() => expect(screen.getByTestId('restore-status').textContent).toBe('ok'));
    expect(screen.getByTestId('cards').textContent).toContain('local-change');
    expect(cloudUpsert.mock.calls.at(-1)[0].state.cards['local-change']).toEqual({ reps: 1 });
  });

  it('keeps answers made during reload and login of a pending replacement', async () => {
    const replacement = buildRestoreSyncPayload(
      buildSyncPayload(),
      buildSyncPayload(makeLearnerSnapshot()),
      'user-a',
    );
    loadAll.mockReturnValueOnce({ ...replacement, syncConfig: { userId: 'user-a' } });
    getRecoveryBackup.mockReturnValue(serializeBackup({ state: defaultState() }));
    const pending = deferred();
    cloudFetch.mockResolvedValue(null);
    cloudUpsert.mockReturnValueOnce(pending.promise);
    renderProvider();
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() => expect(cloudUpsert).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Change learner data' }));
    await act(async () => {
      pending.resolve({ updated_at: '2026-10-07T12:00:00.000Z', revision: 2 });
      await pending.promise;
    });
    await waitFor(() => expect(screen.getByTestId('restore-status').textContent).toBe('ok'));
    expect(screen.getByTestId('cards').textContent).toContain('local-change');
    expect(JSON.parse(screen.getByTestId('snapshot').textContent).guide.attempted).toBe(7);
  });

  it('pauses a stale tab and refuses restore after another tab changes saved data', async () => {
    renderProvider();
    saveAll.mockClear();
    const external = JSON.stringify(makeLearnerSnapshot());
    localStorage.setItem(STORAGE_KEY, external);
    await act(async () => {
      window.dispatchEvent(
        new window.StorageEvent('storage', {
          key: STORAGE_KEY,
          oldValue: null,
          newValue: external,
          storageArea: localStorage,
        }),
      );
    });
    expect(screen.getByTestId('recovery-error').textContent).toMatch(/another tab/);
    fireEvent.click(screen.getByRole('button', { name: 'Change learner data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore backup' }));
    await act(async () => Promise.resolve());
    expect(saveAll).not.toHaveBeenCalled();
    expect(persistBackupRestore).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(external);
  });

  it('rechecks healthy account B after unsupported cloud data in account A', async () => {
    cloudFetch.mockResolvedValueOnce({ data: { state: { ...defaultState(), schemaVersion: 99 } } });
    renderProvider();
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() =>
      expect(screen.getByTestId('recovery-error').textContent).toMatch(/Cloud data needs recovery/),
    );
    cloudFetch.mockResolvedValueOnce(cloudRow('healthy-b-card'));
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_B);
    });
    await waitFor(() => expect(screen.getByTestId('cards').textContent).toBe('healthy-b-card'));
    expect(screen.getByTestId('recovery-error').textContent).toBe('');
  });

  it('rejects malformed cloud custom content before applying or uploading learner data', async () => {
    loadAll.mockReturnValueOnce(makeLearnerSnapshot());
    cloudFetch.mockResolvedValueOnce({
      data: { state: defaultState(), customVerbs: [null] },
      updated_at: '2030-01-01T00:00:00.000Z',
      revision: 5,
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('cards').textContent).toContain('食べる'));
    const before = screen.getByTestId('snapshot').textContent;
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() =>
      expect(screen.getByTestId('recovery-error').textContent).toMatch(/Cloud data needs recovery/),
    );
    expect(screen.getByTestId('snapshot').textContent).toBe(before);
    expect(cloudUpsert).not.toHaveBeenCalled();
  });

  it('ignores an old restore acknowledgement after switching signed-in accounts', async () => {
    cloudFetch.mockResolvedValue(null);
    renderProvider();
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_A);
    });
    await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('Synced to cloud'));
    const pending = deferred();
    cloudUpsert.mockClear();
    cloudUpsert.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Restore backup' }));
    await waitFor(() => expect(cloudUpsert).toHaveBeenCalledTimes(1));
    cloudFetch.mockResolvedValueOnce(cloudRow('account-b-only'));
    await act(async () => {
      authCallbacks[0]('SIGNED_IN', SESSION_B);
    });
    await waitFor(() => expect(cloudFetch).toHaveBeenCalledWith('user-b'));
    await act(async () => {
      pending.resolve({ updated_at: '2026-10-07T12:00:00.000Z', revision: 2 });
      await pending.promise;
    });
    // The active account restore may proceed after the local replacement's
    // operation ends; the old account's acknowledgement must never apply.
    expect(screen.getByTestId('snapshot').textContent).not.toContain('older-cloud-card');
    expect(cloudUpsert.mock.calls.filter((call) => call[1] === 'user-b')).toHaveLength(0);
  });

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
        practicePrefs: DEFAULT_PREFS,
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
      practicePrefs: { ...DEFAULT_PREFS },
      lastSyncedAt: 0,
      syncConfig: { enabled: false, userId: 'user-a' },
    });
    renderProvider();

    await waitFor(() =>
      expect(saveAll.mock.calls.at(-1)?.[4]).toEqual({ enabled: false, userId: 'user-a' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset settings' }));
    await waitFor(() =>
      expect(screen.getByTestId('auto-speak').textContent).toBe(String(DEFAULT_PREFS.autoSpeak)),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enable auto speak' }));

    let pendingEventId = '';
    await waitFor(() => {
      const saved = saveAll.mock.calls.at(-1);
      expect(saved?.[6]?.autoSpeak).toBe(true);
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
    expect(screen.getByTestId('auto-speak').textContent).toBe('true');
    expect(cloudUpsert).toHaveBeenCalledTimes(1);
    expect(cloudUpsert.mock.calls[0][0]).toMatchObject({
      practicePrefs: { autoSpeak: true },
      syncMeta: {
        pendingReset: null,
        resetEpochs: { settings: expect.objectContaining({ revision: expect.any(Number) }) },
      },
    });
    expect(cloudUpsert.mock.calls[0][0].syncMeta.resetEpochs.settings.revision).toBeGreaterThan(50);
    await waitFor(() => {
      const saved = saveAll.mock.calls.at(-1);
      expect(saved?.[6]?.autoSpeak).toBe(true);
      expect(saved?.[7]?.pendingReset?.eventId).toBe(pendingEventId);
    });

    cloudFetch.mockResolvedValueOnce(remote);
    cloudUpsert.mockResolvedValueOnce({
      updated_at: '2030-01-01T00:00:01.000Z',
      revision: 8,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('Merged from cloud'));
    expect(screen.getByTestId('auto-speak').textContent).toBe('true');
    expect(cloudUpsert).toHaveBeenCalledTimes(2);
    expect(cloudUpsert.mock.calls[1][0].syncMeta.pendingReset).toBeNull();
    expect(cloudUpsert.mock.calls[1][0].syncMeta.resetEpochs.settings.revision).toBeGreaterThan(50);
    await waitFor(() => expect(saveAll.mock.calls.at(-1)?.[7]?.pendingReset).toBeNull());
  });

  it('discards a cloud-only pending marker and accepts the next remote settings epoch', async () => {
    const staleMarkerRow = settingsCloudRow({
      autoSpeak: true,
      clockRevision: 10,
      rowRevision: 3,
      pendingReset: true,
    });
    const newerRow = settingsCloudRow({
      autoSpeak: false,
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
    expect(screen.getByTestId('auto-speak').textContent).toBe('true');
    expect(cloudUpsert).not.toHaveBeenCalled();
    await waitFor(() => expect(saveAll.mock.calls.at(-1)?.[7]?.pendingReset).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('Merged from cloud'));
    expect(screen.getByTestId('auto-speak').textContent).toBe('false');
    expect(cloudUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        practicePrefs: expect.objectContaining({ autoSpeak: false }),
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
      practicePrefs: { ...DEFAULT_PREFS },
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

    await waitFor(() => expect(screen.getByTestId('auto-speak').textContent).toBe('true'));
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
      practicePrefs: DEFAULT_PREFS,
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
