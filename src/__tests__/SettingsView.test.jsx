// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../utils/supabase.js', () => ({ supabase: null }));

import App from '../App.jsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

describe('SettingsView controls', () => {
  it('shows only learner-facing practice defaults', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Settings', exact: true }));

    await screen.findByText('Practice setup', {}, { timeout: 5000 });
    expect(screen.getByText('Question pool')).toBeTruthy();

    const answerMode = within(screen.getByRole('group', { name: 'Answer mode' }));
    expect(answerMode.getByRole('button', { name: 'Type answer', exact: true })).toBeTruthy();
    expect(answerMode.getByRole('button', { name: 'Choices', exact: true })).toBeTruthy();
    expect(answerMode.getByRole('button', { name: 'Self-check', exact: true })).toBeTruthy();
    expect(answerMode.getByRole('button', { name: 'Speak answer', exact: true })).toBeTruthy();

    expect(screen.getByText('Daily goal')).toBeTruthy();
    expect(screen.getByText('Display scripts')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Furigana/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Speak answers', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Listening prompt', exact: true })).toBeTruthy();
    expect(screen.getByText('Japanese voice')).toBeTruthy();
    expect(screen.getByText('Form scope')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Core/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Basics/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Advanced Patterns/i })).toBeTruthy();

    for (const removed of [
      'Review style',
      'Source forms',
      'New cards/day',
      'Theme',
      'English meaning',
      'Word category label',
      'Auto next',
      'Custom',
      'Cloud Sync',
      'Backup & restore',
      'Reset progress',
    ]) {
      expect(screen.queryByText(removed)).toBeNull();
    }

    fireEvent.click(answerMode.getByRole('button', { name: 'Speak answer', exact: true }));
    await waitFor(() => {
      const raw = localStorage.getItem('jp-verb-srs-v2');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw).practicePrefs.answerMode).toBe('speak');
    });

    const goalInput = screen.getByRole('spinbutton');
    fireEvent.change(goalInput, { target: { value: '12' } });
    await waitFor(() => {
      const raw = localStorage.getItem('jp-verb-srs-v2');
      expect(JSON.parse(raw).practicePrefs.dailyGoal).toBe(12);
    });
  });
});
