import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  inflateAdjectiveRows,
  inflateNounRows,
  inflateVerbRows,
  mergeBuiltInVerbs,
  mergeBuiltInWords,
} from '../data/verbLexicon.js';
import {
  JLPT_LEVELS,
  STARTER_ADJECTIVES,
  STARTER_VERBS,
  WORD_GROUP_OPTIONS,
} from '../data/starterWords.js';
import { filterWordsForPrefs, getWordMeta } from '../utils/conjugator.js';

const lexicon = JSON.parse(
  readFileSync(new URL('../../public/data/verb-lexicon.json', import.meta.url), 'utf8'),
);
const verbs = mergeBuiltInVerbs(inflateVerbRows(lexicon.verbs), STARTER_VERBS);
const adjectives = mergeBuiltInWords(inflateAdjectiveRows(lexicon.adjectives), STARTER_ADJECTIVES);
const nouns = inflateNounRows(lexicon.nouns);
const words = [...verbs, ...adjectives, ...nouns];

function missingLessons(items, key, max) {
  const seen = new Set();
  for (const word of items) {
    const meta = getWordMeta(word);
    for (const lesson of meta[key]) seen.add(lesson);
  }
  return Array.from({ length: max }, (_, i) => i + 1).filter((lesson) => !seen.has(lesson));
}

describe('expanded vocabulary lexicon', () => {
  it('contains substantial built-in practice words for every JLPT level', () => {
    expect(words.length).toBeGreaterThan(7000);
    expect(verbs.length).toBeGreaterThan(1000);
    expect(adjectives.length).toBeGreaterThan(700);
    expect(nouns.length).toBeGreaterThan(5000);
    for (const level of JLPT_LEVELS) {
      const count = words.filter((word) => getWordMeta(word).jlpt === level).length;
      expect(count).toBeGreaterThan(200);
    }
  });

  it('keeps JLPT-only verbs and adjectives only when they are common', () => {
    for (const word of [...verbs, ...adjectives]) {
      const meta = getWordMeta(word);
      const hasLessonCoverage = Boolean(meta.lessons.length || meta.minnaLessons.length);
      if (!meta.jlpt || hasLessonCoverage) continue;
      expect(meta.common).toBe(true);
    }
  });

  it('covers every configured Genki and Minna lesson with at least one practice word', () => {
    expect(missingLessons(words, 'lessons', 23)).toEqual([]);
    expect(missingLessons(words, 'minnaLessons', 50)).toEqual([]);
  });

  it('returns more than starter verbs for Minna lessons 1-36', () => {
    const result = filterWordsForPrefs(verbs, {
      jlptLevels: ['N5', 'N4', 'N3'],
      wordTypes: ['verb'],
      wordGroups: WORD_GROUP_OPTIONS.map((option) => option.id),
      genkiLessons: null,
      minnaLessons: Array.from({ length: 36 }, (_, i) => i + 1),
      wordListIds: [],
    });
    expect(result.length).toBeGreaterThan(150);
    expect(result.some((word) => getWordMeta(word).jlpt === 'N3')).toBe(true);
  });

  it('keeps fallback lesson metadata when generated rows duplicate starter words', () => {
    const [word] = mergeBuiltInVerbs(
      [{ dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan', jlpt: 'N5' }],
      [{ dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan', lesson: 3 }],
    );
    expect(getWordMeta(word).lessons).toContain(3);
  });
});
