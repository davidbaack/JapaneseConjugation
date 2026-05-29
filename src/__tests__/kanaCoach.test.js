import { describe, it, expect } from 'vitest';
import { kanaCoachCells } from '../utils/kanaCoach.js';

const states = cells => cells.map(c => c.state);
const shown = cells => cells.map(c => c.shown);

describe('kanaCoachCells green water-mark', () => {
  const expected = 'たべます';

  it('marks correctly typed leading kana green, last kana pending while answering', () => {
    const cells = kanaCoachCells(expected, 'tabema', 0, true, 0);
    // た べ ま → first two committed green, ま pending, す empty
    expect(states(cells)).toEqual(['correct', 'correct', 'pending', 'empty']);
  });

  it('keeps already-green kana green after a backspace (refills emptied cells)', () => {
    // Typed up to "たべま" so two kana committed green (water-mark = 2),
    // then backspaced down to just "た".
    const cells = kanaCoachCells(expected, 'ta', 0, true, 2);
    expect(states(cells)).toEqual(['correct', 'correct', 'empty', 'empty']);
    // The refilled (backspaced) cell still shows its expected kana.
    expect(shown(cells)[1]).toBe('べ');
  });

  it('reveals re-typed kana as green right away instead of pending', () => {
    // Water-mark of 2 means re-typing the 2nd kana shows green immediately,
    // not the usual pending styling for the last typed character.
    const cells = kanaCoachCells(expected, 'tabe', 0, true, 2);
    expect(states(cells)).toEqual(['correct', 'correct', 'empty', 'empty']);
  });

  it('still flags a wrong kana red even within the green water-mark', () => {
    // Type a wrong second kana; it must not be forced green.
    const cells = kanaCoachCells(expected, 'tana', 0, false, 2);
    expect(states(cells).slice(0, 2)).toEqual(['correct', 'wrong']);
  });

  it('does not invent green cells without a water-mark', () => {
    const cells = kanaCoachCells(expected, 'ta', 0, true, 0);
    expect(states(cells)).toEqual(['pending', 'empty', 'empty', 'empty']);
  });

  it('prefers green over an amber hint for revealed positions', () => {
    const cells = kanaCoachCells(expected, '', 4, false, 2);
    expect(states(cells)).toEqual(['correct', 'correct', 'hint', 'hint']);
  });
});
