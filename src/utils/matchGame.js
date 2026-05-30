// Conjugation Match — pure board-building logic, kept out of the view so it can
// be unit-tested. Mirrors RushView's buildRound (src/views/RushView.jsx) but deals
// a whole board of word ⇄ conjugated-form pairs instead of one prompt at a time.
import { practiceTypesForItem, pickPromptType, conjugateItem } from './conjugator.js';
import { promptDisplay, formDisplay, shuffled } from './display.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

// Build `pairCount` distinct word/form pairs from the eligible word pool. Each
// pair couples a dictionary-form prompt with one of that word's enabled conjugated
// forms. Returns fewer pairs than requested only when the pool can't supply more.
export function buildMatchPairs(eligible, enabledTypes, prefs = DEFAULT_PREFS, pairCount = 6) {
  const pool = shuffled(eligible || []);
  const pairs = [];
  for (const item of pool) {
    if (pairs.length >= pairCount) break;
    const types = practiceTypesForItem(item, enabledTypes, prefs);
    if (!types.length) continue;
    const type = shuffled(types)[0];
    const promptType = pickPromptType(item, type.id, prefs);
    const expected = conjugateItem(item, type.id);
    if (!expected) continue;
    pairs.push({
      pairId: `${item.dict}-${type.id}`,
      item,
      type,
      promptType,
      prompt: promptDisplay(item, promptType, prefs),
      expected,
      answer: formDisplay(expected, prefs, item, type.id),
    });
  }
  return pairs;
}

// Flatten pairs into a shuffled tile array. Each pair yields a `prompt` tile and an
// `answer` tile sharing the same pairId, each with a stable id for React keys.
export function dealTiles(pairs) {
  const tiles = [];
  for (const pair of pairs) {
    tiles.push({ id: `${pair.pairId}:prompt`, pairId: pair.pairId, side: 'prompt', pair });
    tiles.push({ id: `${pair.pairId}:answer`, pairId: pair.pairId, side: 'answer', pair });
  }
  return shuffled(tiles);
}
