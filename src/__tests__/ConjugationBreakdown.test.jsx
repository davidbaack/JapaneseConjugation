// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ConjugationBreakdown } from '../components/ConjugationBreakdown.jsx';

afterEach(cleanup);

const KAKU = { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' };
const KAERU = { dict: '帰る', reading: 'かえる', meaning: 'to return home', group: 'godan' };
const TABERU = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
const BENKYOU = { dict: '勉強する', reading: 'べんきょうする', meaning: 'to study', group: 'suru' };
const KURU = { dict: '来る', reading: 'くる', meaning: 'to come', group: 'kuru' };
const TAKAI = {
  dict: '高い',
  reading: 'たかい',
  meaning: 'expensive / tall',
  group: 'i-adjective',
};
const SHIZUKA = { dict: '静か', reading: 'しずか', meaning: 'quiet', group: 'na-adjective' };

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
    expect(screen.getByText(/final dictionary kana く changes instead of dropping/)).toBeTruthy();
    expect(screen.getByText(/forms like 書かない \/ 書きます/)).toBeTruthy();
    expect(screen.getByText(/te\/ta sound-change group for 書いて \/ 書いた/)).toBeTruthy();
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
    expect(screen.getByText(/attach the requested ending to 食べ/)).toBeTruthy();
    expect(screen.getByText(/The stem stays stable across forms/)).toBeTruthy();
    expect(screen.getByText('食べます -> 食べ -> 食べた')).toBeTruthy();
  });

  it('explains godan る traps as changing rather than dropping る', () => {
    render(<ConjugationBreakdown word={KAERU} type="plain-past" />);

    expect(screen.getByText('godan / u-verb')).toBeTruthy();
    expect(screen.getByText(/帰る ends in る, but it is still godan \/ u-verb/)).toBeTruthy();
    expect(screen.getByText(/る changes to ら \/ り \/ れ \/ ろ or って \/ った/)).toBeTruthy();
    expect(screen.getByText(/forms like 帰らない \/ 帰ります and 帰って \/ 帰った/)).toBeTruthy();
    expect(screen.getByText(/does not use the ichidan drop-る pattern/)).toBeTruthy();
  });

  it('keeps suru and kuru style verbs in one learner-facing irregular bucket', () => {
    render(<ConjugationBreakdown word={BENKYOU} type="plain-past" />);

    expect(screen.getByText('irregular')).toBeTruthy();
    expect(screen.getByText(/belongs in the irregular bucket/)).toBeTruthy();
    expect(screen.getByText(/keep the part before する/)).toBeTruthy();

    cleanup();
    render(<ConjugationBreakdown word={KURU} type="plain-past" />);

    expect(screen.getByText('irregular')).toBeTruthy();
    expect(screen.getByText(/来る changes its root sound by form/)).toBeTruthy();
    expect(screen.getByText(/き, こ, and く all appearing/)).toBeTruthy();
  });

  it('explains adjective category mechanics with the same concise pattern', () => {
    render(<ConjugationBreakdown word={TAKAI} type="adj-plain-past" />);

    expect(screen.getByText('い-adjective')).toBeTruthy();
    expect(screen.getByText(/高い is an い-adjective/)).toBeTruthy();
    expect(screen.getByText(/final い changes or drops/)).toBeTruthy();

    cleanup();
    render(<ConjugationBreakdown word={SHIZUKA} type="adj-polite-present" />);

    expect(screen.getByText('な-adjective')).toBeTruthy();
    expect(screen.getByText(/the base 静か stays/)).toBeTruthy();
    expect(screen.getByText(/だ \/ です \/ ではない \/ な/)).toBeTruthy();
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
