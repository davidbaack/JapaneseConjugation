import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  inflateAdjectiveRows,
  inflateNounRows,
  inflateVerbRows,
  isGeneratedPracticeArtifactRow,
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
    expect(words.length).toBeGreaterThan(1700);
    expect(verbs.length).toBeGreaterThan(1000);
    expect(adjectives.length).toBeGreaterThan(700);
    expect(nouns.length).toBe(0);
    for (const level of JLPT_LEVELS) {
      const count = words.filter((word) => getWordMeta(word).jlpt === level).length;
      expect(count).toBeGreaterThan(50);
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

  it('filters generated math-operator artifacts from practice words', () => {
    expect(
      isGeneratedPracticeArtifactRow([
        'は',
        'は',
        'Equal (math operator)',
        'noun',
        '',
        [],
        [40],
        true,
      ]),
    ).toBe(true);
    expect(
      inflateVerbRows([
        ['たす', 'たす', 'Plus (math operator)', 'godan', 'N4', [], [40], true],
        ['足す', 'たす', 'to add (numbers)', 'godan', 'N4', [], [40], true],
      ]),
    ).toEqual([
      expect.objectContaining({ dict: '足す', reading: 'たす', meaning: 'to add (numbers)' }),
    ]);
    expect(words.some((word) => /\bmath operator\b/i.test(word.meaning))).toBe(false);
  });

  it('repairs known lesson-source scrape artifacts before learners see them', () => {
    expect(
      inflateVerbRows([
        ['ある', 'ある', 'A certain ~, One ~', 'godan', 'N5', [], [41], true],
        ['掃除する', 'そじする', 'Clean (a room)', 'suru', 'N5', [], [19], false],
        ['注意する', 'ちゅいする', 'Be careful', 'suru', 'N4', [], [33], false],
        ['研究する', 'けんきょうする', 'do Research', 'suru', 'N4', [], [15], false],
        ['用意する', 'よいする', 'Prepare', 'suru', 'N4', [], [45], false],
        ['遅刻する', 'ちこくする', 'Be late, Come late', 'suru', 'N2', [], [39], false],
        ['回する', 'まわする', 'Turn', 'suru', 'N5', [], [23], false],
        ['はんかする', 'はんかする', 'Quarrel, fight', 'suru', '', [], [38], false],
      ]),
    ).toEqual([
      expect.objectContaining({ dict: '掃除する', reading: 'そうじする' }),
      expect.objectContaining({ dict: '注意する', reading: 'ちゅういする' }),
      expect.objectContaining({ dict: '研究する', reading: 'けんきゅうする' }),
      expect.objectContaining({ dict: '用意する', reading: 'よういする' }),
      expect.objectContaining({ dict: '遅刻する', reading: 'ちこくする' }),
      expect.objectContaining({ dict: '回す', reading: 'まわす', group: 'godan' }),
      expect.objectContaining({ dict: 'けんかする', reading: 'けんかする' }),
    ]);
    expect(words.some((word) => word.dict === 'ある' && word.meaning.includes('A certain'))).toBe(
      false,
    );
    expect(words).toContainEqual(
      expect.objectContaining({ dict: '掃除する', reading: 'そうじする' }),
    );
    expect(words).toContainEqual(expect.objectContaining({ dict: '回す', reading: 'まわす' }));
    expect(words).toContainEqual(
      expect.objectContaining({ dict: '注意する', reading: 'ちゅういする' }),
    );
  });

  it('covers every configured Genki and Minna lesson with at least one practice word', () => {
    expect(missingLessons(words, 'lessons', 23)).toEqual([]);
    expect(missingLessons(words, 'minnaLessons', 50)).toEqual([3]);
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
