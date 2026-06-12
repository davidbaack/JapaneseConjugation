import { STARTER_ADJECTIVES, STARTER_VERBS } from './starterWords.js';
import { isLexiconArtifactRow, normalizeLexiconRow } from '../utils/lexiconArtifacts.js';
import { inflatePitchAccent } from '../utils/pitchAccent.js';

const BASE_URL = /** @type {any} */ (import.meta).env?.BASE_URL || '/';

export const VERB_LEXICON_URL = `${BASE_URL}data/verb-lexicon.json`;

// Lexicon rows encode JMdict transitivity compactly (see build-verb-lexicon.js):
// 't' transitive, 'i' intransitive, 'b' both. Inflate to a readable field.
const TRANSITIVITY_BY_CODE = { t: 'transitive', i: 'intransitive', b: 'both' };

export function isGeneratedPracticeArtifactRow(row = []) {
  return isLexiconArtifactRow(row);
}

export function inflateVerbRow(row) {
  const cleanRow = normalizeLexiconRow(row);
  if (!cleanRow) return null;
  const [
    dict,
    reading,
    meaning,
    group,
    jlpt,
    genkiLessons,
    minnaLessons,
    common,
    transitive,
    pitchAccent,
  ] = cleanRow;
  if (!dict || !reading || !group) return null;
  const cleanGenki = Array.isArray(genkiLessons) ? genkiLessons : [];
  const cleanMinna = Array.isArray(minnaLessons) ? minnaLessons : [];
  const cleanPitchAccent = inflatePitchAccent(pitchAccent);
  return {
    dict,
    reading,
    meaning: meaning || '',
    group,
    ...(jlpt ? { jlpt } : {}),
    ...(cleanGenki.length ? { lessons: cleanGenki, lesson: cleanGenki[0] } : {}),
    ...(cleanMinna.length ? { minnaLessons: cleanMinna, minnaLesson: cleanMinna[0] } : {}),
    ...(common ? { common: true } : {}),
    ...(transitive ? { transitive: TRANSITIVITY_BY_CODE[transitive] || undefined } : {}),
    ...(cleanPitchAccent ? { pitchAccent: cleanPitchAccent } : {}),
  };
}

export function inflateVerbRows(rows = []) {
  return rows.map(inflateVerbRow).filter(Boolean);
}

export const inflateAdjectiveRows = inflateVerbRows;

function lessonList(...values) {
  return [
    ...new Set(
      values
        .flatMap((value) => (Array.isArray(value) ? value : value == null ? [] : [value]))
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].sort((a, b) => a - b);
}

function mergeVerbMetadata(target, source) {
  const lessons = lessonList(
    target.lessons,
    target.genkiLessons,
    target.lesson,
    source.lessons,
    source.genkiLessons,
    source.lesson,
  );
  const minnaLessons = lessonList(
    target.minnaLessons,
    target.minnaLesson,
    source.minnaLessons,
    source.minnaLesson,
  );
  if (source.jlpt && !target.jlpt) target.jlpt = source.jlpt;
  if (source.common && !target.common) target.common = true;
  if (lessons.length) {
    target.lessons = lessons;
    target.lesson = lessons[0];
  }
  if (minnaLessons.length) {
    target.minnaLessons = minnaLessons;
    target.minnaLesson = minnaLessons[0];
  }
}

export function mergeBuiltInWords(primary = [], fallback = []) {
  const byKey = new Map();
  const merged = [];
  for (const word of [...primary, ...fallback]) {
    const key = `${word.group}:${word.dict}`;
    const existing = byKey.get(key);
    if (existing) {
      mergeVerbMetadata(existing, word);
      continue;
    }
    byKey.set(key, word);
    merged.push(word);
  }
  return merged;
}

export function mergeBuiltInVerbs(primary = [], fallback = STARTER_VERBS) {
  return mergeBuiltInWords(primary, fallback);
}

export async function loadVerbLexicon(url = VERB_LEXICON_URL) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Could not load verb lexicon (${response.status})`);
  const data = await response.json();
  const cleanData = { ...data };
  delete cleanData.nouns;
  return {
    ...cleanData,
    verbs: mergeBuiltInVerbs(inflateVerbRows(data.verbs), STARTER_VERBS),
    adjectives: mergeBuiltInWords(inflateAdjectiveRows(data.adjectives), STARTER_ADJECTIVES),
  };
}
