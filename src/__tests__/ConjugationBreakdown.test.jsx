// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ConjugationBreakdown } from '../components/ConjugationBreakdown.jsx';

afterEach(cleanup);

const KAKU = { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' };

describe('ConjugationBreakdown', () => {
  it('renders a mobile-readable visual rule path and inferred wrong pattern', () => {
    render(
      <ConjugationBreakdown
        word={KAKU}
        type="te-form"
        userAnswer="かって"
        practicePrefs={{ displayScripts: { kanji: true, kana: true, romaji: true } }}
      />,
    );

    expect(screen.getByText('Visual Rule Path')).toBeTruthy();
    expect(screen.getByText('Stem')).toBeTruthy();
    expect(screen.getByText('Ending')).toBeTruthy();
    expect(screen.getByText('Replace')).toBeTruthy();
    expect(screen.getByText('Result')).toBeTruthy();
    expect(screen.getByText('か + いて = かいて')).toBeTruthy();
    expect(screen.getByText(/う\/つ\/る -> って/)).toBeTruthy();
    expect(screen.getAllByText(/く -> いて/).length).toBeGreaterThan(0);
    expect(screen.getByText(/kaku -> kaite/)).toBeTruthy();
  });

  it('connects group choice to the conjugation rule', () => {
    render(<ConjugationBreakdown word={KAKU} type="plain-negative" />);

    expect(
      screen.getByText(
        'Because this is godan: row-shift, 書く uses the か row for negative: 書かない.',
      ),
    ).toBeTruthy();
  });
});
