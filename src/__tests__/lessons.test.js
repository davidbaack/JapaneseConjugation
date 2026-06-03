import { describe, expect, it } from 'vitest';
import { ALL_CARD_TYPES } from '../data/conjugationTypes.js';
import { LESSON_SECTIONS, LESSON_TRACKS, getLessonCoverage } from '../data/lessonContent.js';

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

  it('organizes every lesson into one guided level track', () => {
    expect(LESSON_TRACKS.map((track) => track.id)).toEqual([
      'beginner',
      'intermediate',
      'advanced',
    ]);

    const known = new Set(LESSON_SECTIONS.map((lesson) => lesson.groupId));
    const tracked = LESSON_TRACKS.flatMap((track) => track.lessonGroupIds);
    const stale = tracked.filter((groupId) => !known.has(groupId));

    expect(stale).toEqual([]);
    expect(new Set(tracked)).toEqual(known);
    expect(tracked).toHaveLength(known.size);
  });
});
