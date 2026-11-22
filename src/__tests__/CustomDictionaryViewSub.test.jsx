// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const geminiMock = vi.hoisted(() => ({
  getSuggestedWord: vi.fn(),
  lookupWordWithGemini: vi.fn(),
}));

vi.mock('../utils/gemini.js', () => ({
  getSuggestedWord: geminiMock.getSuggestedWord,
  lookupWordWithGemini: geminiMock.lookupWordWithGemini,
}));

import CustomDictionaryViewSub from '../views/CustomDictionaryViewSub.jsx';
import { STARTER_VERBS } from '../data/starterWords.js';

function renderDictionary(overrides = {}) {
  const props = {
    customVerbs: [],
    setCustomVerbs: vi.fn(),
    customAdjectives: [],
    setCustomAdjectives: vi.fn(),
    geminiKey: 'proxy',
    ...overrides,
  };

  render(<CustomDictionaryViewSub {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CustomDictionaryViewSub suggestions', () => {
  const write = { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' };
  const read = { dict: '読む', reading: 'よむ', meaning: 'to read', group: 'godan' };

  function delayedLookup() {
    let resolve;
    const promise = new Promise((settle) => {
      resolve = settle;
    });
    geminiMock.lookupWordWithGemini.mockReturnValueOnce(promise);
    return resolve;
  }

  function search(query, kind = 'verb') {
    const article = kind === 'verb' ? 'a' : 'an';
    const input = screen.getByRole('textbox', { name: `Look up ${article} ${kind} to add` });
    fireEvent.change(input, { target: { value: query } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    return input;
  }

  it('keeps the replacement result when a cancelled lookup completes later', async () => {
    const finishFirst = delayedLookup();
    const finishSecond = delayedLookup();
    renderDictionary();
    fireEvent.click(screen.getByRole('button', { name: 'Add verb' }));
    const input = search('write');
    const signal = geminiMock.lookupWordWithGemini.mock.calls[0][3].signal;
    fireEvent.click(within(input.parentElement).getByRole('button', { name: 'Cancel' }));
    expect(signal.aborted).toBe(true);
    search('read');
    await act(() => finishSecond(read));
    await act(() => finishFirst(write));
    expect(screen.getByText(read.dict)).toBeTruthy();
    expect(screen.queryByText(write.dict)).toBeNull();
  });

  it('ignores a pending verb lookup after switching tabs and rejects a wrong-group replacement', async () => {
    const finishVerb = delayedLookup();
    const finishAdjective = delayedLookup();
    const { setCustomAdjectives } = renderDictionary();
    fireEvent.click(screen.getByRole('button', { name: 'Add verb' }));
    search('write');
    const signal = geminiMock.lookupWordWithGemini.mock.calls[0][3].signal;
    await act(() => fireEvent.click(screen.getByRole('tab', { name: 'Adjectives' })));
    expect(signal.aborted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add adjective' }));
    await act(() => finishVerb(write));
    expect(screen.queryByText(write.dict)).toBeNull();

    search('green', 'adjective');
    await act(() => finishAdjective(write));
    const confirmation = screen.getByText('Is this the right adjective?').parentElement;
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Add adjective' }));
    expect(screen.getByText('Choose a Japanese adjective to add.')).toBeTruthy();
    expect(setCustomAdjectives).not.toHaveBeenCalled();
  });

  it('shows learner-added entries first and discloses built-ins on request', () => {
    renderDictionary({ geminiKey: '' });

    expect(screen.getByText('No custom verbs yet. Add one or show the built-ins.')).toBeTruthy();
    expect(screen.queryByText(STARTER_VERBS[0].dict)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Show \d+ built-ins/ }));

    expect(screen.getByText(STARTER_VERBS[0].dict)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide built-ins' })).toBeTruthy();
  });

  it('labels manual word fields and the word group control', () => {
    renderDictionary({ geminiKey: '' });

    fireEvent.click(screen.getByRole('button', { name: 'Add verb' }));

    expect(screen.getByLabelText('Dictionary form')).toBeTruthy();
    expect(screen.getByLabelText('Reading (kana/romaji)')).toBeTruthy();
    expect(screen.getByLabelText('Meaning')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Group' })).toBeTruthy();
  });

  it('waits for an explicit suggestion request on entry', () => {
    renderDictionary();

    expect(screen.getByText(/Suggested next verb/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Suggest word' })).toBeTruthy();
    expect(geminiMock.getSuggestedWord).not.toHaveBeenCalled();
    expect(screen.queryByText(/Failed to fetch/i)).toBeNull();
  });

  it('shows calm copy for suggestion transport failures', async () => {
    geminiMock.getSuggestedWord.mockRejectedValueOnce(new Error('Failed to fetch'));
    renderDictionary();

    fireEvent.click(screen.getByRole('button', { name: 'Suggest word' }));

    expect(
      await screen.findByText('Suggestions are unavailable right now. Try again later.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Failed to fetch/i)).toBeNull();
  });

  it('does not automatically fetch another suggestion after adding the displayed one', async () => {
    const suggestedWord = {
      dict: 'kaku',
      reading: 'kaku',
      meaning: 'to write',
      group: 'godan',
      reason: 'A useful godan verb for early practice.',
    };
    geminiMock.getSuggestedWord.mockResolvedValueOnce(suggestedWord);
    const setCustomVerbs = vi.fn();
    renderDictionary({ setCustomVerbs });

    fireEvent.click(screen.getByRole('button', { name: 'Suggest word' }));

    expect(await screen.findByText('A useful godan verb for early practice.')).toBeTruthy();
    expect(geminiMock.getSuggestedWord).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(setCustomVerbs).toHaveBeenCalledWith([suggestedWord]);
    await waitFor(() =>
      expect(screen.queryByText('A useful godan verb for early practice.')).toBeNull(),
    );
    expect(geminiMock.getSuggestedWord).toHaveBeenCalledTimes(1);
  });
});
