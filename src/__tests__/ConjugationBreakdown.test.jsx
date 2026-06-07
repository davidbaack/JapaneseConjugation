// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ConjugationBreakdown } from '../components/ConjugationBreakdown.jsx';

afterEach(cleanup);

const KAKU = { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' };
const TABERU = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
const BENKYOU = { dict: '勉強する', reading: 'べんきょうする', meaning: 'to study', group: 'suru' };

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
    expect(screen.getByText('1. What category is this and why?')).toBeTruthy();
    expect(screen.getByText('godan / u-verb')).toBeTruthy();
    expect(screen.getByText('2. Step-by-step conjugation rules')).toBeTruthy();
    expect(screen.getByText('From dictionary/plain form')).toBeTruthy();
    expect(screen.getByText('From polite/masu stem')).toBeTruthy();
    expect(screen.getByText('Stem')).toBeTruthy();
    expect(screen.getByText('Ending')).toBeTruthy();
    expect(screen.getByText('Replace')).toBeTruthy();
    expect(screen.getAllByText('Result').length).toBeGreaterThan(1);
    expect(screen.getByText('か + いて = かいて')).toBeTruthy();
    expect(screen.getByText('書きます -> 書き -> 書いて')).toBeTruthy();
    expect(screen.getByText(/う\/つ\/る -> って/)).toBeTruthy();
    expect(screen.getAllByText(/く -> いて/).length).toBeGreaterThan(0);
    expect(screen.getByText(/kaku -> kaite/)).toBeTruthy();
  });

  it('labels ichidan as ichidan / ru-verb and bridges ta-form from masu stem', () => {
    render(<ConjugationBreakdown word={TABERU} type="plain-past" />);

    expect(screen.getByText('ichidan / ru-verb')).toBeTruthy();
    expect(screen.getByText('食べます -> 食べ -> 食べた')).toBeTruthy();
  });

  it('keeps suru and kuru style verbs in one learner-facing irregular bucket', () => {
    render(<ConjugationBreakdown word={BENKYOU} type="plain-past" />);

    expect(screen.getByText('irregular')).toBeTruthy();
    expect(screen.getByText(/belongs in the irregular bucket/)).toBeTruthy();
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
