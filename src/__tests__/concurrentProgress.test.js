import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { parseBackup, serializeBackup } from '../utils/backup.js';
import { applyGuideAttemptToState, gradeGuideSteps } from '../utils/guidePractice.js';
import { buildLearnerResetPayload } from '../utils/learnerReset.js';
import { recordPracticeAnswer } from '../utils/practiceStats.js';
import { weaknessLaneForCard } from '../utils/subcategoryWeakness.js';
import { buildSyncPayload, cardIdFor, defaultState, mergeSyncPayload } from '../utils/storage.js';
import {
  adoptSyncMetadata,
  buildRestoreSyncPayload,
  clearPendingSyncReset,
  rebaseSyncReset,
  stampSyncChanges,
} from '../utils/syncMetadata.js';

const AT = Date.parse('2026-10-08T12:00:00Z');
const WORD = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
const CARD = {
  word: WORD,
  typeId: 'plain-past',
  sourceTypeId: 'dictionary',
  expectedBase: 'たべる',
  expectedBaseVariants: ['たべる'],
  expectedGroup: 'ichidan',
  expectedAnswer: 'たべた',
  expectedAnswerVariants: ['たべた'],
};
const CARD_ID = cardIdFor(WORD, CARD.typeId);
const LANE_ID = weaknessLaneForCard(WORD, CARD.typeId).key;

function payload(state = defaultState(), syncMeta) {
  return buildSyncPayload({
    state,
    customVerbs: [],
    customAdjectives: [],
    wordLists: [],
    practicePrefs: DEFAULT_PREFS,
    syncMeta,
  });
}

function replica(value = payload(), device = 'device') {
  return adoptSyncMetadata(value, device);
}

function guideAnswer(state, id, correct, responseMs = 1000, at = AT) {
  const result = gradeGuideSteps(CARD, {
    base: 'たべる',
    group: 'ichidan',
    answer: correct ? 'たべた' : 'zzzz',
  });
  expect(result.correct).toBe(correct);
  return applyGuideAttemptToState(state, CARD, result, { eventId: id, now: at, responseMs });
}

function change(before, state, writerId) {
  const after = payload(state, before.syncMeta);
  return {
    ...after,
    syncMeta: stampSyncChanges(before.syncMeta, before, after, { writerId }),
  };
}

function answer(before, writerId, id, correct, responseMs = 1000, at = AT) {
  return change(before, guideAnswer(before.state, id, correct, responseMs, at), writerId);
}

function projection(value) {
  const state = value.state;
  const stats = state.practiceStats;
  const readiness = state.readiness.byRule[CARD_ID] || {};
  const lane = state.weakness.byLane[LANE_ID];
  return {
    lifetime: stats.lifetime,
    type: stats.byType[CARD.typeId],
    dates: stats.byDate,
    card: state.cards[CARD_ID]
      ? { correct: state.cards[CARD_ID].correct, incorrect: state.cards[CARD_ID].incorrect }
      : null,
    session: { reviewed: state.session.reviewed, correct: state.session.correct },
    guide: {
      attempted: state.guide.attempted,
      correct: state.guide.correct,
      byStep: state.guide.byStep,
    },
    production: readiness.production,
    speed: readiness.speed,
    weakness: lane
      ? {
          attempted: lane.attempted,
          correct: lane.correct,
          incorrect: lane.incorrect,
          totalResponseMs: lane.totalResponseMs,
        }
      : null,
    recentIds: stats.recent.map((row) => row.id),
  };
}

function expectEvidence(value, attempted, correct, responseMs) {
  const state = value.state;
  const expected = { attempted, correct, responseMs };
  expect(state.practiceStats.lifetime).toMatchObject(expected);
  expect(state.practiceStats.byType[CARD.typeId]).toMatchObject(expected);
  expect(state.practiceStats.lifetime.byMode.input).toMatchObject(expected);
  expect(
    Object.values(state.practiceStats.byDate).reduce((sum, row) => sum + row.attempted, 0),
  ).toBe(attempted);
  expect(Object.values(state.practiceStats.byDate).reduce((sum, row) => sum + row.correct, 0)).toBe(
    correct,
  );
  expect(state.cards[CARD_ID]).toMatchObject({ correct, incorrect: attempted - correct });
  expect(state.session).toMatchObject({ reviewed: attempted, correct });
  expect(state.guide).toMatchObject({ attempted, correct });
  expect(state.guide.byStep.answer).toMatchObject({ attempted, correct });
  for (const dimension of ['production', 'speed']) {
    expect(state.readiness.byRule[CARD_ID][dimension]).toMatchObject({
      attempted,
      correct,
      totalResponseMs: responseMs,
    });
  }
  expect(state.weakness.byLane[LANE_ID]).toMatchObject({
    attempted,
    correct,
    incorrect: attempted - correct,
    totalResponseMs: responseMs,
  });
}

describe('Concurrent learner evidence through the public sync boundary', () => {
  it('preserves distinct same-millisecond identical-form answers and replay is idempotent', () => {
    const common = replica();
    const first = answer(replica(common, 'same-device'), 'tab-a', 'answer-a', true, 700);
    const second = answer(replica(common, 'same-device'), 'tab-b', 'answer-b', false, 1300);
    const merged = mergeSyncPayload(first, second);
    expectEvidence(merged, 2, 1, 2000);
    expect(new Set(merged.state.practiceStats.recent.map((row) => row.id))).toEqual(
      new Set(['answer-a', 'answer-b']),
    );
    expect(projection(mergeSyncPayload(second, first))).toEqual(projection(merged));
    for (const replay of [first, second, merged, first, second]) {
      expectEvidence(mergeSyncPayload(merged, replay), 2, 1, 2000);
    }
    // The actual Guide apply boundary must credit the submitted final result once.
    expect(guideAnswer(first.state, 'answer-a', true, 700)).toBe(first.state);
  });

  it('does not collapse two same-time correct answers with otherwise identical content', () => {
    const common = replica();
    const first = answer(replica(common, 'device-a'), 'writer-a', 'distinct-a', true);
    const second = answer(replica(common, 'device-b'), 'writer-b', 'distinct-b', true);
    const merged = mergeSyncPayload(first, second);
    expectEvidence(merged, 2, 2, 2000);
    expect(merged.state.practiceStats.recent).toHaveLength(2);
    expect(merged.state.guide.recent).toHaveLength(2);
    expect(merged.state.weakness.byLane[LANE_ID].recent).toHaveLength(2);
  });

  it('pauses an ambiguous old-client rewrite instead of counting shared new evidence twice', () => {
    const cloud = answer(replica(), 'new-writer', 'shared-new-answer', true);
    // An older open client can read the cloud's new totals, then rewrite its
    // own local snapshot in protocol 1 while dropping unfamiliar metadata.
    const oldClientLocal = JSON.parse(JSON.stringify(cloud));
    oldClientLocal.syncMeta.version = 1;
    delete oldClientLocal.syncMeta.progressContributions;
    expect(() => replica(oldClientLocal, 'refreshed-old-client')).toThrow(
      /older app copied newer progress/,
    );
    // Once bounded Practice history no longer exposes the copied IDs, the
    // baseline overlap check still refuses an unknowable automatic sum.
    const truncated = JSON.parse(JSON.stringify(oldClientLocal));
    truncated.state.practiceStats.recent = [];
    const upgraded = replica(truncated, 'refreshed-old-client');
    for (const [left, right] of [
      [cloud, upgraded],
      [upgraded, cloud],
    ]) {
      expect(() => mergeSyncPayload(left, right)).toThrow(/older app progress overlaps/);
    }
    expect(cloud.state.practiceStats.lifetime.attempted).toBe(1);
    expect(oldClientLocal.state.practiceStats.lifetime.attempted).toBe(1);
  });

  it('shares an adopted historical baseline beyond recent-history limits and adds only new work', () => {
    let state = defaultState();
    for (let index = 0; index < 140; index += 1) {
      state = guideAnswer(state, `historic-${index}`, index % 2 === 0, 1000, AT - 1000000 + index);
    }
    expect(state.practiceStats.recent).toHaveLength(120);
    expect(state.guide.recent).toHaveLength(20);
    const a = answer(replica(payload(state), 'device-a'), 'writer-a', 'new-a', true, 1000);
    const b = answer(replica(payload(state), 'device-b'), 'writer-b', 'new-b', false, 2000);
    const merged = mergeSyncPayload(a, b);
    expectEvidence(merged, 142, 71, 143000);
    expect(merged.state.practiceStats.recent).toHaveLength(120);
    expect(merged.state.guide.recent).toHaveLength(20);
    expectEvidence(
      mergeSyncPayload(merged, replica(payload(state), 'third-adopter')),
      142,
      71,
      143000,
    );
  });

  it('bounds answer histories while cumulative counters remain exact after 1500 answers', () => {
    let current = replica();
    let ledgerAt250 = '';
    for (let index = 0; index < 1500; index += 1) {
      current = answer(
        current,
        'long-lived-writer',
        `long-${index}`,
        index % 2 === 0,
        1000,
        AT + index,
      );
      if (index === 249) ledgerAt250 = JSON.stringify(current.syncMeta.progressContributions);
    }
    expectEvidence(current, 1500, 750, 1500000);
    expect(current.state.practiceStats.recent).toHaveLength(120);
    expect(current.state.guide.recent).toHaveLength(20);
    expect(current.state.weakness.byLane[LANE_ID].recent).toHaveLength(30);
    const ledger = current.syncMeta.progressContributions;
    expect(Object.keys(ledger.writers)).toHaveLength(1);
    // The extra 1250 answers add counter digits, not 1250 retained event rows.
    expect(JSON.stringify(ledger).length - ledgerAt250.length).toBeLessThan(1000);
    expectEvidence(mergeSyncPayload(current, current), 1500, 750, 1500000);
  });

  it('converges across three offline replicas, all permutations, and both merge associations', () => {
    const common = answer(replica(), 'common-writer', 'shared-answer', true, 400, AT - 1);
    const a = answer(replica(common, 'a'), 'a', 'a-answer', true, 800);
    const b = answer(replica(common, 'b'), 'b', 'b-answer', false, 1200);
    const c = answer(replica(common, 'c'), 'c', 'c-answer', true, 1600);
    let expected;
    for (const [x, y, z] of [
      [a, b, c],
      [a, c, b],
      [b, a, c],
      [b, c, a],
      [c, a, b],
      [c, b, a],
    ]) {
      const left = mergeSyncPayload(mergeSyncPayload(x, y), z);
      const right = mergeSyncPayload(x, mergeSyncPayload(y, z));
      expectEvidence(left, 4, 3, 4000);
      expectEvidence(right, 4, 3, 4000);
      expected ||= projection(left);
      expect(projection(left)).toEqual(expected);
      expect(projection(right)).toEqual(expected);
    }
  });

  it('keeps cumulative evidence while the latest miss controls the schedule', () => {
    let common = replica();
    for (let index = 0; index < 4; index += 1)
      common = answer(common, 'seed', `seed-${index}`, true, 1000, AT - 10000 + index);
    const oldCorrect = answer(
      replica(common, 'device-a'),
      'writer-a',
      'older-correct',
      true,
      500,
      AT,
    );
    const newMiss = answer(
      replica(common, 'device-b'),
      'writer-b',
      'newer-miss',
      false,
      1500,
      AT + 1000,
    );
    for (const result of [
      mergeSyncPayload(oldCorrect, newMiss),
      mergeSyncPayload(newMiss, oldCorrect),
    ]) {
      expectEvidence(result, 6, 5, 6000);
      expect(result.state.cards[CARD_ID]).toMatchObject({
        reps: 0,
        interval: 0,
        lastSeen: AT + 1000,
      });
      expect(result.state.readiness.byRule[CARD_ID].speed).toMatchObject({
        lastAt: AT + 1000,
        lastMs: 1500,
      });
    }
  });

  it('keeps reset evidence empty against high-clock uninformed replicas, then accepts informed answers', () => {
    const common = answer(replica(), 'old-writer', 'old-answer', true);
    const stale = replica(common, 'offline');
    stale.syncMeta.revision = 1000;
    const uninformed = answer(stale, 'offline-writer', 'uninformed-answer', true, 1000, AT + 1);
    const reset = buildLearnerResetPayload(common, 'progress', { ownerUserId: 'owner' });
    for (const merged of [
      mergeSyncPayload(reset, uninformed),
      mergeSyncPayload(uninformed, reset),
    ]) {
      expect(merged.state.practiceStats.lifetime.attempted).toBe(0);
      expect(merged.state.cards).toEqual({});
      expect(merged.state.guide.attempted).toBe(0);
    }
    const informed = answer(
      replica(reset, 'offline'),
      'offline-writer',
      'informed-answer',
      false,
      500,
      AT + 2,
    );
    expectEvidence(mergeSyncPayload(informed, uninformed), 1, 0, 500);
  });

  it.each([0, 1, 3])(
    'restores %i complete attempts and never resurrects old-replica totals',
    (count) => {
      let common = replica();
      for (let index = 0; index < 3; index += 1)
        common = answer(common, 'old-writer', `old-${index}`, true);
      let replacementState = defaultState();
      for (let index = 0; index < count; index += 1)
        replacementState = guideAnswer(replacementState, `restored-${index}`, true, 1000);
      const restored = buildRestoreSyncPayload(common, payload(replacementState), 'owner');
      const rebased = rebaseSyncReset(restored, common, restored.syncMeta.pendingReset.domains);
      const published = clearPendingSyncReset(
        mergeSyncPayload(rebased, common, { userId: 'owner', skipPendingResetRebase: true }),
        restored.syncMeta.pendingReset.eventId,
      );
      expect(published.state.practiceStats.lifetime.attempted).toBe(count);
      expect(published.state.guide.attempted).toBe(count);
      const stale = answer(replica(common, 'offline'), 'offline-writer', 'stale-answer', false);
      const stable = mergeSyncPayload(published, stale);
      expect(stable.state.practiceStats.lifetime.attempted).toBe(count);
      const informed = answer(
        replica(published, 'offline'),
        'offline-writer',
        'informed-new',
        false,
        500,
      );
      expectEvidence(mergeSyncPayload(stable, informed), count + 1, count, count * 1000 + 500);
    },
  );

  it('keeps the recorded calendar day independent of the merging device timezone', () => {
    const common = replica();
    const acrossMidnight = Date.parse('2026-10-08T23:30:00Z');
    const firstState = {
      ...common.state,
      practiceStats: recordPracticeAnswer(common.state.practiceStats, {
        id: 'tokyo-answer',
        typeId: 'plain-past',
        at: acrossMidnight,
        day: '2026-10-09',
        correct: true,
        responseMs: 600,
        mode: 'input',
      }),
    };
    const secondState = {
      ...common.state,
      practiceStats: recordPracticeAnswer(common.state.practiceStats, {
        id: 'la-answer',
        typeId: 'plain-past',
        at: acrossMidnight,
        day: '2026-10-08',
        correct: false,
        responseMs: 900,
        mode: 'choice',
      }),
    };
    const merged = mergeSyncPayload(
      change(common, firstState, 'tokyo'),
      change(common, secondState, 'la'),
    );
    expect(merged.state.practiceStats.byDate['2026-10-09']).toMatchObject({
      attempted: 1,
      correct: 1,
    });
    expect(merged.state.practiceStats.byDate['2026-10-08']).toMatchObject({
      attempted: 1,
      correct: 0,
    });
    expect(merged.state.practiceStats.recent.map((row) => row.day).sort()).toEqual([
      '2026-10-08',
      '2026-10-09',
    ]);
  });

  it('exports merged counters and restores their exact learner evidence under fresh sync ownership', () => {
    const common = replica();
    const merged = mergeSyncPayload(
      answer(common, 'a', 'a', true, 700),
      answer(common, 'b', 'b', false, 1300),
    );
    const text = serializeBackup(merged);
    const parsed = parseBackup(text);
    expect(parsed.ok, parsed.error).toBe(true);
    expect(parsed.data.syncMeta).toBeUndefined();
    const restored = buildRestoreSyncPayload(replica(), parsed.data, 'new-owner');
    expectEvidence(restored, 2, 1, 2000);
    expect(projection(restored)).toEqual(projection(merged));
  });
});
