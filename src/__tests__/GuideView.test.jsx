// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FocusedGuideBanner, StepResult } from '../views/GuideView.jsx';

describe('Guide step result copy', () => {
  it('shows the learner and expected values for a missed step', () => {
    render(
      <StepResult
        step={{
          id: 'answer',
          label: 'Build the answer',
          correct: false,
          submitted: 'かえない',
          expected: 'かえらない',
          assisted: false,
        }}
      />,
    );

    expect(screen.getByText('Your answer: かえない')).toBeTruthy();
    expect(screen.getByText('Correct answer: かえらない')).toBeTruthy();
  });

  it('labels a correct assisted step as completed with help', () => {
    render(
      <StepResult
        step={{
          id: 'group',
          label: 'Choose the group',
          correct: true,
          submitted: 'godan',
          expected: 'godan',
          expectedLabel: 'godan: row-shift',
          assisted: true,
        }}
      />,
    );

    expect(screen.getByText('Completed with help.')).toBeTruthy();
  });
});

describe('Focused Guide banner', () => {
  const word = {
    dict: '\u5bdd\u308b',
    reading: '\u306d\u308b',
    meaning: 'to sleep',
    group: 'ichidan',
  };

  it('labels a non-dictionary source as a form-to-form repair', () => {
    render(
      <FocusedGuideBanner
        focus={{
          source: 'practice-result',
          type: 'plain-negative',
          word,
          formToForm: true,
        }}
        card={{ sourceLabel: 'Plain Past', targetLabel: 'Plain Negative' }}
        onExit={() => {}}
      />,
    );

    expect(screen.getByText(/Form-to-form repair: Plain Past to Plain Negative/)).toBeTruthy();
  });

  it('shows miss context but omits it for a correct focused launch', () => {
    const { rerender } = render(
      <FocusedGuideBanner
        focus={{
          source: 'practice-result',
          type: 'plain-negative',
          word,
          formToForm: false,
          missed: true,
          submittedAnswer: 'nemasu',
          expectedAnswer: '\u5bdd\u306a\u3044',
        }}
        card={{ sourceLabel: 'Dictionary Form', targetLabel: 'Plain Negative' }}
        onExit={() => {}}
      />,
    );

    expect(screen.getByLabelText('Practice miss comparison')).toBeTruthy();
    expect(screen.getByText('nemasu')).toBeTruthy();
    expect(screen.getByText('\u5bdd\u306a\u3044')).toBeTruthy();

    rerender(
      <FocusedGuideBanner
        focus={{
          source: 'practice-result',
          type: 'plain-negative',
          word,
          formToForm: false,
          missed: false,
          expectedAnswer: '\u5bdd\u306a\u3044',
        }}
        card={{ sourceLabel: 'Dictionary Form', targetLabel: 'Plain Negative' }}
        onExit={() => {}}
      />,
    );

    expect(screen.queryByLabelText('Practice miss comparison')).toBeNull();
  });
});
