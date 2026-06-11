import { describe, it, expect } from 'vitest';
import {
  classifyHint,
  searchWords,
  formRows,
  adHocReferenceCandidates,
  formLookupCandidates,
  findFavoritesList,
  favoriteListHasWord,
  toggleFavoriteInLists,
  focusWordInLists,
  referenceWithSearch,
  referenceWithHistory,
  referenceRuleTarget,
  compareReferenceRuleTarget,
  referencePracticePrefsForTarget,
  referenceWithWeakRule,
  referenceHasWeakRule,
  weakReferencePracticeTarget,
} from '../views/ReferenceViewSub.jsx';
import { addUniqueWord, wordsForList } from '../views/ListsViewSub.jsx';

// Test fixtures
const TABERU = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
const KAKU = { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' };
const KAERU = { dict: '帰る', reading: 'かえる', meaning: 'to return home', group: 'godan' };
const HASHIRU = { dict: '走る', reading: 'はしる', meaning: 'to run', group: 'godan' };
const SURU = { dict: 'する', reading: 'する', meaning: 'to do', group: 'suru' };
const KURU = { dict: '来る', reading: 'くる', meaning: 'to come', group: 'kuru' };
const TAKAI = {
  dict: '高い',
  reading: 'たかい',
  meaning: 'expensive / high',
  group: 'i-adjective',
};
const SHIZUKA = { dict: '静か', reading: 'しずか', meaning: 'quiet', group: 'na-adjective' };
const II = {
  dict: 'いい',
  reading: 'いい',
  meaning: 'good',
  group: 'i-adjective',
  irregular: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// classifyHint
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyHint', () => {
  it('mentions ichidan for ichidan verbs', () => {
    expect(classifyHint(TABERU)).toContain('ichidan: drop る');
    expect(classifyHint(TABERU)).toContain('食べない');
  });

  it('mentions godan for godan verbs', () => {
    expect(classifyHint(KAKU)).toContain('godan: row-shift');
    expect(classifyHint(KAKU)).toContain('書かない');
  });

  it('mentions godan traps for る-ending godan verbs', () => {
    expect(classifyHint(KAERU)).toContain('帰る, 入る, 走る, and 切る');
    expect(classifyHint(HASHIRU)).toContain('still godan');
    expect(classifyHint(HASHIRU)).toContain('走る -> 走ります');
  });

  it('mentions する for suru verbs', () => {
    expect(classifyHint(SURU)).toMatch(/する/);
  });

  it('mentions 来る for kuru verbs', () => {
    expect(classifyHint(KURU)).toMatch(/来る/);
  });

  it('mentions よ for irregular い-adjective', () => {
    expect(classifyHint(II)).toMatch(/よ/);
  });

  it('mentions い-adjective for regular i-adjective', () => {
    expect(classifyHint(TAKAI)).toMatch(/い-adjective/i);
  });

  it('mentions な-adjective for na-adjective', () => {
    expect(classifyHint(SHIZUKA)).toMatch(/な-adjective/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formRows
// ─────────────────────────────────────────────────────────────────────────────
describe('formRows', () => {
  it('returns an array of rows for a verb', () => {
    const rows = formRows(TABERU);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('each row has type, answer, and explanation', () => {
    const rows = formRows(KAKU);
    for (const row of rows) {
      expect(row).toHaveProperty('type');
      expect(row).toHaveProperty('answer');
      expect(row).toHaveProperty('explanation');
    }
  });

  it('returns adjective forms for an adjective', () => {
    const rows = formRows(TAKAI);
    const ids = rows.map((r) => r.type.id);
    expect(ids.some((id) => id.startsWith('adj-'))).toBe(true);
  });

  it('returns verb forms for a verb (no adj- prefix)', () => {
    const rows = formRows(TABERU);
    const ids = rows.map((r) => r.type.id);
    expect(ids.every((id) => !id.startsWith('adj-'))).toBe(true);
  });

  it('produces correct plain-past for たべる', () => {
    const rows = formRows(TABERU);
    const pastRow = rows.find((r) => r.type.id === 'plain-past');
    expect(pastRow?.answer).toBe('たべた');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// searchWords
// ─────────────────────────────────────────────────────────────────────────────
describe('reference practice launch helpers', () => {
  it('maps a reference row to a group and form drill target', () => {
    const target = referenceRuleTarget(KAKU, { id: 'te-form', label: 'Te-form', hint: '~te' });
    expect(target).toMatchObject({
      key: 'godan|te-form',
      group: 'godan',
      typeId: 'te-form',
      typeIds: ['te-form'],
      kinds: ['verb'],
    });
  });

  it('builds a nearby compare target for a row', () => {
    const target = compareReferenceRuleTarget(KAKU, {
      id: 'te-form',
      label: 'Te-form',
      hint: '~te',
    });
    expect(target.typeIds).toContain('te-form');
    expect(target.typeIds).toContain('plain-past');
  });

  it('turns a reference target into focused practice prefs', () => {
    const target = referenceRuleTarget(KAKU, { id: 'te-form', label: 'Te-form' });
    const prefs = referencePracticePrefsForTarget(
      {
        wordGroups: ['ichidan'],
        wordTypes: ['adjective'],
        wordListIds: ['favorites'],
        jlptLevels: ['N5'],
      },
      target,
    );
    expect(prefs.wordGroups).toEqual(['godan']);
    expect(prefs.wordTypes).toEqual(['verb']);
    expect(prefs.wordListIds).toEqual([]);
    expect(prefs.reviewStyle).toBe('forms');
    expect(prefs.sourceFormStrategy).toBe('dictionary');
  });

  it('stores and exposes weak reference rules without duplicates', () => {
    const target = referenceRuleTarget(KAKU, { id: 'te-form', label: 'Te-form' });
    const ref = referenceWithWeakRule(referenceWithWeakRule(null, target), target);
    expect(ref.weakRules).toHaveLength(1);
    expect(referenceHasWeakRule(ref, target)).toBe(true);
    expect(weakReferencePracticeTarget(ref)).toMatchObject({
      groups: ['godan'],
      typeIds: ['te-form'],
      kinds: ['verb'],
    });
  });
});

describe('searchWords', () => {
  const words = [TABERU, KAKU, TAKAI, SHIZUKA];

  it('returns all words for an empty query', () => {
    expect(searchWords('', words)).toHaveLength(4);
    expect(searchWords('  ', words)).toHaveLength(4);
  });

  it('matches by dictionary form (kanji)', () => {
    expect(searchWords('食べる', words)).toContain(TABERU);
  });

  it('matches by reading', () => {
    expect(searchWords('たかい', words)).toContain(TAKAI);
  });

  it('matches by meaning (English)', () => {
    const result = searchWords('write', words);
    expect(result).toContain(KAKU);
  });

  it('matches by romaji', () => {
    const result = searchWords('taberu', words);
    expect(result).toContain(TABERU);
  });

  it('returns empty for no match', () => {
    expect(searchWords('zzznomatch', words)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// adHocReferenceCandidates
// ─────────────────────────────────────────────────────────────────────────────
describe('adHocReferenceCandidates', () => {
  it('returns empty for blank query', () => {
    expect(adHocReferenceCandidates('')).toEqual([]);
    expect(adHocReferenceCandidates('  ')).toEqual([]);
  });

  it('returns godan for godan-final kana (く)', () => {
    const candidates = adHocReferenceCandidates('かく');
    expect(candidates.some((c) => c.group === 'godan')).toBe(true);
  });

  it('returns suru for する ending', () => {
    const candidates = adHocReferenceCandidates('べんきょうする');
    expect(candidates.some((c) => c.group === 'suru')).toBe(true);
  });

  it('returns kuru for くる', () => {
    const candidates = adHocReferenceCandidates('くる');
    expect(candidates.some((c) => c.group === 'kuru')).toBe(true);
  });

  it('returns i-adjective for い ending', () => {
    const candidates = adHocReferenceCandidates('たかい');
    expect(candidates.some((c) => c.group === 'i-adjective')).toBe(true);
  });

  it('returns na-adjective for な ending', () => {
    const candidates = adHocReferenceCandidates('しずかな');
    expect(candidates.some((c) => c.group === 'na-adjective')).toBe(true);
  });

  it('returns empty for too-long query', () => {
    expect(adHocReferenceCandidates('あ'.repeat(50))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formLookupCandidates
// ─────────────────────────────────────────────────────────────────────────────
describe('formLookupCandidates', () => {
  const words = [TABERU, KAKU, TAKAI];

  it('returns empty for blank query', () => {
    expect(formLookupCandidates('', words)).toEqual([]);
  });

  it('finds a verb by conjugated form', () => {
    const hits = formLookupCandidates('たべた', words);
    expect(hits.some((h) => h.word.dict === '食べる')).toBe(true);
  });

  it('recognises conversational ら-dropping ichidan potential', () => {
    const hits = formLookupCandidates('食べれる', [
      ...words,
      { dict: '滑る', reading: 'すべる', meaning: 'to slide', group: 'godan' },
    ]);
    expect(hits[0]).toMatchObject({
      word: TABERU,
      type: expect.objectContaining({ id: 'potential' }),
      answer: 'たべれる',
      surface: '食べれる',
      canonicalAnswer: 'たべられる',
      canonicalSurface: '食べられる',
      matchKind: 'variant',
      variantKind: 'colloquial-potential',
    });
  });

  it('result entries have word, type, answer, and matchKind', () => {
    const hits = formLookupCandidates('たべて', words);
    if (hits.length > 0) {
      expect(hits[0]).toHaveProperty('word');
      expect(hits[0]).toHaveProperty('type');
      expect(hits[0]).toHaveProperty('answer');
      expect(hits[0]).toHaveProperty('matchKind');
    }
  });

  it('returns at most 12 results', () => {
    const manyWords = Array.from({ length: 30 }, (_, i) => ({
      dict: `verb${i}る`,
      reading: `verb${i}る`,
      meaning: `test`,
      group: 'ichidan',
    }));
    expect(formLookupCandidates('verbた', manyWords).length).toBeLessThanOrEqual(12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findFavoritesList / favoriteListHasWord / toggleFavoriteInLists
// ─────────────────────────────────────────────────────────────────────────────
describe('findFavoritesList', () => {
  it('returns null for empty list', () => {
    expect(findFavoritesList([])).toBeNull();
  });

  it('finds a list by id "favorites"', () => {
    const lists = [{ id: 'favorites', name: 'Favorites', wordKeys: [] }];
    expect(findFavoritesList(lists)).toBe(lists[0]);
  });

  it('finds a list by name "Favorites" (case-insensitive)', () => {
    const lists = [{ id: 'other', name: 'FAVORITES', wordKeys: [] }];
    expect(findFavoritesList(lists)).toBe(lists[0]);
  });
});

describe('favoriteListHasWord', () => {
  it('returns false when no favorites list exists', () => {
    expect(favoriteListHasWord([], TABERU)).toBe(false);
  });

  it('returns true when word key is in favorites', () => {
    const key = `${TABERU.group}:${TABERU.dict}`;
    const lists = [{ id: 'favorites', name: 'Favorites', wordKeys: [key] }];
    expect(favoriteListHasWord(lists, TABERU)).toBe(true);
  });

  it('returns false when word is not in favorites', () => {
    const lists = [{ id: 'favorites', name: 'Favorites', wordKeys: ['godan:書く'] }];
    expect(favoriteListHasWord(lists, TABERU)).toBe(false);
  });
});

describe('toggleFavoriteInLists', () => {
  it('adds a word to an empty favorites list', () => {
    const { wordLists, favorited } = toggleFavoriteInLists([], TABERU);
    expect(favorited).toBe(true);
    expect(wordLists).toHaveLength(1);
    expect(wordLists[0].wordKeys).toHaveLength(1);
  });

  it('removes a word that is already favorited', () => {
    const key = `${TABERU.group}:${TABERU.dict}`;
    const lists = [{ id: 'favorites', name: 'Favorites', wordKeys: [key] }];
    const { favorited, wordLists } = toggleFavoriteInLists(lists, TABERU);
    expect(favorited).toBe(false);
    expect(wordLists[0].wordKeys).toHaveLength(0);
  });

  it('preserves other lists when toggling', () => {
    const other = { id: 'custom', name: 'My List', wordKeys: [] };
    const { wordLists } = toggleFavoriteInLists([other], TABERU);
    expect(wordLists.some((l) => l.id === 'custom')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// focusWordInLists
// ─────────────────────────────────────────────────────────────────────────────
describe('focusWordInLists', () => {
  it('returns a focus list containing the word key', () => {
    const { wordLists, count } = focusWordInLists([], TABERU);
    expect(count).toBe(1);
    const focus = wordLists.find((l) => l.id === 'focus-word');
    expect(focus?.wordKeys).toHaveLength(1);
  });

  it('replaces previous focus word', () => {
    const { wordLists: first } = focusWordInLists([], TABERU);
    const { wordLists: second } = focusWordInLists(first, KAKU);
    const focus = second.find((l) => l.id === 'focus-word');
    expect(focus?.wordKeys).toHaveLength(1);
    expect(focus?.wordKeys[0]).toBe(`${KAKU.group}:${KAKU.dict}`);
  });

  it('returns safely for null word', () => {
    const result = focusWordInLists([], null);
    expect(result.count).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// referenceWithSearch
// ─────────────────────────────────────────────────────────────────────────────
describe('referenceWithSearch', () => {
  it('adds a query to recentSearches', () => {
    const ref = referenceWithSearch({}, 'eat');
    expect(ref.recentSearches[0]).toBe('eat');
  });

  it('deduplicates repeated searches (moves to front)', () => {
    const ref1 = referenceWithSearch({}, 'eat');
    const ref2 = referenceWithSearch(ref1, 'write');
    const ref3 = referenceWithSearch(ref2, 'eat');
    expect(ref3.recentSearches[0]).toBe('eat');
    expect(ref3.recentSearches.filter((s) => s === 'eat')).toHaveLength(1);
  });

  it('returns normalized state for blank query', () => {
    const ref = referenceWithSearch({ recentSearches: ['a'] }, '');
    expect(ref.recentSearches).toEqual(['a']);
  });

  it('caps recentSearches at 12', () => {
    let ref = {};
    for (let i = 0; i < 15; i++) ref = referenceWithSearch(ref, `term${i}`);
    expect(ref.recentSearches.length).toBeLessThanOrEqual(12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// referenceWithHistory
// ─────────────────────────────────────────────────────────────────────────────
describe('referenceWithHistory', () => {
  it('adds a word to history', () => {
    const ref = referenceWithHistory({}, TABERU);
    expect(ref.history[0].dict).toBe('食べる');
  });

  it('increments count for repeated views', () => {
    const ref1 = referenceWithHistory({}, TABERU);
    const ref2 = referenceWithHistory(ref1, TABERU);
    expect(ref2.history[0].count).toBe(2);
    expect(ref2.history).toHaveLength(1);
  });

  it('caps history at 24', () => {
    let ref = {};
    for (let i = 0; i < 30; i++) {
      ref = referenceWithHistory(ref, {
        dict: `verb${i}`,
        reading: `v${i}`,
        meaning: 'x',
        group: 'godan',
      });
    }
    expect(ref.history.length).toBeLessThanOrEqual(24);
  });

  it('returns normalized state for null word', () => {
    const ref = referenceWithHistory(
      { history: [{ dict: '食べる', reading: 'たべる', group: 'ichidan' }] },
      null,
    );
    expect(ref.history).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addUniqueWord (ListsViewSub)
// ─────────────────────────────────────────────────────────────────────────────
describe('addUniqueWord', () => {
  it('adds a new word', () => {
    const result = addUniqueWord([TABERU], KAKU);
    expect(result).toHaveLength(2);
  });

  it('does not duplicate an existing word', () => {
    const result = addUniqueWord([TABERU], TABERU);
    expect(result).toHaveLength(1);
  });

  it('considers dict AND group for uniqueness', () => {
    const sameDict = { dict: '食べる', reading: 'たべる', meaning: 'other', group: 'godan' };
    const result = addUniqueWord([TABERU], sameDict);
    expect(result).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// wordsForList (ListsViewSub)
// ─────────────────────────────────────────────────────────────────────────────
describe('wordsForList', () => {
  const words = [TABERU, KAKU];
  const key = `${TABERU.group}:${TABERU.dict}`;

  it('returns empty for null list', () => {
    expect(wordsForList(null, words)).toEqual([]);
  });

  it('returns words that match the list wordKeys', () => {
    const list = { wordKeys: [key] };
    const result = wordsForList(list, words);
    expect(result).toHaveLength(1);
    expect(result[0].dict).toBe('食べる');
  });

  it('ignores keys not found in the word pool', () => {
    const list = { wordKeys: ['ichidan:unknown'] };
    expect(wordsForList(list, words)).toHaveLength(0);
  });
});
