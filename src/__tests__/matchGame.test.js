import { describe, it, expect } from 'vitest';
import { buildMatchPairs, dealTiles } from '../utils/matchGame.js';
import { conjugateItem } from '../utils/conjugator.js';
import { CONJ_TYPES } from '../data/conjugationTypes.js';

const VERBS = [
  { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' },
  { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' },
  { dict: '話す', reading: 'はなす', meaning: 'to speak', group: 'godan' },
  { dict: '飲む', reading: 'のむ', meaning: 'to drink', group: 'godan' },
  { dict: '見る', reading: 'みる', meaning: 'to see', group: 'ichidan' },
  { dict: '泳ぐ', reading: 'およぐ', meaning: 'to swim', group: 'godan' },
];
const ENABLED = CONJ_TYPES.map((t) => t.id);

describe('buildMatchPairs', () => {
  it('deals the requested number of valid word/form pairs', () => {
    const pairs = buildMatchPairs(VERBS, ENABLED, undefined, 4);
    expect(pairs).toHaveLength(4);
    for (const pair of pairs) {
      // The conjugated form on the answer tile must match the engine's output.
      expect(pair.expected).toBe(conjugateItem(pair.item, pair.type.id));
      expect(pair.prompt.main).toBeTruthy();
      expect(pair.answer.main).toBeTruthy();
    }
  });

  it('never returns more pairs than the pool can supply', () => {
    const pairs = buildMatchPairs(VERBS.slice(0, 2), ENABLED, undefined, 6);
    expect(pairs.length).toBeLessThanOrEqual(2);
  });

  it('returns an empty array when there are no eligible words', () => {
    expect(buildMatchPairs([], ENABLED, undefined, 4)).toEqual([]);
  });
});

describe('dealTiles', () => {
  it('produces a prompt and an answer tile for every pair', () => {
    const pairs = buildMatchPairs(VERBS, ENABLED, undefined, 4);
    const tiles = dealTiles(pairs);
    expect(tiles).toHaveLength(pairs.length * 2);
    for (const pair of pairs) {
      const sides = tiles
        .filter((t) => t.pairId === pair.pairId)
        .map((t) => t.side)
        .sort();
      expect(sides).toEqual(['answer', 'prompt']);
    }
  });
});
