// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PracticeSelector from '../views/study/PracticeSelector.jsx';
import { ALL_CARD_TYPES } from '../data/conjugationTypes.js';
import { PRACTICE_FORM_CHOICES, PRACTICE_FORM_SECTIONS } from '../data/practiceFormChoices.js';
import {
  defaultPracticeSelection,
  practiceSelectionForTypeIds,
  setPracticeFilterSelection,
  togglePracticeTypeSelection,
} from '../utils/practiceSelection.js';

afterEach(cleanup);

function Chooser({ initial = defaultPracticeSelection() }) {
  const [selection, setSelection] = useState(initial);
  return (
    <PracticeSelector
      selection={selection}
      onToggleType={(id) => setSelection((current) => togglePracticeTypeSelection(current, id))}
    />
  );
}

describe('exact-form chooser', () => {
  it('offers every exact form once with distinct names', () => {
    const ids = PRACTICE_FORM_SECTIONS.flatMap((section) => section.typeIds);
    expect(ids.length).toBe(ALL_CARD_TYPES.length);
    expect(new Set(ids)).toEqual(new Set(ALL_CARD_TYPES.map((type) => type.id)));
    expect(new Set(PRACTICE_FORM_CHOICES.map((type) => type.choiceLabel)).size).toBe(
      ALL_CARD_TYPES.length,
    );
  });

  it('restores section expansion after searching names, meanings, and Japanese examples', () => {
    render(<Chooser />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose forms' }));
    const basic = screen.getByRole('button', { name: 'Basic forms 8 selected' });
    const potential = screen.getByRole('button', { name: 'Potential', exact: true });
    expect(basic.getAttribute('aria-expanded')).toBe('true');
    expect(potential.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(potential);
    const search = screen.getByRole('searchbox', { name: 'Find a form' });
    for (const query of ['CAN', 'potential', '書ける', 'かける']) {
      fireEvent.change(search, { target: { value: query } });
      expect(screen.getByRole('checkbox', { name: 'Potential · plain', exact: true }).checked).toBe(
        false,
      );
      expect(screen.getByRole('heading', { name: 'Practicing 8 forms' })).toBeTruthy();
    }
    fireEvent.change(search, { target: { value: '' } });
    expect(
      screen.getByRole('button', { name: 'Basic forms 8 selected' }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Potential', exact: true }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Passive', exact: true }).getAttribute('aria-expanded'),
    ).toBe('false');
    fireEvent.change(search, { target: { value: 'no-such-form' } });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByText(/No forms found/)).toBeTruthy();
  });

  it('shows all checked names for a small selection and removes a section final form', () => {
    render(<Chooser initial={practiceSelectionForTypeIds(['potential', 'te-form'])} />);
    expect(screen.getByTestId('practice-form-summary').textContent).toBe(
      'Te-form / Potential · plain',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose forms' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Potential · plain', exact: true }));
    expect(screen.getByRole('heading', { name: 'Practicing 1 form' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Te-form', exact: true }));
    expect(screen.getByRole('checkbox', { name: 'Te-form', exact: true }).checked).toBe(true);
  });

  it('shows only effective forms from an existing filtered selection and clears hidden restrictions on edit', () => {
    render(
      <Chooser initial={setPracticeFilterSelection(defaultPracticeSelection(), 'time', 'past')} />,
    );
    expect(screen.getByRole('heading', { name: 'Practicing 4 forms' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Choose forms' }));
    expect(screen.getByRole('checkbox', { name: 'Non-past · plain', exact: true }).checked).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Te-form', exact: true }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Te-form', exact: true }));
    expect(screen.getByRole('heading', { name: 'Practicing 5 forms' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Non-past · plain', exact: true }).checked).toBe(
      false,
    );
  });
});
