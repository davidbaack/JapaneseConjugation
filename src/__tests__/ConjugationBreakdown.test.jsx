// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConjugationBreakdown } from '../components/ConjugationBreakdown.jsx';
import { getConjugationDebugInfo } from '../utils/conjugatorExplain.js';

afterEach(cleanup);

const KAKU = { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' };
const KAERU = { dict: '帰る', reading: 'かえる', meaning: 'to return home', group: 'godan' };
const YOMU = { dict: '読む', reading: 'よむ', meaning: 'to read', group: 'godan' };
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
    expect(screen.getByText(/its final kana く row-shifts/)).toBeTruthy();
    expect(screen.getByText(/く → か \/ き \/ け \/ こ/)).toBeTruthy();
    expect(screen.getByText(/書きます shows き, 書かない shows か/)).toBeTruthy();
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
    expect(screen.queryByText('Row visual')).toBeNull();
    expect(screen.getByText('What went wrong')).toBeTruthy();
    expect(screen.getByText('What should have happened')).toBeTruthy();
  });

  it('explains a godan row-shift miss as the learner action versus the target action', () => {
    render(<ConjugationBreakdown word={YOMU} type="plain-negative" userAnswer="よむない" />);

    expect(screen.getByText('What went wrong')).toBeTruthy();
    expect(screen.getByText('Kept dictionary ending む + ない')).toBeTruthy();
    expect(screen.getByText('What should have happened')).toBeTruthy();
    expect(screen.getAllByText('む -> ま + ない').length).toBeGreaterThan(0);
    expect(screen.getByText(/change む to ま first, then add ない: よまない/)).toBeTruthy();
    expect(screen.getByText('Row visual')).toBeTruthy();
    expect(screen.getByText(/moves to the a-row/)).toBeTruthy();
    expect(screen.getByText('よ + ま + ない = よまない')).toBeTruthy();
  });

  it('labels ichidan as ichidan / ru-verb and bridges ta-form from masu stem', () => {
    render(<ConjugationBreakdown word={TABERU} type="plain-past" />);

    expect(screen.getByText('ichidan / ru-verb')).toBeTruthy();
    expect(
      screen.getByText(/final る simply drops, and the stem 食べ stays the same/),
    ).toBeTruthy();
    expect(screen.getByText(/Tell-tale sign: 食べます and 食べない just drop る/)).toBeTruthy();
    expect(
      screen.getByText(/Contrast: a る-ending godan verb \(帰る, 入る, 走る\) row-shifts/),
    ).toBeTruthy();
    expect(screen.getByText('食べます -> 食べ -> 食べた')).toBeTruthy();
  });

  it('explains godan る traps as changing rather than dropping る', () => {
    render(<ConjugationBreakdown word={KAERU} type="plain-past" />);

    expect(screen.getByText('godan / u-verb')).toBeTruthy();
    expect(
      screen.getByText(/帰る ends in る, so it looks like an ichidan \(ru-verb\)/),
    ).toBeTruthy();
    expect(screen.getByText(/the final る does not just drop/)).toBeTruthy();
    expect(
      screen.getByText(/shifts to the other sounds in its row \(ら \/ り \/ れ \/ ろ\)/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Tell-tale sign: 帰ります and 帰らない keep a り \/ ら sound/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Common る-trap verbs to memorize: 帰る, 入る, 走る, and 切る/),
    ).toBeTruthy();
  });

  it('keeps suru and kuru style verbs in one learner-facing irregular bucket', () => {
    render(<ConjugationBreakdown word={BENKYOU} type="plain-past" />);

    expect(screen.getByText('irregular')).toBeTruthy();
    expect(
      screen.getByText(/勉強する is in the irregular bucket: it is 勉強 \+ する/),
    ).toBeTruthy();
    expect(screen.getByText(/the する part does not follow godan or ichidan rules/)).toBeTruthy();
    expect(screen.getByText(/Recognize it by the する ending/)).toBeTruthy();
    expect(screen.getByText(/The 勉強 part never changes; only する does/)).toBeTruthy();

    cleanup();
    render(<ConjugationBreakdown word={KURU} type="plain-past" />);

    expect(screen.getByText('irregular')).toBeTruthy();
    expect(screen.getByText(/its root sound changes \(き \/ こ \/ く\)/)).toBeTruthy();
    expect(
      screen.getByText(/Recognize 来る as its own pattern and memorize its forms/),
    ).toBeTruthy();
  });

  it('explains adjective category mechanics with the same concise pattern', () => {
    render(<ConjugationBreakdown word={TAKAI} type="adj-plain-past" />);

    expect(screen.getByText('い-adjective')).toBeTruthy();
    expect(screen.getByText(/高い is an い-adjective, not a verb/)).toBeTruthy();
    expect(screen.getByText(/The final い is the part that changes/)).toBeTruthy();
    expect(screen.getByText(/Tell-tale sign: it ends in い and describes a thing/)).toBeTruthy();
    expect(
      screen.getByText(/Before a noun, the dictionary form stays as-is: 高い \+ noun/),
    ).toBeTruthy();

    cleanup();
    render(<ConjugationBreakdown word={SHIZUKA} type="adj-polite-present" />);

    expect(screen.getByText('な-adjective')).toBeTruthy();
    expect(screen.getByText(/静か is a な-adjective: the base stays the same/)).toBeTruthy();
    expect(screen.getByText(/Tell-tale sign: it does not end in a changing い/)).toBeTruthy();
    expect(screen.getByText(/It takes な before a noun \(静かな \+ noun\)/)).toBeTruthy();
  });

  it('explains irregular adjectives and noun category boundaries', () => {
    render(<ConjugationBreakdown word={II} type="adj-plain-negative" />);

    expect(screen.getByText('irregular')).toBeTruthy();
    expect(screen.getByText(/the visible いい is not the stem most forms use/)).toBeTruthy();
    expect(screen.getByText(/Recognize いい \(and かっこいい\) as exceptions/)).toBeTruthy();

    const nounCategory = getConjugationDebugInfo(GAKUSEI, 'adj-polite-present').category;

    expect(nounCategory.label).toBe('noun');
    expect(nounCategory.why).toContain('the noun itself does not conjugate');
    expect(nounCategory.checks).toContain('Do not force a noun into ichidan or godan rules.');
  });

  it('connects group choice to the conjugation rule', () => {
    const openLearn = vi.fn();
    render(<ConjugationBreakdown word={KAKU} type="plain-negative" onOpenLearn={openLearn} />);

    expect(
      screen.getByText(
        'Because this is godan: row-shift, 書く uses the か row for negative: 書かない.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'See Learn table' }));
    expect(openLearn).toHaveBeenCalledTimes(1);
  });
});
