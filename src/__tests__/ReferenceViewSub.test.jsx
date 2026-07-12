// @vitest-environment jsdom
import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ReferenceViewSub from '../views/ReferenceViewSub.jsx';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { defaultState } from '../utils/storage.js';

const IU = {
  dict: '言う',
  reading: 'いう',
  meaning: 'to say',
  group: 'godan',
  jlpt: 'N5',
  lesson: 8,
  common: true,
};

const IKU = {
  dict: '行く',
  reading: 'いく',
  meaning: 'to go',
  group: 'godan',
  jlpt: 'N5',
  lesson: 3,
  common: true,
};

function LookupHarness({ verbs }) {
  const [state, setState] = useState(() => defaultState());
  return (
    <>
      <ReferenceViewSub
        state={state}
        setState={setState}
        verbs={verbs}
        adjectives={[]}
        practicePrefs={DEFAULT_PREFS}
      />
      <output data-testid="reference-state">{JSON.stringify(state.reference)}</output>
    </>
  );
}

function searchFor(value) {
  fireEvent.change(screen.getByLabelText('Search for a word or conjugation form'), {
    target: { value },
  });
}

describe('ReferenceViewSub ambiguity chooser', () => {
  it('requires an explicit itta choice and records the confirmed word in history', async () => {
    render(<LookupHarness verbs={[IU, IKU]} />);

    searchFor('itta');

    expect(await screen.findByText('Ambiguous exact match')).toBeTruthy();
    expect(
      screen.getByText(/Ranked by spelling, your lookup choices, and learner level/),
    ).toBeTruthy();
    expect(screen.queryByText('Focused lookup hit')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Practice this form' })).toBeNull();

    const rankedButtons = screen
      .getAllByRole('button')
      .filter((button) => button.textContent.includes('Plain Past'));
    const goButton = rankedButtons.find((button) => button.textContent.includes('行った'));
    const sayButton = rankedButtons.find((button) => button.textContent.includes('言った'));
    expect(goButton).toBeTruthy();
    expect(sayButton).toBeTruthy();
    expect(rankedButtons).toEqual([goButton, sayButton]);

    fireEvent.click(sayButton);

    expect(await screen.findByText('Focused lookup hit')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Practice this form' })).toBeTruthy();
    await waitFor(() => {
      const reference = JSON.parse(screen.getByTestId('reference-state').textContent);
      expect(reference.history[0]).toMatchObject({ dict: '言う', count: 1 });
      expect(reference.recentSearches[0]).toBe('itta');
    });

    searchFor('');
    searchFor('itta');
    expect(await screen.findByText('Ambiguous exact match')).toBeTruthy();
    expect(screen.queryByText('Focused lookup hit')).toBeNull();
    const rerankedButtons = screen
      .getAllByRole('button')
      .filter((button) => button.textContent.includes('Plain Past'));
    expect(rerankedButtons[0].textContent).toContain('言った');
  });

  it('also requires confirmation for dictionary-reading and same-word form collisions', async () => {
    const kiruWords = [
      { dict: '切る', reading: 'きる', meaning: 'to cut', group: 'godan' },
      { dict: '着る', reading: 'きる', meaning: 'to wear', group: 'ichidan' },
    ];
    const { unmount } = render(<LookupHarness verbs={kiruWords} />);

    searchFor('きる');
    expect(await screen.findByText('Ambiguous exact match')).toBeTruthy();
    expect(screen.queryByText('Focused lookup hit')).toBeNull();

    unmount();
    render(
      <LookupHarness
        verbs={[{ dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' }]}
      />,
    );
    searchFor('食べられる');
    expect(await screen.findByText('Ambiguous exact match')).toBeTruthy();
    expect(screen.getByText('Potential')).toBeTruthy();
    expect(screen.getByText('Passive')).toBeTruthy();
    expect(screen.queryByText('Focused lookup hit')).toBeNull();
  });
});
