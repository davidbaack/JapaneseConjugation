import { describe, expect, it } from 'vitest';
import { wordKey } from '../utils/conjugator.js';
import { recordPracticeAnswer } from '../utils/practiceStats.js';
import { recordReadinessAttempt } from '../utils/readiness.js';
import { recordWeaknessAttempt, weaknessLaneForCard } from '../utils/subcategoryWeakness.js';
import { buildLearnerResetPayload } from '../utils/learnerReset.js';
import {
  adoptSyncMetadata,
  buildRestoreSyncPayload,
  clearPendingSyncReset,
  progressEpoch,
  rebaseSyncReset,
  stampSyncChanges,
} from '../utils/syncMetadata.js';
import {
  materializeProgressContributions,
  mergeProgressContributions,
  seedProgressContributions,
  stampProgressContributions,
  validateProgressContributions,
  validateProgressContributionsState,
} from '../utils/progressContributions.js';
import {
  buildSyncPayload,
  cardIdFor,
  defaultState,
  gradeCard,
  mergeSyncPayload,
} from '../utils/storage.js';

const word = { dict: '食べる', reading: 'たべる', group: 'ichidan', meaning: 'eat' };
const typeId = 'plain-past';
const rid = cardIdFor(word, typeId);
const laneKey = weaknessLaneForCard(word, typeId).key;
const at = new Date('2026-10-08T12:00:00Z').getTime();

function seed(state = defaultState(), deviceId = 'device') {
  return adoptSyncMetadata(buildSyncPayload({ state }), deviceId);
}

function answer(before, { id, writerId = id, correct, ms = 800, now = at, mode = 'input' }) {
  const state = before.state;
  const after = {
    ...before,
    state: {
      ...state,
      cards: {
        ...state.cards,
        [rid]: { ...gradeCard(state.cards[rid], correct, now), lastAttemptId: id },
      },
      practiceStats: recordPracticeAnswer(state.practiceStats, {
        id,
        typeId,
        correct,
        responseMs: ms,
        at: now,
        mode,
      }),
      readiness: recordReadinessAttempt(state.readiness, rid, {
        correct,
        responseMs: ms,
        now,
        eventId: id,
        answerMode: mode,
      }),
      weakness: recordWeaknessAttempt(state.weakness, {
        word,
        typeId,
        correct,
        responseMs: ms,
        now,
        eventId: id,
      }),
      verbStats: {
        [word.dict]: {
          [rid]: {
            seen: (state.verbStats[word.dict]?.[rid]?.seen || 0) + 1,
            incorrect: (state.verbStats[word.dict]?.[rid]?.incorrect || 0) + (correct ? 0 : 1),
          },
        },
      },
      session: {
        ...state.session,
        reviewed: state.session.reviewed + 1,
        correct: state.session.correct + (correct ? 1 : 0),
      },
    },
  };
  return { ...after, syncMeta: stampSyncChanges(before.syncMeta, before, after, { writerId }) };
}

function counts(payload, attempts, correct) {
  const state = payload.state;
  const totals = state.practiceStats.lifetime;
  expect(totals.attempted).toBe(attempts);
  expect(totals.correct).toBe(correct);
  expect(state.cards[rid].correct).toBe(correct);
  expect(state.cards[rid].incorrect).toBe(attempts - correct);
  expect(state.readiness.byRule[rid].production.attempted).toBe(attempts);
  expect(state.readiness.byRule[rid].production.correct).toBe(correct);
  expect(state.weakness.byLane[laneKey].attempted).toBe(attempts);
  expect(state.weakness.byLane[laneKey].correct).toBe(correct);
  expect(state.weakness.byLane[laneKey].incorrect).toBe(attempts - correct);
  expect(state.verbStats[word.dict][rid].seen).toBe(attempts);
  expect(state.session.reviewed).toBe(attempts);
}

describe('concurrent learner progress contributions', () => {
  it('keeps separate same-millisecond answers and coherent exact-form evidence', () => {
    const base = seed();
    const left = answer(base, { id: 'right', correct: true, ms: 700 });
    const right = answer(base, { id: 'wrong', correct: false, ms: 1000 });
    const merged = mergeSyncPayload(left, right);
    counts(merged, 2, 1);
    expect(merged.state.practiceStats.recent).toHaveLength(2);
    expect(merged.state.practiceStats.lifetime.responseMs).toBe(1700);
    expect(merged.state.practiceStats.byType[typeId].attempted).toBe(2);
    expect(
      merged.state.practiceStats.byDate[merged.state.practiceStats.recent[0].day].attempted,
    ).toBe(2);
    expect(merged.state.practiceStats.lifetime.byMode.input.attempted).toBe(2);
    expect(merged.state.readiness.byRule[rid].production.totalResponseMs).toBe(1700);
    expect(merged.state.weakness.byLane[laneKey].totalResponseMs).toBe(1700);
    counts(mergeSyncPayload(merged, right), 2, 1);
    counts(mergeSyncPayload(right, merged), 2, 1);
  });

  it('is associative, commutative, and idempotent for three offline writers', () => {
    const base = seed();
    const a = answer(base, { id: 'a', correct: true });
    const b = answer(base, { id: 'b', correct: false });
    const c = answer(base, { id: 'c', correct: true });
    const ab = mergeSyncPayload(a, b);
    const ba = mergeSyncPayload(b, a);
    expect(ab.state).toEqual(ba.state);
    const left = mergeSyncPayload(ab, c);
    const right = mergeSyncPayload(a, mergeSyncPayload(b, c));
    expect(left.state).toEqual(right.state);
    counts(left, 3, 2);
    counts(mergeSyncPayload(left, left), 3, 2);
  });

  it('preserves totals after the bounded recent history has expired', () => {
    const base = seed();
    let a = base;
    let b = base;
    for (let index = 0; index < 140; index += 1) {
      a = answer(a, { id: `a:${index}`, writerId: 'a', correct: true, now: at + index });
      b = answer(b, { id: `b:${index}`, writerId: 'b', correct: false, now: at + index });
    }
    const merged = mergeSyncPayload(a, b);
    counts(merged, 280, 140);
    expect(merged.state.practiceStats.recent).toHaveLength(120);
    expect(Object.keys(merged.syncMeta.progressContributions.writers)).toHaveLength(2);
    counts(mergeSyncPayload(mergeSyncPayload(merged, a), b), 280, 140);
  });

  it('retains a valid historical baseline without inventing earlier answer events', () => {
    const old = answer(seed(), { id: 'old', correct: true });
    const baseline = seed(old.state);
    const a = answer(baseline, { id: 'a', correct: false });
    const b = answer(baseline, { id: 'b', correct: true });
    counts(mergeSyncPayload(a, b), 3, 2);
    expect(baseline.syncMeta.progressContributions.writers).toEqual({});
  });

  it('uses a newer miss for card scheduling instead of older higher reps', () => {
    let previous = seed();
    previous = answer(previous, { id: '1', correct: true, now: at - 20 });
    previous = answer(previous, { id: '2', correct: true, now: at - 10 });
    const missed = answer(previous, { id: 'missed', correct: false, now: at });
    const merged = mergeSyncPayload(previous, missed);
    counts(merged, 3, 2);
    expect(merged.state.cards[rid].reps).toBe(0);
    expect(merged.state.cards[rid].lastAttemptId).toBe('missed');
  });

  it('suppresses high-clock old-lineage answers after reset and preserves new answers', () => {
    const base = answer(seed(), { id: 'old', correct: true });
    const reset = buildLearnerResetPayload(base, 'progress');
    const published = clearPendingSyncReset(reset, reset.syncMeta.pendingReset.eventId);
    const stale = answer(
      { ...base, syncMeta: { ...base.syncMeta, revision: 1000 } },
      { id: 'stale', correct: true },
    );
    const merged = mergeSyncPayload(published, stale);
    expect(merged.state.practiceStats.lifetime.attempted).toBe(0);
    const fresh = answer(merged, { id: 'fresh', correct: false });
    counts(mergeSyncPayload(fresh, stale), 1, 0);
  });

  it('restores lower snapshot totals and seeds its full baseline under the replacement epoch', () => {
    const one = answer(seed(), { id: 'one', correct: true });
    const two = answer(one, { id: 'two', correct: false });
    const restored = buildRestoreSyncPayload(two, buildSyncPayload({ state: one.state }), 'user');
    const rebased = rebaseSyncReset(restored, two, restored.syncMeta.pendingReset.domains);
    expect(progressEpoch(rebased.syncMeta)).toBe(progressEpoch(restored.syncMeta));
    const published = clearPendingSyncReset(
      mergeSyncPayload(rebased, two, { userId: 'user', skipPendingResetRebase: true }),
      restored.syncMeta.pendingReset.eventId,
    );
    counts(published, 1, 1);
    const fresh = answer(published, { id: 'new', correct: false });
    counts(mergeSyncPayload(fresh, two), 2, 1);
  });

  it('adopts metadata v1 without losing its clocks or reset lineage', () => {
    const state = defaultState();
    state.game.played = 7;
    const clock = { deviceId: 'old', revision: 4, eventId: 'old-reset' };
    const adopted = adoptSyncMetadata(
      buildSyncPayload({
        state,
        syncMeta: {
          version: 1,
          deviceId: 'old',
          revision: 5,
          resetEpochs: { progress: clock },
          clocks: { 'prefs.theme': clock },
        },
      }),
    );
    expect(adopted.syncMeta.version).toBe(2);
    expect(adopted.syncMeta.resetEpochs.progress).toEqual(clock);
    expect(adopted.syncMeta.clocks['prefs.theme']).toEqual(clock);
    expect(adopted.syncMeta.progressContributions.epoch).toBe('old-reset');
    expect(
      materializeProgressContributions(defaultState(), adopted.syncMeta.progressContributions).game
        .played,
    ).toBe(7);
  });

  it('aggregates every supported drill counter while preserving personal bests', () => {
    const before = defaultState();
    const after = globalThis.structuredClone(before);
    for (const root of [
      'classify',
      'onbin',
      'register',
      'meaning',
      'production',
      'transformation',
      'shadow',
    ])
      after[root].attempted = 1;
    after.ambient.sessions = 1;
    after.ambient.played = 2;
    after.game.played = 1;
    after.game.bestScore = 20;
    after.game.byType[typeId] = { attempted: 1, correct: 1, incorrect: 0 };
    after.mock.taken = 1;
    after.reader.sessions = 1;
    after.reader.chars = 15;
    after.reader.encounters = 1;
    after.reader.wordSeen[wordKey(word)] = 1;
    after.minimalPairs.bySet.demo = { attempted: 1, correct: 1 };
    after.mistakes = [{ key: 'mistake', count: 1 }];
    after.reference.history = [{ ...word, count: 1 }];
    const value = seedProgressContributions(before);
    const a = stampProgressContributions(value, before, after, { writerId: 'a' });
    const b = stampProgressContributions(value, before, after, { writerId: 'b' });
    const state = materializeProgressContributions(after, mergeProgressContributions(a, b));
    for (const root of [
      'classify',
      'onbin',
      'register',
      'meaning',
      'production',
      'transformation',
      'shadow',
    ])
      expect(state[root].attempted).toBe(2);
    expect(state.game.played).toBe(2);
    expect(state.game.bestScore).toBe(20);
    expect(state.game.byType[typeId].correct).toBe(2);
    expect(state.reader.chars).toBe(30);
    expect(state.reader.wordSeen[wordKey(word)]).toBe(2);
    expect(state.mock.taken).toBe(2);
    expect(state.minimalPairs.bySet.demo.attempted).toBe(2);
    expect(state.mistakes[0].count).toBe(2);
    expect(state.reference.history[0].count).toBe(2);
  });

  it('rejects unsupported contribution versions, unsafe paths, and future sync versions', () => {
    expect(() => validateProgressContributions({ version: 2 })).toThrow(/unsupported/);
    expect(() =>
      validateProgressContributions({
        version: 1,
        epoch: '',
        writers: {},
        baseline: { '["cards","__proto__","correct"]': 1 },
      }),
    ).toThrow(/unsupported/);
    expect(() => adoptSyncMetadata({ syncMeta: { version: 3 } })).toThrow(/Unsupported/);
  });

  it('rejects missing v2 evidence and mismatched reset lineages without reseeding', () => {
    const healthy = answer(seed(), { id: 'healthy', correct: true });
    const missing = globalThis.structuredClone(healthy);
    delete missing.syncMeta.progressContributions;
    expect(() => adoptSyncMetadata(missing)).toThrow(/evidence is missing/);
    const mismatched = globalThis.structuredClone(healthy);
    mismatched.syncMeta.progressContributions.epoch = 'foreign-reset';
    expect(() => adoptSyncMetadata(mismatched)).toThrow(/lineage/);
    expect(() => stampSyncChanges(mismatched.syncMeta, mismatched, mismatched)).toThrow(/lineage/);
  });

  it('rejects counter paths that could replace histories or other scalar fields', () => {
    for (const path of [
      ['practiceStats', 'recent', '0', 'correct'],
      ['readiness', 'byRule', rid, 'production', 'recent', 'correct'],
      ['cards', rid, 'ease', 'correct'],
      ['guide', 'recent', '0', 'attempted'],
    ]) {
      expect(() =>
        validateProgressContributions({
          version: 1,
          epoch: '',
          baseline: {
            [JSON.stringify(path)]: 1,
          },
          writers: {},
        }),
      ).toThrow(/unsupported counter path/);
    }
  });

  it('rejects impossible totals and snapshots whose counters differ from their evidence', () => {
    const healthy = answer(seed(), { id: 'healthy', correct: true });
    const impossible = globalThis.structuredClone(healthy.syncMeta.progressContributions);
    impossible.baseline['["practiceStats","lifetime","correct"]'] = 100;
    expect(() => validateProgressContributions(impossible)).toThrow(/exceeds attempts/);
    const mismatch = globalThis.structuredClone(healthy);
    mismatch.state.cards[rid].correct = 9;
    expect(() =>
      validateProgressContributionsState(
        mismatch.state,
        mismatch.syncMeta.progressContributions,
        '',
      ),
    ).toThrow(/do not match/);
    expect(() => adoptSyncMetadata(mismatch)).toThrow(/do not match/);
  });

  it('pauses an older client snapshot copied from the new protocol', () => {
    const cloud = answer(seed(), { id: 'new-protocol', correct: true });
    const mixed = globalThis.structuredClone(cloud);
    mixed.syncMeta.version = 1;
    delete mixed.syncMeta.progressContributions;
    expect(() => adoptSyncMetadata(mixed)).toThrow(/older app copied newer progress/);
  });

  it('pauses ambiguous differing historical baselines rather than double-counting overlap', () => {
    const cloud = answer(seed(), { id: 'new-protocol', correct: true });
    const raw = globalThis.structuredClone(cloud);
    raw.syncMeta.version = 1;
    delete raw.syncMeta.progressContributions;
    raw.state.practiceStats.recent = raw.state.practiceStats.recent.map(
      ({ id: _id, day: _day, ...row }) => row,
    );
    const old = adoptSyncMetadata(raw);
    expect(() => mergeSyncPayload(old, cloud)).toThrow(/Automatic merge is paused/);
    expect(() => mergeSyncPayload(cloud, old)).toThrow(/Automatic merge is paused/);
  });

  it('preserves answers across sequential offline progress and settings resets', () => {
    const original = answer(seed(), { id: 'original', correct: true });
    const reset = buildLearnerResetPayload(original, 'progress');
    const first = answer(reset, { id: 'first', correct: false });
    const settings = buildLearnerResetPayload(first, 'settings');
    expect(progressEpoch(settings.syncMeta)).toBe(progressEpoch(reset.syncMeta));
    const rebased = rebaseSyncReset(settings, original, settings.syncMeta.pendingReset.domains);
    expect(progressEpoch(rebased.syncMeta)).toBe(settings.syncMeta.pendingReset.eventId);
    const published = clearPendingSyncReset(
      mergeSyncPayload(rebased, original, {
        skipPendingResetRebase: true,
      }),
      settings.syncMeta.pendingReset.eventId,
    );
    counts(published, 1, 0);
    const second = answer(published, { id: 'second', correct: true });
    counts(mergeSyncPayload(second, published), 2, 1);
    expect(second.state.practiceStats.recent).toHaveLength(2);
  });

  it('repairs historical diagnostic counters before adopting their baseline', () => {
    const one = answer(seed(), { id: 'one', correct: true });
    const raw = globalThis.structuredClone(one.state);
    raw.readiness.byRule[rid].production.attempted = 10;
    raw.readiness.byRule[rid].production.totalResponseMs = 8000;
    const adopted = seed(raw);
    expect(adopted.diagnosticRepairNeeded).toBe(true);
    expect(adopted.state.readiness.byRule[rid].production.attempted).toBe(1);
    expect(adopted.state.readiness.byRule[rid].production.totalResponseMs).toBe(800);
    const next = answer(adopted, { id: 'next', correct: false, ms: 3000 });
    const merged = mergeSyncPayload(next, next);
    counts(merged, 2, 1);
    expect(merged.state.readiness.byRule[rid].production.totalResponseMs).toBe(3800);
    const corrupted = {
      ...one,
      state: raw,
      syncMeta: { ...one.syncMeta, progressContributions: seedProgressContributions(raw) },
    };
    expect(() => adoptSyncMetadata(corrupted)).toThrow(/do not match/);
  });

  it('preserves optional learner fields through exact self-merges and reading-source merges', () => {
    const one = answer(seed(), { id: 'one', correct: true });
    const state = globalThis.structuredClone(one.state);
    state.cards[rid].sourceTypeStats = {
      'te-form': { correct: 1, incorrect: 0, lastSeen: at - 1000 },
    };
    state.weakness.byLane[laneKey].label = 'Preserved lane description';
    const original = seed(state);
    const self = mergeSyncPayload(original, original);
    expect(self.state).toEqual(original.state);
    const newer = answer(original, { id: 'newer', correct: false, now: at + 1 });
    const merged = mergeSyncPayload(newer, original);
    expect(merged.state.cards[rid].sourceTypeStats['te-form']).toEqual({
      correct: 1,
      incorrect: 0,
      lastSeen: at - 1000,
    });
  });
});
