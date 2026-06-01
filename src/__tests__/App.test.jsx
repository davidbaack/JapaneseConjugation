// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';

// No Supabase configured in tests → auth/sync effects no-op (offline-first path).
vi.mock('../utils/supabase.js', () => ({ supabase: null }));

import App from '../App.jsx';
import { DEFAULT_PREFS, STORAGE_KEY } from '../data/defaults.js';
import { defaultState, localDateKey } from '../utils/storage.js';
import { TODAY_DRILL_LIST_ID } from '../utils/todayDrill.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

describe('App shell', () => {
  it('renders the header, subtitle, and full nav', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Katachiya/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Japanese Conjugation SRS/ })).toBeTruthy();
    // Nav labels (accessible name is the catalog string; CSS only capitalizes).
    for (const label of [
      'study',
      'Conjugation Check',
      'Which Group?',
      'Endings',
      'games',
      'insights',
      'library',
      'settings',
    ]) {
      expect(screen.getByRole('tab', { name: label, exact: true })).toBeTruthy();
    }
  });

  it('lazy-loads the default Study view without crashing', async () => {
    render(<App />);
    // The Suspense skeleton resolves to the Study view; its answer input appears.
    await waitFor(() => expect(screen.getByPlaceholderText(/Type romaji or kana/i)).toBeTruthy(), {
      timeout: 5000,
    });
    const direction = within(screen.getByRole('group', { name: 'Practice direction' }));
    expect(direction.getByRole('button', { name: 'Conjugate' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    fireEvent.click(direction.getByRole('button', { name: 'Un-conjugate' }));

    await waitFor(() => {
      const updatedDirection = within(screen.getByRole('group', { name: 'Practice direction' }));
      expect(
        updatedDirection.getByRole('button', { name: 'Un-conjugate' }).getAttribute('aria-pressed'),
      ).toBe('true');
    });
    await waitFor(() => expect(screen.getByPlaceholderText(/Type dictionary form/i)).toBeTruthy());
  });

  it('shows a sign-in prompt instead of signed-out SRS counters', async () => {
    render(<App />);

    await screen.findByText('Sign in to save SRS progress', {}, { timeout: 5000 });
    expect(screen.queryByText('SRS Queue')).toBeNull();
    expect(screen.queryByText('0/0 this session')).toBeNull();
    expect(screen.queryByText('0/30 today')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Sign in' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Start review' })).toBeNull();
  });

  it('does not auto-start a daily drill while signed out', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          ...defaultState(),
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

    render(<App />);

    await screen.findByText('Sign in to save SRS progress', {}, { timeout: 5000 });
    await waitFor(() => {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      expect(raw.practicePrefs.wordListIds || []).not.toContain(TODAY_DRILL_LIST_ID);
    });
    expect(screen.queryByRole('button', { name: 'Start review' })).toBeNull();
  });

  it('starts Transform mode from the Study screen with a source-to-target route', async () => {
    render(<App />);
    const transformButton = await screen.findByRole(
      'button',
      { name: 'Transform' },
      { timeout: 5000 },
    );

    fireEvent.click(transformButton);

    const direction = within(screen.getByRole('group', { name: 'Practice direction' }));
    expect(screen.getAllByRole('button', { name: /Conjugate/i }).length).toBeGreaterThan(0);
    expect(direction.getByRole('button', { name: 'Un-conjugate' })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText(/Transform/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/Conjugate to/i)).toBeTruthy();
    expect(screen.getByText(/Prompt form:/i)).toBeTruthy();
    expect(screen.getByText(/From /i)).toBeTruthy();
    expect(screen.getAllByText(/->/).length).toBeGreaterThan(0);
  }, 15000);

  it('does not show answer-form endings or target English before answering', async () => {
    const savedState = defaultState();
    const savedType = 'desiderative-past-negative';
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          ...savedState,
          enabledTypes: [...savedState.enabledTypes, savedType],
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
        dict: '\u8a71\u3059',
        group: 'godan',
        type: savedType,
      }),
    );

    render(<App />);

    await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    expect(screen.getAllByText(/Tai Past Negative/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/did not want to ~/i)).toBeTruthy();
    expect(screen.getByText(/to speak/i)).toBeTruthy();
    expect(screen.queryByText('\u305f\u304f\u306a\u304b\u3063\u305f')).toBeNull();
    expect(screen.queryByText(/did not want to speak/i)).toBeNull();
  }, 15000);

  it('keeps deep answer teaching collapsed after an incorrect miss', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          ...defaultState(),
          enabledTypes: ['plain-past'],
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
        dict: '\u8a71\u3059',
        group: 'godan',
        type: 'plain-negative',
        word: {
          dict: '\u8a71\u3059',
          reading: '\u306f\u306a\u3059',
          meaning: 'to speak',
          group: 'godan',
        },
      }),
    );

    render(<App />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check (Enter)' }));

    await screen.findAllByText('Not quite.', {}, { timeout: 5000 });
    expect(screen.getByText(/Rule:/)).toBeTruthy();
    expect(screen.getByText('Full rule path').closest('details')?.hasAttribute('open')).toBe(false);
    expect(screen.queryByText('Gemini is not configured for AI chat.')).toBeNull();
  }, 15000);

  it('mounts every tab without hitting the error boundary', async () => {
    render(<App />);
    // Each nav button's accessible name is its catalog label.
    const labels = [
      'study',
      'Conjugation Check',
      'Which Group?',
      'Endings',
      'games',
      'insights',
      'library',
      'settings',
    ];
    for (const label of labels) {
      fireEvent.click(screen.getByRole('tab', { name: label, exact: true }));
      // Each view lazy-loads; wait until its chunk resolves (nav stays mounted).
      await waitFor(() => expect(screen.queryByText('Something went wrong')).toBeNull());
      expect(screen.getByRole('tab', { name: label, exact: true })).toBeTruthy();
    }
  });
});
