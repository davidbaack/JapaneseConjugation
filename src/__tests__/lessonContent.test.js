import { describe, expect, it } from 'vitest';
import { RU_MASU_DIAGNOSTIC_ROWS } from '../data/lessonContent.js';

describe('lesson content', () => {
  it('teaches the ru-verb masu diagnostic with trap and homophone examples', () => {
    expect(RU_MASU_DIAGNOSTIC_ROWS.map((row) => row.dict)).toEqual([
      '食べる',
      '見る',
      '走る',
      '帰る',
      '切る',
      '着る',
    ]);
    expect(RU_MASU_DIAGNOSTIC_ROWS.find((row) => row.dict === '走る')).toMatchObject({
      polite: '走ります',
      group: 'godan',
    });
    expect(RU_MASU_DIAGNOSTIC_ROWS.find((row) => row.dict === '着る')).toMatchObject({
      polite: '着ます',
      group: 'ichidan',
    });
  });
});
