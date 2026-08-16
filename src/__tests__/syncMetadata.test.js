import { describe, expect, it } from 'vitest';

import { DEFAULT_PREFS } from '../data/defaults.js';
import { buildLearnerResetPayload } from '../utils/learnerReset.js';
import { buildSyncPayload, defaultState, mergeSyncPayload } from '../utils/storage.js';
import {
  adoptSyncMetadata,
  clearPendingSyncReset,
  rebaseSyncReset,
  stampSyncChanges,
} from '../utils/syncMetadata.js';

function payload(parts = {}) {
  return buildSyncPayload({
    state: parts.state || defaultState(),
    customVerbs: parts.customVerbs || [],
    customAdjectives: parts.customAdjectives || [],
    wordLists: parts.wordLists || [],
    practicePrefs: parts.practicePrefs || DEFAULT_PREFS,
    syncMeta: parts.syncMeta,
  });
}

function adopt(value, deviceId) {
  return adoptSyncMetadata(payload(value), deviceId);
}

function change(before, afterParts) {
  const after = payload({ ...afterParts, syncMeta: before.syncMeta });
  return { ...after, syncMeta: stampSyncChanges(before.syncMeta, before, after) };
}

function guide(attempted) {
  const state = defaultState();
  state.guide = {
    attempted,
    correct: attempted,
    assisted: 0,
    byStep: Object.fromEntries(
      ['base', 'group', 'answer'].map((id) => [id, { attempted, correct: attempted, assisted: 0 }]),
    ),
    recent: [],
  };
  return state;
}

function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

describe('sync metadata convergence', () => {
  it('adopts legacy Guide totals into one max-merged component', () => {
    const five = adopt({ state: guide(5) }, 'device-a');
    const seven = adopt({ state: guide(7) }, 'device-b');

    expect(mergeSyncPayload(five, five).state.guide.attempted).toBe(5);
    expect(mergeSyncPayload(five, seven).state.guide.attempted).toBe(7);
    expect(mergeSyncPayload(seven, five).state.guide.attempted).toBe(7);
  });

  it('adds independent Guide attempts once and remains idempotent', () => {
    const baselineA = adopt({ state: guide(5) }, 'device-a');
    const baselineB = { ...baselineA, syncMeta: { ...baselineA.syncMeta, deviceId: 'device-b' } };
    const attemptA = change(baselineA, { state: guide(6) });
    const attemptB = change(baselineB, { state: guide(6) });
    const merged = mergeSyncPayload(attemptA, attemptB);

    expect(merged.state.guide.attempted).toBe(7);
    expect(mergeSyncPayload(merged, attemptA).state.guide.attempted).toBe(7);
  });

  it('keeps deletions of custom content and whole lists against stale snapshots', () => {
    const verb = { kind: 'verb', group: 'ichidan', dict: '食べる', reading: 'たべる' };
    const stale = adopt(
      {
        customVerbs: [verb],
        wordLists: [{ id: 'mine', name: 'Mine', wordKeys: ['verb:ichidan:食べる:たべる'] }],
      },
      'device-a',
    );
    const deleted = change(stale, { customVerbs: [], wordLists: [] });
    const merged = mergeSyncPayload(deleted, stale);

    expect(merged.customVerbs).toEqual([]);
    expect(merged.wordLists).toEqual([]);
    expect(mergeSyncPayload(stale, deleted).wordLists).toEqual([]);
  });

  it('merges concurrent set-valued preference additions by member', () => {
    const baselineA = adopt({}, 'device-a');
    const baselineB = { ...baselineA, syncMeta: { ...baselineA.syncMeta, deviceId: 'device-b' } };
    const a = change(baselineA, {
      practicePrefs: { ...DEFAULT_PREFS, genkiLessons: [1] },
    });
    const b = change(baselineB, {
      practicePrefs: { ...DEFAULT_PREFS, genkiLessons: [2] },
    });

    expect(mergeSyncPayload(a, b).practicePrefs.genkiLessons).toEqual([1, 2]);
    expect(mergeSyncPayload(b, a).practicePrefs.genkiLessons).toEqual([1, 2]);
  });

  it('preserves concurrent changes to different nested preference leaves', () => {
    const baselineA = adopt({}, 'device-a');
    const baselineB = { ...baselineA, syncMeta: { ...baselineA.syncMeta, deviceId: 'device-b' } };
    const a = change(baselineA, {
      practicePrefs: {
        ...DEFAULT_PREFS,
        displayScripts: { ...DEFAULT_PREFS.displayScripts, kana: false },
        autoAdvanceCorrectByAnswerForm: { 'input-live': true },
      },
    });
    const b = change(baselineB, {
      practicePrefs: {
        ...DEFAULT_PREFS,
        displayScripts: { ...DEFAULT_PREFS.displayScripts, romaji: true },
        autoAdvanceCorrectByAnswerForm: { choice: false },
      },
    });

    for (const merged of [mergeSyncPayload(a, b), mergeSyncPayload(b, a)]) {
      expect(merged.practicePrefs.displayScripts).toEqual({
        kanji: true,
        kana: false,
        romaji: true,
      });
      expect(merged.practicePrefs.autoAdvanceCorrectByAnswerForm).toEqual({
        choice: false,
        'input-live': true,
      });
    }
  });

  it('uses a progress reset epoch to prevent stale cards from returning', () => {
    const state = defaultState();
    state.cards = { stale: { reps: 4, nextReview: 1 } };
    const stale = adopt({ state }, 'device-a');
    const reset = buildLearnerResetPayload(stale, 'progress');

    expect(mergeSyncPayload(reset, stale).state.cards).toEqual({});
    expect(mergeSyncPayload(stale, reset).state.cards).toEqual({});
  });

  it('keeps Guide and Register progress cleared while preserving newer post-reset attempts', () => {
    const state = guide(5);
    state.guide.recent = [{ id: 'before-reset', at: 100, correct: true }];
    state.register = {
      attempted: 4,
      correct: 3,
      streak: 2,
      bestStreak: 2,
      byPattern: { polite: { attempted: 4, correct: 3 } },
      byVerb: {},
    };
    state.minimalPairs = {
      bySet: {
        vowel: {
          attempted: 4,
          correct: 3,
          incorrect: 1,
          streak: 2,
          bestStreak: 2,
          lastAt: 100,
          byContrast: { long: { attempted: 4, correct: 3, incorrect: 1 } },
        },
      },
    };
    const stale = adopt({ state }, 'device-a');
    const reset = buildLearnerResetPayload(stale, 'progress');

    for (const merged of [mergeSyncPayload(reset, stale), mergeSyncPayload(stale, reset)]) {
      expect(merged.state.guide.attempted).toBe(0);
      expect(merged.state.guide.recent).toEqual([]);
      expect(merged.state.register.attempted).toBe(0);
      expect(merged.state.register.byPattern).toEqual({});
      expect(merged.state.minimalPairs).toEqual({ bySet: {} });
    }

    const postResetState = guide(1);
    postResetState.guide.recent = [{ id: 'after-reset', at: 200, correct: true }];
    const postReset = change(reset, { state: postResetState });
    const merged = mergeSyncPayload(postReset, stale);

    expect(merged.state.guide.attempted).toBe(1);
    expect(merged.state.guide.recent.map((row) => row.id)).toEqual(['after-reset']);
  });

  it('keeps custom-content reset list selection empty against a stale device', () => {
    const stale = adopt(
      {
        wordLists: [{ id: 'mine', name: 'Mine', wordKeys: ['verb:ichidan:食べる:たべる'] }],
        practicePrefs: { ...DEFAULT_PREFS, wordListIds: ['mine'] },
      },
      'device-a',
    );
    const reset = buildLearnerResetPayload(stale, 'custom-content');

    expect(mergeSyncPayload(reset, stale).wordLists).toEqual([]);
    expect(mergeSyncPayload(reset, stale).practicePrefs.wordListIds).toEqual([]);
  });

  it('honors newer re-add, default preference, and exclusion-removal intent', () => {
    const verb = { kind: 'verb', group: 'ichidan', dict: '食べる', reading: 'たべる' };
    const state = defaultState();
    state.reviewScope = { ...state.reviewScope, excludedWordKeys: ['verb:ichidan:食べる:たべる'] };
    const stale = adopt(
      {
        state,
        customVerbs: [verb],
        practicePrefs: { ...DEFAULT_PREFS, theme: 'dark' },
      },
      'device-a',
    );
    const removed = change(stale, {
      state: { ...state, reviewScope: { ...state.reviewScope, excludedWordKeys: [] } },
      customVerbs: [],
      practicePrefs: DEFAULT_PREFS,
    });
    const readded = change(removed, {
      state: removed.state,
      customVerbs: [{ ...verb, meaning: 'to eat again' }],
      practicePrefs: removed.practicePrefs,
    });
    const merged = mergeSyncPayload(readded, stale);

    expect(merged.customVerbs).toEqual([{ ...verb, meaning: 'to eat again' }]);
    expect(merged.practicePrefs.theme).toBe(DEFAULT_PREFS.theme);
    expect(merged.state.reviewScope.excludedWordKeys).toEqual([]);
  });

  it('keeps a delete-then-re-add live across repeated self-merges', () => {
    const verb = { kind: 'verb', group: 'ichidan', dict: '食べる', reading: 'たべる' };
    const original = adopt({ customVerbs: [verb] }, 'device-a');
    const removed = change(original, { customVerbs: [] });
    const readded = change(removed, {
      customVerbs: [{ ...verb, meaning: 'to eat again' }],
    });

    for (const once of [mergeSyncPayload(readded, removed), mergeSyncPayload(removed, readded)]) {
      expect(once.customVerbs).toEqual([{ ...verb, meaning: 'to eat again' }]);
      expect(mergeSyncPayload(once, once).customVerbs).toEqual([
        { ...verb, meaning: 'to eat again' },
      ]);
    }
  });

  it('preserves a causally newer post-reset re-add while rebasing the reset', () => {
    const staleVerb = { kind: 'verb', group: 'godan', dict: '書く', reading: 'かく' };
    const readdedVerb = { ...staleVerb, meaning: 'to write again' };
    const stale = adopt({ customVerbs: [staleVerb] }, 'device-a');
    const reset = buildLearnerResetPayload(stale, 'custom-content');
    const postReset = change(reset, { customVerbs: [readdedVerb] });
    const remote = adopt(
      {
        customVerbs: [{ kind: 'verb', group: 'ichidan', dict: '見る', reading: 'みる' }],
      },
      'device-b',
    );
    const remoteHigh = {
      ...remote,
      syncMeta: {
        ...remote.syncMeta,
        revision: 50,
        clocks: Object.fromEntries(
          Object.entries(remote.syncMeta.clocks).map(([path, clock]) => [
            path,
            { ...clock, revision: 50 },
          ]),
        ),
      },
    };

    const rebased = rebaseSyncReset(postReset, remoteHigh, ['custom-content']);
    const merged = mergeSyncPayload(rebased, remoteHigh);

    expect(merged.customVerbs).toEqual([readdedVerb]);
    expect(merged.syncMeta.resetEpochs['custom-content'].revision).toBeGreaterThan(50);
  });

  it('does not restore a device-local pending marker from a cloud payload', () => {
    const local = adopt({}, 'device-local');
    const cloud = adopt({}, 'device-cloud');
    cloud.syncMeta.pendingReset = {
      eventId: 'stale-cloud-pending',
      domains: ['settings'],
      clock: { deviceId: 'device-cloud', revision: 4, eventId: 'stale-cloud-pending' },
      ownerUserId: 'user-a',
    };

    const merged = mergeSyncPayload(local, cloud, { userId: 'user-a' });

    expect(merged.syncMeta.pendingReset).toBeNull();
  });

  it('clears only the pending reset event acknowledged by the CAS', () => {
    const reset = buildLearnerResetPayload(adopt({}, 'device-local'), 'settings');
    const eventId = reset.syncMeta.pendingReset.eventId;

    expect(clearPendingSyncReset(reset, 'different-reset').syncMeta.pendingReset.eventId).toBe(
      eventId,
    );
    expect(clearPendingSyncReset(reset, eventId).syncMeta.pendingReset).toBeNull();
  });

  it('preserves concurrent custom words, lists, and list-member additions', () => {
    const baselineA = adopt({}, 'device-a');
    const baselineB = { ...baselineA, syncMeta: { ...baselineA.syncMeta, deviceId: 'device-b' } };
    const a = change(baselineA, {
      customVerbs: [{ kind: 'verb', group: 'ichidan', dict: '食べる', reading: 'たべる' }],
      wordLists: [{ id: 'mine', name: 'Mine', wordKeys: ['word-a'] }],
    });
    const b = change(baselineB, {
      customVerbs: [{ kind: 'verb', group: 'godan', dict: '書く', reading: 'かく' }],
      wordLists: [{ id: 'mine', name: 'Mine', wordKeys: ['word-b'] }],
    });
    const merged = mergeSyncPayload(a, b);

    expect(merged.customVerbs.map((word) => word.dict).sort()).toEqual(['書く', '食べる'].sort());
    expect(merged.wordLists[0].wordKeys.sort()).toEqual(['word-a', 'word-b']);
  });

  it('is idempotent, commutative, and associative modulo collection ordering', () => {
    const baseline = adopt({}, 'device-a');
    const branch = (deviceId, lesson) =>
      change(
        { ...baseline, syncMeta: { ...baseline.syncMeta, deviceId } },
        { practicePrefs: { ...DEFAULT_PREFS, genkiLessons: [lesson] } },
      );
    const a = branch('device-a', 1);
    const b = branch('device-b', 2);
    const c = branch('device-c', 3);
    const project = (value) =>
      canonical({
        state: value.state,
        customVerbs: value.customVerbs,
        customAdjectives: value.customAdjectives,
        wordLists: value.wordLists,
        practicePrefs: value.practicePrefs,
        clocks: value.syncMeta.clocks,
        tombstones: value.syncMeta.tombstones,
        resetEpochs: value.syncMeta.resetEpochs,
        guideCounters: value.syncMeta.guideCounters,
        guideCounterClocks: value.syncMeta.guideCounterClocks,
      });

    expect(project(mergeSyncPayload(a, a))).toEqual(project(a));
    expect(project(mergeSyncPayload(a, b))).toEqual(project(mergeSyncPayload(b, a)));
    expect(project(mergeSyncPayload(mergeSyncPayload(a, b), c))).toEqual(
      project(mergeSyncPayload(a, mergeSyncPayload(b, c))),
    );
  });
});
