import { describe, it, expect, vi, beforeEach } from 'vitest';

// The cloud-sync layer talks to a module-level Supabase client created from env
// vars in src/utils/supabase.js. In tests there are no env vars, so we replace
// the whole module with a steerable fake client. Because storage.js binds the
// `supabase` import at module load, mocking the module makes cloudFetch /
// cloudUpsert run against our fake exactly as they would in production.
const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('../utils/supabase.js', () => ({
  getLoadedSupabaseClient: () => mockSupabase,
  isSupabaseConfigured: () => true,
  loadSupabaseClient: () => Promise.resolve(mockSupabase),
}));

import {
  syncReady,
  cloudFetch,
  cloudUpsert,
  resolveSyncAction,
  cloudTimestamp,
  buildSyncPayload,
  defaultState,
  mergeCloudState,
  mergeSyncPayload,
  SRS_SCHEMA_VERSION,
} from '../utils/storage.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

// Mirror the chainable query-builder shape the Supabase JS client exposes, while
// keeping each step's mock reachable so we can assert how it was called.
function selectBuilder(result) {
  const maybeSingle = vi.fn(() => Promise.resolve(result));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, maybeSingle };
}

const SESSION = { user: { id: 'user-123' } };

// A payload exercising every field the app round-trips through the cloud.
const SAMPLE_PAYLOAD = {
  state: {
    cards: { 'taberu|plain-past': { reps: 3, interval: 6 } },
    daily: { count: 5 },
    mistakes: [],
  },
  customVerbs: [{ dict: '走る', reading: 'はしる', meaning: 'to run', group: 'godan' }],
  customAdjectives: [{ dict: '青い', reading: 'あおい', meaning: 'blue', group: 'i-adjective' }],
  wordLists: [{ id: 'l1', name: 'JLPT N5', words: ['taberu'] }],
  practicePrefs: { theme: 'dark', dailyGoal: 20 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('syncReady', () => {
  it('reports true when a Supabase client is configured', () => {
    expect(syncReady()).toBe(true);
  });
});

describe('cloudFetch', () => {
  it('returns null when there is no authenticated session', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    const result = await cloudFetch();
    expect(result).toBeNull();
    // Without a session it must not even touch the table.
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('queries the srs_sync row for the current user and returns it', async () => {
    const row = { data: SAMPLE_PAYLOAD, updated_at: '2026-05-29T00:00:00.000Z' };
    const builder = selectBuilder({ data: row, error: null });
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
    mockSupabase.from.mockReturnValue(builder);

    const result = await cloudFetch();

    expect(mockSupabase.from).toHaveBeenCalledWith('srs_sync');
    expect(builder.select).toHaveBeenCalledWith('data, updated_at, revision');
    expect(builder.eq).toHaveBeenCalledWith('id', 'user-123');
    expect(result).toEqual(row);
  });

  it('rejects an expected-user mismatch before reading a cloud row', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });

    await expect(cloudFetch('other-user')).rejects.toThrow(/user changed/);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('preserves every field of the stored payload on the way back (round-trip fidelity)', async () => {
    const row = { data: SAMPLE_PAYLOAD, updated_at: '2026-05-29T00:00:00.000Z' };
    const builder = selectBuilder({ data: row, error: null });
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
    mockSupabase.from.mockReturnValue(builder);

    const result = await cloudFetch();

    expect(result.data).toEqual(SAMPLE_PAYLOAD);
    expect(result.data.customVerbs).toHaveLength(1);
    expect(result.data.wordLists[0].name).toBe('JLPT N5');
    expect(result.data.practicePrefs.theme).toBe('dark');
  });

  it('strips a device-local pending reset marker from fetched cloud data', async () => {
    const clock = { deviceId: 'stale-device', revision: 4, eventId: 'stale-reset' };
    const row = {
      data: {
        ...SAMPLE_PAYLOAD,
        syncMeta: {
          version: 1,
          deviceId: 'stale-device',
          revision: 4,
          clocks: {},
          tombstones: {},
          resetEpochs: { settings: clock },
          guideCounters: {},
          guideCounterClocks: {},
          pendingReset: {
            eventId: clock.eventId,
            domains: ['settings'],
            clock,
            ownerUserId: 'user-123',
          },
          legacyAdopted: true,
        },
      },
      updated_at: '2026-05-29T00:00:00.000Z',
    };
    const builder = selectBuilder({ data: row, error: null });
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
    mockSupabase.from.mockReturnValue(builder);

    const result = await cloudFetch('user-123');

    expect(result.data.syncMeta.pendingReset).toBeNull();
    expect(result.data.syncMeta.resetEpochs.settings).toEqual(clock);
  });

  it('propagates a Supabase error instead of swallowing it', async () => {
    const builder = selectBuilder({ data: null, error: new Error('row level security') });
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
    mockSupabase.from.mockReturnValue(builder);

    await expect(cloudFetch()).rejects.toThrow('row level security');
  });
});

describe('cloudUpsert', () => {
  it('rejects when the user is not authenticated', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(cloudUpsert(SAMPLE_PAYLOAD, '', null)).rejects.toThrow(/not authenticated/);
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('writes through the CAS RPC and returns its server acknowledgement', async () => {
    const acknowledgement = {
      sync_data: SAMPLE_PAYLOAD,
      sync_updated_at: '2026-08-15T12:00:00.000Z',
      sync_revision: 1,
    };
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
    mockSupabase.rpc.mockResolvedValue({ data: [acknowledgement], error: null });

    const result = await cloudUpsert(SAMPLE_PAYLOAD, 'user-123', null);

    expect(mockSupabase.rpc).toHaveBeenCalledWith('cas_srs_sync', {
      expected_revision: null,
      next_data: SAMPLE_PAYLOAD,
      expected_user_id: 'user-123',
    });
    expect(result).toEqual({
      data: SAMPLE_PAYLOAD,
      updated_at: acknowledgement.sync_updated_at,
      revision: 1,
    });
  });

  it('rejects an expected-user mismatch before writing a cloud row', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });

    await expect(cloudUpsert(SAMPLE_PAYLOAD, 'other-user', 3)).rejects.toThrow(/user changed/);
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('requires the expected user so the RPC can verify account identity atomically', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });

    await expect(cloudUpsert(SAMPLE_PAYLOAD, '', 3)).rejects.toThrow(/expected cloud user/i);
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('propagates a Supabase write error', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
    mockSupabase.rpc.mockResolvedValue({ data: null, error: new Error('quota exceeded') });

    await expect(cloudUpsert(SAMPLE_PAYLOAD, 'user-123', 4)).rejects.toThrow('quota exceeded');
  });

  it('round-trips a payload through upsert and fetch unchanged', async () => {
    // Upload, then read back the same bytes the upsert wrote.
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
    mockSupabase.rpc.mockResolvedValue({
      data: [
        {
          sync_data: SAMPLE_PAYLOAD,
          sync_updated_at: '2026-08-15T12:00:00.000Z',
          sync_revision: 1,
        },
      ],
      error: null,
    });
    const written = await cloudUpsert(SAMPLE_PAYLOAD, 'user-123', null);

    const fetchBuilder = selectBuilder({
      data: written,
      error: null,
    });
    mockSupabase.from.mockReturnValue(fetchBuilder);
    const result = await cloudFetch();

    expect(result.data).toEqual(SAMPLE_PAYLOAD);
  });
});

describe('cloudTimestamp', () => {
  it('parses an ISO updated_at into epoch millis', () => {
    expect(cloudTimestamp({ updated_at: '2026-05-29T00:00:00.000Z' })).toBe(
      Date.parse('2026-05-29T00:00:00.000Z'),
    );
  });

  it('returns 0 for missing, empty, or unparseable timestamps', () => {
    expect(cloudTimestamp(null)).toBe(0);
    expect(cloudTimestamp({})).toBe(0);
    expect(cloudTimestamp({ updated_at: '' })).toBe(0);
    expect(cloudTimestamp({ updated_at: 'not-a-date' })).toBe(0);
  });
});

describe('resolveSyncAction (conflict resolution)', () => {
  const newer = '2026-05-29T12:00:00.000Z';
  const cloudAt = Date.parse(newer);

  it('pulls when the cloud row is newer than our last sync', () => {
    expect(resolveSyncAction({ data: SAMPLE_PAYLOAD, updated_at: newer }, cloudAt - 1000)).toBe(
      'pull',
    );
  });

  it('merges when the cloud row is newer but local data only has custom learner content', () => {
    const localPayload = buildSyncPayload({
      state: { cards: {} },
      customVerbs: [{ dict: 'local', reading: 'local', meaning: 'local word', group: 'godan' }],
      customAdjectives: [],
      wordLists: [{ id: 'local-list', name: 'Local list', wordKeys: ['godan:local'] }],
      practicePrefs: DEFAULT_PREFS,
    });

    expect(
      resolveSyncAction({ data: SAMPLE_PAYLOAD, updated_at: newer }, cloudAt - 1000, localPayload),
    ).toBe('merge');
  });

  it('pushes when local progress is newer than the cloud row', () => {
    expect(resolveSyncAction({ data: SAMPLE_PAYLOAD, updated_at: newer }, cloudAt + 1000)).toBe(
      'push',
    );
  });

  it('does nothing when the timestamps match exactly', () => {
    expect(resolveSyncAction({ data: SAMPLE_PAYLOAD, updated_at: newer }, cloudAt)).toBe('noop');
  });

  it('reconciles equal timestamps when unsynced local metadata differs', () => {
    const local = {
      ...SAMPLE_PAYLOAD,
      syncMeta: { version: 1, deviceId: 'device-a', revision: 2 },
    };
    const cloud = {
      ...SAMPLE_PAYLOAD,
      syncMeta: { version: 1, deviceId: 'device-a', revision: 1 },
    };

    expect(resolveSyncAction({ data: cloud, updated_at: newer }, cloudAt, local)).toBe('merge');
  });

  it('pushes for a brand-new cloud account (no row / no data)', () => {
    expect(resolveSyncAction(null, 0)).toBe('push');
    expect(resolveSyncAction(null, 12345)).toBe('push');
    expect(resolveSyncAction({ data: null, updated_at: newer }, 0)).toBe('push');
  });

  it('treats a row with no timestamp as epoch 0', () => {
    // cloudAt 0 vs local 0 → in sync; vs local > 0 → local wins.
    expect(resolveSyncAction({ data: SAMPLE_PAYLOAD }, 0)).toBe('noop');
    expect(resolveSyncAction({ data: SAMPLE_PAYLOAD }, 5000)).toBe('push');
  });
});

describe('mergeSyncPayload', () => {
  it('builds one cloud-newer payload without dropping local custom-only data', () => {
    const localPayload = buildSyncPayload({
      state: { cards: {} },
      customVerbs: [{ dict: 'local', reading: 'local', meaning: 'local word', group: 'godan' }],
      customAdjectives: [],
      wordLists: [{ id: 'local-list', name: 'Local list', wordKeys: ['godan:local'] }],
      practicePrefs: DEFAULT_PREFS,
    });
    const cloudPayload = buildSyncPayload({
      state: {
        cards: { 'godan|plain-past': { reps: 2, interval: 3, nextReview: 10 } },
        shadow: { attempted: 4, totalRating: 12, byScenario: { te: 4 } },
      },
      customVerbs: [{ dict: 'cloud', reading: 'cloud', meaning: 'cloud word', group: 'godan' }],
      customAdjectives: [
        {
          dict: 'cloud-adj',
          reading: 'cloud-adj',
          meaning: 'cloud adjective',
          group: 'i-adjective',
        },
      ],
      wordLists: [{ id: 'cloud-list', name: 'Cloud list', wordKeys: ['godan:cloud'] }],
      practicePrefs: { ...DEFAULT_PREFS, theme: 'dark', dailyGoal: 20 },
    });

    const merged = mergeSyncPayload(localPayload, cloudPayload);

    expect(merged.state).toEqual(
      expect.objectContaining({
        cards: cloudPayload.state.cards,
        shadow: cloudPayload.state.shadow,
      }),
    );
    expect(merged.customVerbs.map((word) => word.dict).sort()).toEqual(['cloud', 'local']);
    expect(merged.customAdjectives.map((word) => word.dict)).toEqual(['cloud-adj']);
    expect(merged.wordLists.map((list) => list.id).sort()).toEqual(['cloud-list', 'local-list']);
    expect(merged.practicePrefs.theme).toBe('dark');
    expect(merged.practicePrefs.dailyGoal).toBe(20);
  });

  it('uses local unsynced learner data in the merged payload written back to cloud', () => {
    const localPayload = buildSyncPayload({
      state: {
        schemaVersion: SRS_SCHEMA_VERSION,
        cards: { 'local-rule': { reps: 5, interval: 7, nextReview: 200 } },
      },
      customVerbs: [{ dict: 'shared', reading: 'local', meaning: 'local meaning', group: 'godan' }],
      customAdjectives: [],
      wordLists: [{ id: 'shared-list', name: 'Local name', wordKeys: ['godan:local'] }],
      practicePrefs: { ...DEFAULT_PREFS, theme: 'light' },
    });
    const cloudPayload = buildSyncPayload({
      state: {
        schemaVersion: SRS_SCHEMA_VERSION,
        cards: { 'cloud-rule': { reps: 1, interval: 1, nextReview: 100 } },
      },
      customVerbs: [{ dict: 'shared', reading: 'cloud', meaning: 'cloud meaning', group: 'godan' }],
      customAdjectives: [],
      wordLists: [{ id: 'shared-list', name: 'Cloud name', wordKeys: ['godan:cloud'] }],
      practicePrefs: { ...DEFAULT_PREFS, theme: 'dark', dailyGoal: 10 },
    });

    const merged = mergeSyncPayload(localPayload, cloudPayload);

    expect(Object.keys(merged.state.cards).sort()).toEqual(['cloud-rule', 'local-rule']);
    expect(merged.customVerbs).toHaveLength(1);
    expect(merged.customVerbs[0].dict).toBe('shared');
    expect(merged.wordLists).toHaveLength(1);
    expect(merged.wordLists[0].wordKeys.sort()).toEqual(['godan:cloud', 'godan:local']);
    expect(['light', 'dark']).toContain(merged.practicePrefs.theme);
    expect([10, DEFAULT_PREFS.dailyGoal]).toContain(merged.practicePrefs.dailyGoal);
  });

  it('normalizes legacy kana answer preferences before merging sync payloads', () => {
    const guidedLocal = mergeSyncPayload(
      { practicePrefs: { answerMode: 'guided' } },
      { practicePrefs: { ...DEFAULT_PREFS, kanaAssist: 'off' } },
    );

    expect(guidedLocal.practicePrefs.answerMode).toBe('input');
    expect(guidedLocal.practicePrefs.kanaAssist).toBe('guided');
    expect(guidedLocal.practicePrefs).not.toHaveProperty('kanaMatchDisplay');

    const offLocal = mergeSyncPayload(
      { practicePrefs: { kanaMatchDisplay: 'none' } },
      { practicePrefs: { ...DEFAULT_PREFS, kanaAssist: 'guided' } },
    );

    expect(offLocal.practicePrefs.answerMode).toBe('input');
    expect(['off', 'guided']).toContain(offLocal.practicePrefs.kanaAssist);
    expect(offLocal.practicePrefs).not.toHaveProperty('kanaMatchDisplay');
  });

  it('strips retired repair drill sync state without dropping recommendation launches', () => {
    const merged = mergeSyncPayload(
      {
        wordLists: [
          { id: 'repair-drill', name: 'Repair', wordKeys: ['ichidan:\u98df\u3079\u308b'] },
          { id: 'learner-list', name: 'Learner List', wordKeys: ['godan:\u66f8\u304f'] },
        ],
        practicePrefs: {
          ...DEFAULT_PREFS,
          reviewLimitSource: 'repair',
          reviewLimit: 10,
          wordListIds: ['repair-drill'],
        },
      },
      {
        wordLists: [
          { id: 'repair-drill', name: 'Repair', wordKeys: ['godan:\u66f8\u304f'] },
          {
            id: 'list-review-rec-cloud',
            name: 'Recommended reviews',
            wordKeys: ['godan:\u66f8\u304f'],
          },
        ],
        practicePrefs: {
          ...DEFAULT_PREFS,
          reviewLimitSource: 'recommendation',
          reviewLimit: 8,
          wordListIds: ['list-review-rec-cloud'],
        },
      },
    );

    expect(merged.wordLists.map((list) => list.id).sort()).toEqual(
      ['list-review-rec-cloud', 'learner-list'].sort(),
    );
    expect(['recommendation', '']).toContain(merged.practicePrefs.reviewLimitSource);
    expect([8, 0]).toContain(merged.practicePrefs.reviewLimit);
    expect(merged.practicePrefs.wordListIds).not.toContain('repair-drill');
  });

  it('preserves every cloud-only progress domain when the local state is otherwise default', () => {
    const local = defaultState();
    local.cards = { local: { reps: 1, interval: 1, nextReview: 10, lastSeen: 5 } };
    const cloud = defaultState();
    cloud.cards = { cloud: { reps: 2, interval: 3, nextReview: 20, lastSeen: 10 } };
    cloud.shadow = { attempted: 4, totalRating: 12, byScenario: { te: 4 } };
    cloud.ambient = { sessions: 2, played: 7, lastAt: 100 };
    cloud.register = {
      attempted: 5,
      correct: 4,
      streak: 2,
      bestStreak: 3,
      byPattern: { polite: { attempted: 5, correct: 4, lastAt: 100 } },
      byVerb: { taberu: { attempted: 3, correct: 2 } },
    };
    cloud.reader = {
      sessions: 3,
      chars: 400,
      encounters: 9,
      wordSeen: { taberu: 4 },
      lastAt: 110,
    };
    cloud.production = { attempted: 6, correct: 5, lastScore: 88, lastAt: 120 };
    cloud.reference = {
      recentSearches: ['taberu'],
      history: [
        {
          dict: 'taberu',
          reading: 'taberu',
          meaning: 'to eat',
          group: 'ichidan',
          count: 2,
          lastAt: 130,
        },
      ],
      selected: {
        dict: 'taberu',
        reading: 'taberu',
        meaning: 'to eat',
        group: 'ichidan',
        selectedAt: 130,
      },
      weakRules: [],
    };
    cloud.session = {
      reviewed: 7,
      correct: 5,
      skipped: 1,
      currentStreak: 2,
      bestStreak: 4,
      recentOutcomes: [{ at: 140, cardId: 'cloud', kind: 'correct', label: 'Cloud' }],
      mistakePatterns: {
        vowel: { patternId: 'vowel', count: 2, latestAt: 140, label: 'Vowel' },
      },
    };
    cloud.minimalPairs = {
      bySet: {
        vowel: {
          attempted: 3,
          correct: 2,
          incorrect: 1,
          streak: 1,
          bestStreak: 2,
          lastAt: 150,
          byContrast: { long: { attempted: 3, correct: 2, incorrect: 1 } },
        },
      },
    };

    const forward = mergeCloudState(local, cloud);
    const reverse = mergeCloudState(cloud, local);

    expect(forward).toEqual(reverse);
    expect(Object.keys(forward.cards).sort()).toEqual(['cloud', 'local']);
    expect(forward.shadow).toEqual(cloud.shadow);
    expect(forward.ambient).toEqual(cloud.ambient);
    expect(forward.register).toEqual(cloud.register);
    expect(forward.reader).toEqual(cloud.reader);
    expect(forward.production).toEqual(cloud.production);
    expect(forward.reference.selected.dict).toBe('taberu');
    expect(forward.session.reviewed).toBe(7);
    expect(forward.minimalPairs.bySet.vowel.attempted).toBe(3);
  });

  it('commutatively merges populated same-key nested progress buckets', () => {
    const local = defaultState();
    const cloud = defaultState();
    local.classify = {
      attempted: 5,
      correct: 2,
      byGroup: { ichidan: { attempted: 5, correct: 2 } },
    };
    cloud.classify = {
      attempted: 4,
      correct: 4,
      byGroup: { ichidan: { attempted: 4, correct: 4 } },
    };
    local.onbin = {
      attempted: 5,
      correct: 2,
      hints: 7,
      streak: 1,
      bestStreak: 3,
      byPattern: { te: { attempted: 5, correct: 2, lastAt: 100 } },
    };
    cloud.onbin = {
      attempted: 4,
      correct: 4,
      hints: 3,
      streak: 4,
      bestStreak: 4,
      byPattern: { te: { attempted: 4, correct: 4, lastAt: 200 } },
    };
    local.register = {
      attempted: 5,
      correct: 2,
      streak: 1,
      bestStreak: 3,
      byPattern: { polite: { attempted: 5, correct: 2, lastAt: 100 } },
      byVerb: { taberu: { attempted: 5, correct: 2 } },
    };
    cloud.register = {
      attempted: 4,
      correct: 4,
      streak: 4,
      bestStreak: 4,
      byPattern: { polite: { attempted: 4, correct: 4, lastAt: 200 } },
      byVerb: { taberu: { attempted: 4, correct: 4 } },
    };
    local.meaning = { attempted: 5, correct: 2, byWord: { taberu: { attempted: 5, correct: 2 } } };
    cloud.meaning = { attempted: 4, correct: 4, byWord: { taberu: { attempted: 4, correct: 4 } } };
    local.mock = {
      taken: 5,
      bestPct: 80,
      lastPct: 60,
      lastScore: 6,
      lastTotal: 10,
      lastAt: 100,
      bySkill: { conjugation: { attempted: 5, correct: 2 } },
    };
    cloud.mock = {
      taken: 4,
      bestPct: 90,
      lastPct: 90,
      lastScore: 9,
      lastTotal: 10,
      lastAt: 200,
      bySkill: { conjugation: { attempted: 4, correct: 4 } },
    };
    local.shadow = { attempted: 5, totalRating: 10, byScenario: { te: 3 } };
    cloud.shadow = { attempted: 4, totalRating: 14, byScenario: { te: 4 } };
    local.reader = { sessions: 5, chars: 100, encounters: 8, wordSeen: { taberu: 5 }, lastAt: 100 };
    cloud.reader = { sessions: 4, chars: 200, encounters: 7, wordSeen: { taberu: 4 }, lastAt: 200 };
    local.session = {
      reviewed: 5,
      correct: 2,
      skipped: 1,
      currentStreak: 1,
      bestStreak: 3,
      recentOutcomes: [{ at: 100, cardId: 'same', kind: 'missed', label: 'Earlier' }],
      mistakePatterns: {
        vowel: { patternId: 'vowel', count: 5, latestAt: 100, label: 'Earlier' },
      },
    };
    cloud.session = {
      reviewed: 4,
      correct: 4,
      skipped: 2,
      currentStreak: 4,
      bestStreak: 4,
      recentOutcomes: [{ at: 200, cardId: 'same', kind: 'correct', label: 'Later' }],
      mistakePatterns: {
        vowel: { patternId: 'vowel', count: 4, latestAt: 200, label: 'Later' },
      },
    };

    const forward = mergeCloudState(local, cloud);
    const reverse = mergeCloudState(cloud, local);

    expect(forward).toEqual(reverse);
    expect(forward.classify.byGroup.ichidan).toEqual({ attempted: 5, correct: 4 });
    expect(forward.onbin.byPattern.te).toEqual({ attempted: 5, correct: 4, lastAt: 200 });
    expect(forward.register.byVerb.taberu).toEqual({ attempted: 5, correct: 4 });
    expect(forward.meaning.byWord.taberu).toEqual({ attempted: 5, correct: 4 });
    expect(forward.mock).toMatchObject({
      taken: 5,
      bestPct: 90,
      lastPct: 90,
      lastScore: 9,
      lastAt: 200,
      bySkill: { conjugation: { attempted: 5, correct: 4 } },
    });
    expect(forward.session.mistakePatterns.vowel).toMatchObject({
      count: 5,
      latestAt: 200,
      label: 'Later',
    });
  });
});

describe('when Supabase is not configured', () => {
  it('syncReady is false and cloud calls reject clearly', async () => {
    vi.resetModules();
    vi.doMock('../utils/supabase.js', () => ({
      getLoadedSupabaseClient: () => null,
      isSupabaseConfigured: () => false,
      loadSupabaseClient: () => Promise.reject(new Error('Supabase client is not configured')),
    }));
    const mod = await import('../utils/storage.js');

    expect(mod.syncReady()).toBe(false);
    await expect(mod.cloudFetch()).rejects.toThrow(/not configured/);
    await expect(mod.cloudUpsert({})).rejects.toThrow(/not configured/);

    vi.doUnmock('../utils/supabase.js');
    vi.resetModules();
  });
});
