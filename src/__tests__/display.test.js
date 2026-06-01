import { describe, it, expect } from 'vitest';
import {
  englishForForm,
  editDistance,
  normalizeJapaneseText,
  typoGuardForAnswer,
  cleanEnglishAction,
  gerund,
  pastParticiple,
  thirdPerson,
  resolveDisplayScripts,
  answerPhaseTaskDetails,
  mergePracticePrefs,
  makeChoices,
  makeReverseChoices,
  spokenAnswerResult,
} from '../utils/display.js';
import { filterWordsForPrefs } from '../utils/conjugator.js';
import { STARTER_VERBS } from '../data/starterWords.js';

const TABERU = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
const TAKAI = { dict: '高い', reading: 'たかい', meaning: 'expensive', group: 'i-adjective' };

// ─── normalizeJapaneseText ────────────────────────────────────────────────────
describe('normalizeJapaneseText', () => {
  it('strips punctuation and whitespace', () => {
    expect(normalizeJapaneseText('たべる。')).toBe('たべる');
    expect(normalizeJapaneseText('  たべ る  ')).toBe('たべる');
    expect(normalizeJapaneseText('「たべる」')).toBe('たべる');
  });

  it('returns empty for empty input', () => {
    expect(normalizeJapaneseText('')).toBe('');
    expect(normalizeJapaneseText(null)).toBe('');
  });
});

// ─── cleanEnglishAction ───────────────────────────────────────────────────────
describe('cleanEnglishAction', () => {
  it('strips leading "to "', () => {
    expect(cleanEnglishAction('to eat')).toBe('eat');
    expect(cleanEnglishAction('to write')).toBe('write');
  });

  it('leaves non-"to" strings unchanged', () => {
    expect(cleanEnglishAction('eat')).toBe('eat');
    expect(cleanEnglishAction('run fast')).toBe('run fast');
  });

  it('returns fallback for empty', () => {
    expect(cleanEnglishAction('')).toBe('do it');
    expect(cleanEnglishAction(null)).toBe('do it');
  });
});

// ─── gerund ───────────────────────────────────────────────────────────────────
describe('gerund', () => {
  it('handles drop-e verbs', () => {
    expect(gerund('write')).toBe('writing');
    expect(gerund('make')).toBe('making');
    expect(gerund('ride')).toBe('riding');
  });

  it('handles regular verbs', () => {
    expect(gerund('eat')).toBe('eating');
    expect(gerund('drink')).toBe('drinking');
    expect(gerund('walk')).toBe('walking');
  });

  it('handles ie → ying', () => {
    expect(gerund('die')).toBe('dying');
    expect(gerund('lie')).toBe('lying');
  });
});

// ─── pastParticiple ───────────────────────────────────────────────────────────
describe('pastParticiple', () => {
  it('returns known irregular participles', () => {
    expect(pastParticiple('eat')).toBe('eaten');
    expect(pastParticiple('write')).toBe('written');
    expect(pastParticiple('drink')).toBe('drunk');
    expect(pastParticiple('go')).toBe('gone');
    expect(pastParticiple('see')).toBe('seen');
  });

  it('applies -d to e-ending verbs', () => {
    expect(pastParticiple('use')).toBe('used');
  });

  it('applies -ed to regular verbs', () => {
    expect(pastParticiple('walk')).toBe('walked');
    expect(pastParticiple('play')).toBe('played');
  });
});

// ─── thirdPerson ──────────────────────────────────────────────────────────────
describe('thirdPerson', () => {
  it('handles irregular verbs', () => {
    expect(thirdPerson('do')).toBe('does');
    expect(thirdPerson('go')).toBe('goes');
  });

  it('adds -es to ch/sh/s/x/z/o endings', () => {
    expect(thirdPerson('watch')).toBe('watches');
    expect(thirdPerson('wash')).toBe('washes');
    expect(thirdPerson('miss')).toBe('misses');
  });

  it('adds -s to regular verbs', () => {
    expect(thirdPerson('eat')).toBe('eats');
    expect(thirdPerson('drink')).toBe('drinks');
  });
});

// ─── editDistance ─────────────────────────────────────────────────────────────
describe('editDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(editDistance('たべる', 'たべる')).toBe(0);
    expect(editDistance('abc', 'abc')).toBe(0);
  });

  it('returns correct distance for 1-char difference', () => {
    expect(editDistance('たべた', 'たべて')).toBe(1);
    expect(editDistance('abc', 'abd')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', '')).toBe(3);
    expect(editDistance('', '')).toBe(0);
  });
});

// ─── typoGuardForAnswer ───────────────────────────────────────────────────────
describe('typoGuardForAnswer', () => {
  it('returns null for exact match', () => {
    expect(typoGuardForAnswer('たべた', 'たべた', 'たべた', TABERU, false)).toBeNull();
  });

  it('returns null for very short strings', () => {
    // maxLen < 3 → no typo guard
    expect(typoGuardForAnswer('た', 'た', 'て', TABERU, false)).toBeNull();
  });

  it('detects 1-char off answers', () => {
    const result = typoGuardForAnswer('たべて', 'たべて', 'たべた', TABERU, false);
    expect(result).not.toBeNull();
    expect(result.submitted).toBe('たべて');
    expect(result.target).toBe('たべた');
  });

  it('returns null for answers that are too wrong (distance > 1 without transposition)', () => {
    const result = typoGuardForAnswer('まったく', 'まったく', 'たべた', TABERU, false);
    expect(result).toBeNull();
  });
});

// ─── englishForForm ───────────────────────────────────────────────────────────
describe('englishForForm', () => {
  it('returns meaning for plain-present', () => {
    expect(englishForForm(TABERU, 'plain-present')).toBe('to eat');
  });

  it('generates correct English for verb forms', () => {
    expect(englishForForm(TABERU, 'plain-past')).toBe('did eat');
    expect(englishForForm(TABERU, 'plain-negative')).toBe('do not eat');
    expect(englishForForm(TABERU, 'polite-present')).toBe('eat (polite)');
    expect(englishForForm(TABERU, 'te-form')).toBe('eat and... / eat for a helper pattern');
    expect(englishForForm(TABERU, 'desiderative')).toBe('want to eat');
    expect(englishForForm(TABERU, 'obligation')).toBe('must eat');
    expect(englishForForm(TABERU, 'permission')).toBe('may eat');
    expect(englishForForm(TABERU, 'request-kudasai')).toBe('please eat');
  });

  it('generates correct English for adjective forms', () => {
    expect(englishForForm(TAKAI, 'adj-plain-past')).toBe('was expensive');
    expect(englishForForm(TAKAI, 'adj-plain-negative')).toBe('is not expensive');
    expect(englishForForm(TAKAI, 'adj-sou')).toBe('looks expensive');
    expect(englishForForm(TAKAI, 'adj-naru')).toBe('becomes expensive');
  });

  it('returns meaning for null item', () => {
    expect(englishForForm(null, 'plain-past')).toBe('');
  });
});

// --- answerPhaseTaskDetails ---
describe('answerPhaseTaskDetails', () => {
  it('hides forward answer-form subtext while keeping a generic form hint', () => {
    expect(
      answerPhaseTaskDetails({
        taskSub: 'takunakatta',
        taskHint: 'did not want to ~',
      }),
    ).toEqual({
      sub: '',
      supportText: 'did not want to ~',
    });
  });

  it('keeps the dictionary-form cue for reverse drills', () => {
    expect(
      answerPhaseTaskDetails({
        reverseDrill: true,
        taskSub: 'dictionary form',
        taskHint: 'answer with dictionary form',
      }),
    ).toEqual({
      sub: 'dictionary form',
      supportText: 'answer with dictionary form',
    });
  });
});

describe('answer mode choices', () => {
  const current = {
    id: 'ichidan|plain-past',
    verb: STARTER_VERBS[0],
    type: 'plain-past',
  };

  it('keeps forward choices stable across rerenders for the same card', () => {
    const first = makeChoices(current, STARTER_VERBS);
    expect(first).toHaveLength(4);
    for (let i = 0; i < 20; i++) {
      expect(makeChoices(current, STARTER_VERBS)).toEqual(first);
    }
  });

  it('keeps reverse choices stable across rerenders for the same card', () => {
    const first = makeReverseChoices(current, STARTER_VERBS);
    expect(first).toHaveLength(4);
    expect(first).toContain(current.verb);
    for (let i = 0; i < 20; i++) {
      expect(makeReverseChoices(current, STARTER_VERBS)).toEqual(first);
    }
  });
});

describe('spokenAnswerResult', () => {
  it('accepts exact kana or kanji spoken surfaces', () => {
    expect(
      spokenAnswerResult(['\u305f\u3079\u305f', '\u98df\u3079\u305f'], '\u305f\u3079\u305f'),
    ).toMatchObject({
      ok: true,
      score: 100,
    });
    expect(
      spokenAnswerResult(['\u305f\u3079\u305f', '\u98df\u3079\u305f'], '\u98df\u3079\u305f'),
    ).toMatchObject({
      ok: true,
      score: 100,
    });
  });

  it('scores but does not accept near spoken misses', () => {
    const result = spokenAnswerResult(['\u305f\u3079\u305f'], '\u305f\u3079\u3066');
    expect(result.ok).toBe(false);
    expect(result.score).toBeGreaterThan(0);
  });
});

// ─── resolveDisplayScripts ───────────────────────────────────────────────────
describe('resolveDisplayScripts', () => {
  it('returns kanji+kana by default', () => {
    const result = resolveDisplayScripts({});
    expect(result.kanji).toBe(true);
    expect(result.kana).toBe(true);
    expect(result.romaji).toBe(false);
  });

  it('respects explicit displayScripts', () => {
    const result = resolveDisplayScripts({
      displayScripts: { kanji: false, kana: true, romaji: true },
    });
    expect(result.kanji).toBe(false);
    expect(result.romaji).toBe(true);
  });

  it('handles scriptMode=romaji', () => {
    const result = resolveDisplayScripts({ scriptMode: 'romaji' });
    expect(result.kanji).toBe(false);
    expect(result.kana).toBe(false);
    expect(result.romaji).toBe(true);
  });

  it('handles scriptMode=all', () => {
    const result = resolveDisplayScripts({ scriptMode: 'all' });
    expect(result.kanji).toBe(true);
    expect(result.kana).toBe(true);
    expect(result.romaji).toBe(true);
  });
});

// ─── filterWordsForPrefs ──────────────────────────────────────────────────────
const sampleWords = [
  { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan', jlpt: 'N5' },
  { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan', jlpt: 'N5' },
  { dict: '勉強する', reading: 'べんきょうする', meaning: 'to study', group: 'suru', jlpt: 'N5' },
  { dict: '来る', reading: 'くる', meaning: 'to come', group: 'kuru', jlpt: 'N5' },
  { dict: '高い', reading: 'たかい', meaning: 'expensive', group: 'i-adjective', jlpt: 'N5' },
  { dict: '静か', reading: 'しずか', meaning: 'quiet', group: 'na-adjective', jlpt: 'N5' },
];

describe('filterWordsForPrefs', () => {
  it('returns all words with default prefs', () => {
    const result = filterWordsForPrefs(sampleWords, {
      jlptLevels: ['N5', 'N4', 'N3', 'N2', 'N1'],
      wordTypes: ['verb', 'i-adjective', 'na-adjective'],
      wordGroups: [
        'ichidan',
        'godan',
        'suru',
        'kuru',
        'irregular-adjective',
        'i-adjective',
        'na-adjective',
      ],
      genkiLessons: [],
      wordListIds: [],
    });
    expect(result.length).toBe(sampleWords.length);
  });

  it('filters by JLPT level', () => {
    const result = filterWordsForPrefs(sampleWords, {
      jlptLevels: ['N2'], // words are N5, so none pass
      wordTypes: ['verb', 'i-adjective', 'na-adjective'],
      wordGroups: [
        'ichidan',
        'godan',
        'suru',
        'kuru',
        'irregular-adjective',
        'i-adjective',
        'na-adjective',
      ],
      genkiLessons: [],
      wordListIds: [],
    });
    expect(result.length).toBe(0);
  });

  it('filters by wordTypes (verb only)', () => {
    const result = filterWordsForPrefs(sampleWords, {
      jlptLevels: ['N5', 'N4', 'N3', 'N2', 'N1'],
      wordTypes: ['verb'],
      wordGroups: ['ichidan', 'godan', 'suru', 'kuru'],
      genkiLessons: [],
      wordListIds: [],
    });
    const groups = result.map((w) => w.group);
    expect(groups).not.toContain('i-adjective');
    expect(groups).not.toContain('na-adjective');
  });

  it('filters by wordGroups', () => {
    const result = filterWordsForPrefs(sampleWords, {
      jlptLevels: ['N5', 'N4', 'N3', 'N2', 'N1'],
      wordTypes: ['verb', 'i-adjective', 'na-adjective'],
      wordGroups: ['ichidan'],
      genkiLessons: [],
      wordListIds: [],
    });
    expect(result.length).toBe(1);
    expect(result[0].group).toBe('ichidan');
  });
});

describe('mergePracticePrefs', () => {
  it('keeps review limits only for repair drills', () => {
    expect(mergePracticePrefs({ reviewLimit: 10, reviewLimitSource: 'today' })).toMatchObject({
      reviewLimit: 0,
      reviewLimitSource: '',
    });
    expect(mergePracticePrefs({ reviewLimit: 10, reviewLimitSource: 'repair' })).toMatchObject({
      reviewLimit: 10,
      reviewLimitSource: 'repair',
    });
  });

  it('resets hidden low-value settings while preserving restored learner controls', () => {
    const prefs = mergePracticePrefs({
      answerMode: 'speak',
      skipDuplicateForms: false,
      trickQuestions: true,
      colorCodeConjugations: false,
      aiGuideTone: 'direct',
      durationSec: 120,
      kanaMatchDisplay: 'none',
      showWordCategory: true,
      promptForm: 'random',
    });

    expect(prefs).toMatchObject({
      answerMode: 'speak',
      kanaAssist: 'off',
      skipDuplicateForms: true,
      trickQuestions: false,
      colorCodeConjugations: true,
      aiGuideTone: 'sensei',
      showWordCategory: true,
      promptForm: 'random',
    });
    expect(prefs).not.toHaveProperty('kanaMatchDisplay');
    expect(prefs).not.toHaveProperty('durationSec');
  });

  it('falls back to free input for unknown answer modes', () => {
    expect(mergePracticePrefs({ answerMode: 'legacy-speech' }).answerMode).toBe('input');
  });

  it('migrates legacy guided answer mode into kana assist', () => {
    expect(mergePracticePrefs({ answerMode: 'guided' })).toMatchObject({
      answerMode: 'input',
      kanaAssist: 'guided',
    });
  });

  it('migrates legacy kana feedback display into kana assist levels', () => {
    expect(mergePracticePrefs({ kanaMatchDisplay: 'none' })).toMatchObject({
      answerMode: 'input',
      kanaAssist: 'off',
    });
    expect(mergePracticePrefs({ kanaMatchDisplay: 'color' })).toMatchObject({
      answerMode: 'input',
      kanaAssist: 'live',
    });
  });
});
