// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StepResult } from '../views/GuideView.jsx';

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
