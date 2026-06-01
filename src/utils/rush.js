import { toHiragana } from './romaji.js';

export const RUSH_CARDS_PER_WAVE = 5;
export const RUSH_START_LIMIT_MS = 12000;
export const RUSH_WAVE_ACCELERATION_MS = 900;
export const RUSH_MIN_LIMIT_MS = 4200;

export function rushWaveForCleared(cleared) {
  return 1 + Math.floor(Math.max(0, cleared) / RUSH_CARDS_PER_WAVE);
}

export function rushLimitForWave(wave) {
  const safeWave = Math.max(1, Math.floor(Number.isFinite(wave) ? wave : 1));
  return Math.max(
    RUSH_MIN_LIMIT_MS,
    RUSH_START_LIMIT_MS - (safeWave - 1) * RUSH_WAVE_ACCELERATION_MS,
  );
}

export function normalizeRushAnswer(answer) {
  return toHiragana(answer);
}

export function isRushAnswerCorrect(answer, expected) {
  return !!expected && normalizeRushAnswer(answer) === expected;
}
