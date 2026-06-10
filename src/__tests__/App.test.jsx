// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';

// No Supabase configured in tests → auth/sync effects no-op (offline-first path).
vi.mock('../utils/supabase.js', () => ({ supabase: null }));

globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();

import App from '../App.jsx';
import { DEFAULT_PREFS, STORAGE_KEY } from '../data/defaults.js';
import { defaultState, localDateKey } from '../utils/storage.js';
import { recordWeaknessAttempt } from '../utils/subcategoryWeakness.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
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
    expect(screen.getByRole('complementary', { name: 'Focus map' })).toBeTruthy();
    expect(screen.getByText('Category progress')).toBeTruthy();
    expect(screen.getByText('Practice categories')).toBeTruthy();
    expect(screen.getByText('Toggle categories for continuous Practice.')).toBeTruthy();
    expect(screen.getAllByText('No reps yet').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Untested').length).toBeGreaterThan(0);
    expect(screen.getByText('Practice run')).toBeTruthy();
    expect(screen.getByText('0 cards · 0 missed · 0 streak')).toBeTruthy();
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

    expect(within(practiceMap()).getByText('2/2 saved')).toBeTruthy();
    expect(within(practiceMap()).getByText('0 right / 2 wrong')).toBeTruthy();
    expect(within(practiceMap()).getByText('Gathering data')).toBeTruthy();
    expect(
      within(practiceMap()).getByRole('button', { name: 'Disable all Te/Ta Sound Changes forms' }),
    ).toBeTruthy();
    expect(within(practiceMap()).getByText('Recent weak spots')).toBeTruthy();
    expect(within(practiceMap()).getByText('Te-form - Godan ku sound changes')).toBeTruthy();
    expect(within(practiceMap()).getByText('0/2')).toBeTruthy();

    fireEvent.click(within(practiceMap()).getByRole('button', { name: /^Te-form/i }));
    await waitFor(() => expect(within(practiceMap()).getByText('1/2 saved')).toBeTruthy());
    expect(teTaDetailsButton().getAttribute('aria-expanded')).toBe('true');
    expect(within(practiceMap()).getByText('Recent weak spots')).toBeTruthy();
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
    expect(await screen.findByText('Practice run', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Practice map' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Focus map' })).toBeTruthy();
    expect(screen.getByText('52 saved forms')).toBeTruthy();
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

    await waitForPracticeCard();
    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check (Enter)' }));

    const verdictStatus = await screen.findAllByText('Not quite.', {}, { timeout: 5000 });
    expect(verdictStatus).toHaveLength(1);
    expect(screen.getByText('Review this form.')).toBeTruthy();
    const nextButtons = screen.getAllByRole('button', { name: 'Next (Enter)' });
    expect(nextButtons).toHaveLength(2);
    for (const button of nextButtons) expect(button.closest('.sticky')).toBeNull();
    // Typed misses show the consolidated rich top (kanji + coach diff), not the
    // redundant plain-text "Compare your answer" grid (kept only for non-typed cards).
    expect(screen.queryByText('Compare your answer')).toBeNull();
    expect(screen.getAllByText('Correct Answer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Your Answer').length).toBeGreaterThan(0);
    expect(screen.getByText(/Rule:/)).toBeTruthy();
    expect(screen.getByText('Answer breakdown').closest('details')).toBeNull();
    expect(screen.getByText('1. What category is this and why?')).toBeTruthy();
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
      target: { value: 'tabeta' },
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
      target: { value: 'tabeta' },
    });
    expect(await screen.findByText('1 hit')).toBeTruthy();
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
      target: { value: 'tabeta' },
    });
    expect(await screen.findByText('1 hit')).toBeTruthy();
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
      screen.getByText(/Recognized 食べれる as conversational ら-dropping potential/),
    ).toBeTruthy();
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
    expect(screen.getByText('variant')).toBeTruthy();
    expect(
      screen.getByText(/Recognized 食べれる as conversational ら-dropping potential/),
    ).toBeTruthy();
    expect(screen.queryByText('Scratch conjugator')).toBeNull();
    expect(screen.queryByText(/お食べれ/)).toBeNull();
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
      target: { value: '食べました' },
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
