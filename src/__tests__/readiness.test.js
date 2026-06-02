import { describe, expect, it } from 'vitest';
import {
  buildConjugationSpeedRows,
  buildReadinessFamilyRows,
  buildReadinessMap,
  defaultReadinessState,
  launchPrefsForReadinessDimension,
  recordReadinessAttempt,
  weakestReadinessSkill,
} from '../utils/readiness.js';

const ICHIDAN_WORD = {
  dict: '\u98df\u3079\u308b',
  reading: '\u305f\u3079\u308b',
  meaning: 'to eat',
  group: 'ichidan',
};

const GODAN_WORD = {
  dict: '\u66f8\u304f',
  reading: '\u304b\u304f',
  meaning: 'to write',
  group: 'godan',
};

describe('readiness tracking', () => {
  it('records production attempts and speed metrics together', () => {
    const readiness = recordReadinessAttempt(defaultReadinessState(), 'ichidan|plain-past', {
      correct: true,
      responseMs: 5200,
      answerMode: 'input',
      now: 1000,
    });

    const metrics = readiness.byRule['ichidan|plain-past'];
    expect(metrics.production).toMatchObject({ attempted: 1, correct: 1, lastMs: 5200 });
    expect(metrics.speed).toMatchObject({
      attempted: 1,
      correct: 1,
      fastCorrect: 1,
      fastestMs: 5200,
    });
  });

  it('routes choice and reading drills into recognition', () => {
    let readiness = defaultReadinessState();
    readiness = recordReadinessAttempt(readiness, 'ichidan|plain-past', {
      correct: false,
      responseMs: 9000,
      answerMode: 'choice',
      now: 1000,
    });
    readiness = recordReadinessAttempt(readiness, 'ichidan|plain-past', {
      correct: true,
      responseMs: 7000,
      answerMode: 'input',
      reverseDrill: true,
      now: 2000,
    });

    const metrics = readiness.byRule['ichidan|plain-past'];
    expect(metrics.recognition).toMatchObject({ attempted: 2, correct: 1 });
    expect(metrics.speed).toMatchObject({ attempted: 2, correct: 1 });
  });

  it('builds a readiness map with distinct untested and weak cells', () => {
    let readiness = defaultReadinessState();
    for (const now of [1000, 2000, 3000]) {
      readiness = recordReadinessAttempt(readiness, 'ichidan|plain-past', {
        correct: true,
        responseMs: 5000,
        answerMode: 'input',
        now,
      });
    }
    readiness = recordReadinessAttempt(readiness, 'ichidan|plain-past', {
      correct: false,
      responseMs: 11000,
      answerMode: 'choice',
      now: 4000,
    });

    const rows = buildReadinessMap({ enabledTypes: ['plain-past'], cards: {}, readiness }, [
      ICHIDAN_WORD,
    ]);
    const row = rows.find((candidate) => candidate.ruleId === 'ichidan|plain-past');

    expect(row.cells.production.status).toBe('strong');
    expect(row.cells.speed.status).toBe('developing');
    expect(row.cells.recognition.status).toBe('weak');
    expect(row.cells.sentence).toBeUndefined();
  });

  it('aggregates study completion speed by conjugation type', () => {
    let readiness = defaultReadinessState();
    readiness = recordReadinessAttempt(readiness, 'ichidan|plain-past', {
      correct: true,
      responseMs: 4000,
      answerMode: 'input',
      now: 1000,
    });
    readiness = recordReadinessAttempt(readiness, 'godan|plain-past', {
      correct: false,
      responseMs: 10000,
      answerMode: 'input',
      now: 2000,
    });
    readiness = recordReadinessAttempt(readiness, 'ichidan|te-form', {
      correct: true,
      responseMs: 15000,
      answerMode: 'input',
      now: 3000,
    });

    const rows = buildConjugationSpeedRows({ enabledTypes: ['plain-past', 'te-form'], readiness }, [
      ICHIDAN_WORD,
      GODAN_WORD,
    ]);
    const plainPast = rows.find((row) => row.typeId === 'plain-past');

    expect(rows[0]).toMatchObject({ typeId: 'te-form', attempted: 1, avgMs: 15000 });
    expect(plainPast).toMatchObject({
      attempted: 2,
      correct: 1,
      avgMs: 7000,
      correctAvgMs: 4000,
      accuracy: 50,
      fastCorrect: 1,
    });
  });

  it('returns drill preferences for weak-cell launches', () => {
    expect(launchPrefsForReadinessDimension('recognition')).toMatchObject({
      answerMode: 'choice',
      reviewStyle: 'auto',
    });
    expect(launchPrefsForReadinessDimension('speed')).toMatchObject({
      answerMode: 'input',
      reviewStyle: 'forms',
      sourceFormStrategy: 'dictionary',
      autoAdvanceCorrect: true,
    });
    expect(launchPrefsForReadinessDimension('production')).toMatchObject({
      answerMode: 'input',
      reviewStyle: 'forms',
    });
  });
});

describe('readiness family rollup', () => {
  it('rolls word-form readiness up to form families and ignores untested dimensions', () => {
    let readiness = defaultReadinessState();
    // Production records on typed answers (the default). Keys are word-form
    // card ids, exactly as production stores them.
    readiness = recordReadinessAttempt(readiness, 'verb:ichidan:食べる:たべる|plain-past', {
      correct: true,
      responseMs: 4000,
      answerMode: 'input',
      now: 1000,
    });
    readiness = recordReadinessAttempt(readiness, 'verb:godan:書く:かく|plain-past', {
      correct: false,
      responseMs: 12000,
      answerMode: 'input',
      now: 2000,
    });

    const rows = buildReadinessFamilyRows({ readiness });
    const basics = rows.find((row) => row.id === 'basic-tenses');

    expect(basics.measured).toEqual(expect.arrayContaining(['production', 'speed']));
    // Typed answers never populate recognition, so it stays untested/hidden.
    expect(basics.measured).not.toContain('recognition');
    expect(basics.cells.recognition.status).toBe('untested');
    expect(basics.cells.production.attempted).toBe(2);
    expect(basics.types.find((type) => type.typeId === 'plain-past')).toBeTruthy();

    // A family with no reps reports nothing measured.
    const untouched = rows.find((row) => row.practiced === 0);
    expect(untouched.measured).toEqual([]);
    expect(untouched.types).toEqual([]);
  });

  it('records recognition only for choice-mode answers', () => {
    let readiness = defaultReadinessState();
    readiness = recordReadinessAttempt(readiness, 'verb:ichidan:見る:みる|te-form', {
      correct: true,
      responseMs: 3000,
      answerMode: 'choice',
      now: 1000,
    });
    const rows = buildReadinessFamilyRows({ readiness });
    const teFamily = rows.find((row) => (row.typeIds || []).includes('te-form'));
    expect(teFamily.measured).toContain('recognition');
  });

  it('surfaces the weakest measured skill, never an untested recognition cell', () => {
    let readiness = defaultReadinessState();
    for (let i = 0; i < 4; i += 1) {
      readiness = recordReadinessAttempt(readiness, 'verb:godan:書く:かく|plain-past', {
        correct: false,
        responseMs: 5000,
        answerMode: 'input',
        now: 1000 + i,
      });
    }

    const weak = weakestReadinessSkill({ readiness });
    expect(weak.familyId).toBe('basic-tenses');
    expect(['production', 'speed']).toContain(weak.dimension);
    expect(weak.dimension).not.toBe('recognition');
  });

  it('returns no nudge when nothing has been practiced', () => {
    expect(weakestReadinessSkill({ readiness: defaultReadinessState() })).toBeNull();
  });
});
