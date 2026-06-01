import { toHiraganaProgress } from './romaji.js';
import { conjugateItem, isAdjective } from './conjugator.js';
import { getTypeInfo } from '../data/conjugationTypes.js';
import { GROUP_NAMES } from './conjugatorExplain.js';

export function kanaCoachCells(
  expected,
  input,
  revealed = 0,
  pendingLast = false,
  greenRevealed = 0,
) {
  const target = Array.from(expected || '');
  const typed = Array.from(toHiraganaProgress(input || ''));
  const completeMatch =
    typed.length === target.length && target.every((kana, i) => typed[i] === kana);
  // Trailing 'n' is held pending in progress mode; commit it as 'ん' when context confirms it
  if (
    typed.length < target.length &&
    target[typed.length] === 'ん' &&
    /n$/i.test((input || '').trimEnd())
  ) {
    typed.push('ん');
  }
  const lastTypedIndex = typed.length - 1;
  const cells = target.map((expectedKana, i) => {
    const got = typed[i] || '';
    // Positions that have been correctly typed at some point stay green: keep them
    // green when re-typed (skip the pending styling) and refill them when backspaced.
    const greenRevealedCell = i < greenRevealed;
    const hinted = !got && i < revealed;
    let state;
    if (got) {
      if (got === expectedKana) {
        state =
          pendingLast && i === lastTypedIndex && !greenRevealedCell && !completeMatch
            ? 'pending'
            : 'correct';
      } else {
        state = pendingLast && i === lastTypedIndex ? 'pending' : 'wrong';
      }
    } else {
      state = greenRevealedCell ? 'correct' : hinted ? 'hint' : 'empty';
    }
    return {
      expected: expectedKana,
      shown: got || (greenRevealedCell || hinted ? expectedKana : ''),
      state,
    };
  });
  for (let i = target.length; i < typed.length; i++) {
    cells.push({
      expected: '',
      shown: typed[i],
      state: pendingLast && i === lastTypedIndex ? 'pending' : 'extra',
    });
  }
  return cells;
}

export function explainReversePrompt(item, type) {
  const form = conjugateItem(item, type);
  const ti = getTypeInfo(type);
  return {
    intro: `${item.dict} (${item.reading}) is ${GROUP_NAMES[item.group]}.`,
    rule: `The prompt was the ${ti.label} form ${form}. Reverse drills ask you to identify the dictionary form behind that conjugation.`,
    derivation: `${form} → ${item.reading}`,
    note: isAdjective(item)
      ? 'Answer with the dictionary adjective form, not another tense or politeness level.'
      : 'Answer with the dictionary verb form, the form used in dictionaries before adding endings.',
  };
}
