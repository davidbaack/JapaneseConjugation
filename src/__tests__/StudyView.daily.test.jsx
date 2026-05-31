// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { DEFAULT_PREFS } from '../data/defaults.js';
import { STARTER_ADJECTIVES, STARTER_VERBS } from '../data/starterWords.js';
import { defaultState } from '../utils/storage.js';
import { TODAY_DRILL_LIST_ID } from '../utils/todayDrill.js';

const mockedApp = vi.hoisted(() => ({ value: null }));

vi.mock('../state/AppStateContext.jsx', () => ({
  useApp: () => mockedApp.value,
}));

import StudyView from '../views/StudyView.jsx';

function makeApp(overrides = {}) {
  return {
    state: defaultState(),
    setState: vi.fn(),
    setTab: vi.fn(),
    allWords: [...STARTER_VERBS, ...STARTER_ADJECTIVES],
    activeGeminiKey: '',
    practicePrefs: DEFAULT_PREFS,
    setPracticePrefs: vi.fn(),
    wordLists: [],
    setWordLists: vi.fn(),
    studyFocus: null,
    clearStudyFocus: vi.fn(),
    hydrated: true,
    ...overrides,
  };
}

function launchedToday(setPracticePrefs) {
  return setPracticePrefs.mock.calls.some(([prefs]) =>
    (prefs?.wordListIds || []).includes(TODAY_DRILL_LIST_ID),
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('StudyView daily startup guards', () => {
  it('does not auto-start today over a focused word launch', async () => {
    const setPracticePrefs = vi.fn();
    const setWordLists = vi.fn();
    const clearStudyFocus = vi.fn();
    mockedApp.value = makeApp({
      setPracticePrefs,
      setWordLists,
      clearStudyFocus,
      studyFocus: {
        word: STARTER_VERBS[0],
        type: 'plain-past',
      },
    });

    render(<StudyView />);

    await waitFor(() => expect(clearStudyFocus).toHaveBeenCalled());
    expect(setWordLists).not.toHaveBeenCalled();
    expect(launchedToday(setPracticePrefs)).toBe(false);
  });

  it('does not auto-start today over a repair drill', async () => {
    const setPracticePrefs = vi.fn();
    const setWordLists = vi.fn();
    mockedApp.value = makeApp({
      setPracticePrefs,
      setWordLists,
      practicePrefs: {
        ...DEFAULT_PREFS,
        reviewLimit: 10,
        reviewLimitSource: 'repair',
      },
    });

    render(<StudyView />);

    await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    expect(setWordLists).not.toHaveBeenCalled();
    expect(launchedToday(setPracticePrefs)).toBe(false);
  });
});
