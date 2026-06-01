import { describe, expect, it } from 'vitest';
import {
  RUSH_MIN_LIMIT_MS,
  RUSH_START_LIMIT_MS,
  isRushAnswerCorrect,
  rushLimitForWave,
  rushWaveForCleared,
} from '../utils/rush.js';

describe('rush timing', () => {
  it('starts slower and accelerates by wave', () => {
    expect(rushLimitForWave(1)).toBe(RUSH_START_LIMIT_MS);
    expect(rushLimitForWave(1)).toBeGreaterThan(8500);
    expect(rushLimitForWave(2)).toBeLessThan(rushLimitForWave(1));
    expect(rushLimitForWave(5)).toBeLessThan(rushLimitForWave(4));
    expect(rushLimitForWave(100)).toBe(RUSH_MIN_LIMIT_MS);
  });

  it('moves to the next wave after every five cleared cards', () => {
    expect(rushWaveForCleared(0)).toBe(1);
    expect(rushWaveForCleared(4)).toBe(1);
    expect(rushWaveForCleared(5)).toBe(2);
    expect(rushWaveForCleared(10)).toBe(3);
  });
});

describe('rush answer matching', () => {
  it('accepts completed romaji or kana answers without Enter', () => {
    const tabeta = '\u305f\u3079\u305f';

    expect(isRushAnswerCorrect('tabeta', tabeta)).toBe(true);
    expect(isRushAnswerCorrect(` ${tabeta} `, tabeta)).toBe(true);
    expect(isRushAnswerCorrect('tabete', tabeta)).toBe(false);
  });
});
