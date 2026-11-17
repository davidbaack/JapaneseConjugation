// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LessonsView from '../views/LessonsView.jsx';
import { PracticeAnswerTip } from '../views/study/AnswerInputPanel.jsx';
import PracticeSelector from '../views/study/PracticeSelector.jsx';
import { practiceSelectionForTypeIds } from '../utils/practiceSelection.js';

vi.mock('../state/AppStateContext.jsx', () => ({
  useApp: () => ({ allWords: [] }),
}));

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('beginner learning support', () => {
  it('shows explicit base and changed-form readings and English in Basics', () => {
    window.location.hash = '#lesson-basic-tenses';
    render(<LessonsView />);
    const basics = document.getElementById('lesson-basic-tenses');
    const row = within(basics).getByText('to write').closest('tr');
    expect(within(row).getAllByText('かく')).toHaveLength(2);
    expect(within(row).getByText('かかない')).toBeTruthy();
    expect(within(row).getByText('かきます')).toBeTruthy();
    expect(within(row).getByText('do not write / will not write')).toBeTruthy();
    const english = within(row).getByText('write / will write (polite)');
    expect(english.closest('[lang="ja"]')).toBeNull();
    expect(within(row).getByText('書きます').getAttribute('lang')).toBe('ja');
  });

  it('finds beginner examples by their kana or English support', () => {
    render(<LessonsView />);
    fireEvent.change(screen.getByLabelText('Find a rule'), { target: { value: 'たべましょう' } });
    expect(screen.getByRole('heading', { name: 'Volitional', level: 3 })).toBeTruthy();
    expect(document.getElementById('lesson-basic-tenses')).toBeNull();
    fireEvent.change(screen.getByLabelText('Find a rule'), {
      target: { value: 'wanted to write' },
    });
    expect(screen.getByRole('heading', { name: 'Wanting with 〜たい', level: 3 })).toBeTruthy();
  });

  it('offers terms in a closed Learn disclosure', () => {
    render(<LessonsView />);
    const summary = screen.getByText('What do dictionary, plain, ichidan and godan mean?');
    const details = summary.closest('details');
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    expect(within(details).getByText('Dictionary form')).toBeTruthy();
    expect(within(details).getByText('Godan')).toBeTruthy();
  });

  it.each([
    ['input', false, true, 'Type romaji like'],
    ['choice', false, true, 'Choose the matching answer'],
    ['self-check', false, true, 'Recall the answer, reveal it'],
    ['self-check', true, true, 'Compare your answer'],
    ['speak', false, true, 'Use Speak answer'],
    ['speak', false, false, 'Speech input is unavailable here'],
  ])(
    'matches instructions to %s mode and its current state',
    (answerMode, selfCheckOpen, available, copy) => {
      render(
        <PracticeAnswerTip
          phase="answering"
          answerMode={answerMode}
          selfCheckOpen={selfCheckOpen}
          speechRecognitionAvailable={available}
        />,
      );
      const tip = screen.getByTestId('practice-answer-tip');
      expect(tip.textContent).toContain(copy);
      if (answerMode !== 'input') expect(tip.textContent).not.toContain('romaji');
    },
  );

  it('combines listening guidance with the answer mode and switches to review instructions', () => {
    const { rerender } = render(
      <PracticeAnswerTip phase="answering" answerMode="choice" listeningPrompt />,
    );
    const tip = screen.getByTestId('practice-answer-tip');
    expect(tip.textContent).toContain('Listen to the prompt; use Replay');
    expect(tip.textContent).toContain('Choose the matching answer');
    rerender(
      <PracticeAnswerTip phase="answering" answerMode="choice" listeningPrompt showPromptText />,
    );
    expect(tip.textContent).not.toContain('Listen to the prompt');
    rerender(<PracticeAnswerTip phase="reviewing" answerMode="choice" listeningPrompt />);
    expect(tip.textContent).toContain('choose Next card');
    expect(tip.textContent).not.toContain('Listen to the prompt');
  });

  it('uses singular and plural counts for the exact selected scope', () => {
    const { rerender } = render(
      <PracticeSelector selection={practiceSelectionForTypeIds(['plain-past'])} />,
    );
    expect(screen.getByText('1 form')).toBeTruthy();
    rerender(
      <PracticeSelector selection={practiceSelectionForTypeIds(['humble', 'humble-polite'])} />,
    );
    expect(screen.getByText('2 forms')).toBeTruthy();
  });
});
