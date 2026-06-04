// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

// No Supabase configured in tests → auth/sync effects no-op (offline-first path).
vi.mock('../utils/supabase.js', () => ({ supabase: null }));

import App from '../App.jsx';
import { DEFAULT_PREFS, STORAGE_KEY } from '../data/defaults.js';
import { defaultState, localDateKey } from '../utils/storage.js';
import { recordWeaknessAttempt } from '../utils/subcategoryWeakness.js';
import { TODAY_DRILL_LIST_ID } from '../utils/todayDrill.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

async function startWorkoutFromDashboard() {
  const starts = await screen.findAllByRole(
    'button',
    { name: /Start workout|Continue workout/ },
    { timeout: 5000 },
  );
  fireEvent.click(starts[starts.length - 1]);
}

describe('App shell', () => {
  it('renders the header, subtitle, and restored nav', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Katachiya/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Conjugation Practice/ })).toBeTruthy();
    // Nav labels (accessible name is the catalog string; CSS only capitalizes).
    for (const label of ['Practice', 'Learn', 'Tools', 'Settings']) {
      expect(screen.getByRole('tab', { name: label, exact: true })).toBeTruthy();
    }
  });

  it('lazy-loads a clean Practice dashboard for a brand-new learner', async () => {
    render(<App />);
    // The Suspense skeleton resolves to the Practice dashboard.
    expect(await screen.findByRole('region', { name: 'Practice dashboard' })).toBeTruthy();
    // New learner (no history): a single clear Start, no wall of zeros, and no
    // returning-user signals until there is history to show.
    expect(screen.getByText('Begin with practical forms.')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Practice map' })).toBeTruthy();
    expect(screen.getByText('Enabled form scope')).toBeTruthy();
    expect(screen.queryByText('Forms in this workout')).toBeNull();
    expect(screen.queryByText('Next workout')).toBeNull();
    expect(screen.queryByText('Form families')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Practice direction' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Transform' })).toBeNull();
  });

  it('reveals forecast and form-family signals once there is review history', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          ...defaultState(),
          daily: {
            date: localDateKey(),
            count: 5,
            goalHit: false,
            goalStreak: 2,
            bestGoalStreak: 2,
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

    expect(await screen.findByRole('region', { name: 'Practice dashboard' })).toBeTruthy();
    expect(screen.getByText('Start a focused workout.')).toBeTruthy();
    expect(screen.getByText('Next workout')).toBeTruthy();
    expect(screen.getByText('Form families')).toBeTruthy();
  });

  it('shows subgroup weakness rows in the expanded Practice map', async () => {
    const weakWord = {
      dict: '\u66f8\u304f',
      reading: '\u304b\u304f',
      meaning: 'to write',
      group: 'godan',
    };
    let weakness = recordWeaknessAttempt(defaultState().weakness, {
      word: weakWord,
      typeId: 'te-form',
      correct: false,
      responseMs: 9000,
      now: Date.now(),
    });
    weakness = recordWeaknessAttempt(weakness, {
      word: weakWord,
      typeId: 'te-form',
      correct: false,
      responseMs: 8500,
      now: Date.now() + 1,
    });

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: { ...defaultState(), weakness },
        customVerbs: [],
        customAdjectives: [],
        wordLists: [],
        practicePrefs: DEFAULT_PREFS,
      }),
    );

    render(<App />);

    expect(await screen.findByRole('region', { name: 'Practice dashboard' })).toBeTruthy();
    fireEvent.click(screen.getByText('Te-form & Stem'));

    expect(screen.getByText('2/2 enabled')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disable all Te-form & Stem forms' })).toBeTruthy();
    expect(screen.getByText('Recent weak spots')).toBeTruthy();
    expect(screen.getByText('Te-form - Godan ku sound changes')).toBeTruthy();
    expect(screen.getByText('0/2')).toBeTruthy();
  });

  it('does not auto-start a daily drill after today is complete while signed out', async () => {
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

    await screen.findByRole('region', { name: 'Practice dashboard' }, { timeout: 5000 });
    await waitFor(() => {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      expect(raw.practicePrefs.wordListIds || []).not.toContain(TODAY_DRILL_LIST_ID);
    });
    expect(screen.getByRole('button', { name: 'Start workout' })).toBeTruthy();
  });

  it('shows the single Practice flow instead of legacy Study mode controls', async () => {
    render(<App />);
    await startWorkoutFromDashboard();
    expect(await screen.findByText('Form practice', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Practice map' })).toBeTruthy();
    // "Sentence" is now the cued-cloze presentation toggle — a valid review
    // control, not a legacy study-mode button.
    expect(screen.getByRole('button', { name: 'Sentence', exact: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Transform', exact: true })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Study mode' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Practice direction' })).toBeNull();
    expect(screen.getByPlaceholderText(/Type romaji or kana/i)).toBeTruthy();
    expect(screen.queryByText(/Prompt form:/i)).toBeNull();
  }, 15000);

  it('does not show answer-form endings or English meaning before answering', async () => {
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

    await startWorkoutFromDashboard();
    await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    expect(screen.getAllByText(/Tai Past Negative/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/did not want to ~/i)).toBeTruthy();
    expect(screen.queryByText(/to speak/i)).toBeNull();
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

    await startWorkoutFromDashboard();
    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check (Enter)' }));

    await screen.findAllByText('Not quite.', {}, { timeout: 5000 });
    expect(screen.getByText(/Rule:/)).toBeTruthy();
    expect(screen.getByText('Full rule path').closest('details')?.hasAttribute('open')).toBe(false);
    expect(screen.queryByText('Gemini is not configured for AI chat.')).toBeNull();
  }, 15000);

  it('shows correct-answer rationale expanded without a More toggle', async () => {
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
        type: 'plain-past',
        word: {
          dict: '\u8a71\u3059',
          reading: '\u306f\u306a\u3059',
          meaning: 'to speak',
          group: 'godan',
        },
      }),
    );

    render(<App />);

    await startWorkoutFromDashboard();
    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: 'hanashita' } });
    const checkButton = screen.queryByRole('button', { name: 'Check (Enter)' });
    if (checkButton) fireEvent.click(checkButton);

    await screen.findAllByText('Correct!', {}, { timeout: 5000 });
    const rationale = screen.getByText('Why this is right');
    expect(rationale.closest('details')).toBeNull();
    expect(screen.getByText(/Dictionary Form -> Plain Past transformation/)).toBeTruthy();
    expect(screen.queryByText('More')).toBeNull();
  }, 15000);

  it('mounts every tab without hitting the error boundary', async () => {
    render(<App />);
    // Each nav button's accessible name is its catalog label.
    const labels = ['Practice', 'Learn', 'Tools', 'Settings'];
    for (const label of labels) {
      fireEvent.click(screen.getByRole('tab', { name: label, exact: true }));
      // Each view lazy-loads; wait until its chunk resolves (nav stays mounted).
      await waitFor(() => expect(screen.queryByText('Something went wrong')).toBeNull());
      expect(screen.getByRole('tab', { name: label, exact: true })).toBeTruthy();
    }
  });

  it('restores Tools learning and management sections with drill handoffs', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Tools', exact: true }));

    await screen.findByText('Lookup, repair drills, and word management.', {}, { timeout: 5000 });
    expect(screen.getByRole('tab', { name: /^Words/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Lookup \/ Check/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Lists/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Custom words/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^Words/i }));
    expect(await screen.findAllByRole('button', { name: 'Practice now' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^Lookup \/ Check/i }));
    const drillWord = await screen.findByRole('button', { name: 'Drill word' });
    expect(drillWord).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search for a word or conjugation form'), {
      target: { value: 'tabeta' },
    });
    expect(await screen.findByRole('button', { name: 'AI disambiguate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Favorite', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Drill favorites' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy table' })).toBeTruthy();
  }, 15000);

  it('keeps Tools reverse lookup details aligned with the confirmed hit', async () => {
    const savedState = defaultState();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          ...savedState,
          reference: {
            ...savedState.reference,
            selected: {
              dict: '書く',
              reading: 'かく',
              meaning: 'to write',
              group: 'godan',
            },
          },
        },
        customVerbs: [],
        customAdjectives: [],
        wordLists: [],
        practicePrefs: DEFAULT_PREFS,
      }),
    );

    render(<App />);
    await screen.findByRole('region', { name: 'Practice dashboard' }, { timeout: 5000 });
    fireEvent.click(screen.getByRole('tab', { name: 'Tools', exact: true }));

    fireEvent.click(await screen.findByRole('tab', { name: /^Lookup \/ Check/i }));
    expect((await screen.findAllByText('to write')).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Search for a word or conjugation form'), {
      target: { value: '食べました' },
    });

    expect(await screen.findByText('1 hit')).toBeTruthy();
    await waitFor(() => expect(screen.queryAllByText('to write').length).toBe(0));
    expect(screen.getAllByText('to eat').length).toBeGreaterThan(0);
  }, 15000);
});
