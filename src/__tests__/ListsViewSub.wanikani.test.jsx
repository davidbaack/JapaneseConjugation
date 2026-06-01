// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../utils/wanikani.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildWanikaniImport: vi.fn(),
  };
});

import ListsViewSub from '../views/ListsViewSub.jsx';
import { buildWanikaniImport } from '../utils/wanikani.js';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ListsViewSub WaniKani import', () => {
  it('imports WaniKani words into a stable enabled study list', async () => {
    buildWanikaniImport.mockResolvedValue({
      scope: { id: 'passed', listName: 'WaniKani passed' },
      user: { username: 'tester' },
      assignments: 3,
      subjects: 3,
      skipped: 1,
      words: [
        {
          dict: '語る',
          reading: 'かたる',
          meaning: 'To Talk',
          group: 'godan',
          source: 'wanikani',
        },
        {
          dict: '静か',
          reading: 'しずか',
          meaning: 'Quiet',
          group: 'na-adjective',
          source: 'wanikani',
        },
      ],
    });
    const setCustomVerbs = vi.fn();
    const setCustomAdjectives = vi.fn();
    const setWordLists = vi.fn();
    const setPracticePrefs = vi.fn();

    render(
      <ListsViewSub
        words={[]}
        customVerbs={[]}
        setCustomVerbs={setCustomVerbs}
        customAdjectives={[]}
        setCustomAdjectives={setCustomAdjectives}
        wordLists={[]}
        setWordLists={setWordLists}
        practicePrefs={{ wordListIds: [] }}
        setPracticePrefs={setPracticePrefs}
        geminiKey=""
      />,
    );

    const importButton = screen.getByRole('button', { name: 'Import WaniKani words' });
    expect(importButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('WaniKani API token'), {
      target: { value: 'wk_test_token' },
    });
    expect(importButton.disabled).toBe(false);
    fireEvent.click(importButton);

    await waitFor(() =>
      expect(buildWanikaniImport).toHaveBeenCalledWith(
        'wk_test_token',
        'passed',
        expect.objectContaining({ signal: expect.any(Object) }),
      ),
    );
    await waitFor(() =>
      expect(setWordLists).toHaveBeenCalledWith([
        {
          id: 'wanikani-passed',
          name: 'WaniKani passed',
          wordKeys: ['godan:語る', 'na-adjective:静か'],
        },
      ]),
    );
    expect(setCustomVerbs).toHaveBeenCalledWith([
      expect.objectContaining({ dict: '語る', group: 'godan' }),
    ]);
    expect(setCustomAdjectives).toHaveBeenCalledWith([
      expect.objectContaining({ dict: '静か', group: 'na-adjective' }),
    ]);
    expect(setPracticePrefs).toHaveBeenCalledWith({ wordListIds: ['wanikani-passed'] });
    expect(
      await screen.findByText(
        'Imported 2 WaniKani words into WaniKani passed and enabled it for drills.',
      ),
    ).toBeTruthy();
  });
});
