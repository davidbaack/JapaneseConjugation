import { describe, it, expect } from 'vitest';
import { buildBackup, serializeBackup, parseBackup, BACKUP_VERSION } from '../utils/backup.js';
import {
  cardIdFor,
  defaultState,
  gradeCard,
  gradeTransformationStats,
  mergeState,
} from '../utils/storage.js';
import { mergeMinimalPairProgress, recordMinimalPairResult } from '../utils/minimalPairs.js';
import { makeLearnerSnapshot, makeLegacyV42Backup } from './fixtures/learnerSnapshot.js';
import {
  validateLearnerBundle,
  validatePreservedSnapshot,
  fillMissingSnapshotDefaults,
} from '../utils/learnerStateValidation.js';
import { mergePracticePrefs } from '../utils/display.js';

const roundTrip = () => parseBackup(serializeBackup(makeLearnerSnapshot()));

describe('complete versioned backup', () => {
  it('captures every current state domain and independent auxiliary snapshot', () => {
    const source = makeLearnerSnapshot();
    const backup = buildBackup({ ...source, session: { access_token: 'SECRET' } });
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.state).toEqual(source.state);
    expect(Object.keys(backup.state)).toEqual(Object.keys(defaultState()));
    source.state.guide.attempted = 999;
    expect(backup.state.guide.attempted).toBe(7);
    expect(JSON.stringify(backup)).not.toContain('SECRET');
    expect(backup).not.toHaveProperty('syncMeta');
    expect(backup).not.toHaveProperty('syncConfig');
  });
  it('preserves every learner bucket through the real restore normalizer', () => {
    const restored = roundTrip();
    expect(restored.ok, restored.error).toBe(true);
    expect(restored.data.state).toEqual(makeLearnerSnapshot().state);
    expect(mergeState(restored.data.state)).toEqual(makeLearnerSnapshot().state);
    expect(restored.summary).toMatchObject({
      cards: 2,
      practiceAttempts: 8,
      guideAttempts: 7,
      customWords: 2,
      lists: 1,
    });
    expect(restored.warnings).toEqual([]);
  });
  it('re-exports an accepted partial session as a complete restorable current snapshot', () => {
    const source = makeLearnerSnapshot();
    // The normal-profile export had this accepted shape despite independent
    // Practice lifetime counts. Those counts cannot supply missing session
    // history, skips, streaks, or mistake patterns.
    source.state.session = { reviewed: 0, correct: 0 };
    const before = JSON.stringify(source);
    expect(() => validateLearnerBundle(source)).not.toThrow();
    const incompleteExport = { ...buildBackup(source), state: source.state };
    expect(parseBackup(JSON.stringify(incompleteExport))).toMatchObject({
      ok: false,
      error: 'state.session.skipped: expected a saved field.',
    });
    for (const state of [source.state, mergeState(source.state)]) {
      const parsed = parseBackup(serializeBackup({ ...source, state }));
      expect(parsed.ok, parsed.error).toBe(true);
      expect(parsed.data.state.session).toEqual(defaultState().session);
      expect(parsed.data.state.practiceStats).toEqual(source.state.practiceStats);
      expect(parsed.data.state.cards).toEqual(source.state.cards);
      expect(() => validatePreservedSnapshot(source.state, parsed.data.state)).not.toThrow();
    }
    expect(JSON.stringify(source)).toBe(before);
  });
  it('refuses to export normalization that would drop saved learner fields', () => {
    const source = makeLearnerSnapshot();
    source.state.reference.retainedNote = 'irreplaceable source evidence';
    const before = JSON.stringify(source);
    expect(() => buildBackup(source)).toThrow(/state.reference.retainedNote.*without loss/);
    expect(JSON.stringify(source)).toBe(before);
  });
  it.each([{}, { theme: 'dark', displayScripts: { kana: true }, autoSpeak: false }])(
    'completes accepted partial preferences while preserving every supplied value',
    (practicePrefs) => {
      const source = { ...makeLearnerSnapshot(), practicePrefs };
      const before = JSON.stringify(practicePrefs);
      const backup = buildBackup(source);
      const restored = parseBackup(JSON.stringify(backup));
      expect(restored.ok, restored.error).toBe(true);
      expect(() =>
        validatePreservedSnapshot(practicePrefs, restored.data.practicePrefs),
      ).not.toThrow();
      expect(restored.data.practicePrefs).toEqual(mergePracticePrefs(backup.practicePrefs));
      expect(JSON.stringify(practicePrefs)).toBe(before);
    },
  );
  it('refuses supplied invalid, discarded, or rewritten preference values without mutating them', () => {
    for (const practicePrefs of [
      { autoSpeak: null },
      { displayScripts: { kana: 'false' } },
      { retainedNote: 'unknown preference evidence' },
      { reviewStyle: 'unsupported-style' },
      { skipDuplicateForms: false },
    ]) {
      const before = JSON.stringify(practicePrefs);
      expect(() => buildBackup({ ...makeLearnerSnapshot(), practicePrefs })).toThrow();
      expect(JSON.stringify(practicePrefs)).toBe(before);
    }
  });
  it.each([{ attempted: 4 }, {}])(
    'completes an accepted partial shadow bucket without weakening its original import',
    (shadow) => {
      const source = makeLearnerSnapshot();
      source.state.shadow = shadow;
      const before = JSON.stringify(source);
      expect(() => validateLearnerBundle(source)).not.toThrow();
      const backup = buildBackup({ ...source, state: mergeState(source.state) });
      const originalIncomplete = { ...backup, state: source.state };
      expect(parseBackup(JSON.stringify(originalIncomplete)).ok).toBe(false);
      const restored = parseBackup(JSON.stringify(backup));
      expect(restored.ok, restored.error).toBe(true);
      expect(restored.data.state.shadow).toEqual({ ...defaultState().shadow, ...shadow });
      expect(restored.data.state.cards).toEqual(source.state.cards);
      expect(restored.data.state.practiceStats).toEqual(source.state.practiceStats);
      expect(() => validatePreservedSnapshot(source.state, restored.data.state)).not.toThrow();
      expect(JSON.stringify(source)).toBe(before);
    },
  );
  it('completes absent static nested fields while preserving supplied counters and dynamic rows', () => {
    const source = makeLearnerSnapshot();
    delete source.state.guide.byStep.base.assisted;
    delete source.state.guide.byStep.group.correct;
    source.state.shadow = { attempted: 4, byScenario: { saved: { attempted: 4 } } };
    source.state.ambient = {};
    const before = JSON.stringify(source);
    const backup = buildBackup(source);
    const restored = parseBackup(JSON.stringify(backup));
    expect(restored.ok, restored.error).toBe(true);
    expect(restored.data.state.guide.byStep.base).toEqual({
      ...source.state.guide.byStep.base,
      assisted: 0,
    });
    expect(restored.data.state.guide.byStep.group).toEqual({
      ...source.state.guide.byStep.group,
      correct: 0,
    });
    expect(restored.data.state.shadow).toEqual({ ...source.state.shadow, totalRating: 0 });
    expect(restored.data.state.shadow.byScenario).toEqual({ saved: { attempted: 4 } });
    expect(restored.data.state.ambient).toEqual(defaultState().ambient);
    expect(() => validatePreservedSnapshot(source.state, restored.data.state)).not.toThrow();
    expect(JSON.stringify(source)).toBe(before);
  });
  it('does not overwrite provided invalid values with supported defaults during export', () => {
    for (const shadow of [
      { attempted: 4, totalRating: '7' },
      { attempted: 4, totalRating: null },
      { attempted: 4, byScenario: [] },
      { attempted: undefined },
    ]) {
      const source = makeLearnerSnapshot();
      source.state.shadow = shadow;
      expect(() => buildBackup(source)).toThrow();
      expect(source.state.shadow).toBe(shadow);
      expect(fillMissingSnapshotDefaults(shadow, defaultState().shadow)).toMatchObject(shadow);
    }
  });
  it('fills only absent default keys and does not mutate the source or template', () => {
    const source = {
      existing: undefined,
      nullable: null,
      dynamic: { saved: { count: 4 } },
      history: [{ id: 'known' }],
      nested: { count: 4 },
    };
    const template = {
      existing: 7,
      nullable: 8,
      dynamic: {},
      history: [],
      nested: { count: 0, correct: 0 },
      missingHistory: [],
    };
    const completed = fillMissingSnapshotDefaults(source, template);
    expect(completed).toEqual({
      ...source,
      nested: { count: 4, correct: 0 },
      missingHistory: [],
    });
    expect(Object.hasOwn(completed, 'existing')).toBe(true);
    expect(completed.existing).toBeUndefined();
    expect(source.nested).toEqual({ count: 4 });
    expect(template.nested).toEqual({ count: 0, correct: 0 });
    completed.missingHistory.push({ id: 'new' });
    expect(template.missingHistory).toEqual([]);
  });
  it('round trips committed Transform and Minimal Pair identities without dropping replay evidence', () => {
    const parts = makeLearnerSnapshot();
    parts.state.transformation = gradeTransformationStats(parts.state.transformation, {
      correct: true,
      sourceType: 'dictionary',
      targetType: 'plain-past',
      eventId: 'transform-answer',
      now: 1000,
    });
    parts.state.minimalPairs = recordMinimalPairResult(
      parts.state.minimalPairs,
      'ichidan-godan-ru',
      { dict: '食べる', reading: 'たべる', group: 'ichidan', meaning: 'eat' },
      'plain-past',
      true,
      { eventId: 'minimal-pair-answer', now: 1000 },
    );
    const restored = parseBackup(serializeBackup(parts));
    expect(restored.ok, restored.error).toBe(true);
    expect(restored.data.state.transformation.lastAttemptId).toBe('transform-answer');
    expect(
      mergeMinimalPairProgress({}, restored.data.state.minimalPairs).bySet['ichidan-godan-ru']
        .lastAttemptId,
    ).toBe('minimal-pair-answer');
  });

  it('round trips current adjective and noun word identities in both supported formats', () => {
    const parts = makeLearnerSnapshot();
    for (const word of [
      { dict: 'いい', reading: 'いい', meaning: 'good', group: 'i-adjective' },
      { dict: '静か', reading: 'しずか', meaning: 'quiet', group: 'na-adjective' },
      { dict: '学生', reading: 'がくせい', meaning: 'student', group: 'noun' },
    ])
      parts.state.cards[cardIdFor(word, 'plain-past')] = gradeCard(null, true);
    parts.customAdjectives.push({
      dict: '学生',
      reading: 'がくせい',
      meaning: 'student',
      group: 'noun',
    });
    parts.practicePrefs.genkiLessons = [1, 2];
    parts.practicePrefs.minnaLessons = [21, '35'];
    for (const backup of [buildBackup(parts), makeLegacyV42Backup(parts)]) {
      const parsed = parseBackup(JSON.stringify(backup));
      expect(parsed.ok, parsed.error).toBe(true);
      expect(parsed.data.state.cards).toEqual(parts.state.cards);
      expect(parsed.data.practicePrefs.genkiLessons).toEqual([1, 2]);
      expect(parsed.data.practicePrefs.minnaLessons).toEqual([21, '35']);
    }
  });
  it('recovers only the recognized app-generated v42 format and discloses omissions', () => {
    const parsed = parseBackup(JSON.stringify(makeLegacyV42Backup()));
    expect(parsed.ok, parsed.error).toBe(true);
    expect(parsed.data.state.cards).toEqual(makeLearnerSnapshot().state.cards);
    expect(parsed.data.state.guide.attempted).toBe(7);
    expect(parsed.data.state.register.attempted).toBe(0);
    expect(parsed.warnings.join(' ')).toMatch(/Version 42.*retry queue.*session/);
  });
  it('rejects ambiguous legacy data and unsupported schemas rather than stamping them current', () => {
    for (const change of [
      (b) => {
        delete b.version;
      },
      (b) => {
        b.version = 44;
      },
      (b) => {
        b.state.schemaVersion = 3;
      },
      (b) => {
        b.version = 42;
      },
      (b) => {
        delete b.state.schemaVersion;
      },
    ]) {
      const backup = buildBackup(makeLearnerSnapshot());
      change(backup);
      expect(parseBackup(JSON.stringify(backup)).ok).toBe(false);
    }
  });
  it.each([null, [], 'cards', 2])('rejects invalid card collection %s', (cards) => {
    const backup = buildBackup(makeLearnerSnapshot());
    backup.state.cards = cards;
    expect(parseBackup(JSON.stringify(backup)).ok).toBe(false);
  });
  it('rejects malformed nested progress, preferences, lists, words and unsafe keys', () => {
    for (const change of [
      (b) => {
        b.state.cards[Object.keys(b.state.cards)[0]].reps = '7';
      },
      (b) => {
        b.state.guide = {};
      },
      (b) => {
        b.state.practiceStats.lifetime.correct = 999;
      },
      (b) => {
        b.state.readiness.byRule = [];
      },
      (b) => {
        b.state.session.recentOutcomes = {};
      },
      (b) => {
        b.state.practiceStats.recent = [null];
      },
      (b) => {
        b.state.practiceStats.recent = [3];
      },
      (b) => {
        b.state.mistakes = [null];
      },
      (b) => {
        b.state.practiceStats.byType['plain-past'] = null;
      },
      (b) => {
        b.state.practiceStats.byType['plain-past'] = {};
      },
      (b) => {
        b.state.practiceStats.byType['plain-past'] = { correct: true };
      },
      (b) => {
        b.state.practiceStats.recent = [{}];
      },
      (b) => {
        b.state.practiceStats.recent[0].correct = 9;
      },
      (b) => {
        b.state.classify.byGroup.ichidan = 'oops';
      },
      (b) => {
        b.practicePrefs = {};
      },
      (b) => {
        b.state.reference.history[0].meaning = { bad: 'value' };
      },
      (b) => {
        b.state.reference.selected.meaning = { bad: 'value' };
      },
      (b) => {
        b.wordLists[0].wordKeys = {};
      },
      (b) => {
        b.customVerbs[0].group = 'invalid';
      },
      (b) => {
        b.practicePrefs.displayScripts.kana = 'false';
      },
      (b) => {
        b.syncConfig = { enabled: true };
      },
    ]) {
      const backup = buildBackup(makeLearnerSnapshot());
      change(backup);
      expect(parseBackup(JSON.stringify(backup)).ok, JSON.stringify(backup)).toBe(false);
    }
    expect(parseBackup('{"format":"jp-verb-srs","__proto__":{"polluted":true}}').ok).toBe(false);
    expect({}.polluted).toBeUndefined();
    expect(parseBackup('not json').ok).toBe(false);
  });
});
