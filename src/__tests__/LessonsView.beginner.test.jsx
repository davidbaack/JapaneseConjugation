// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LessonsView from '../views/LessonsView.jsx';
import PracticeBeginnerHelp from '../views/study/PracticeBeginnerHelp.jsx';

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

  it('keeps Practice help optional and sends the learner to Basics explicitly', () => {
    const onLearnBasics = vi.fn();
    render(<PracticeBeginnerHelp onLearnBasics={onLearnBasics} />);
    const summary = screen.getByText('New to conjugation?');
    const details = summary.closest('details');
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    const example = screen.getByRole('region', { name: 'Worked example: Plain Negative' });
    expect(within(example).getByText('食べる (たべる)')).toBeTruthy();
    expect(within(example).getByText('食べない (たべない)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Learn Basics and Politeness' }));
    expect(onLearnBasics).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ dict: '食べる', reading: 'たべる' }, '寝ない (ねない)', '食べない', 'たべない'],
    [{ dict: 'たべる' }, '寝ない (ねない)', '食べない', 'たべない'],
    [{ dict: '寝る', reading: 'ねる' }, '食べない (たべない)', '寝ない', 'ねない'],
    [{ dict: '書く', reading: 'かく' }, '食べない (たべない)', '書かない', 'かかない'],
  ])(
    'keeps Practice teaching separate from the active %j card',
    (activeWord, sample, answer, reading) => {
      const { rerender } = render(
        <PracticeBeginnerHelp activeWord={activeWord} onLearnBasics={vi.fn()} />,
      );
      fireEvent.click(screen.getByText('New to conjugation?'));
      const details = screen.getByText('New to conjugation?').closest('details');
      expect(within(details).getByText(sample)).toBeTruthy();
      expect(details.textContent).not.toContain(answer);
      expect(details.textContent).not.toContain(reading);
      expect(details.querySelector('dl').textContent).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/u);

      rerender(
        <PracticeBeginnerHelp
          activeWord={{ dict: '食べる', reading: 'たべる' }}
          onLearnBasics={vi.fn()}
        />,
      );
      expect(details.textContent).not.toContain('食べない');
      expect(within(details).getByText('寝ない (ねない)')).toBeTruthy();
    },
  );
});
