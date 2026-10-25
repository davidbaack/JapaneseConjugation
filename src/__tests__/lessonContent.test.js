import { describe, expect, it } from 'vitest';
import { LESSON_SECTIONS, LESSON_TRACKS, RU_MASU_DIAGNOSTIC_ROWS } from '../data/lessonContent.js';

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

  it('provides kana and meanings for every base and form in the beginner track', () => {
    const beginner = LESSON_TRACKS.find((track) => track.id === 'beginner');
    for (const groupId of beginner.lessonGroupIds) {
      const lesson = LESSON_SECTIONS.find((section) => section.groupId === groupId);
      for (const [base, forms] of lesson.examples) {
        const support = lesson.exampleSupport[base];
        expect(support, `${groupId}: ${base}`).toBeTruthy();
        expect(support.reading).toMatch(/^[\u3040-\u30ff]+$/u);
        expect(support.meaning).toMatch(/[a-z]/i);
        expect(support.forms).toHaveLength(forms.split(' / ').length);
        for (const [reading, meaning] of support.forms) {
          expect(reading).toMatch(/^[\u3040-\u30ff]+$/u);
          expect(meaning).toMatch(/[a-z]/i);
        }
      }
    }
  });
});
