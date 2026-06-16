// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';

// No Supabase configured in tests → auth/sync effects no-op (offline-first path).
vi.mock('../utils/supabase.js', () => ({ supabase: null }));

globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();

import App from '../App.jsx';
import { DEFAULT_PREFS, STORAGE_KEY } from '../data/defaults.js';
import { STARTER_VERBS } from '../data/starterWords.js';
import { cardIdFor, defaultState, localDateKey } from '../utils/storage.js';
import { recordWeaknessAttempt } from '../utils/subcategoryWeakness.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '';
});

async function waitForPracticeCard() {
  return screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
}

describe('App shell', () => {
  it('renders the header, subtitle, and restored nav', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Katachiya/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Conjugation Practice/ })).toBeTruthy();
    // Nav labels (accessible name is the catalog string; CSS only capitalizes).
    for (const label of ['Practice', 'Guide', 'Stats', 'Learn', 'Drills', 'Tools', 'Settings']) {
      expect(screen.getByRole('tab', { name: label, exact: true })).toBeTruthy();
    }
  });

  it('lazy-loads directly into continuous Practice for a brand-new learner', async () => {
    render(<App />);
    expect(await waitForPracticeCard()).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Practice map' })).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Focus map' })).toBeNull();
    expect(screen.getByText('Practice categories')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Turn Plain forms on' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Turn Polite forms on' })).toBeTruthy();
    expect(screen.getAllByText('Not introduced').length).toBeGreaterThan(0);
    expect(screen.queryByText('No reps yet')).toBeNull();
    expect(screen.queryByText('Untested')).toBeNull();
    expect(screen.getByText('Practice run')).toBeTruthy();
    expect(screen.getByText('0 cards')).toBeTruthy();
    expect(screen.getByText('0 right')).toBeTruthy();
    expect(screen.getByText('0 wrong')).toBeTruthy();
    expect(screen.getByText('0 streak')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
    expect(screen.queryByText('Next workout')).toBeNull();
    expect(screen.queryByText('Form families')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Practice direction' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Transform' })).toBeNull();
  });

  it('shows forecast and form-family signals in the Stats tab', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          ...defaultState(),
          cards: {
            [cardIdFor(STARTER_VERBS[0], 'plain-past')]: { correct: 7, incorrect: 3 },
            [cardIdFor(STARTER_VERBS[1], 'plain-negative')]: { correct: 2, incorrect: 1 },
          },
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

    expect(await waitForPracticeCard()).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Stats', exact: true }));
    expect(await screen.findByRole('region', { name: 'Stats dashboard' })).toBeTruthy();
    expect(screen.getByText('Practice pulse.')).toBeTruthy();
    expect(screen.getByText('Accuracy')).toBeTruthy();
    expect(screen.getByText('69%')).toBeTruthy();
    expect(screen.getByText('9 right / 4 wrong lifetime')).toBeTruthy();
    expect(screen.getByText('Upcoming reviews')).toBeTruthy();
    expect(screen.getByText('Form families')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
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

    expect(await waitForPracticeCard()).toBeTruthy();
    const practiceMap = () => screen.getByRole('complementary', { name: 'Practice map' });
    const teTaDetailsButton = () =>
      within(practiceMap()).getByRole('button', {
        name: 'Te/Ta Sound Changes category details',
      });

    fireEvent.click(teTaDetailsButton());
    expect(teTaDetailsButton().getAttribute('aria-expanded')).toBe('true');

    expect(within(practiceMap()).getByText('2/2 forms on')).toBeTruthy();
    expect(within(practiceMap()).getByText('Needs review')).toBeTruthy();
    expect(within(practiceMap()).getByText('0 right / 2 wrong lifetime')).toBeTruthy();
    expect(within(practiceMap()).getByText('Needs review')).toBeTruthy();
    expect(within(practiceMap()).getByText('Gathering data')).toBeTruthy();
    expect(
      within(practiceMap()).getByRole('button', { name: 'Turn Te/Ta Sound Changes focus off' }),
    ).toBeTruthy();
    expect(within(practiceMap()).getByText('Recent weak spots')).toBeTruthy();
    expect(within(practiceMap()).getByText('Te-form - Godan ku sound changes')).toBeTruthy();
    expect(within(practiceMap()).getByText('0/2')).toBeTruthy();

    fireEvent.click(within(practiceMap()).getByRole('button', { name: /^Te-form/i }));
    await waitFor(() => expect(within(practiceMap()).getByText('1/2 forms on')).toBeTruthy());
    expect(teTaDetailsButton().getAttribute('aria-expanded')).toBe('true');
    expect(within(practiceMap()).getByText('Recent weak spots')).toBeTruthy();
  });

  it('introduces a disabled Practice map family with a primer and small focused set', async () => {
    render(<App />);

    expect(await waitForPracticeCard()).toBeTruthy();
    const practiceMap = () => screen.getByRole('complementary', { name: 'Practice map' });
    expect(
      within(practiceMap()).queryByRole('button', { name: 'Enable all Passive forms' }),
    ).toBeNull();

    fireEvent.click(
      within(practiceMap()).getByRole('button', { name: 'Introduce Passive family' }),
    );

    expect(await screen.findByText('Family primer')).toBeTruthy();
    expect(screen.getByText('4-card guided set')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Intro progress' })).toBeTruthy();
    expect(within(practiceMap()).getByText('4/10 forms on')).toBeTruthy();

    const primer = screen.getByRole('region', { name: 'Passive primer' });
    expect(within(primer).getByText('Passive Polite Negative')).toBeTruthy();
    expect(within(primer).queryByText('Passive Polite Past')).toBeNull();
  });

  it('keeps continuous Practice available after old daily goal data is complete', async () => {
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

    await waitForPracticeCard();
    expect(screen.getByText('Practice run')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
  });

  it('shows the single Practice flow instead of legacy Study mode controls', async () => {
    render(<App />);
    await waitForPracticeCard();
    const settingsButton = await screen.findByRole(
      'button',
      { name: 'Practice run settings' },
      { timeout: 5000 },
    );
    expect(settingsButton).toBeTruthy();
    expect(screen.getByText('Practice run')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Practice map' })).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Focus map' })).toBeNull();
    expect(screen.getByText('52 forms on')).toBeTruthy();
    // "Sentence" is now the cued-cloze presentation toggle: a valid review
    // control, not a legacy study-mode button.
    expect(screen.queryByRole('button', { name: 'Sentence off', exact: true })).toBeNull();
    fireEvent.click(settingsButton);
    expect(screen.getByRole('button', { name: 'Sentence off', exact: true })).toBeTruthy();
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

    await waitForPracticeCard();
    await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    expect(screen.getAllByText(/Tai Past Negative/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/did not want to ~/i)).toBeTruthy();
    expect(screen.queryByText(/to speak/i)).toBeNull();
    expect(screen.queryByText(/did not want to speak/i)).toBeNull();
  }, 15000);

  it('keeps deep answer teaching inline after an incorrect miss', async () => {
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

    await waitForPracticeCard();
    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check (Enter)' }));

    const verdictStatus = await screen.findAllByText('Not quite.', {}, { timeout: 5000 });
    expect(verdictStatus).toHaveLength(1);
    expect(screen.getByText('Review this form.')).toBeTruthy();
    expect(screen.getByText('Walk through this form in Guide')).toBeTruthy();
    expect(screen.getByText(/Drills this same word and target form/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Guide for this rule' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next (Enter)' })).toBeNull();
    // Typed misses show the consolidated rich top (kanji + coach diff), not the
    // redundant plain-text "Compare your answer" grid (kept only for non-typed cards).
    expect(screen.queryByText('Compare your answer')).toBeNull();
    expect(screen.getAllByText('Correct Answer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Your Answer').length).toBeGreaterThan(0);
    expect(screen.getByText(/Rule:/)).toBeTruthy();
    const fullBreakdown = screen.getByText('Full breakdown').closest('section');
    expect(fullBreakdown).toBeTruthy();
    expect(fullBreakdown.tagName.toLowerCase()).toBe('section');
    expect(within(fullBreakdown).queryByText('More')).toBeNull();
    expect(screen.getByText('1. What category is this and why?').closest('summary')).toBeNull();
    expect(within(fullBreakdown).getByText('Visual Rule Path')).toBeTruthy();
    expect(screen.queryByText('Answer breakdown')).toBeNull();
    expect(screen.queryByText('Gemini is not configured for AI chat.')).toBeNull();
  }, 15000);

  it('opens a focused Guide for the same missed form', async () => {
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

    const input = await waitForPracticeCard();
    fireEvent.change(input, { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check (Enter)' }));
    expect(await screen.findByText('Review this form.')).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: 'Open Guide for this rule' }));
    expect(await screen.findByText('Focused Guide')).toBeTruthy();
    expect(screen.getByText(/Step through the same form from your Practice answer/)).toBeTruthy();
    expect(screen.getAllByText('Plain Negative').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\u8a71\u3059/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Exit focus' })).toBeTruthy();
  }, 15000);

  it('returns from Learn to the same missed Practice card and offers focused follow-ups', async () => {
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
        dict: '\u98df\u3079\u308b',
        group: 'ichidan',
        type: 'plain-past',
        word: {
          dict: '\u98df\u3079\u308b',
          reading: '\u305f\u3079\u308b',
          meaning: 'to eat',
          group: 'ichidan',
        },
      }),
    );

    render(<App />);

    const input = await waitForPracticeCard();
    fireEvent.change(input, { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check (Enter)' }));
    expect(await screen.findByText('Review this form.')).toBeTruthy();

    fireEvent.click(
      await screen.findByRole('button', { name: 'I forgot this' }, { timeout: 5000 }),
    );
    expect(await screen.findByText('From your Practice card')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guide this form' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Practice this form' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Practice this form' }));
    expect(await screen.findByText('Learn focus')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Plain Past Practice/i })).toBeTruthy();
    expect(screen.getByText(/Locked Practice set/)).toBeTruthy();
  }, 15000);

  it('opens the exact Learn lesson from Teach me this rule and focuses it', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          ...defaultState(),
          enabledTypes: ['imperative'],
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
        type: 'imperative',
        word: {
          dict: '\u8a71\u3059',
          reading: '\u306f\u306a\u3059',
          meaning: 'to speak',
          group: 'godan',
        },
      }),
    );
    globalThis.HTMLElement.prototype.scrollIntoView.mockClear();

    render(<App />);

    const input = await waitForPracticeCard();
    fireEvent.change(input, { target: { value: 'hanase' } });
    const checkButton = screen.queryByRole('button', { name: 'Check (Enter)' });
    if (checkButton) fireEvent.click(checkButton);
    await screen.findAllByText('Correct!', {}, { timeout: 5000 });

    globalThis.HTMLElement.prototype.scrollIntoView.mockClear();
    fireEvent.click(await screen.findByRole('button', { name: 'Teach me this rule' }));

    expect(await screen.findByText('From your Practice card')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Learn', selected: true })).toBeTruthy();
    expect(
      screen.getByRole('heading', {
        name: 'Commands, Requests, Permission, Obligation',
      }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guide this form' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Practice this form' })).toBeTruthy();

    const lesson = document.getElementById('lesson-commands-requests');
    expect(lesson).toBeTruthy();
    await waitFor(() => {
      expect(globalThis.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      });
      expect(document.activeElement).toBe(lesson);
    });
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

    await waitForPracticeCard();
    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: 'hanashita' } });
    const checkButton = screen.queryByRole('button', { name: 'Check (Enter)' });
    if (checkButton) fireEvent.click(checkButton);

    await screen.findAllByText('Correct!', {}, { timeout: 5000 });
    const rationale = screen.getByText('Answer breakdown');
    expect(rationale.closest('details')).toBeNull();
    expect(screen.getByText('Visual Rule Path')).toBeTruthy();
    expect(screen.getByText('From polite/masu stem')).toBeTruthy();
    expect(screen.queryByText('More')).toBeNull();
    expect(screen.getByText('Walk through this form in Guide')).toBeTruthy();
    expect(screen.getByText(/Drills this same word and target form/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next card' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open Guide for this rule' }));
    expect(await screen.findByText('Focused Guide')).toBeTruthy();
    expect(screen.getByText(/Step through the same form from your Practice answer/)).toBeTruthy();
    expect(screen.getAllByText('Plain Past').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\u8a71\u3059/).length).toBeGreaterThan(0);
  }, 15000);

  it('mounts every tab without hitting the error boundary', async () => {
    render(<App />);
    // Each nav button's accessible name is its catalog label.
    const labels = ['Practice', 'Guide', 'Stats', 'Learn', 'Drills', 'Tools', 'Settings'];
    for (const label of labels) {
      fireEvent.click(screen.getByRole('tab', { name: label, exact: true }));
      // Each view lazy-loads; wait until its chunk resolves (nav stays mounted).
      await waitFor(() => expect(screen.queryByText('Something went wrong')).toBeNull());
      expect(screen.getByRole('tab', { name: label, exact: true })).toBeTruthy();
    }
  });

  it('opens Formation keys with a highlighted godan row-map cell from the hash', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Learn', exact: true }));
    expect(
      await screen.findByRole('heading', { name: /Conjugation formation guide/ }),
    ).toBeTruthy();

    window.location.hash = 'formation-keys?ending=%E3%82%80&row=a-row';
    window.dispatchEvent(new Event('hashchange'));

    expect(await screen.findByRole('table', { name: 'Godan row map' })).toBeTruthy();
    expect(screen.getByText(/Highlighted shift:/).textContent).toContain('む -> ま');
    expect(screen.getByTestId('godan-row-む-a-row').getAttribute('aria-current')).toBe('true');
  });

  it('opens Guide and submits a completed assisted guide card', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Guide', exact: true }));

    expect(await screen.findByText('Build the conjugation step by step.')).toBeTruthy();
    const skipButtons = await screen.findAllByRole('button', { name: 'Skip' });
    for (const button of skipButtons) fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Submit guide card' }));

    expect(await screen.findAllByText(/assisted/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next card' })).toBeTruthy();
  });

  it('hides Guide prompt English meaning before submitting by default', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          ...defaultState(),
          enabledTypes: ['plain-past'],
        },
        customVerbs: [],
        customAdjectives: [],
        wordLists: [],
        practicePrefs: DEFAULT_PREFS,
      }),
    );

    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Guide', exact: true }));

    expect(await screen.findByText('Build the conjugation step by step.')).toBeTruthy();
    expect(
      screen.queryByText((content) => content.includes(' · ') && content.split(' · ').length === 3),
    ).toBeNull();
  });

  it('shows Guide prompt English meaning when the setting is enabled', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          ...defaultState(),
          enabledTypes: ['plain-past'],
        },
        customVerbs: [],
        customAdjectives: [],
        wordLists: [],
        practicePrefs: { ...DEFAULT_PREFS, englishHints: 'show' },
      }),
    );

    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Guide', exact: true }));

    expect(await screen.findByText('Build the conjugation step by step.')).toBeTruthy();
    expect(
      screen.getByText((content) => content.includes(' · ') && content.split(' · ').length === 3),
    ).toBeTruthy();
  });

  it('keeps Tools focused on lookup, check, and word management', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Tools', exact: true }));

    await screen.findByText(
      'Lookup, check, word lists, and word management.',
      {},
      { timeout: 5000 },
    );
    expect(screen.getByRole('tab', { name: /^Words/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Lookup/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Check/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Lists/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Custom words/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /^Ending Lab/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /^Groups/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /^Rush/i })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /^Words/i }));
    expect(await screen.findAllByRole('button', { name: 'Practice now' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^Lookup/i }));
    const drillWord = await screen.findByRole('button', { name: 'Drill word' });
    expect(drillWord).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search for a word or conjugation form'), {
      target: { value: 'taberu' },
    });
    expect(await screen.findByRole('button', { name: 'AI disambiguate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Favorite', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Drill favorites' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy table' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^Check/i }));
    expect(await screen.findByText('Check a conjugation')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/tabeta/i), { target: { value: 'tabeta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check', exact: true }));
    expect(await screen.findByText('Correct conjugation')).toBeTruthy();
  }, 15000);

  it('shows secondary right Check matches without expanding close matches', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: defaultState(),
        customVerbs: [
          {
            dict: '\u67b6\u304f',
            reading: '\u304b\u304f',
            meaning: 'fixture bridge',
            group: 'godan',
          },
          {
            dict: '\u61f8\u304f',
            reading: '\u304b\u304f',
            meaning: 'fixture hang',
            group: 'godan',
          },
        ],
        customAdjectives: [],
        wordLists: [],
        practicePrefs: DEFAULT_PREFS,
      }),
    );

    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Tools', exact: true }));
    fireEvent.click(await screen.findByRole('tab', { name: /^Check/i }));
    fireEvent.change(screen.getByPlaceholderText(/tabeta/i), {
      target: { value: '\u304b\u304b\u306a\u3044' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check', exact: true }));

    expect(await screen.findByText('Correct conjugation')).toBeTruthy();
    const rightHeading = await screen.findByText('Other right answers');
    const rightSection = rightHeading.closest('section');
    expect(rightSection).toBeTruthy();
    expect(rightSection.closest('details')).toBeNull();
    expect(within(rightSection).getAllByText('Right').length).toBeGreaterThanOrEqual(2);
    expect(within(rightSection).getByText('fixture bridge')).toBeTruthy();
    expect(within(rightSection).getByText('fixture hang')).toBeTruthy();

    const closeMatches = screen.getByText('Other close matches').closest('details');
    expect(closeMatches).toBeTruthy();
    expect(closeMatches.open).toBe(false);
    expect(within(closeMatches).getAllByText('Wrong').length).toBeGreaterThan(0);
  }, 15000);

  it('exposes practice exercises in the Drills tab', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Drills', exact: true }));

    await screen.findByText(
      'Focused exercises for endings, transformations, groups, and speed.',
      {},
      { timeout: 5000 },
    );
    expect(screen.getByRole('tab', { name: /^Ending Lab/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Transform/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Groups/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Rush/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /^Check/i })).toBeNull();

    expect(await screen.findByRole('heading', { name: 'Ending Lab' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^Transform/i }));
    expect(await screen.findByText(/Conjugate to/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^Groups/i }));
    expect(await screen.findByText('Classification drill')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^Rush/i }));
    expect(await screen.findAllByText('Kotoba Rush')).toBeTruthy();
  }, 15000);

  it('starts Learn practice tracks as focused Practice sessions', async () => {
    render(<App />);
    expect(await waitForPracticeCard()).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Learn', exact: true }));
    const trackButtons = await screen.findAllByRole('button', { name: 'Practice track' });
    fireEvent.click(trackButtons[0]);

    expect(await screen.findByText('Learn focus')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Beginner track Practice/i })).toBeTruthy();
    expect(screen.getByText(/Locked Practice set/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exit focus' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to Stats' })).toBeNull();
  }, 15000);

  it('starts Lookup Drill word as focused word Practice', async () => {
    render(<App />);
    expect(await waitForPracticeCard()).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Tools', exact: true }));
    fireEvent.click(await screen.findByRole('tab', { name: /^Lookup/i }));
    fireEvent.change(screen.getByLabelText('Search for a word or conjugation form'), {
      target: { value: 'taberu' },
    });
    expect(await screen.findAllByText('to eat')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Drill word' }));

    expect(await screen.findByText('Reference drill')).toBeTruthy();
    expect(screen.getByText(/Word focus/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to reference' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to Stats' })).toBeNull();
  }, 15000);

  it('starts Lookup Drill enabled forms as a word form sweep', async () => {
    render(<App />);
    expect(await waitForPracticeCard()).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Tools', exact: true }));
    fireEvent.click(await screen.findByRole('tab', { name: /^Lookup/i }));
    fireEvent.change(screen.getByLabelText('Search for a word or conjugation form'), {
      target: { value: 'taberu' },
    });
    expect(await screen.findAllByText('to eat')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Drill enabled forms' }));

    expect(await screen.findByText('Word form sweep')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /食べる/ })).toBeTruthy();
    const progress = screen.getByRole('progressbar', { name: 'Enabled forms progress' });
    expect(Number(progress.getAttribute('aria-valuemax'))).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: 'Back to reference' })).toBeTruthy();
  }, 15000);

  it('does not offer Drill enabled forms for unmatched scratch lookup words', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Tools', exact: true }));
    fireEvent.click(await screen.findByRole('tab', { name: /^Lookup/i }));
    fireEvent.change(screen.getByLabelText('Search for a word or conjugation form'), {
      target: { value: 'みらる' },
    });

    expect((await screen.findAllByText(/Local/)).length).toBeGreaterThan(0);
    expect(
      screen.getByText('No local form match yet. Try a dictionary form or romaji.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Scanner/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Drill enabled forms' })).toBeNull();
  }, 15000);

  it('recognizes conversational 食べれる in Check without guessing 滑る', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Tools', exact: true }));

    fireEvent.click(await screen.findByRole('tab', { name: /^Check/i }));
    fireEvent.change(screen.getByPlaceholderText(/tabeta/i), {
      target: { value: '\u98df\u3079\u308c\u308b' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check', exact: true }));

    expect(await screen.findByText('Correct conjugation')).toBeTruthy();
    expect(
      screen.getAllByText(/Recognized 食べれる as conversational ら-dropping potential/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Practice this form' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show full word reference' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hide full word reference' })).toBeNull();
    expect(screen.queryByText(/滑る/)).toBeNull();
    expect(screen.queryByText('Not quite')).toBeNull();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  }, 15000);

  it('recognizes conversational 食べれる in Lookup without showing scratch forms', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Tools', exact: true }));
    fireEvent.click(await screen.findByRole('tab', { name: /^Lookup/i }));
    fireEvent.change(screen.getByLabelText('Search for a word or conjugation form'), {
      target: { value: '\u98df\u3079\u308c\u308b' },
    });

    expect(await screen.findByText('1 hit')).toBeTruthy();
    expect(screen.getAllByText('Focused lookup hit').length).toBe(1);
    expect(screen.getAllByText('variant').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Practice this form' })).toBeTruthy();
    const referenceDetails = screen.getByText('Show full word reference').closest('details');
    expect(referenceDetails).toBeTruthy();
    expect(referenceDetails.open).toBe(false);
    expect(
      screen.getAllByText(/Recognized 食べれる as conversational ら-dropping potential/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Scratch conjugator')).toBeNull();
    expect(screen.queryByText(/お食べれ/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Drill enabled forms' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy table' })).toBeNull();
  }, 15000);

  it('shows a focused Lookup hit for polite past before the full reference table', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Tools', exact: true }));
    fireEvent.click(await screen.findByRole('tab', { name: /^Lookup/i }));
    fireEvent.change(screen.getByLabelText('Search for a word or conjugation form'), {
      target: { value: '\u98df\u3079\u307e\u3057\u305f' },
    });

    expect(await screen.findByText('1 hit')).toBeTruthy();
    expect(screen.getAllByText('Focused lookup hit').length).toBe(1);
    expect(screen.getAllByText('Polite Past').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Practice this form' })).toBeTruthy();
    const referenceDetails = screen.getByText('Show full word reference').closest('details');
    expect(referenceDetails).toBeTruthy();
    expect(referenceDetails.open).toBe(false);
    expect(screen.queryByRole('button', { name: 'Drill enabled forms' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy table' })).toBeNull();
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
    await waitForPracticeCard();
    fireEvent.click(screen.getByRole('tab', { name: 'Tools', exact: true }));

    fireEvent.click(await screen.findByRole('tab', { name: /^Lookup/i }));
    expect((await screen.findAllByText('to write')).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Search for a word or conjugation form'), {
      target: { value: '\u98df\u3079\u307e\u3057\u305f' },
    });

    expect(await screen.findByText('1 hit')).toBeTruthy();
    await waitFor(() => expect(screen.queryAllByText('to write').length).toBe(0));
    expect(screen.getAllByText('to eat').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Search for a word or conjugation form'), {
      target: { value: 'plus' },
    });

    expect(await screen.findByText('no exact hit')).toBeTruthy();
    await waitFor(() => expect(screen.queryAllByText('to eat').length).toBe(0));
    expect(screen.queryByText('Plus (math operator)')).toBeNull();
  }, 15000);
});
