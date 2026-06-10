import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { cardIdFor, defaultState } from '../utils/storage.js';
import {
  applyGuideAttemptToState,
  buildGuideDiagnosticInsight,
  buildGuideCard,
  gradeGuideSteps,
  guideGroupChoice,
  guideGroupOptions,
} from '../utils/guidePractice.js';
import { recordWeaknessAttempt } from '../utils/subcategoryWeakness.js';

const TABERU = {
  dict: '\u98df\u3079\u308b',
  reading: '\u305f\u3079\u308b',
  meaning: 'to eat',
  group: 'ichidan',
};
const KAKU = {
  dict: '\u66f8\u304f',
  reading: '\u304b\u304f',
  meaning: 'to write',
  group: 'godan',
};
const SHIZUKA = {
  dict: '\u9759\u304b',
  reading: '\u3057\u305a\u304b',
  meaning: 'quiet',
  group: 'na-adjective',
};

describe('guide practice engine', () => {
  it('builds Guide cards from the current Practice scope', () => {
    const state = { ...defaultState(), enabledTypes: ['plain-past'] };
    const card = buildGuideCard([TABERU], state, DEFAULT_PREFS, { seed: 1 });

    expect(card.word).toBe(TABERU);
    expect(card.typeId).toBe('plain-past');
    expect(card.expectedBase).toBe('\u98df\u3079\u308b');
    expect(card.expectedAnswer).toBe('\u98df\u3079\u305f');
    expect(card.sourceTypeId).not.toBe(card.typeId);
  });

  it('prefers weakness-prioritized cards before fallback cards', () => {
    const weakness = recordWeaknessAttempt(defaultState().weakness, {
      word: KAKU,
      typeId: 'te-form',
      correct: false,
      responseMs: 9000,
      now: Date.now(),
    });
    const state = { ...defaultState(), enabledTypes: ['plain-past', 'te-form'], weakness };

    const card = buildGuideCard([TABERU, KAKU], state, DEFAULT_PREFS, { seed: 0 });

    expect(card.word).toBe(KAKU);
    expect(card.typeId).toBe('te-form');
  });

  it('grades all three steps correctly for verbs and accepts romaji', () => {
    const card = buildGuideCard(
      [KAKU],
      { ...defaultState(), enabledTypes: ['polite-past'] },
      DEFAULT_PREFS,
      { seed: 0 },
    );

    const result = gradeGuideSteps(card, {
      base: 'kaku',
      group: 'godan',
      answer: 'kakimashita',
    });

    expect(result.correct).toBe(true);
    expect(result.steps.base.correct).toBe(true);
    expect(result.steps.group.correct).toBe(true);
    expect(result.steps.answer.correct).toBe(true);
  });

  it('grades all three steps correctly for adjectives', () => {
    const card = buildGuideCard(
      [SHIZUKA],
      { ...defaultState(), enabledTypes: ['adj-polite-past'] },
      DEFAULT_PREFS,
      { seed: 0 },
    );

    const result = gradeGuideSteps(card, {
      base: 'shizuka',
      group: 'na-adjective',
      answer: 'shizukadeshita',
    });

    expect(guideGroupOptions(SHIZUKA).map((option) => option.id)).toEqual([
      'i-adjective',
      'na-adjective',
    ]);
    expect(guideGroupChoice(SHIZUKA)).toBe('na-adjective');
    expect(result.correct).toBe(true);
  });

  it('marks skipped or hinted steps as assisted', () => {
    const card = buildGuideCard([TABERU], { ...defaultState(), enabledTypes: ['plain-past'] });
    const result = gradeGuideSteps(
      card,
      { base: 'taberu', group: 'ichidan', answer: 'tabeta' },
      { base: true },
    );

    expect(result.correct).toBe(true);
    expect(result.assisted).toBe(true);
    expect(result.steps.base.assisted).toBe(true);
  });

  it('updates normal Practice only when the completed card is submitted', () => {
    const state = { ...defaultState(), enabledTypes: ['plain-past'] };
    const card = buildGuideCard([TABERU], state, DEFAULT_PREFS);
    const result = gradeGuideSteps(card, {
      base: 'taberu',
      group: 'ichidan',
      answer: 'tabeta',
    });
    const beforeId = cardIdFor(TABERU, 'plain-past');

    expect(state.cards[beforeId]).toBeUndefined();
    const next = applyGuideAttemptToState(state, card, result, { responseMs: 1200 });

    expect(next.cards[beforeId].reps).toBe(1);
    expect(next.cards[beforeId].correct).toBe(1);
    expect(next.guide.attempted).toBe(1);
    expect(next.guide.byStep.answer.correct).toBe(1);
    expect(next.guide.recent[0]).toMatchObject({
      group: 'ichidan',
      expectedGroup: 'ichidan',
      steps: {
        base: { correct: true, assisted: false },
        group: { correct: true, assisted: false },
        answer: { correct: true, assisted: false },
      },
    });
  });

  it('records an incorrect completed card without advancing the Practice interval', () => {
    const state = { ...defaultState(), enabledTypes: ['plain-past'] };
    const card = buildGuideCard([TABERU], state, DEFAULT_PREFS);
    const result = gradeGuideSteps(card, {
      base: 'taberu',
      group: 'godan',
      answer: 'tabeta',
    });

    const next = applyGuideAttemptToState(state, card, result, { responseMs: 1200 });
    const reviewCard = next.cards[cardIdFor(TABERU, 'plain-past')];

    expect(result.correct).toBe(false);
    expect(reviewCard.reps).toBe(0);
    expect(reviewCard.correct).toBe(0);
    expect(reviewCard.incorrect).toBe(1);
    expect(next.guide.byStep.group.correct).toBe(0);
  });

  it('turns separated Guide step results into a group-specific diagnostic', () => {
    let state = { ...defaultState(), enabledTypes: ['plain-past'] };
    const card = buildGuideCard([KAKU], state, DEFAULT_PREFS, { seed: 0 });
    const result = gradeGuideSteps(card, {
      base: 'kaku',
      group: 'ichidan',
      answer: 'kaita',
    });

    state = applyGuideAttemptToState(state, card, result, { now: 1000 });
    state = applyGuideAttemptToState(state, card, result, { now: 2000 });

    expect(buildGuideDiagnosticInsight(state.guide)).toMatchObject({
      id: 'guide-group-after-answer',
      stepId: 'group',
      message: 'You know the ending but keep misclassifying godan verbs.',
    });
  });

  it('falls back to generic Guide step diagnostics for older recent logs', () => {
    const insight = buildGuideDiagnosticInsight({
      attempted: 3,
      correct: 1,
      assisted: 0,
      byStep: {
        base: { attempted: 3, correct: 3, assisted: 0 },
        group: { attempted: 3, correct: 1, assisted: 0 },
        answer: { attempted: 3, correct: 3, assisted: 0 },
      },
      recent: [],
    });

    expect(insight).toMatchObject({
      id: 'guide-group-after-answer',
      message: 'You know the ending but keep misclassifying word groups.',
    });
  });
});
