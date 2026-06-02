import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { wordKey } from '../utils/conjugator.js';
import { cardIdFor } from '../utils/storage.js';
import {
  filterWordsForStudyScope,
  introducedBuiltInWordCount,
  wordProgressionScore,
} from '../utils/vocabularyProgression.js';

function word(index, overrides = {}) {
  return {
    dict: `word-${index}`,
    reading: `word-${index}`,
    meaning: `word ${index}`,
    group: 'godan',
    jlpt: 'N5',
    lesson: Math.min(index + 1, 23),
    minnaLesson: Math.min(index + 1, 50),
    common: true,
    ...overrides,
  };
}

describe('vocabulary progression', () => {
  it('starts fresh automatic study with the first 24 ranked words', () => {
    const words = Array.from({ length: 40 }, (_, i) => word(i));

    const result = filterWordsForStudyScope(words, { cards: {} }, DEFAULT_PREFS, []);

    expect(result).toHaveLength(24);
    expect(result.map((item) => item.dict)).toEqual(
      [...words]
        .sort((a, b) => wordProgressionScore(a) - wordProgressionScore(b))
        .slice(0, 24)
        .map((item) => item.dict),
    );
  });

  it('expands the automatic tier from existing SRS word history', () => {
    const words = Array.from({ length: 70 }, (_, i) => word(i));
    const cards = Object.fromEntries(
      words.slice(0, 12).map((item) => [cardIdFor(item, 'plain-past'), { reps: 1 }]),
    );

    const result = filterWordsForStudyScope(words, { cards }, DEFAULT_PREFS, []);

    expect(introducedBuiltInWordCount({ cards }, words)).toBe(12);
    expect(result).toHaveLength(55);
  });

  it('ignores removed global vocabulary filter prefs for automatic study', () => {
    const words = [
      ...Array.from({ length: 30 }, (_, i) => word(i)),
      word(99, { dict: 'advanced', reading: 'advanced', jlpt: 'N1', lesson: 50, minnaLesson: 50 }),
    ];
    const prefs = {
      ...DEFAULT_PREFS,
      jlptLevels: ['N1'],
      genkiLessons: null,
      minnaLessons: null,
      wordTypes: ['na-adjective'],
      wordGroups: ['ichidan'],
    };

    const result = filterWordsForStudyScope(words, { cards: {} }, prefs, []);

    expect(result).toHaveLength(24);
    expect(result.some((item) => item.jlpt === 'N5')).toBe(true);
  });

  it('keeps nouns out of automatic study by default, but includes them when opted in', () => {
    const words = [
      ...Array.from({ length: 10 }, (_, i) => word(i)),
      word(50, { dict: '本', reading: 'ほん', meaning: 'book', group: 'noun' }),
      word(51, { dict: '学生', reading: 'がくせい', meaning: 'student', group: 'noun' }),
    ];

    const defaultResult = filterWordsForStudyScope(words, { cards: {} }, DEFAULT_PREFS, []);
    expect(defaultResult.some((item) => item.group === 'noun')).toBe(false);

    const optedIn = filterWordsForStudyScope(
      words,
      { cards: {} },
      { ...DEFAULT_PREFS, wordGroups: [...DEFAULT_PREFS.wordGroups, 'noun'] },
      [],
    );
    expect(optedIn.some((item) => item.group === 'noun')).toBe(true);
  });

  it('lets enabled library lists bypass progression tiers intentionally', () => {
    const words = [
      ...Array.from({ length: 30 }, (_, i) => word(i)),
      word(99, { dict: 'advanced', reading: 'advanced', jlpt: 'N1', lesson: 50, minnaLesson: 50 }),
    ];
    const target = words[words.length - 1];

    const result = filterWordsForStudyScope(
      words,
      { cards: {} },
      { ...DEFAULT_PREFS, wordListIds: ['advanced-list'] },
      [{ id: 'advanced-list', name: 'Advanced', wordKeys: [wordKey(target)] }],
    );

    expect(result).toEqual([target]);
  });

  it('counts repeated SRS cards for the same word only once', () => {
    const words = [word(1), word(2)];
    const cards = {
      [cardIdFor(words[0], 'plain-past')]: { reps: 1 },
      [cardIdFor(words[0], 'te-form')]: { reps: 1 },
      [cardIdFor(words[1], 'plain-past')]: { reps: 1 },
    };

    expect(introducedBuiltInWordCount({ cards }, words)).toBe(2);
  });
});
