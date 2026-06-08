// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ConjugationBreakdown } from '../components/ConjugationBreakdown.jsx';
import { getConjugationDebugInfo } from '../utils/conjugatorExplain.js';

afterEach(cleanup);

const KAKU = { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' };
const KAERU = { dict: '帰る', reading: 'かえる', meaning: 'to return home', group: 'godan' };
const TABERU = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
const BENKYOU = { dict: '勉強する', reading: 'べんきょうする', meaning: 'to study', group: 'suru' };
const KURU = { dict: '来る', reading: 'くる', meaning: 'to come', group: 'kuru' };
const II = {
  dict: 'いい',
  reading: 'いい',
  meaning: 'good',
  group: 'i-adjective',
  irregular: true,
};
const TAKAI = {
  dict: '高い',
  reading: 'たかい',
  meaning: 'expensive / tall',
  group: 'i-adjective',
};
const SHIZUKA = { dict: '静か', reading: 'しずか', meaning: 'quiet', group: 'na-adjective' };
const GAKUSEI = { dict: '学生', reading: 'がくせい', meaning: 'student', group: 'noun' };

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
    expect(screen.getByText(/final dictionary kana く is the moving part/)).toBeTruthy();
    expect(
      screen.getByText(/く can move to か \/ き \/ け \/ こ, giving 書かない \/ 書きます/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Te\/past check: 書く uses the く sound-change group, giving 書いて \/ 書いた/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Watch for る-ending godan verbs too/)).toBeTruthy();
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
    expect(screen.getByText(/final る drops and the stem 食べ stays stable/)).toBeTruthy();
    expect(screen.getByText(/Masu check: 食べる -> 食べます/)).toBeTruthy();
    expect(
      screen.getByText(/Negative check: drop る and attach ない, giving 食べない/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Te\/past check: attach directly to the same stem, giving 食べて \/ 食べた/),
    ).toBeTruthy();
    expect(screen.getByText('食べます -> 食べ -> 食べた')).toBeTruthy();
  });

  it('explains godan る traps as changing rather than dropping る', () => {
    render(<ConjugationBreakdown word={KAERU} type="plain-past" />);

    expect(screen.getByText('godan / u-verb')).toBeTruthy();
    expect(screen.getByText(/帰る ends in る, but it is godan \/ u-verb/)).toBeTruthy();
    expect(screen.getByText(/final る changes rows instead of disappearing/)).toBeTruthy();
    expect(screen.getByText(/forms with ら \/ り \/ れ \/ ろ/)).toBeTruthy();
    expect(
      screen.getByText(
        /Te\/past check: 帰る uses the う\/つ\/る sound-change group, giving 帰って \/ 帰った/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Trap check: final る alone is not enough/)).toBeTruthy();
    expect(screen.getByText(/帰ります and 帰らない show り \/ ら/)).toBeTruthy();
  });

  it('keeps suru and kuru style verbs in one learner-facing irregular bucket', () => {
    render(<ConjugationBreakdown word={BENKYOU} type="plain-past" />);

    expect(screen.getByText('irregular')).toBeTruthy();
    expect(screen.getByText(/belongs in the irregular bucket/)).toBeTruthy();
    expect(screen.getByText(/does not follow the normal godan or ichidan pattern/)).toBeTruthy();
    expect(screen.getByText(/勉強する is treated as 勉強 \+ する/)).toBeTruthy();
    expect(
      screen.getByText(/Common anchors: 勉強しない \/ 勉強します \/ 勉強して \/ 勉強できる/),
    ).toBeTruthy();

    cleanup();
    render(<ConjugationBreakdown word={KURU} type="plain-past" />);

    expect(screen.getByText('irregular')).toBeTruthy();
    expect(screen.getByText(/来る changes its root sound by form/)).toBeTruthy();
    expect(screen.getByText(/same word can use き, こ, or く/)).toBeTruthy();
    expect(screen.getByText(/Common anchors: 来ます \/ 来ない \/ 来て \/ 来た/)).toBeTruthy();
  });

  it('explains adjective category mechanics with the same concise pattern', () => {
    render(<ConjugationBreakdown word={TAKAI} type="adj-plain-past" />);

    expect(screen.getByText('い-adjective')).toBeTruthy();
    expect(screen.getByText(/高い is an い-adjective/)).toBeTruthy();
    expect(screen.getByText(/final い is the part that changes/)).toBeTruthy();
    expect(
      screen.getByText(
        /Ending check: い changes into adjective endings, giving 高くない \/ 高かった \/ 高くて/,
      ),
    ).toBeTruthy();

    cleanup();
    render(<ConjugationBreakdown word={SHIZUKA} type="adj-polite-present" />);

    expect(screen.getByText('な-adjective')).toBeTruthy();
    expect(screen.getByText(/base stays mostly unchanged/)).toBeTruthy();
    expect(
      screen.getByText(/Predicate check: attach です or だ-style endings, giving 静かです/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Negative check: use a copula-style negative, giving 静かではない/),
    ).toBeTruthy();
    expect(screen.getByText(/Before a noun, add な: 静かな \+ noun/)).toBeTruthy();
  });

  it('explains irregular adjectives and noun category boundaries', () => {
    render(<ConjugationBreakdown word={II} type="adj-plain-negative" />);

    expect(screen.getByText('irregular')).toBeTruthy();
    expect(
      screen.getByText(/visible いい form is not the stem used by most conjugations/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Stem check: use よ before endings, giving よくない \/ よかった \/ よくて/),
    ).toBeTruthy();

    const nounCategory = getConjugationDebugInfo(GAKUSEI, 'adj-polite-present').category;

    expect(nounCategory.label).toBe('noun');
    expect(nounCategory.why).toContain('the noun itself does not conjugate');
    expect(nounCategory.checks).toContain('Do not force a noun into ichidan or godan rules.');
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
