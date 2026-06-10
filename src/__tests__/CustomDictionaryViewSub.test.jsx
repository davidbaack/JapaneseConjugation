// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const geminiMock = vi.hoisted(() => ({
  getSuggestedWord: vi.fn(),
  lookupWordWithGemini: vi.fn(),
}));

vi.mock('../utils/gemini.js', () => ({
  getSuggestedWord: geminiMock.getSuggestedWord,
  lookupWordWithGemini: geminiMock.lookupWordWithGemini,
}));

import CustomDictionaryViewSub from '../views/CustomDictionaryViewSub.jsx';

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
