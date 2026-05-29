import { describe, it, expect } from 'vitest';
import { conjugateItem, explainItem, stepCoachHint, compatibleTypes } from '../utils/conjugator.js';

// Representative words spanning every class: ichidan, all godan endings
// (う/く/ぐ/す/つ/ぬ/ぶ/む/る) + the 行く exception, both irregular verbs and
// a compound する verb, a regular and an irregular い-adjective, and a な-adjective.
const WORDS = [
  { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' },
  { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' },
  { dict: '泳ぐ', reading: 'およぐ', meaning: 'to swim', group: 'godan' },
  { dict: '話す', reading: 'はなす', meaning: 'to speak', group: 'godan' },
  { dict: '待つ', reading: 'まつ', meaning: 'to wait', group: 'godan' },
  { dict: '死ぬ', reading: 'しぬ', meaning: 'to die', group: 'godan' },
  { dict: '遊ぶ', reading: 'あそぶ', meaning: 'to play', group: 'godan' },
  { dict: '飲む', reading: 'のむ', meaning: 'to drink', group: 'godan' },
  { dict: '買う', reading: 'かう', meaning: 'to buy', group: 'godan' },
  { dict: '帰る', reading: 'かえる', meaning: 'to return', group: 'godan' },
  { dict: '行く', reading: 'いく', meaning: 'to go', group: 'godan' },
  { dict: 'する', reading: 'する', meaning: 'to do', group: 'suru' },
  { dict: '勉強する', reading: 'べんきょうする', meaning: 'to study', group: 'suru' },
  { dict: '来る', reading: 'くる', meaning: 'to come', group: 'kuru' },
  { dict: '高い', reading: 'たかい', meaning: 'expensive', group: 'i-adjective' },
  { dict: 'いい', reading: 'いい', meaning: 'good', group: 'i-adjective', irregular: true },
  { dict: '静か', reading: 'しずか', meaning: 'quiet', group: 'na-adjective' },
];

// Every (word, type) pair that produces a real (non-empty) conjugation.
const COMBOS = [];
for (const w of WORDS) {
  for (const t of compatibleTypes(w)) {
    const answer = conjugateItem(w, t.id);
    if (answer) COMBOS.push({ w, type: t.id, answer });
  }
}

describe('stepCoachHint coverage sweep (all classes × all conjugations)', () => {
  it('sweeps a meaningful number of combos', () => {
    expect(COMBOS.length).toBeGreaterThan(1000);
  });

  it('never throws and always returns { text:string, masked:boolean }', () => {
    for (const { w, type } of COMBOS) {
      for (const typed of ['', 'x', conjugateItem(w, type)]) {
        const out = stepCoachHint(w, type, typed);
        expect(typeof out.text).toBe('string');
        expect(out.text.length).toBeGreaterThan(0);
        expect(typeof out.masked).toBe('boolean');
      }
    }
  });

  it('always includes a non-empty build recipe', () => {
    const empties = COMBOS.filter(({ w, type }) => {
      const e = explainItem(w, type);
      return ![e.rule, e.note].filter(Boolean).join(' ').trim();
    }).map(({ w, type }) => `${w.dict}/${type}`);
    expect(empties).toEqual([]);
  });

  it('first hint never reveals the answer (regular forms derive it, irregulars are masked)', () => {
    const leaks = [];
    for (const { w, type, answer } of COMBOS) {
      if (answer.length < 2) continue;
      if (answer === w.reading) continue; // unchanged dictionary form — already on screen, nothing to spoil
      const half = answer.slice(0, Math.ceil(answer.length / 2)); // a correct prefix
      const { text } = stepCoachHint(w, type, half); // reveal defaults to false
      if (text.includes(answer)) leaks.push(`${w.dict}/${type}`);
    }
    expect(leaks).toEqual([]);
  });

  it('any masked irregular form reveals its steps on the second pass', () => {
    const masked = COMBOS.filter(({ w, type }) => stepCoachHint(w, type, '').masked);
    expect(masked.length).toBeGreaterThan(0); // する/来る etc. should be in here
    for (const { w, type, answer } of masked) {
      const revealed = stepCoachHint(w, type, '', true);
      expect(revealed.masked).toBe(false);
      expect(revealed.text).toContain(answer);
    }
  });

  it('regular, derivable forms are never masked', () => {
    const REGULAR = ['食べる', '書く', '待つ', '飲む', '高い', '静か'];
    const wrongly = COMBOS
      .filter(({ w, type }) => REGULAR.includes(w.dict) && stepCoachHint(w, type, '').masked)
      .map(({ w, type }) => `${w.dict}/${type}`);
    expect(wrongly).toEqual([]);
  });
});
