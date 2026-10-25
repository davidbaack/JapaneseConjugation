// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockedApp = vi.hoisted(() => ({ value: null }));
vi.mock('../state/AppStateContext.jsx', () => ({ useApp: () => mockedApp.value }));

import ReviewInventoryView from '../views/ReviewInventoryView.jsx';

const IKU = { dict: '行く', reading: 'いく', meaning: 'to go', group: 'godan', lesson: 3 };
const TABERU = {
  dict: '食べる',
  reading: 'たべる',
  meaning: 'to eat',
  group: 'ichidan',
  lesson: 1,
};

afterEach(() => {
  cleanup();
  mockedApp.value = null;
});

function renderInventory(allWords = [IKU, TABERU]) {
  const state = { reviewScope: { excludedWordKeys: [] } };
  const practiceWord = vi.fn();
  const setState = vi.fn();
  mockedApp.value = { state, setState, allWords, practiceWord };
  const view = render(<ReviewInventoryView />);
  return { ...view, state, setState, practiceWord };
}

function manyWords(count) {
  return Array.from({ length: count }, (_, i) => ({
    dict: `語${String(i).padStart(3, '0')}る`,
    reading: 'てすとる',
    meaning: 'test verb',
    group: 'ichidan',
    lesson: i + 1,
  }));
}

describe('Words inventory search', () => {
  it('names the search field and describes its supported formats', () => {
    renderInventory();
    const input = screen.getByRole('searchbox', { name: 'Search words' });
    const description = document.getElementById(input.getAttribute('aria-describedby'));
    expect(description.textContent).toContain('romaji, kana, kanji, or English');
    expect(description.textContent).toContain('iku, いく, or 行く');
  });

  it.each(['iku', 'いく', 'イク', '行く', '　ＩＫＵ　', 'GO'])(
    'shows 行く for %s without changing the selected word action',
    (query) => {
      const { practiceWord } = renderInventory();
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
      expect(screen.getByText('行く')).toBeTruthy();
      expect(screen.queryByText('食べる')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Practice this' }));
      expect(practiceWord).toHaveBeenCalledWith(IKU, 'plain-past', {
        source: 'tools',
        launchMode: 'inventory',
      });
    },
  );

  it('keeps Remove and Restore tied to the word found by romaji', () => {
    const { state, setState, rerender } = renderInventory();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'iku' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const excludedState = setState.mock.calls[0][0](state);
    expect(excludedState.reviewScope.excludedWordKeys).toEqual(['godan:行く']);
    mockedApp.value = { ...mockedApp.value, state: excludedState };
    rerender(<ReviewInventoryView />);
    expect(screen.getByText('excluded')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(setState.mock.calls[1][0](excludedState).reviewScope.excludedWordKeys).toEqual([]);
  });

  it('shows a nonmatch and clears to the first inventory page with search focus', () => {
    renderInventory(manyWords(65));
    fireEvent.click(screen.getByRole('button', { name: 'Load 30 more' }));
    expect(screen.getAllByRole('button', { name: 'Practice this' })).toHaveLength(60);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'no-such-word' } });
    expect(screen.getByRole('status').textContent).toContain('No words match “no-such-word”');
    expect(screen.queryAllByRole('button', { name: 'Practice this' })).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(screen.getAllByRole('button', { name: 'Practice this' })).toHaveLength(30);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps textbook order, the 120-result cap, and 30-row pages when filtering', () => {
    const words = manyWords(135);
    renderInventory([...words].reverse());
    const firstWord = screen.getAllByText(/^語\d+る$/)[0];
    expect(firstWord.textContent).toBe(words[0].dict);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'test' } });
    expect(screen.getAllByRole('button', { name: 'Practice this' })).toHaveLength(30);
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Load 30 more' }));
    }
    expect(screen.getAllByRole('button', { name: 'Practice this' })).toHaveLength(120);
    expect(screen.queryByRole('button', { name: 'Load 30 more' })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'test verb' } });
    expect(screen.getAllByRole('button', { name: 'Practice this' })).toHaveLength(30);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '　 ' } });
    expect(screen.getAllByRole('button', { name: 'Practice this' })).toHaveLength(30);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
