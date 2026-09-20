// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatsDashboard } from '../views/StatsView.jsx';
import { defaultState } from '../utils/storage.js';
import { recordPracticeAnswer } from '../utils/practiceStats.js';

describe('StatsDashboard', () => {
  it('shows lifetime evidence and routes a topic back to Practice', () => {
    const state = defaultState();
    state.practiceStats = recordPracticeAnswer(state.practiceStats, {
      typeId: 'volitional',
      correct: true,
      mode: 'input',
      at: Date.now(),
    });
    const onPracticeTopic = vi.fn();

    render(<StatsDashboard state={state} onPracticeTopic={onPracticeTopic} />);

    expect(screen.getByText('See what is getting easier.')).toBeTruthy();
    expect(screen.getByText('Accuracy over the last 14 days')).toBeTruthy();
    expect(screen.getByText('Typed and spoken production')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Volitional/ }));
    expect(onPracticeTopic).toHaveBeenCalledWith('volitional');
  });
});
