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
  },
}));

vi.mock('../utils/supabase.js', () => ({ supabase: mockSupabase }));

import {
  syncReady,
  cloudFetch,
  cloudUpsert,
  resolveSyncAction,
  cloudTimestamp,
  buildSyncPayload,
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

function upsertBuilder(result) {
  const upsert = vi.fn(() => Promise.resolve(result));
  return { upsert };
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
    expect(builder.select).toHaveBeenCalledWith('data, updated_at');
    expect(builder.eq).toHaveBeenCalledWith('id', 'user-123');
    expect(result).toEqual(row);
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
    await expect(cloudUpsert(SAMPLE_PAYLOAD)).rejects.toThrow(/not authenticated/);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('writes the payload under the user id with a fresh ISO timestamp', async () => {
    const builder = upsertBuilder({ error: null });
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
    mockSupabase.from.mockReturnValue(builder);

    await cloudUpsert(SAMPLE_PAYLOAD);

    expect(mockSupabase.from).toHaveBeenCalledWith('srs_sync');
    expect(builder.upsert).toHaveBeenCalledTimes(1);
    const written = builder.upsert.mock.calls[0][0];
    expect(written.id).toBe('user-123');
    expect(written.data).toEqual(SAMPLE_PAYLOAD);
    expect(written.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('propagates a Supabase write error', async () => {
    const builder = upsertBuilder({ error: new Error('quota exceeded') });
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
    mockSupabase.from.mockReturnValue(builder);

    await expect(cloudUpsert(SAMPLE_PAYLOAD)).rejects.toThrow('quota exceeded');
  });

  it('round-trips a payload through upsert and fetch unchanged', async () => {
    // Upload, then read back the same bytes the upsert wrote.
    const upBuilder = upsertBuilder({ error: null });
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
    mockSupabase.from.mockReturnValue(upBuilder);
    await cloudUpsert(SAMPLE_PAYLOAD);
    const written = upBuilder.upsert.mock.calls[0][0];

    const fetchBuilder = selectBuilder({
      data: { data: written.data, updated_at: written.updated_at },
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

    expect(merged.state).toEqual(cloudPayload.state);
    expect(merged.customVerbs.map((word) => word.dict)).toEqual(['cloud', 'local']);
    expect(merged.customAdjectives.map((word) => word.dict)).toEqual(['cloud-adj']);
    expect(merged.wordLists.map((list) => list.id)).toEqual(['cloud-list', 'local-list']);
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
    expect(merged.customVerbs).toEqual(localPayload.customVerbs);
    expect(merged.wordLists).toEqual([
      {
        id: 'shared-list',
        name: 'Local name',
        wordKeys: ['godan:cloud', 'godan:local'],
      },
    ]);
    expect(merged.practicePrefs.theme).toBe('light');
    expect(merged.practicePrefs.dailyGoal).toBe(10);
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
    expect(offLocal.practicePrefs.kanaAssist).toBe('off');
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

    expect(merged.wordLists.map((list) => list.id)).toEqual([
      'list-review-rec-cloud',
      'learner-list',
    ]);
    expect(merged.practicePrefs.reviewLimitSource).toBe('recommendation');
    expect(merged.practicePrefs.reviewLimit).toBe(8);
    expect(merged.practicePrefs.wordListIds).toEqual(['list-review-rec-cloud']);
  });
});

describe('when Supabase is not configured', () => {
  it('syncReady is false and cloud calls reject clearly', async () => {
    vi.resetModules();
    vi.doMock('../utils/supabase.js', () => ({ supabase: null }));
    const mod = await import('../utils/storage.js');

    expect(mod.syncReady()).toBe(false);
    await expect(mod.cloudFetch()).rejects.toThrow(/not configured/);
    await expect(mod.cloudUpsert({})).rejects.toThrow(/not configured/);

    vi.doUnmock('../utils/supabase.js');
    vi.resetModules();
  });
});
