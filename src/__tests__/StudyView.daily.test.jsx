// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { DEFAULT_PREFS } from '../data/defaults.js';
import { STARTER_ADJECTIVES, STARTER_VERBS } from '../data/starterWords.js';
import { conjugateItem, wordKey } from '../utils/conjugator.js';
import { englishForForm } from '../utils/display.js';
import { cardIdFor, defaultState } from '../utils/storage.js';
import { buildTodayDrillPlan, TODAY_DRILL_LIST_ID } from '../utils/todayDrill.js';

const mockedApp = vi.hoisted(() => ({ value: null }));

vi.mock('../state/AppStateContext.jsx', () => ({
  useApp: () => mockedApp.value,
}));

import StudyView from '../views/StudyView.jsx';

function makeApp(overrides = {}) {
  const base = {
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
  const todayDrillActive =
    !base.practicePrefs.minimalPairSetId &&
    !base.practicePrefs.reviewLimitSource &&
    (base.practicePrefs.wordListIds || []).includes(TODAY_DRILL_LIST_ID);
  const todayPlan =
    overrides.todayPlan ||
    buildTodayDrillPlan(base.state, base.allWords, base.practicePrefs, base.wordLists);
  return {
    ...base,
    todayPlan,
    todayDrillActive: overrides.todayDrillActive ?? todayDrillActive,
    srsQueue: overrides.srsQueue || {
      date: base.state.daily.date,
      dueRuleIds: todayDrillActive ? [...(todayPlan.dueRuleIds || [])] : [],
      completedDueRuleIds: [],
      startedAt: todayDrillActive ? Date.now() : null,
    },
    startTodayDrill: overrides.startTodayDrill || vi.fn(() => true),
    markSrsQueueCompleted: overrides.markSrsQueueCompleted || vi.fn(),
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

function stateWithDueRule(ruleId) {
  return {
    ...defaultState(),
    cards: {
      [ruleId]: {
        ease: 2.5,
        interval: 1,
        reps: 1,
        nextReview: 1,
        correct: 0,
        incorrect: 0,
        lastSeen: 0,
      },
    },
  };
}

function todayListFor(word) {
  return {
    id: TODAY_DRILL_LIST_ID,
    name: "Today's Drill",
    wordKeys: [wordKey(word)],
  };
}

function persistStudyCard(word, type) {
  sessionStorage.setItem(
    'jp-study-current',
    JSON.stringify({
      dict: word.dict,
      reading: word.reading,
      meaning: word.meaning,
      group: word.group,
      type,
      word,
    }),
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
    const app = makeApp();
    mockedApp.value = app;

    render(<StudyView />);

    await waitFor(() => expect(app.startTodayDrill).toHaveBeenCalled());
  });

  it('auto-starts today while signed out', async () => {
    const app = makeApp({
      session: null,
    });
    mockedApp.value = app;

    render(<StudyView />);

    await waitFor(() => expect(app.startTodayDrill).toHaveBeenCalled());
  });

  it('does not auto-start today over a focused word launch', async () => {
    const clearStudyFocus = vi.fn();
    const app = makeApp({
      clearStudyFocus,
      studyFocus: {
        word: STARTER_VERBS[0],
        type: 'plain-past',
      },
    });
    mockedApp.value = app;

    render(<StudyView />);

    await waitFor(() => expect(clearStudyFocus).toHaveBeenCalled());
    expect(app.startTodayDrill).not.toHaveBeenCalled();
  });

  it('does not auto-start today over a repair drill', async () => {
    const app = makeApp({
      practicePrefs: {
        ...DEFAULT_PREFS,
        reviewLimit: 10,
        reviewLimitSource: 'repair',
      },
    });
    mockedApp.value = app;

    render(<StudyView />);

    await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    expect(app.startTodayDrill).not.toHaveBeenCalled();
  });

  it('does not auto-start today over a persisted study card', async () => {
    const target = STARTER_VERBS[0];
    sessionStorage.setItem(
      'jp-study-current',
      JSON.stringify({
        dict: target.dict,
        reading: target.reading,
        meaning: target.meaning,
        group: target.group,
        type: 'plain-past',
        word: target,
      }),
    );
    const app = makeApp();
    mockedApp.value = app;

    render(<StudyView />);

    await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    expect(app.startTodayDrill).not.toHaveBeenCalled();
  });

  it('restores a persisted study card when vocabulary metadata changes', async () => {
    const target = STARTER_VERBS[0];
    const refreshedTarget = {
      ...target,
      meaning: `${target.meaning} (refreshed)`,
      jlpt: 'N5',
    };
    sessionStorage.setItem(
      'jp-study-current',
      JSON.stringify({
        dict: target.dict,
        reading: target.reading,
        meaning: target.meaning,
        group: target.group,
        type: 'plain-past',
        word: target,
      }),
    );
    mockedApp.value = makeApp({ allWords: [refreshedTarget, STARTER_VERBS[1]] });

    render(<StudyView />);

    await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    const raw = sessionStorage.getItem('jp-study-current');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw).dict).toBe(target.dict);
  });

  it('hides English meaning and reveal controls while answering by default', async () => {
    const target = STARTER_VERBS[0];
    mockedApp.value = makeApp({
      activeGeminiKey: 'proxy',
      studyFocus: {
        word: target,
        type: 'plain-past',
      },
    });

    render(<StudyView />);

    await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    expect(screen.queryByText(englishForForm(target, 'plain-past'))).toBeNull();
    expect(screen.queryByText('English hint hidden until review.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show hint', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'AI clue', exact: true })).toBeNull();
  });

  it('shows English meaning after review even when default hidden', async () => {
    const target = STARTER_VERBS[0];
    const type = 'plain-past';
    mockedApp.value = makeApp({
      studyFocus: {
        word: target,
        type,
      },
    });

    render(<StudyView />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: conjugateItem(target, type) } });

    await waitFor(() => expect(screen.getAllByText('Correct!').length).toBeGreaterThan(0));
    expect(screen.getByText(englishForForm(target, type))).toBeTruthy();
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
      practicePrefs: { ...DEFAULT_PREFS, englishHints: 'show' },
    });

    render(<StudyView />);

    await screen.findByText('to open (v.t.)', {}, { timeout: 5000 });
    expect(screen.queryByText('No cards available')).toBeNull();
  });

  it('automatically checks a final spoken answer in speak answer mode', async () => {
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

    await screen.findByRole('button', { name: 'Stop listening' }, { timeout: 5000 });
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

  it('controls live kana help from the Study answer box', async () => {
    const target = STARTER_VERBS[0];
    const type = 'plain-past';
    mockedApp.value = makeApp({
      practicePrefs: {
        ...DEFAULT_PREFS,
        kanaAssist: 'off',
      },
      studyFocus: {
        word: target,
        type,
      },
    });

    render(<StudyView />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    const helper = await screen.findByRole('group', { name: 'Live kana help' }, { timeout: 5000 });
    const expectedKana = Array.from(conjugateItem(target, type));
    const firstKana = expectedKana[0];

    fireEvent.click(within(helper).getByRole('button', { name: 'Reveal next kana' }));
    expect(within(helper).getByText(firstKana)).toBeTruthy();
    await waitFor(() => expect(input.value).toBe(firstKana));

    fireEvent.change(input, { target: { value: 'ta' } });
    fireEvent.click(within(helper).getByRole('button', { name: 'Reveal next kana' }));
    await waitFor(() => expect(input.value).toBe(expectedKana.slice(0, 2).join('')));

    fireEvent.click(within(helper).getByRole('button', { name: 'Hide live kana help' }));
    expect(within(helper).getByRole('button', { name: 'Show live kana help' })).toBeTruthy();
    expect(within(helper).queryByText(firstKana)).toBeNull();

    fireEvent.click(within(helper).getByRole('button', { name: 'Show live kana help' }));
    expect(within(helper).getByText(firstKana)).toBeTruthy();
  });

  it('shows a non-spoiler kana preview while typing reading-practice answers', async () => {
    const target = STARTER_VERBS[0];
    mockedApp.value = makeApp({
      practicePrefs: {
        ...DEFAULT_PREFS,
        reviewStyle: 'reading',
      },
      studyFocus: {
        word: target,
        type: 'dictionary',
      },
    });

    render(<StudyView />);

    const input = await screen.findByPlaceholderText(
      /Type dictionary form/i,
      {},
      { timeout: 5000 },
    );
    fireEvent.change(input, { target: { value: 'oki' } });

    const preview = screen.getByRole('status', { name: 'Kana preview' });
    expect(within(preview).getByText('お')).toBeTruthy();
    expect(within(preview).getByText('き')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Live kana help' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reveal next kana' })).toBeNull();
  });

  it('shows SRS queue progress for an active Today drill in the Review flow', async () => {
    const target = STARTER_VERBS[0];
    const type = 'plain-past';
    const dueCardId = cardIdFor(target, type);
    persistStudyCard(target, type);

    mockedApp.value = makeApp({
      state: stateWithDueRule(dueCardId),
      allWords: [target],
      practicePrefs: {
        ...DEFAULT_PREFS,
        wordListIds: [TODAY_DRILL_LIST_ID],
      },
      wordLists: [todayListFor(target)],
    });

    render(<StudyView />);

    expect(await screen.findByText('0/1 due')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Transform' })).toBeNull();
  });

  it('counts a correct Review answer toward the SRS queue and daily progress', async () => {
    const setState = vi.fn();
    const target = STARTER_VERBS[0];
    const type = 'plain-past';
    const dueCardId = cardIdFor(target, type);
    const state = stateWithDueRule(dueCardId);
    const markSrsQueueCompleted = vi.fn();
    persistStudyCard(target, type);

    mockedApp.value = makeApp({
      state,
      setState,
      markSrsQueueCompleted,
      allWords: [target],
      practicePrefs: {
        ...DEFAULT_PREFS,
        wordListIds: [TODAY_DRILL_LIST_ID],
      },
      wordLists: [todayListFor(target)],
    });

    render(<StudyView />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: conjugateItem(target, type) } });

    await waitFor(() => expect(screen.getAllByText('Correct!').length).toBeGreaterThan(0));
    const nextState = setState.mock.calls
      .map(([arg]) => arg)
      .find((arg) => arg && typeof arg === 'object' && arg.session?.reviewed === 1);

    expect(nextState).toBeTruthy();
    expect(nextState.cards[dueCardId].correct).toBe(1);
    expect(nextState.daily.count).toBe(1);
    expect(nextState.transformation.attempted).toBe(0);
    expect(markSrsQueueCompleted).toHaveBeenCalledWith(dueCardId);
  });

  it('checks an exact romaji answer as soon as typing completes it', async () => {
    const setState = vi.fn();
    const target = STARTER_VERBS[0];
    const type = 'plain-past';
    const cardId = cardIdFor(target, type);
    mockedApp.value = makeApp({
      setState,
      allWords: [target],
      studyFocus: {
        word: target,
        type,
      },
    });

    render(<StudyView />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: 'tabet' } });
    expect(setState).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'tabeta' } });
    expect(setState).toHaveBeenCalled();

    const nextState = setState.mock.calls[0][0];
    expect(nextState.session.reviewed).toBe(1);
    expect(nextState.session.correct).toBe(1);
    expect(nextState.cards[cardId].correct).toBe(1);
    expect(screen.getAllByText('Correct!').length).toBeGreaterThan(0);
  });

  it('shows Gemini review help after a correct answer when configured', async () => {
    const target = STARTER_VERBS[0];
    const type = 'plain-past';
    mockedApp.value = makeApp({
      activeGeminiKey: 'proxy',
      studyFocus: {
        word: target,
        type,
      },
    });

    render(<StudyView />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: conjugateItem(target, type) } });

    await waitFor(() => expect(screen.getAllByText('Correct!').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Ask Gemini why').length).toBeGreaterThan(0);
  });

  it('keeps direct kana pending until a miss, then grades retyped kana immediately', async () => {
    mockedApp.value = makeApp({
      practicePrefs: {
        ...DEFAULT_PREFS,
        kanaAssist: 'live',
      },
      studyFocus: {
        word: STARTER_VERBS[0],
        type: 'plain-past',
      },
    });

    const { container } = render(<StudyView />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: 'たべ' } });

    await waitFor(() => {
      expect(container.querySelectorAll('.border-emerald-300').length).toBe(1);
    });

    fireEvent.change(input, { target: { value: 'たなこ' } });
    await waitFor(() => expect(screen.getByText('Kana 2 does not match yet.')).toBeTruthy());

    fireEvent.change(input, { target: { value: 'たべ' } });
    await waitFor(() => {
      expect(container.querySelectorAll('.border-emerald-300').length).toBe(2);
    });
  });

  it('focuses the review advance button without asking the browser to scroll', async () => {
    const originalFocus = window.HTMLButtonElement.prototype.focus;
    const focusSpy = vi.fn();
    window.HTMLButtonElement.prototype.focus = focusSpy;
    mockedApp.value = makeApp({
      studyFocus: {
        word: STARTER_VERBS[0],
        type: 'plain-past',
      },
    });

    try {
      render(<StudyView />);

      const input = await screen.findByPlaceholderText(
        /Type romaji or kana/i,
        {},
        { timeout: 5000 },
      );
      fireEvent.change(input, { target: { value: 'zzzz' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => expect(screen.getAllByText('Not quite.').length).toBeGreaterThan(0));
      await waitFor(() => expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true }));
    } finally {
      window.HTMLButtonElement.prototype.focus = originalFocus;
    }
  });
});
