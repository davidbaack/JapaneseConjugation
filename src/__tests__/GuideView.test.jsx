// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockedApp = vi.hoisted(() => ({ value: null }));

vi.mock('../state/AppStateContext.jsx', () => ({
  useApp: () => mockedApp.value,
}));

import GuideView, { FocusedGuideBanner, StepResult } from '../views/GuideView.jsx';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { defaultState } from '../utils/storage.js';

const NERU = {
  dict: '\u5bdd\u308b',
  reading: '\u306d\u308b',
  meaning: 'to sleep',
  group: 'ichidan',
};

afterEach(() => {
  cleanup();
  mockedApp.value = null;
});

function renderFocusedGuide() {
  const state = { ...defaultState(), enabledTypes: ['plain-negative'] };
  const setState = vi.fn();
  mockedApp.value = {
    allWords: [NERU],
    builtInWords: [NERU],
    clearGuideFocus: vi.fn(),
    guideFocus: {
      source: 'practice-result',
      type: 'plain-negative',
      sourceTypeId: 'dictionary',
      word: NERU,
    },
    practicePrefs: DEFAULT_PREFS,
    setState,
    state,
    wordLists: [],
  };
  render(<GuideView />);
  return { setState, state };
}

function renderGuide(enabledTypes = ['plain-negative', 'plain-past']) {
  const state = { ...defaultState(), enabledTypes };
  mockedApp.value = {
    allWords: [NERU],
    builtInWords: [NERU],
    clearGuideFocus: vi.fn(),
    guideFocus: null,
    practicePrefs: DEFAULT_PREFS,
    setState: vi.fn(),
    state,
    wordLists: [],
  };
  render(<GuideView />);
}

describe('Guide step result copy', () => {
  it('shows the learner and expected values for a missed step', () => {
    render(
      <StepResult
        step={{
          id: 'answer',
          label: 'Build the answer',
          correct: false,
          submitted: 'かえない',
          expected: 'かえらない',
          assisted: false,
        }}
      />,
    );

    expect(screen.getByText('Your answer: かえない')).toBeTruthy();
    expect(screen.getByText('Correct answer: かえらない')).toBeTruthy();
  });

  it('labels a correct assisted step as completed with help', () => {
    render(
      <StepResult
        step={{
          id: 'group',
          label: 'Choose the group',
          correct: true,
          submitted: 'godan',
          expected: 'godan',
          expectedLabel: 'godan: row-shift',
          assisted: true,
        }}
      />,
    );

    expect(screen.getByText('Completed with help.')).toBeTruthy();
  });
});

describe('Guide gated walkthrough', () => {
  it('lets the learner choose one exact form for Guide cards', async () => {
    renderGuide();

    const formSelect = await screen.findByLabelText('Practice form');
    expect(screen.getByRole('option', { name: 'Mixed from Practice' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Plain Negative' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Plain Past' })).toBeTruthy();

    fireEvent.change(formSelect, { target: { value: 'plain-past' } });

    expect(formSelect.value).toBe('plain-past');
    expect(screen.getByText('Make: Plain Past')).toBeTruthy();
  });

  it('keeps a missed plain-form step locked until the learner types the correction', async () => {
    renderFocusedGuide();

    const plainForm = await screen.findByLabelText('Plain form');
    const groupStep = screen.getByRole('button', { name: /^2\. Group/ });
    expect(groupStep.disabled).toBe(true);

    fireEvent.change(plainForm, { target: { value: 'taberu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check plain form' }));

    expect(screen.getByText('Your answer: taberu')).toBeTruthy();
    expect(screen.getByText('Correct answer: \u5bdd\u308b')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^2\. Group/ }).disabled).toBe(true);
    expect(screen.getByLabelText('Plain form').value).toBe('');

    fireEvent.change(screen.getByLabelText('Plain form'), { target: { value: 'taberu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check correction' }));
    expect(screen.getByRole('alert').textContent).toMatch(/does not match/i);

    fireEvent.change(screen.getByLabelText('Plain form'), { target: { value: 'neru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check correction' }));

    expect(screen.getByText(/Correction complete/)).toBeTruthy();
    expect(screen.getByText('Your answer: taberu')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^2\. Group/ }).disabled).toBe(true);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Continue to group' }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue to group' }));
    expect(screen.getByRole('heading', { name: '2. Choose the group' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^2\. Group/ }).disabled).toBe(false);
  });

  it('requires a missed group to be reselected and records the card only after Finish', async () => {
    const { setState, state } = renderFocusedGuide();

    fireEvent.change(await screen.findByLabelText('Plain form'), { target: { value: 'neru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check plain form' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to group' }));

    fireEvent.click(screen.getByRole('button', { name: 'godan / u-verb' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check group' }));
    expect(screen.getByText(/Your answer: godan/)).toBeTruthy();
    expect(screen.getByText(/Correct answer: ichidan/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'ichidan / ru-verb' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check correction' }));
    expect(screen.getByText(/Correction complete/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to answer' }));

    fireEvent.change(screen.getByLabelText('Final conjugation'), {
      target: { value: 'nenai' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(setState).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Submit guide card' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Finish card' }));
    expect(await screen.findByRole('heading', { name: 'Path complete.' })).toBeTruthy();
    expect(setState).toHaveBeenCalledTimes(1);

    const recorded = setState.mock.calls[0][0](state);
    expect(recorded.guide.attempted).toBe(1);
    expect(recorded.guide.byStep.group.correct).toBe(0);
    expect(recorded.guide.recent[0].steps.group.correct).toBe(false);
  });

  it('makes Skip reveal the answer and require an active correction', async () => {
    renderFocusedGuide();
    await screen.findByLabelText('Plain form');

    fireEvent.click(screen.getByRole('button', { name: 'Skip plain form step' }));

    expect(screen.getByText('Answer revealed. Correct it to continue.')).toBeTruthy();
    expect(screen.getByText('Correct answer: \u5bdd\u308b')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^2\. Group/ }).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Plain form'), { target: { value: 'neru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check correction' }));
    expect(screen.getByText(/Answer copied/)).toBeTruthy();
    expect(screen.getByText('Completed with help.')).toBeTruthy();
  });
});

describe('Focused Guide banner', () => {
  const word = {
    dict: '\u5bdd\u308b',
    reading: '\u306d\u308b',
    meaning: 'to sleep',
    group: 'ichidan',
  };

  it('labels a non-dictionary source as a form-to-form repair', () => {
    render(
      <FocusedGuideBanner
        focus={{
          source: 'practice-result',
          type: 'plain-negative',
          word,
          formToForm: true,
        }}
        card={{ sourceLabel: 'Plain Past', targetLabel: 'Plain Negative' }}
        onExit={() => {}}
      />,
    );

    expect(screen.getByText(/Form-to-form repair: Plain Past to Plain Negative/)).toBeTruthy();
  });

  it('shows miss context but omits it for a correct focused launch', () => {
    const { rerender } = render(
      <FocusedGuideBanner
        focus={{
          source: 'practice-result',
          type: 'plain-negative',
          word,
          formToForm: false,
          missed: true,
          submittedAnswer: 'nemasu',
          expectedAnswer: '\u5bdd\u306a\u3044',
        }}
        card={{ sourceLabel: 'Dictionary Form', targetLabel: 'Plain Negative' }}
        onExit={() => {}}
      />,
    );

    expect(screen.getByLabelText('Practice miss comparison')).toBeTruthy();
    expect(screen.getByText('nemasu')).toBeTruthy();
    expect(screen.getByText('\u5bdd\u306a\u3044')).toBeTruthy();

    rerender(
      <FocusedGuideBanner
        focus={{
          source: 'practice-result',
          type: 'plain-negative',
          word,
          formToForm: false,
          missed: false,
          expectedAnswer: '\u5bdd\u306a\u3044',
        }}
        card={{ sourceLabel: 'Dictionary Form', targetLabel: 'Plain Negative' }}
        onExit={() => {}}
      />,
    );

    expect(screen.queryByLabelText('Practice miss comparison')).toBeNull();
  });
});
