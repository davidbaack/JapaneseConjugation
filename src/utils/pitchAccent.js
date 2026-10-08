import { conjugateItem, isAdjective } from './conjugator.js';
import { toHiragana } from './romaji.js';

const SMALL_KANA = new Set(
  Array.from(
    '\u3041\u3043\u3045\u3047\u3049\u3083\u3085\u3087\u308e\u3095\u3096\u30a1\u30a3\u30a5\u30a7\u30a9\u30e3\u30e5\u30e7\u30ee\u30f5\u30f6',
  ),
);
const EXACT_FORM_TYPE_IDS = new Set([
  'dictionary',
  'plain-present',
  'adj-plain-present',
  'adj-attributive',
]);
const DERIVED_NEGATIVE_TYPES = new Set(['plain-negative']);

export function katakanaToHiragana(value) {
  return String(value || '').replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  );
}

export function normalizeAccentReading(value) {
  return toHiragana(katakanaToHiragana(String(value || '').normalize('NFKC'))).trim();
}

function normalizeAccentSurface(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim();
}

function accentKey(surface, reading) {
  return `${normalizeAccentSurface(surface)}\t${normalizeAccentReading(reading)}`;
}

function cleanAccentNumbers(value) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : String(value || '').split(','))
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 0),
    ),
  ].sort((a, b) => a - b);
}

export function parseKanjiumAccentRows(text = '') {
  const rows = new Map();
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const [surface, reading, accents] = line.split('\t');
    const cleanSurface = normalizeAccentSurface(surface);
    const cleanReading = normalizeAccentReading(reading);
    const cleanAccents = cleanAccentNumbers(accents);
    if (!cleanSurface || !cleanReading || !cleanAccents.length) continue;
    const key = `${cleanSurface}\t${cleanReading}`;
    const existing = rows.get(key);
    rows.set(key, {
      surface: cleanSurface,
      reading: cleanReading,
      accents: cleanAccentNumbers([...(existing?.accents || []), ...cleanAccents]),
    });
  }
  return rows;
}

export function compactPitchAccentForWord(word, accentRows) {
  if (!word || !accentRows) return null;
  const reading = normalizeAccentReading(word.reading);
  if (!reading) return null;
  const surfaces = [
    normalizeAccentSurface(word.dict),
    normalizeAccentSurface(word.reading),
    reading,
  ].filter(Boolean);
  for (const surface of [...new Set(surfaces)]) {
    const match = accentRows.get(accentKey(surface, reading));
    if (match?.accents?.length) return match.accents;
  }
  return null;
}

export function inflatePitchAccent(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const accents = cleanAccentNumbers(value);
    return accents.length ? { accents, source: 'kanjium' } : null;
  }
  if (typeof value === 'object') {
    const accents = cleanAccentNumbers(value.accents);
    return accents.length ? { accents, source: value.source || 'kanjium' } : null;
  }
  return null;
}

export function splitMorae(value = '') {
  const morae = [];
  for (const char of Array.from(String(value || '').normalize('NFKC'))) {
    if (SMALL_KANA.has(char) && morae.length) {
      morae[morae.length - 1] += char;
    } else {
      morae.push(char);
    }
  }
  return morae;
}

export function tonesForAccent(morae = [], accent = 0) {
  if (!morae.length || !Number.isInteger(accent) || accent < 0 || accent > morae.length) {
    return [];
  }
  if (accent === 0) return morae.map((_, index) => (index === 0 ? 'L' : 'H'));
  if (accent === 1) return morae.map((_, index) => (index === 0 ? 'H' : 'L'));
  return morae.map((_, index) => (index === 0 ? 'L' : index < accent ? 'H' : 'L'));
}

function buildAccentResult(reading, accent, source, confidence) {
  const morae = splitMorae(reading);
  const tones = tonesForAccent(morae, accent);
  if (!tones.length) return null;
  return { reading, accent, morae, tones, source, confidence };
}

function singleVerifiedAccent(word) {
  const pitchAccent = inflatePitchAccent(word?.pitchAccent);
  if (!pitchAccent || pitchAccent.accents.length !== 1) return null;
  return { accent: pitchAccent.accents[0], source: pitchAccent.source };
}

function derivedNegativeAccent(word, targetReading, baseAccent) {
  if (!['ichidan', 'godan'].includes(word?.group)) return null;
  if (baseAccent === 0) return 0;
  const morae = splitMorae(targetReading);
  if (morae.length < 3) return null;
  return Math.max(1, morae.length - 2);
}

function targetReadingFor(word, typeId, kana) {
  const explicit = normalizeAccentReading(kana);
  if (explicit) return explicit;
  if (!word || !typeId || typeId === 'dictionary') return normalizeAccentReading(word?.reading);
  return normalizeAccentReading(conjugateItem(word, typeId));
}

export function accentForForm(word, typeId, kana = '') {
  const verified = singleVerifiedAccent(word);
  if (!verified) return null;
  const targetReading = targetReadingFor(word, typeId, kana);
  if (!targetReading) return null;
  const baseReading = normalizeAccentReading(word.reading);
  if (targetReading === baseReading || EXACT_FORM_TYPE_IDS.has(typeId)) {
    return buildAccentResult(targetReading, verified.accent, verified.source, 'verified');
  }
  if (!isAdjective(word) && DERIVED_NEGATIVE_TYPES.has(typeId)) {
    const accent = derivedNegativeAccent(word, targetReading, verified.accent);
    if (accent == null) return null;
    return buildAccentResult(targetReading, accent, verified.source, 'derived');
  }
  return null;
}
