// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/supabase.js', () => ({ supabase: null }));

globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();

import App from '../App.jsx';
import { DEFAULT_PREFS, STORAGE_KEY } from '../data/defaults.js';
import { defaultState, localDateKey } from '../utils/storage.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '';
});

describe('Practice miss to focused Guide handoff', () => {
  it('keeps Plain Negative \u5bdd\u308b on the exact dictionary-form repair route', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          ...defaultState(),
          enabledTypes: ['plain-negative'],
          daily: {
            date: localDateKey(),
            count: DEFAULT_PREFS.dailyGoal,
            goalHit: true,
            goalStreak: 1,
            bestGoalStreak: 1,
            currentAnswerStreak: 0,
            bestAnswerStreak: 0,
          },
        },
        customVerbs: [],
        customAdjectives: [],
        wordLists: [],
        practicePrefs: DEFAULT_PREFS,
      }),
    );
    sessionStorage.setItem(
      'jp-study-current',
      JSON.stringify({
        dict: '\u5bdd\u308b',
        group: 'ichidan',
        type: 'plain-negative',
        word: {
          dict: '\u5bdd\u308b',
          reading: '\u306d\u308b',
          meaning: 'to sleep',
          group: 'ichidan',
        },
      }),
    );

    render(<App />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: 'nemasu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check (Enter)' }));
    expect((await screen.findAllByText('Not quite.')).length).toBeGreaterThan(0);

    fireEvent.click(await screen.findByRole('button', { name: 'Open Guide for this rule' }));
    expect(await screen.findByText('Focused Guide')).toBeTruthy();
    expect(screen.getByText(/Source: Dictionary Form/)).toBeTruthy();
    expect(screen.getByLabelText('Card 1 of 8')).toBeTruthy();

    const missComparison = screen.getByLabelText('Practice miss comparison');
    expect(within(missComparison).getByText('\u306d\u307e\u3059')).toBeTruthy();
    expect(within(missComparison).getByText('\u5bdd\u306a\u3044')).toBeTruthy();

    function expectDictionaryPrompt() {
      const promptCard = screen.getByText('Prompt').parentElement;
      expect(within(promptCard).getAllByText(/\u5bdd\u308b/).length).toBeGreaterThan(0);
      expect(within(promptCard).getByText(/Dictionary Form/)).toBeTruthy();
      expect(within(promptCard).queryByText(/\u5bdd\u307e\u3059/)).toBeNull();
      expect(within(promptCard).queryByText(/\u5bdd\u305f/)).toBeNull();
      expect(within(promptCard).queryByText(/\u5bdd\u306a\u304b\u3063\u305f/)).toBeNull();
      expect(within(promptCard).queryByText(/\u5bdd\u3066/)).toBeNull();
    }

    expectDictionaryPrompt();

    fireEvent.change(screen.getByLabelText('Plain form'), { target: { value: 'neru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next: choose the group' }));
    fireEvent.click(screen.getByRole('button', { name: 'ichidan / ru-verb' }));
    fireEvent.change(screen.getByLabelText('Final conjugation'), { target: { value: 'nenai' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit guide card' }));
    expect(screen.getByLabelText('Card 1 of 8')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Next card' }));

    expect(screen.getByLabelText('Card 2 of 8')).toBeTruthy();
    expectDictionaryPrompt();
  }, 15000);
});
