// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DEFAULT_PREFS } from '../data/defaults.js';
import { STARTER_ADJECTIVES, STARTER_VERBS } from '../data/starterWords.js';
import { conjugateItem } from '../utils/conjugator.js';
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
    session: { user: { id: 'test-user' } },
    showAuth: vi.fn(),
    hydrated: true,
    ...overrides,
  };
}

function goalHitState() {
  const state = defaultState();
  return {
    ...state,
    daily: {
      ...state.daily,
      count: DEFAULT_PREFS.dailyGoal,
      goalHit: true,
    },
  };
}

function launchedToday(setPracticePrefs) {
  return setPracticePrefs.mock.calls.some(([prefs]) =>
    (prefs?.wordListIds || []).includes(TODAY_DRILL_LIST_ID),
  );
}

class FakeSpeechRecognition {
  static instance = null;

  constructor() {
    FakeSpeechRecognition.instance = this;
    this.continuous = false;
    this.interimResults = false;
    this.lang = '';
    this.maxAlternatives = 1;
  }

  start() {
    this.onstart?.();
  }

  stop() {
    this.onend?.();
  }

  abort() {
    this.onend?.();
  }

  emitFinal(transcript) {
    const result = {
      0: { transcript },
      isFinal: true,
      length: 1,
    };
    this.onresult?.({
      resultIndex: 0,
      results: {
        0: result,
        length: 1,
      },
    });
  }
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
  FakeSpeechRecognition.instance = null;
});

describe('StudyView daily startup guards', () => {
  it('auto-starts today for signed-in learners', async () => {
    const setPracticePrefs = vi.fn();
    const setWordLists = vi.fn();
    mockedApp.value = makeApp({ setPracticePrefs, setWordLists });

    render(<StudyView />);

    await waitFor(() => expect(setWordLists).toHaveBeenCalled());
    expect(launchedToday(setPracticePrefs)).toBe(true);
  });

  it('shows a sign-in bar instead of auto-starting today while signed out', async () => {
    const setPracticePrefs = vi.fn();
    const setWordLists = vi.fn();
    const showAuth = vi.fn();
    mockedApp.value = makeApp({
      session: null,
      setPracticePrefs,
      setWordLists,
      showAuth,
    });

    render(<StudyView />);

    expect(await screen.findByText('Sign in to save SRS progress')).toBeTruthy();
    expect(screen.queryByText('SRS Queue')).toBeNull();
    expect(setWordLists).not.toHaveBeenCalled();
    expect(launchedToday(setPracticePrefs)).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(showAuth).toHaveBeenCalled();
  });

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

  it('ignores a persisted card when its form is no longer enabled', async () => {
    sessionStorage.setItem(
      'jp-study-current',
      JSON.stringify({
        dict: STARTER_VERBS[0].dict,
        group: STARTER_VERBS[0].group,
        type: 'passive',
      }),
    );
    mockedApp.value = makeApp({ state: goalHitState() });

    render(<StudyView />);

    await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    await waitFor(() => {
      const raw = sessionStorage.getItem('jp-study-current');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw).type).not.toBe('passive');
    });
    expect(screen.queryByText('No cards available')).toBeNull();
  });

  it('ignores a persisted card outside the current word list', async () => {
    const staleWord = STARTER_VERBS[0];
    const allowedWord = STARTER_VERBS[1];
    const list = {
      id: 'focused-list',
      name: 'Focused List',
      wordKeys: [`${allowedWord.group}:${allowedWord.dict}`],
    };
    sessionStorage.setItem(
      'jp-study-current',
      JSON.stringify({
        dict: staleWord.dict,
        group: staleWord.group,
        type: 'plain-past',
      }),
    );
    mockedApp.value = makeApp({
      state: goalHitState(),
      allWords: [staleWord, allowedWord],
      practicePrefs: { ...DEFAULT_PREFS, wordListIds: [list.id] },
      wordLists: [list],
    });

    render(<StudyView />);

    await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    await waitFor(() => {
      const raw = sessionStorage.getItem('jp-study-current');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw).dict).toBe(allowedWord.dict);
    });
    expect(screen.queryByText('No cards available')).toBeNull();
  });

  it('restores the exact persisted word when duplicate dictionary entries exist', async () => {
    const baseWord = {
      dict: '開ける',
      reading: 'あける',
      meaning: 'to open',
      group: 'ichidan',
      jlpt: 'N5',
    };
    const exactWord = { ...baseWord, meaning: 'to open (v.t.)' };
    sessionStorage.setItem(
      'jp-study-current',
      JSON.stringify({
        dict: exactWord.dict,
        reading: exactWord.reading,
        meaning: exactWord.meaning,
        group: exactWord.group,
        type: 'polite-present',
      }),
    );
    mockedApp.value = makeApp({
      state: goalHitState(),
      allWords: [baseWord, exactWord],
    });

    render(<StudyView />);

    await screen.findByText('to open (v.t.)', {}, { timeout: 5000 });
    expect(screen.queryByText('No cards available')).toBeNull();
  });

  it('checks a final spoken answer in speak answer mode', async () => {
    window.SpeechRecognition = FakeSpeechRecognition;
    const setState = vi.fn();
    const clearStudyFocus = vi.fn();
    const target = STARTER_VERBS[0];
    const type = 'plain-past';
    mockedApp.value = makeApp({
      setState,
      clearStudyFocus,
      studyFocus: { word: target, type },
      practicePrefs: { ...DEFAULT_PREFS, answerMode: 'speak' },
    });

    render(<StudyView />);

    const mic = await screen.findByRole('button', { name: 'Speak answer' }, { timeout: 5000 });
    fireEvent.click(mic);
    expect(FakeSpeechRecognition.instance?.lang).toBe('ja-JP');

    act(() => {
      FakeSpeechRecognition.instance.emitFinal(conjugateItem(target, type));
    });

    await waitFor(() => expect(setState).toHaveBeenCalled());
    const nextState = setState.mock.calls[0][0];
    expect(nextState.session.reviewed).toBe(1);
    expect(nextState.session.correct).toBe(1);
    expect(screen.getAllByText('Correct!').length).toBeGreaterThan(0);
  });

  it('does not count a corrected mid-type kana mistake when kana assist is off', async () => {
    mockedApp.value = makeApp({
      practicePrefs: {
        ...DEFAULT_PREFS,
        kanaAssist: 'off',
      },
      studyFocus: {
        word: STARTER_VERBS[0],
        type: 'plain-past',
      },
    });

    render(<StudyView />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: 'tadeta' } });
    fireEvent.change(input, { target: { value: 'tabeta' } });

    await waitFor(() => expect(screen.getAllByText('Correct!').length).toBeGreaterThan(0));
    expect(screen.queryByText('Self-corrected.')).toBeNull();
  });
});
