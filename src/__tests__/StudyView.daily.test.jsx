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
    openLabTool: vi.fn(),
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

async function waitForPracticeCard() {
  return screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
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
  vi.useRealTimers();
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
  FakeSpeechRecognition.instance = null;
});

describe('StudyView continuous Practice startup', () => {
  it('opens continuous Practice for signed-in learners', async () => {
    const app = makeApp();
    mockedApp.value = app;

    render(<StudyView />);

    expect(await waitForPracticeCard()).toBeTruthy();
    expect(screen.getByText('Practice run')).toBeTruthy();
    expect(screen.getByText('0 cards · 0 missed · 0 streak')).toBeTruthy();
    expect(screen.getByText('New enabled form.')).toBeTruthy();
    expect(screen.queryByRole('progressbar', { name: 'Session cards' })).toBeNull();
    expect(app.startTodayDrill).not.toHaveBeenCalled();
  });

  it('opens continuous Practice while signed out', async () => {
    const app = makeApp({
      session: null,
    });
    mockedApp.value = app;

    render(<StudyView />);

    expect(await waitForPracticeCard()).toBeTruthy();
    expect(screen.getByText('Practice run')).toBeTruthy();
    expect(screen.getByText('0 cards · 0 missed · 0 streak')).toBeTruthy();
    expect(app.startTodayDrill).not.toHaveBeenCalled();
  });

  it('returns to Stats from an active card', async () => {
    const target = STARTER_VERBS[0];
    persistStudyCard(target, 'plain-past');
    const app = makeApp();
    mockedApp.value = app;

    render(<StudyView />);

    await waitForPracticeCard();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Stats' }));
    expect(app.setTab).toHaveBeenCalledWith('stats');
  });

  it('surfaces answer style and kana help controls on the Practice card', async () => {
    const setPracticePrefs = vi.fn();
    mockedApp.value = makeApp({
      setPracticePrefs,
      studyFocus: {
        word: STARTER_VERBS[0],
        type: 'plain-past',
      },
    });

    render(<StudyView />);

    await waitForPracticeCard();
    const answerStyle = within(screen.getByRole('group', { name: 'Answer style' }));
    expect(answerStyle.getByRole('button', { name: 'Type' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    fireEvent.click(answerStyle.getByRole('button', { name: 'Choose' }));
    const answerUpdater = setPracticePrefs.mock.calls.at(-1)[0];
    expect(answerUpdater({ ...DEFAULT_PREFS }).answerMode).toBe('choice');

    const kanaToggle = screen.getByRole('button', { name: 'Kana help on' });
    expect(kanaToggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(kanaToggle);
    const kanaUpdater = setPracticePrefs.mock.calls.at(-1)[0];
    expect(kanaUpdater({ ...DEFAULT_PREFS }).kanaAssist).toBe('off');

    const autoNextToggle = screen.getByRole('button', { name: 'Auto next off' });
    expect(autoNextToggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(autoNextToggle);
    const autoNextUpdater = setPracticePrefs.mock.calls.at(-1)[0];
    expect(autoNextUpdater({ ...DEFAULT_PREFS })).toMatchObject({
      autoAdvanceCorrect: true,
      autoAdvanceCorrectUserSet: true,
      autoAdvanceCorrectByAnswerForm: { 'input-live': true },
    });
  });

  it('offers an Overview return path from a focused (special) session', async () => {
    const app = makeApp({ studyFocus: { word: STARTER_VERBS[0], type: 'plain-past' } });
    // Consuming the focus clears it in the real provider; mirror that so the
    // dashboard can re-render once the focus lock is released.
    app.clearStudyFocus = vi.fn(() => {
      app.studyFocus = null;
    });
    mockedApp.value = app;

    render(<StudyView />);

    // A focus launch is a "special" session: it leads with a title banner and
    // exits the locked focus through that banner rather than the generic
    // "Back to Stats" header button.
    await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: 'Exit focus' }));

    expect(app.setTab).toHaveBeenCalledWith('stats');
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

  it('does not auto-start today for stale repair launch prefs', async () => {
    const app = makeApp({
      practicePrefs: {
        ...DEFAULT_PREFS,
        reviewLimit: 10,
        reviewLimitSource: 'repair',
      },
    });
    mockedApp.value = app;

    render(<StudyView />);

    await waitForPracticeCard();
    expect(screen.queryByText('No cards available')).toBeNull();
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

    await waitForPracticeCard();
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

    await waitForPracticeCard();
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
        type: 'short-causative-passive-polite-past-negative',
      }),
    );
    mockedApp.value = makeApp({ state: goalHitState() });

    render(<StudyView />);

    await waitForPracticeCard();
    await waitFor(() => {
      const raw = sessionStorage.getItem('jp-study-current');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw).type).not.toBe('short-causative-passive-polite-past-negative');
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

    await waitForPracticeCard();
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

    await waitForPracticeCard();
    await screen.findByText('to open (v.t.)', {}, { timeout: 5000 });
    expect(screen.queryByText('No cards available')).toBeNull();
  });

  it('does not treat a retired repair list as a persisted special launch', async () => {
    // Retired repair-drill prefs can remain in older storage. They should not
    // launch a fresh Today drill now that generic repair drills are retired.
    const target = STARTER_VERBS[0];
    mockedApp.value = makeApp({
      state: defaultState(),
      allWords: [target],
      wordLists: [{ id: 'repair-drill', name: 'Repair', wordKeys: [wordKey(target)] }],
      practicePrefs: {
        ...DEFAULT_PREFS,
        englishHints: 'show',
        reviewLimitSource: 'repair',
        reviewLimit: 10,
        wordListIds: ['repair-drill'],
      },
    });

    render(<StudyView />);

    await waitForPracticeCard();
    expect(screen.queryByText('No cards available')).toBeNull();
    expect(mockedApp.value.startTodayDrill).not.toHaveBeenCalled();
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
    expect(nextState.session.currentStreak).toBe(1);
    expect(nextState.session.bestStreak).toBe(1);
    expect(nextState.session.recentOutcomes[0]).toMatchObject({
      kind: 'correct',
      label: 'Plain Past',
    });
    expect(screen.getAllByText('Correct!').length).toBeGreaterThan(0);
  });

  it('reveals kana directly into the Study answer box', async () => {
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
    const expectedKana = Array.from(conjugateItem(target, type));
    const firstKana = expectedKana[0];
    const revealNext = await screen.findByRole(
      'button',
      { name: 'Reveal next kana' },
      { timeout: 5000 },
    );

    fireEvent.click(revealNext);
    await waitFor(() => expect(input.value).toBe(firstKana));

    fireEvent.change(input, { target: { value: 'ta' } });
    await waitFor(() => expect(input.value).toBe(firstKana));
    fireEvent.click(revealNext);
    await waitFor(() => expect(input.value).toBe(expectedKana.slice(0, 2).join('')));

    expect(screen.queryByRole('group', { name: 'Live kana help' })).toBeNull();
    expect(screen.queryByRole('status', { name: 'Kana preview' })).toBeNull();
  });

  it('auto-converts reading-practice answers in the text input', async () => {
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

    expect(input.value).toBe('\u304a\u304d');
    expect(screen.queryByRole('status', { name: 'Kana preview' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Live kana help' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reveal next kana' })).toBeNull();
  });

  it('keeps continuous Practice status even when old Today drill prefs are present', async () => {
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

    await waitForPracticeCard();
    expect(screen.getByText('Practice run')).toBeTruthy();
    expect(screen.getByText('0 cards · 0 missed · 0 streak')).toBeTruthy();
    expect(screen.queryByText('0/1 ready')).toBeNull();
    expect(screen.getAllByText('Practice').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Transform' })).toBeNull();
  });

  it('counts a correct Practice answer without completing the old ready queue', async () => {
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

    await waitForPracticeCard();
    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: conjugateItem(target, type) } });

    await waitFor(() => expect(screen.getAllByText('Correct!').length).toBeGreaterThan(0));
    const nextState = setState.mock.calls
      .map(([arg]) => arg)
      .find((arg) => arg && typeof arg === 'object' && arg.session?.reviewed === 1);

    expect(nextState).toBeTruthy();
    expect(nextState.session.currentStreak).toBe(1);
    expect(nextState.session.recentOutcomes[0]).toMatchObject({
      kind: 'correct',
      label: 'Plain Past',
    });
    expect(nextState.cards[dueCardId].correct).toBe(1);
    expect(nextState.daily.count).toBe(1);
    expect(nextState.transformation.attempted).toBe(0);
    expect(markSrsQueueCompleted).not.toHaveBeenCalled();
  });

  it('records Transform drill answers in transformation progress', async () => {
    const setState = vi.fn();
    const target = STARTER_VERBS[0];
    const type = 'plain-past';
    mockedApp.value = makeApp({
      setState,
      state: { ...defaultState(), enabledTypes: [type] },
      allWords: [target],
      practicePrefs: {
        ...DEFAULT_PREFS,
        sourceFormStrategy: 'dictionary',
      },
    });

    render(<StudyView mode="transform" />);

    expect(await screen.findByText(/Conjugate to/i)).toBeTruthy();
    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: conjugateItem(target, type) } });

    await waitFor(() => expect(screen.getAllByText('Correct!').length).toBeGreaterThan(0));
    const nextState = setState.mock.calls
      .map(([arg]) => arg)
      .find((arg) => arg && typeof arg === 'object' && arg.session?.reviewed === 1);

    expect(nextState.transformation.attempted).toBe(1);
    expect(nextState.transformation.correct).toBe(1);
    expect(Object.keys(nextState.transformation.byPair)).toHaveLength(1);
    expect(nextState.cards).toEqual({});
    expect(nextState.daily.count).toBe(0);
  });
  it('keeps an exact romaji answer unsubmitted until Check or Enter when kana help is off', async () => {
    const setState = vi.fn();
    const target = STARTER_VERBS[0];
    const type = 'plain-past';
    const cardId = cardIdFor(target, type);
    mockedApp.value = makeApp({
      setState,
      allWords: [target],
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
    fireEvent.change(input, { target: { value: 'tabet' } });
    expect(input.value).toBe('\u305f\u3079t');
    expect(setState).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'tabeta' } });
    expect(input.value).toBe('\u305f\u3079\u305f');
    expect(setState).not.toHaveBeenCalled();
    expect(screen.queryByText('Correct!')).toBeNull();

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(setState).toHaveBeenCalled());

    const nextState = setState.mock.calls[0][0];
    expect(nextState.session.reviewed).toBe(1);
    expect(nextState.session.correct).toBe(1);
    expect(nextState.session.currentStreak).toBe(1);
    expect(nextState.session.bestStreak).toBe(1);
    expect(nextState.session.recentOutcomes[0]).toMatchObject({
      kind: 'correct',
      label: 'Plain Past',
    });
    expect(nextState.cards[cardId].correct).toBe(1);
    expect(screen.getAllByText('Correct!').length).toBeGreaterThan(0);
  });

  it('auto-submits an exact answer when kana help is on', async () => {
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
    fireEvent.change(input, { target: { value: 'tabeta' } });

    await waitFor(() => expect(setState).toHaveBeenCalled());

    const nextState = setState.mock.calls[0][0];
    expect(nextState.session.reviewed).toBe(1);
    expect(nextState.session.correct).toBe(1);
    expect(nextState.cards[cardId].correct).toBe(1);
    expect(screen.queryByText('Complete match. Press Enter.')).toBeNull();
    expect(screen.getAllByText('Correct!').length).toBeGreaterThan(0);
  });

  it('counts a near-miss answer submitted with Enter as wrong', async () => {
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
    fireEvent.change(input, { target: { value: 'tabete' } });
    expect(setState).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(setState).toHaveBeenCalled());

    const nextState = setState.mock.calls[0][0];
    expect(nextState.session.reviewed).toBe(1);
    expect(nextState.session.correct).toBe(0);
    expect(nextState.session.recentOutcomes[0]).toMatchObject({
      kind: 'missed',
      label: 'Plain Past',
    });
    expect(nextState.cards[cardId].incorrect).toBe(1);
    expect(screen.queryByText('Almost - possible typo.')).toBeNull();
  });

  it('updates the coach strip after a correct answer in the current run', async () => {
    const target = STARTER_VERBS[0];
    const type = 'plain-past';
    let app;
    const setState = vi.fn((nextState) => {
      app = { ...app, state: nextState };
      mockedApp.value = app;
    });
    app = makeApp({
      setState,
      allWords: [target],
      studyFocus: {
        word: target,
        type,
      },
    });
    mockedApp.value = app;
    const { rerender } = render(<StudyView />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: 'tabeta' } });
    await waitFor(() => expect(setState).toHaveBeenCalled());
    rerender(<StudyView />);

    expect(screen.getByText('1 card · 0 missed · 1 streak')).toBeTruthy();
    expect(screen.getByText('Focused practice: 食べる. Clean run so far.')).toBeTruthy();
  });

  it('counts a typed wrong answer as missed and resets the current streak', async () => {
    const setState = vi.fn();
    const target = STARTER_VERBS[0];
    const type = 'plain-negative';
    mockedApp.value = makeApp({
      setState,
      state: {
        ...defaultState(),
        session: { ...defaultState().session, currentStreak: 3, bestStreak: 5 },
      },
      allWords: [target],
      studyFocus: {
        word: target,
        type,
      },
    });

    render(<StudyView />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: 'tabeta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check (Enter)' }));
    await waitFor(() => expect(setState).toHaveBeenCalled());

    const nextState = setState.mock.calls[0][0];
    expect(nextState.session.reviewed).toBe(1);
    expect(nextState.session.correct).toBe(0);
    expect(nextState.session.currentStreak).toBe(0);
    expect(nextState.session.bestStreak).toBe(5);
    expect(nextState.session.recentOutcomes[0]).toMatchObject({
      kind: 'missed',
      label: 'Plain Negative',
    });
  });

  it('counts Reveal as missed and resets the current streak', async () => {
    const setState = vi.fn();
    const target = STARTER_VERBS[0];
    const type = 'plain-past';
    mockedApp.value = makeApp({
      setState,
      state: {
        ...defaultState(),
        session: { ...defaultState().session, currentStreak: 2, bestStreak: 4 },
      },
      allWords: [target],
      studyFocus: {
        word: target,
        type,
      },
    });

    render(<StudyView />);

    await waitForPracticeCard();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    await waitFor(() => expect(setState).toHaveBeenCalled());

    const nextState = setState.mock.calls[0][0];
    expect(nextState.session.reviewed).toBe(1);
    expect(nextState.session.correct).toBe(0);
    expect(nextState.session.currentStreak).toBe(0);
    expect(nextState.session.bestStreak).toBe(4);
    expect(nextState.session.recentOutcomes[0]).toMatchObject({
      kind: 'missed',
      label: 'Plain Past',
    });
  });

  it("counts I don't know as missed in choice mode", async () => {
    const setState = vi.fn();
    const target = STARTER_VERBS[0];
    const type = 'plain-past';
    mockedApp.value = makeApp({
      setState,
      allWords: [target],
      practicePrefs: { ...DEFAULT_PREFS, answerMode: 'choice' },
      studyFocus: {
        word: target,
        type,
      },
    });

    render(<StudyView />);

    fireEvent.click(await screen.findByRole('button', { name: "I don't know" }));
    await waitFor(() => expect(setState).toHaveBeenCalled());

    const nextState = setState.mock.calls[0][0];
    expect(nextState.session.reviewed).toBe(1);
    expect(nextState.session.correct).toBe(0);
    expect(nextState.session.currentStreak).toBe(0);
    expect(nextState.session.recentOutcomes[0]).toMatchObject({
      kind: 'missed',
      label: 'Plain Past',
    });
  });

  it('keeps Skip separate from missed and streak penalties', async () => {
    const setState = vi.fn();
    const target = STARTER_VERBS[0];
    const type = 'plain-past';
    mockedApp.value = makeApp({
      setState,
      state: {
        ...defaultState(),
        session: { ...defaultState().session, currentStreak: 2, bestStreak: 4 },
      },
      allWords: [target],
      studyFocus: {
        word: target,
        type,
      },
    });

    render(<StudyView />);

    await waitForPracticeCard();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(setState).toHaveBeenCalled());

    const nextState = setState.mock.calls[0][0];
    expect(nextState.session.reviewed).toBe(0);
    expect(nextState.session.correct).toBe(0);
    expect(nextState.session.skipped).toBe(1);
    expect(nextState.session.currentStreak).toBe(2);
    expect(nextState.session.bestStreak).toBe(4);
    expect(nextState.session.recentOutcomes[0]).toMatchObject({
      kind: 'skipped',
      label: 'Plain Past',
    });
  });

  it('shows the top session mistake pattern and recent trail in run details', async () => {
    const target = STARTER_VERBS[0];
    const type = 'plain-negative';
    let app;
    const setState = vi.fn((nextState) => {
      app = { ...app, state: nextState };
      mockedApp.value = app;
    });
    app = makeApp({
      setState,
      allWords: [target],
      studyFocus: {
        word: target,
        type,
      },
    });
    mockedApp.value = app;
    const { rerender } = render(<StudyView />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: 'tabeta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check (Enter)' }));
    await waitFor(() => expect(setState).toHaveBeenCalled());
    rerender(<StudyView />);

    fireEvent.click(screen.getByText('Run details'));
    expect(screen.getByText('Why this card')).toBeTruthy();
    expect(screen.getByText('Top miss')).toBeTruthy();
    expect(
      screen.getAllByText(/Negative\/affirmative mismatch: Plain Negative/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('missed: Plain Negative')).toBeTruthy();
  });

  it('opens a run review page with expandable answer reveals', async () => {
    const target = STARTER_VERBS[0];
    const type = 'plain-past';
    mockedApp.value = makeApp({
      allWords: [target],
      studyFocus: {
        word: target,
        type,
      },
    });

    render(<StudyView />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    expect(screen.getByRole('button', { name: 'Review answers' }).disabled).toBe(true);

    fireEvent.change(input, { target: { value: conjugateItem(target, type) } });
    await waitFor(() => expect(screen.getAllByText('Correct!').length).toBeGreaterThan(0));

    const reviewButton = screen.getByRole('button', { name: 'Review answers' });
    expect(reviewButton.disabled).toBe(false);
    fireEvent.click(reviewButton);

    expect(screen.getByRole('region', { name: 'Practice run review' })).toBeTruthy();
    expect(screen.getByText('Answers from this run')).toBeTruthy();
    expect(screen.getByText('Answer #1')).toBeTruthy();
    expect(screen.getByText('Your answer:')).toBeTruthy();

    fireEvent.click(screen.getByText('Answer #1'));
    expect(screen.getAllByText('Correct!').length).toBeGreaterThan(0);
    expect(screen.getByText('Answer breakdown')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Practice' }));
    expect(screen.getByText('Practice run')).toBeTruthy();
  });

  it('walks a word form sweep in order and repeats missed forms before completion', async () => {
    const target = STARTER_VERBS[0];
    const state = {
      ...defaultState(),
      enabledTypes: ['plain-past', 'plain-negative', 'polite-present'],
    };
    mockedApp.value = makeApp({
      state,
      allWords: [target],
      practicePrefs: { ...DEFAULT_PREFS, autoAdvanceCorrect: false },
      studyFocus: {
        word: target,
        launchMode: 'word-sweep',
        returnTo: 'reference',
      },
    });

    render(<StudyView />);

    expect(await screen.findByText('Word form sweep')).toBeTruthy();
    expect(screen.getByText(/3 enabled forms/)).toBeTruthy();
    expect(screen.getAllByText('Plain Past').length).toBeGreaterThan(0);

    fireEvent.change(await waitForPracticeCard(), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check (Enter)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next (Enter)' }));

    await waitFor(() => expect(screen.getAllByText('Plain Negative').length).toBeGreaterThan(0));
    fireEvent.change(await waitForPracticeCard(), {
      target: { value: conjugateItem(target, 'plain-negative') },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Next (Enter)' }));

    await waitFor(() => expect(screen.getAllByText('Polite Present').length).toBeGreaterThan(0));
    fireEvent.change(await waitForPracticeCard(), {
      target: { value: conjugateItem(target, 'polite-present') },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Next (Enter)' }));

    expect((await screen.findAllByText(/Repeating missed forms/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Plain Past').length).toBeGreaterThan(0);
    fireEvent.change(await waitForPracticeCard(), {
      target: { value: conjugateItem(target, 'plain-past') },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Next (Enter)' }));

    expect(await screen.findByText('Drill complete')).toBeTruthy();
  });

  it('auto-advances after a brief correct visual by default for guided kana', async () => {
    const target = STARTER_VERBS[0];
    const nextTarget = STARTER_VERBS[1];
    const type = 'plain-past';
    mockedApp.value = makeApp({
      allWords: [target, nextTarget],
      practicePrefs: {
        ...DEFAULT_PREFS,
        kanaAssist: 'guided',
      },
      studyFocus: {
        word: target,
        type,
      },
    });

    render(<StudyView />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    vi.useFakeTimers();

    fireEvent.change(input, { target: { value: conjugateItem(target, type) } });

    expect(screen.getAllByText('Correct!').length).toBeGreaterThan(0);
    expect(screen.getByText('Next card coming up...')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(850);
    });
    vi.useRealTimers();

    await waitFor(() => expect(screen.queryByText('Correct!')).toBeNull());
    const nextInput = screen.getByPlaceholderText(/Type romaji or kana/i);
    expect(document.activeElement).toBe(nextInput);
  });

  it('does not auto-advance non-guided typed answers by default', async () => {
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

    expect(screen.getAllByText('Correct!').length).toBeGreaterThan(0);
    expect(screen.queryByText('Next card coming up...')).toBeNull();
  });

  it('auto-advances non-guided typed answers after enabling that answer form', async () => {
    const target = STARTER_VERBS[0];
    const nextTarget = STARTER_VERBS[1];
    const type = 'plain-past';
    mockedApp.value = makeApp({
      allWords: [target, nextTarget],
      practicePrefs: {
        ...DEFAULT_PREFS,
        autoAdvanceCorrectByAnswerForm: { 'input-live': true },
      },
      studyFocus: {
        word: target,
        type,
      },
    });

    render(<StudyView />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    vi.useFakeTimers();

    fireEvent.change(input, { target: { value: conjugateItem(target, type) } });

    expect(screen.getByText('Next card coming up...')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(850);
    });
    vi.useRealTimers();

    await waitFor(() => expect(screen.queryByText('Correct!')).toBeNull());
    const nextInput = screen.getByPlaceholderText(/Type romaji or kana/i);
    expect(document.activeElement).toBe(nextInput);
  });

  it('offers Gemini review chat after a correct answer without opening it automatically', async () => {
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
    expect(screen.getAllByText('Chat about this').length).toBeGreaterThan(0);
    expect(screen.queryByText('Gemini is thinking…')).toBeNull();
  });

  it('keeps direct kana in the input and flags mismatches inline', async () => {
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

    render(<StudyView />);

    const input = await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: 'たべ' } });
    await waitFor(() => expect(input.value).toBe('たべ'));
    expect(screen.queryByText('Expected \u3079 at kana 2.')).toBeNull();

    fireEvent.change(input, { target: { value: 'たなこ' } });
    await waitFor(() => expect(screen.getByText('Expected \u3079 at kana 2.')).toBeTruthy());
    expect(input.className).toContain('border-rose-400');

    fireEvent.change(input, { target: { value: 'たべ' } });
    await waitFor(() => expect(screen.queryByText('Expected \u3079 at kana 2.')).toBeNull());
    expect(input.className).not.toContain('border-rose-400');
  });

  it('hides live kana mismatch feedback and penalty when kana help is off', async () => {
    const setState = vi.fn();
    const target = STARTER_VERBS[0];
    const type = 'plain-past';
    mockedApp.value = makeApp({
      setState,
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
    expect(screen.getByRole('button', { name: 'Kana help off' }).getAttribute('aria-pressed')).toBe(
      'false',
    );

    fireEvent.change(input, { target: { value: '\u305f\u306a\u3053' } });
    await waitFor(() => expect(input.value).toBe('\u305f\u306a\u3053'));
    expect(screen.queryByText('Expected \u3079 at kana 2.')).toBeNull();
    expect(input.className).not.toContain('border-rose-400');

    fireEvent.change(input, { target: { value: conjugateItem(target, type) } });
    fireEvent.click(screen.getByRole('button', { name: 'Check (Enter)' }));
    await waitFor(() => expect(setState).toHaveBeenCalled());
    const nextState = setState.mock.calls[0][0];
    expect(nextState.session.reviewed).toBe(1);
    expect(nextState.session.correct).toBe(1);
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
      fireEvent.change(input, { target: { value: 'tanako' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => expect(screen.getByText('Review this form.')).toBeTruthy());
      const typedAnswer = screen.getByRole('group', { name: 'Your typed answer' });
      expect(within(typedAnswer).getByText('\u305f')).toBeTruthy();
      expect(within(typedAnswer).getByText('\u306a')).toBeTruthy();
      expect(within(typedAnswer).getByText('\u3053')).toBeTruthy();
      await waitFor(() => expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true }));
    } finally {
      window.HTMLButtonElement.prototype.focus = originalFocus;
    }
  });
});
