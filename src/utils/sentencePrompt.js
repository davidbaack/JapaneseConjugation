import { conjugateItem, surfaceFormFor } from './conjugator.js';

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

export function buildOfflineSentenceEntry() {
  // A generic grammar template cannot establish that a word's sense fits its
  // context. Offline learners use reviewed bundled entries or word practice.
  return null;
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
  const completedParts = sentencePartsFromSegments(
    entry.segments,
    surface,
    targetRuby(surface, kanaSurface),
  );
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
    completedSentence: audioText,
    completedParts,
    cue: '',
    note: entry.en || '',
    source: entry.source || '',
    surface,
    kanaSurface,
  };
}
