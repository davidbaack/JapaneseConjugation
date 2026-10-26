// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatsDashboard } from '../views/StatsView.jsx';
import { defaultState } from '../utils/storage.js';
import { recordPracticeAnswer } from '../utils/practiceStats.js';

function answer(state, typeId, correct, index) {
  state.practiceStats = recordPracticeAnswer(state.practiceStats, {
    typeId,
    correct,
    mode: 'input',
    at: Date.now() + index,
    id: `stats-answer-${index}`,
  });
}

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

  it('offers Continue before evidence is available without selecting another topic', () => {
    const state = defaultState();
    const selection = JSON.parse(JSON.stringify(state.practiceSelection));
    const onPracticeTopic = vi.fn();
    const onContinuePractice = vi.fn();
    render(
      <StatsDashboard
        state={state}
        onPracticeTopic={onPracticeTopic}
        onContinuePractice={onContinuePractice}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue practice' }));
    expect(onContinuePractice).toHaveBeenCalledOnce();
    expect(onPracticeTopic).not.toHaveBeenCalled();
    expect(state.practiceSelection).toEqual(selection);
  });

  it('offers the most recent missed topic while no topic has three attempts', () => {
    const state = defaultState();
    answer(state, 'plain-negative', false, 1);
    answer(state, 'volitional', false, 2);
    const onPracticeTopic = vi.fn();
    render(<StatsDashboard state={state} onPracticeTopic={onPracticeTopic} />);

    const recommendation = screen.getByRole('button', { name: 'Practice Volitional' });
    expect(within(recommendation).getByText(/recent misses/)).toBeTruthy();
    expect(screen.getByText('Revisit a recent miss')).toBeTruthy();
    expect(screen.queryByText('Worth another look')).toBeNull();
    fireEvent.click(recommendation);
    expect(onPracticeTopic).toHaveBeenCalledWith('volitional');
  });

  it('explains why the only rated topic is both strongest and recommended', () => {
    const state = defaultState();
    for (let index = 0; index < 5; index += 1) answer(state, 'adj-sou', index !== 0, index);
    const onPracticeTopic = vi.fn();
    render(<StatsDashboard state={state} onPracticeTopic={onPracticeTopic} />);

    const recommendation = screen.getByRole('button', { name: 'Practice Adjective Patterns' });
    expect(within(recommendation).getByText(/only topic with at least 3 attempts/)).toBeTruthy();
    expect(within(recommendation).getByText(/80% right across 5 attempts/)).toBeTruthy();
    expect(screen.getByText('80% right · 5 attempts')).toBeTruthy();
    expect(screen.queryByText(/lowest-accuracy topic/)).toBeNull();
    fireEvent.click(recommendation);
    expect(onPracticeTopic).toHaveBeenCalledWith('adjective-patterns');
  });

  it('keeps the three-attempt threshold and recommends the lowest eligible accuracy', () => {
    const state = defaultState();
    let index = 0;
    for (const correct of [true, true, true]) answer(state, 'volitional', correct, index++);
    for (const correct of [true, false, true]) answer(state, 'adj-sou', correct, index++);
    for (const correct of [false, false]) answer(state, 'potential', correct, index++);
    const onPracticeTopic = vi.fn();
    render(<StatsDashboard state={state} onPracticeTopic={onPracticeTopic} />);

    const recommendation = screen.getByRole('button', { name: 'Practice Adjective Patterns' });
    expect(within(recommendation).getByText(/lowest-accuracy topic/)).toBeTruthy();
    fireEvent.click(recommendation);
    expect(onPracticeTopic).toHaveBeenCalledWith('adjective-patterns');
  });

  it('uses singular attempt copy for a single answer', () => {
    const state = defaultState();
    answer(state, 'volitional', true, 1);
    render(<StatsDashboard state={state} onPracticeTopic={vi.fn()} />);

    expect(screen.getAllByText(/1 right \/ 1 attempt/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/1 attempts/)).toBeNull();
  });
});
