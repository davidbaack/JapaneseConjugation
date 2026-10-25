import { conjugateItem, surfaceFormFor } from './conjugator.js';
import { toHiragana } from './romaji.js';

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

function clozeBoundaries(entry) {
  const templateParts = String(entry.jaTemplate || '').split('{w}');
  if (templateParts.length !== 2) return null;
  const [prefix, suffix] = templateParts;
  const segments = entry.segments;
  const targetIndex = Array.isArray(segments) ? segments.findIndex((segment) => segment?.w) : -1;
  const hasSingleTarget = targetIndex >= 0 && segments.filter((segment) => segment?.w).length === 1;
  const readingFor = (items) => items.map((segment) => segment?.r || segment?.t || '').join('');
  return {
    prefix,
    suffix,
    prefixReading: hasSingleTarget ? readingFor(segments.slice(0, targetIndex)) : prefix,
    suffixReading: hasSingleTarget ? readingFor(segments.slice(targetIndex + 1)) : suffix,
  };
}

function boundaryText(value) {
  // A sentence's terminal punctuation is not part of its printed grammar.
  return String(value || '').replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, '');
}

/** Explain copied text around a reviewed blank without changing answer grading. */
export function sentenceBlankFeedback(prompt, submittedAnswer) {
  if (prompt?.mode !== 'forward-cloze' || !prompt.cloze) return null;
  const submitted = toHiragana(String(submittedAnswer || '').trim());
  if (!submitted) return null;
  const targets = [
    ...new Set([prompt.kanaSurface, prompt.surface].filter(Boolean).map(toHiragana)),
  ];
  const { prefix, suffix, prefixReading, suffixReading } = prompt.cloze;
  const prefixForms = [prefix, prefixReading].map((value) => toHiragana(boundaryText(value)));
  const suffixForms = [suffix, suffixReading].map((value) => toHiragana(boundaryText(value)));

  for (const target of targets) {
    if (!target || submitted === target) continue;
    let targetIndex = submitted.indexOf(target);
    while (targetIndex >= 0) {
      const copiedPrefix = submitted.slice(0, targetIndex);
      const copiedSuffix = submitted.slice(targetIndex + target.length);
      const prefixMatches =
        !copiedPrefix || prefixForms.some((text) => text && text.endsWith(copiedPrefix));
      const suffixMatches =
        !copiedSuffix || suffixForms.some((text) => text && text.startsWith(copiedSuffix));
      if (prefixMatches && suffixMatches && (copiedPrefix || copiedSuffix)) {
        const duplicatedText = [copiedPrefix, copiedSuffix].filter(Boolean).join(' and ');
        return {
          copiedPrefix,
          copiedSuffix,
          message: `The sentence already includes ${duplicatedText}; enter ${prompt.surface} here.`,
        };
      }
      targetIndex = submitted.indexOf(target, targetIndex + 1);
    }
  }
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
    cloze: mode === 'forward-cloze' ? clozeBoundaries(entry) : null,
  };
}
