// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { buildSentencePromptModel } from '../utils/sentencePrompt.js';
import { AnswerInputPanel } from '../views/study/AnswerInputPanel.jsx';
import { RunAnswerReveal } from '../views/study/StudyReviewPanels.jsx';

const WORD = { dict: '元気', reading: 'げんき', meaning: 'energetic', group: 'na-adjective' };
const ENTRY = {
  jaTemplate: 'この子は{w}だ。',
  surface: '元気そう',
  kanaSurface: 'げんきそう',
  source: 'bundled',
};
const PROMPT = buildSentencePromptModel({ entry: ENTRY, word: WORD, type: 'adj-sou' });
const RECORD = {
  word: WORD,
  cardType: 'adj-sou',
  practicedType: 'adj-sou',
  expected: 'げんきそう',
  submittedAnswer: 'genkisouda',
  answerMode: 'input',
  practicePrefs: DEFAULT_PREFS,
  correct: false,
  sentencePrompt: PROMPT,
};

afterEach(cleanup);

describe('sentence blank instructions and review', () => {
  it('names the forward cloze input without revealing its answer before grading', () => {
    render(
      <AnswerInputPanel
        phase="answering"
        answerMode="input"
        answer=""
        current={{ verb: WORD, type: 'adj-sou' }}
        answerTaskDetails={{}}
        practicePrefs={DEFAULT_PREFS}
        taskLabel="Looks Like"
        sentencePrompt={PROMPT}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Fill only the blank' })).toBeTruthy();
    expect(screen.queryByText('元気そう')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Sentence blank review' })).toBeNull();
  });

  it('prioritizes the printed ending explanation and marks inserted spans after grading', () => {
    render(<RunAnswerReveal record={RECORD} />);
    const review = screen.getByRole('region', { name: 'Sentence blank review' });
    expect(
      within(review).getByText('The sentence already includes だ; enter 元気そう here.'),
    ).toBeTruthy();
    const marks = review.querySelectorAll('mark');
    expect([...marks].map((mark) => mark.textContent)).toEqual(['げんきそうだ', '元気そう']);
    expect(marks[0].parentElement.textContent).toBe('この子はげんきそうだだ。');
    expect(marks[1].parentElement.textContent).toBe('この子は元気そうだ。');
  });

  it('keeps the recorded mistake visible after an assisted correction', () => {
    render(<RunAnswerReveal record={{ ...RECORD, wasCorrected: true }} />);
    expect(screen.getByText('The sentence already includes だ; enter 元気そう here.')).toBeTruthy();
  });

  it('shows the completed blank cleanly for a corrected entry', () => {
    render(<RunAnswerReveal record={{ ...RECORD, submittedAnswer: 'genkisou', correct: true }} />);
    const review = screen.getByRole('region', { name: 'Sentence blank review' });
    expect(within(review).queryByText(/sentence already includes/)).toBeNull();
    expect(review.querySelectorAll('mark')).toHaveLength(1);
    expect(review.querySelector('mark').parentElement.textContent).toBe('この子は元気そうだ。');
  });

  it.each([
    { sentencePrompt: null },
    {
      sentencePrompt: buildSentencePromptModel({
        entry: ENTRY,
        word: WORD,
        type: 'adj-sou',
        reverseDrill: true,
      }),
    },
    {
      sentencePrompt: buildSentencePromptModel({
        entry: ENTRY,
        word: WORD,
        type: 'adj-sou',
        listeningPrompt: true,
      }),
    },
    { reverseDrill: true },
  ])('suppresses blank guidance outside forward cloze review (%j)', (overrides) => {
    render(<RunAnswerReveal record={{ ...RECORD, ...overrides }} />);
    expect(screen.queryByRole('region', { name: 'Sentence blank review' })).toBeNull();
  });
});
