import { getGroupDisplay } from './groupDisplay.js';

export const ANSWER_OUTCOME = Object.freeze({
  correct: 'correct',
  missed: 'missed',
  assisted: 'assisted',
  timeout: 'timeout',
});

const OUTCOME_COPY = Object.freeze({
  [ANSWER_OUTCOME.correct]: 'Correct.',
  [ANSWER_OUTCOME.missed]: 'Not quite.',
  [ANSWER_OUTCOME.assisted]: 'Assisted correction.',
  [ANSWER_OUTCOME.timeout]: "Time's up.",
});

export function answerOutcomeCopy(outcome) {
  return OUTCOME_COPY[outcome] || OUTCOME_COPY[ANSWER_OUTCOME.missed];
}

export function answerComparisonLabels(context = 'answer') {
  if (context === 'lookup') {
    return { submitted: 'Your input', expected: 'Closest valid form' };
  }
  if (context === 'group') {
    return { submitted: 'You chose', expected: 'Correct group' };
  }
  return { submitted: 'Your answer', expected: 'Correct answer' };
}

export function answerResultCopy({ outcome, context = 'answer', submitted = '', expected = '' }) {
  const headline = answerOutcomeCopy(outcome);
  const labels = answerComparisonLabels(context);
  const showSubmitted = outcome !== ANSWER_OUTCOME.correct && outcome !== ANSWER_OUTCOME.timeout;
  const detailParts = [
    showSubmitted && `${labels.submitted}: ${submitted || 'No answer'}.`,
    outcome !== ANSWER_OUTCOME.correct && expected && `${labels.expected}: ${expected}.`,
  ].filter(Boolean);
  return {
    headline,
    ...labels,
    submittedValue: submitted || 'No answer',
    expectedValue: expected,
    announcement: [headline, ...detailParts].join(' '),
  };
}

export function lookupResultHeadline(status) {
  if (status === 'exact') return 'Recognized form.';
  if (status === 'near') return 'Closest match.';
  return "Couldn't identify that.";
}

export function groupPatternCopy(group) {
  const display = getGroupDisplay(group);
  if (!display) return String(group || 'the expected group');
  return [display.shortLabel, display.concept].filter(Boolean).join(' ');
}

export function groupConfusionFeedback({
  usedGroup,
  expectedGroup,
  word,
  userResult,
  expectedRule = '',
  expectedResult,
}) {
  const expectedStep = expectedRule
    ? `use ${expectedRule}: ${expectedResult}`
    : `the correct answer is ${expectedResult}`;
  return `You used the ${groupPatternCopy(usedGroup)} pattern, which produced ${userResult}. ${word} is ${groupPatternCopy(expectedGroup)}, so ${expectedStep}.`;
}

export function buildMistakeExplanation({ diagnostic = '', mistake = null } = {}) {
  if (mistake?.detail) return { title: 'Why it missed', body: mistake.detail };
  if (diagnostic) return { title: 'Why it missed', body: diagnostic };
  return null;
}
