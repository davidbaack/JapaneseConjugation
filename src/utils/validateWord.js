// @ts-check
// Validation & sanitization for custom vocabulary input (improvement #16).
//
// Custom word fields flow into localStorage, cloud sync, TSV export, and — most
// importantly — interpolated AI prompts. Unbounded or control-character input
// could bloat storage, corrupt TSV rows (tabs/newlines), or distort prompts.
// This module trims, strips control/format characters, enforces length caps,
// and validates the shape before a word is ever stored.

import { toHiragana, isAllKana } from './romaji.js';

export const FIELD_LIMITS = { dict: 40, reading: 60, meaning: 120 };

export const VALID_GROUPS = new Set([
  'ichidan',
  'godan',
  'suru',
  'kuru',
  'i-adjective',
  'na-adjective',
]);

// Control chars (C0 + DEL + C1) and zero-width / BOM format characters. These
// would break TSV export and inject stray content into AI prompts. Built from
// escape sequences so no raw control bytes live in the source.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200D\\uFEFF]', 'g');

// Remove unsafe characters, collapse internal whitespace, trim, and cap length.
export function sanitizeField(value, max = 200) {
  if (value == null) return '';
  return String(value).replace(UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Validate and normalize a candidate word. Returns
// `{ ok, errors: string[], word }` where `word` is the sanitized result (only
// meaningful when ok). `reading` is converted to hiragana and must be all kana.
/**
 * @typedef {Object} WordInput
 * @property {string} [dict]
 * @property {string} [reading]
 * @property {string} [meaning]
 * @property {string} [group]
 */
/**
 * @param {WordInput} raw
 * @returns {{ ok: boolean, errors: string[], word: { dict: string, reading: string, meaning: string, group: string } }}
 */
export function validateWord(raw) {
  /** @type {string[]} */
  const errors = [];
  const dict = sanitizeField(raw?.dict, FIELD_LIMITS.dict);
  const meaning = sanitizeField(raw?.meaning, FIELD_LIMITS.meaning);
  const readingInput = sanitizeField(raw?.reading, FIELD_LIMITS.reading);
  const reading = toHiragana(readingInput);
  const group = String(raw?.group || '').trim();

  if (!dict) errors.push('Dictionary form is required.');
  if (!readingInput) errors.push('Reading is required.');
  if (!meaning) errors.push('Meaning is required.');
  if (readingInput && !isAllKana(reading)) errors.push('Reading must be kana only.');
  if (!VALID_GROUPS.has(group)) errors.push('Unknown word group.');

  // Ending rules key off the group itself (authoritative), so tampered or
  // AI-sourced words are checked regardless of any caller-supplied UI context.
  if (!errors.length) {
    if (group === 'i-adjective' && !reading.endsWith('い')) {
      errors.push('い-adjective reading must end in い.');
    } else if (group === 'ichidan' && !reading.endsWith('る')) {
      errors.push('Ichidan verb must end in る.');
    } else if (group === 'godan' && !/[うくぐすつぬぶむる]$/.test(reading)) {
      errors.push('Godan verb must end in う/く/ぐ/す/つ/ぬ/ぶ/む/る.');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    word: { dict, reading, meaning, group },
  };
}
