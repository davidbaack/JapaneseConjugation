import { describe, expect, it } from 'vitest';
import {
  ANSWER_OUTCOME,
  answerOutcomeCopy,
  answerResultCopy,
  buildMistakeExplanation,
  groupConfusionFeedback,
  lookupResultHeadline,
} from '../utils/answerFeedbackCopy.js';

describe('answer feedback copy', () => {
  it('uses one outcome vocabulary across answer surfaces', () => {
    expect(answerOutcomeCopy(ANSWER_OUTCOME.correct)).toBe('Correct.');
    expect(answerOutcomeCopy(ANSWER_OUTCOME.missed)).toBe('Not quite.');
    expect(answerOutcomeCopy(ANSWER_OUTCOME.assisted)).toBe('Assisted correction.');
    expect(answerOutcomeCopy(ANSWER_OUTCOME.timeout)).toBe("Time's up.");
  });

  it('builds explicit answer and lookup comparisons', () => {
    expect(
      answerResultCopy({
        outcome: ANSWER_OUTCOME.missed,
        submitted: 'かえない',
        expected: 'かえらない',
      }),
    ).toMatchObject({
      headline: 'Not quite.',
      submitted: 'Your answer',
      expected: 'Correct answer',
      announcement: 'Not quite. Your answer: かえない. Correct answer: かえらない.',
    });
    expect(lookupResultHeadline('exact')).toBe('Recognized form.');
    expect(lookupResultHeadline('near')).toBe('Closest match.');
    expect(lookupResultHeadline('none')).toBe("Couldn't identify that.");
  });

  it('names the learner pattern before the correct 帰る rule', () => {
    const body = groupConfusionFeedback({
      usedGroup: 'ichidan',
      expectedGroup: 'godan',
      word: '帰る',
      userResult: 'かえない',
      expectedRule: 'る -> ら + ない',
      expectedResult: 'かえらない',
    });

    expect(body).toBe(
      'You used the ichidan drop る pattern, which produced かえない. 帰る is godan row-shift, so use る -> ら + ない: かえらない.',
    );
    expect(buildMistakeExplanation({ mistake: { detail: body } })).toEqual({
      title: 'Why it missed',
      body,
    });
    expect(body).not.toContain('The answer follows');
  });

  it('uses explicit group-selection and timeout announcements', () => {
    expect(
      answerResultCopy({
        outcome: ANSWER_OUTCOME.missed,
        context: 'group',
        submitted: 'ichidan: drop る',
        expected: 'godan: row-shift',
      }).announcement,
    ).toBe('Not quite. You chose: ichidan: drop る. Correct group: godan: row-shift.');
    expect(
      answerResultCopy({
        outcome: ANSWER_OUTCOME.timeout,
        expected: 'かえらない',
      }).announcement,
    ).toBe("Time's up. Correct answer: かえらない.");
  });
});
