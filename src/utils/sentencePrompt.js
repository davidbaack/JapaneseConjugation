import { getTypeInfo } from '../data/conjugationTypes.js';
import { conjugateItem, surfaceFormFor } from './conjugator.js';
import { buildOfflineCuedCloze } from './clozeSentences.js';

export const CLOZE_BLANK = '[______]';

function safeForm(fn) {
  try {
    return fn() || '';
  } catch {
    return '';
  }
}

function targetRuby(surface, kanaSurface) {
  const surfaceText = String(surface || '');
  const kanaText = String(kanaSurface || '');
  return surfaceText && kanaText && surfaceText !== kanaText ? kanaText : '';
}

export function fillSentenceTemplate(template, replacement) {
  return String(template || '').replace('{w}', String(replacement || ''));
}

export function sentencePartsFromSegments(segments, replacement = CLOZE_BLANK, ruby = '') {
  if (!Array.isArray(segments)) return null;
  return segments.map((seg) =>
    seg && seg.w
      ? { text: String(replacement || ''), ruby: String(ruby || '') }
      : { text: seg?.t || '', ruby: seg?.r || '' },
  );
}

export function hydrateSentenceValue(value, word, type, source = 'db') {
  const surface = safeForm(() => surfaceFormFor(word, type));
  const kanaSurface = safeForm(() => conjugateItem(word, type));
  return {
    jaTemplate: value?.jaTemplate || value?.ja_template || '',
    segments: Array.isArray(value?.segments) ? value.segments : null,
    en: value?.en || '',
    cue: value?.cue || '',
    surface,
    kanaSurface,
    source,
  };
}

export function buildOfflineSentenceEntry(word, type) {
  const built = buildOfflineCuedCloze(word, type);
  return hydrateSentenceValue(
    {
      jaTemplate: built.jaTemplate || String(built.sentence || '').replace(CLOZE_BLANK, '{w}'),
      segments: null,
      en: built.note,
      cue: built.cue,
    },
    word,
    type,
    'offline',
  );
}

/**
 * @param {{
 *   entry?: {
 *     jaTemplate?: string,
 *     segments?: Array<object> | null,
 *     en?: string,
 *     cue?: string,
 *     surface?: string,
 *     kanaSurface?: string,
 *     source?: string,
 *   } | null,
 *   word?: object | null,
 *   type?: string,
 *   reverseDrill?: boolean,
 *   listeningPrompt?: boolean,
 * }} options
 */
export function buildSentencePromptModel({
  entry,
  word,
  type,
  reverseDrill = false,
  listeningPrompt = false,
} = {}) {
  if (!entry?.jaTemplate || !word || !type) return null;

  const typeLabel = getTypeInfo(type).label || type;
  const surface = entry.surface || safeForm(() => surfaceFormFor(word, type));
  const kanaSurface = entry.kanaSurface || safeForm(() => conjugateItem(word, type));
  if (!surface) return null;

  const mode = listeningPrompt
    ? 'listening-recognition'
    : reverseDrill
      ? 'reverse-context'
      : 'forward-cloze';
  const replacement = mode === 'forward-cloze' ? CLOZE_BLANK : surface;
  const sentence = fillSentenceTemplate(entry.jaTemplate, replacement);
  const audioText = fillSentenceTemplate(entry.jaTemplate, surface);
  const parts = sentencePartsFromSegments(
    entry.segments,
    replacement,
    mode === 'forward-cloze' ? '' : targetRuby(surface, kanaSurface),
  );

  return {
    mode,
    sentence,
    parts,
    audioText,
    cue:
      entry.cue ||
      (reverseDrill
        ? `Recover the dictionary form from this ${typeLabel} sentence.`
        : `Use the ${typeLabel} form in this sentence.`),
    note: entry.en || '',
    source: entry.source || '',
    surface,
    kanaSurface,
  };
}
