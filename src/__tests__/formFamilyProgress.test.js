import { describe, expect, it } from 'vitest';

import { buildFormFamilyProgress } from '../utils/formFamilyProgress.js';
import { cardIdFor, defaultState } from '../utils/storage.js';

const KAKU = {
  dict: '\u66f8\u304f',
  reading: '\u304b\u304f',
  meaning: 'to write',
  group: 'godan',
};

function teTaRow(progress) {
  return progress.rows.find((row) => row.id === 'te-ta-sound-changes');
}

describe('form family progress rollup', () => {
  it('counts reading dictionary cards through their source form stats', () => {
    const progress = buildFormFamilyProgress({
      ...defaultState(),
      cards: {
        [cardIdFor(KAKU, 'dictionary')]: {
          correct: 1,
          incorrect: 1,
          sourceTypeStats: {
            'plain-past': { correct: 1, incorrect: 1, lastAt: 1000 },
          },
        },
      },
    });

    expect(progress.totalPracticed).toBe(2);
    expect(teTaRow(progress)).toMatchObject({
      attempted: 2,
      correct: 1,
      incorrect: 1,
    });
  });

  it('keeps legacy unattributed dictionary cards in the headline total only', () => {
    const progress = buildFormFamilyProgress({
      ...defaultState(),
      cards: {
        [cardIdFor(KAKU, 'dictionary')]: {
          correct: 2,
          incorrect: 1,
        },
      },
    });

    expect(progress.totalPracticed).toBe(3);
    expect(progress.unattributedPracticed).toBe(3);
    expect(progress.rows.every((row) => row.attempted === 0)).toBe(true);
  });

  it('best-effort attributes legacy dictionary cards that still have one source type', () => {
    const progress = buildFormFamilyProgress({
      ...defaultState(),
      cards: {
        [cardIdFor(KAKU, 'dictionary')]: {
          correct: 2,
          incorrect: 0,
          sourceType: 'plain-past',
        },
      },
    });

    expect(progress.totalPracticed).toBe(2);
    expect(progress.unattributedPracticed).toBe(0);
    expect(teTaRow(progress).attempted).toBe(2);
  });

  it('classifies reading mistakes by their source form family', () => {
    const progress = buildFormFamilyProgress({
      ...defaultState(),
      cards: {
        [cardIdFor(KAKU, 'dictionary')]: {
          correct: 1,
          incorrect: 0,
          sourceTypeStats: {
            'plain-past': { correct: 1, incorrect: 0, lastAt: 1000 },
          },
        },
      },
      mistakes: [
        {
          type: 'dictionary',
          promptType: 'plain-past',
          resolved: false,
        },
      ],
    });

    expect(teTaRow(progress)).toMatchObject({
      attempted: 1,
      mistakeCount: 1,
      status: 'weak',
    });
  });
});
