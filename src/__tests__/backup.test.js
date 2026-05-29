import { describe, it, expect } from 'vitest';
import {
  buildBackup,
  serializeBackup,
  parseBackup,
  BACKUP_FORMAT,
  BACKUP_VERSION,
} from '../utils/backup.js';

const parts = () => ({
  state: {
    cards: { 'a|b': { reps: 2 } },
    enabledTypes: ['plain-past'],
    daily: { count: 3 },
  },
  customVerbs: [{ dict: '走る', reading: 'はしる', meaning: 'to run', group: 'godan' }],
  customAdjectives: [],
  wordLists: [{ id: 'l1', name: 'N5' }],
  practicePrefs: { theme: 'dark' },
});

describe('buildBackup / serializeBackup', () => {
  it('tags the payload with format and version', () => {
    const b = buildBackup(parts());
    expect(b.format).toBe(BACKUP_FORMAT);
    expect(b.version).toBe(BACKUP_VERSION);
    expect(typeof b.exportedAt).toBe('string');
  });

  it('captures progress and settings sections', () => {
    const b = buildBackup(parts());
    expect(b.state.cards).toEqual({ 'a|b': { reps: 2 } });
    expect(b.customVerbs).toHaveLength(1);
    expect(b.wordLists[0].name).toBe('N5');
    expect(b.practicePrefs.theme).toBe('dark');
  });

  it('serializeBackup produces valid JSON round-trippable by parseBackup', () => {
    const json = serializeBackup(parts());
    const { ok, data } = parseBackup(json);
    expect(ok).toBe(true);
    expect(data.state.cards['a|b'].reps).toBe(2);
  });
});

describe('parseBackup', () => {
  it('rejects non-JSON input', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, error: 'parse failed' });
  });

  it('rejects a wrong/foreign format', () => {
    const r = parseBackup(JSON.stringify({ format: 'something-else', state: { cards: {} } }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/backup/);
  });

  it('rejects a backup missing card data', () => {
    const r = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, state: {} }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/card data/);
  });

  it('accepts a well-formed backup', () => {
    const r = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, state: { cards: {} } }));
    expect(r.ok).toBe(true);
    expect(r.data.state.cards).toEqual({});
  });
});
