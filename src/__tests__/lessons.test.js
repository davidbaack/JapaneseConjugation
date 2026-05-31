import { describe, expect, it } from 'vitest';
import { ALL_CARD_TYPES } from '../data/conjugationTypes.js';
import { LESSON_SECTIONS, getLessonCoverage } from '../data/lessonContent.js';

describe('lesson content', () => {
  it('maps every practice form to a lesson', () => {
    const coverage = getLessonCoverage();

    expect(coverage.covered).toBe(ALL_CARD_TYPES.length);
    expect(coverage.missing).toEqual([]);
  });

  it('does not include stale form ids', () => {
    const known = new Set(ALL_CARD_TYPES.map((type) => type.id));
    const stale = LESSON_SECTIONS.flatMap((lesson) =>
      lesson.typeIds.filter((id) => !known.has(id)).map((id) => `${lesson.groupId}:${id}`),
    );

    expect(stale).toEqual([]);
  });
});
