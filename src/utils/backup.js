// @ts-check
// Backup serialize/parse for Settings export & import (improvement #4 —
// SettingsView decomposition). This is the critical user-data path, so the
// pure logic lives here (testable) and the view only wires it to UI state.
import { defaultState } from './storage.js';

export const BACKUP_FORMAT = 'jp-verb-srs';
export const BACKUP_VERSION = 40;

/**
 * Build the export object capturing all persistable progress + settings.
 * @returns {object}
 */
export function buildBackup({ state, customVerbs, customAdjectives, wordLists, practicePrefs }) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state: {
      cards: state.cards,
      enabledTypes: state.enabledTypes,
      verbStats: state.verbStats || {},
      mistakes: state.mistakes || [],
      shadow: state.shadow,
      ambient: state.ambient,
      game: state.game,
      onbin: state.onbin,
      meaning: state.meaning,
      mock: state.mock,
      reader: state.reader,
      production: state.production || defaultState().production,
      guide: state.guide || defaultState().guide,
      reference: state.reference,
      daily: state.daily,
      classify: state.classify,
    },
    customVerbs,
    customAdjectives,
    wordLists,
    practicePrefs,
  };
}

/** Serialize a backup to a JSON string. */
export function serializeBackup(parts) {
  return JSON.stringify(buildBackup(parts));
}

/**
 * Parse and validate an import string.
 * @param {string} text
 * @returns {{ ok: boolean, error?: string, data?: object }}
 */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(String(text).trim());
  } catch {
    return { ok: false, error: 'parse failed' };
  }
  if (!data || data.format !== BACKUP_FORMAT) {
    return { ok: false, error: "doesn't look like a verb-drill backup" };
  }
  if (!data.state || typeof data.state.cards !== 'object') {
    return { ok: false, error: 'missing card data' };
  }
  return { ok: true, data };
}
