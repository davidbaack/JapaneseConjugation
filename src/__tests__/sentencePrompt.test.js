import { describe, expect, it } from 'vitest';
import {
  buildOfflineSentenceEntry,
  buildSentencePromptModel,
  sentencePartsFromSegments,
} from '../utils/sentencePrompt.js';

const WORD = { dict: '買う', reading: 'かう', meaning: 'to buy', group: 'godan' };

const ENTRY = {
  jaTemplate: '昼に{w}。',
  en: 'I bought it at noon.',
  cue: 'Use the target form in context.',
  surface: '買った',
  kanaSurface: 'かった',
  source: 'bundled',
  segments: [{ t: '昼', r: 'ひる' }, { t: 'に', r: '' }, { w: true }, { t: '。', r: '' }],
};

describe('sentence prompt model', () => {
  it('builds a forward cloze while keeping filled sentence audio available', () => {
    const prompt = buildSentencePromptModel({ entry: ENTRY, word: WORD, type: 'plain-past' });

    expect(prompt).toMatchObject({
      mode: 'forward-cloze',
      sentence: '昼に[______]。',
      audioText: '昼に買った。',
      cue: '',
      note: 'I bought it at noon.',
      source: 'bundled',
    });
    expect(prompt.parts[2]).toEqual({ text: '[______]', ruby: '' });
  });

  it('builds a filled reverse sentence for dictionary recovery', () => {
    const prompt = buildSentencePromptModel({
      entry: ENTRY,
      word: WORD,
      type: 'plain-past',
      reverseDrill: true,
    });

    expect(prompt.mode).toBe('reverse-context');
    expect(prompt.sentence).toBe('昼に買った。');
    expect(prompt.cue).toBe('');
    expect(prompt.parts[2]).toEqual({ text: '買った', ruby: 'かった' });
  });

  it('uses the filled sentence as the listening prompt', () => {
    const prompt = buildSentencePromptModel({
      entry: ENTRY,
      word: WORD,
      type: 'plain-past',
      listeningPrompt: true,
    });

    expect(prompt.mode).toBe('listening-recognition');
    expect(prompt.sentence).toBe('昼に買った。');
    expect(prompt.audioText).toBe('昼に買った。');
    expect(prompt.cue).toBe('');
  });

  it('keeps custom words offline-safe with deterministic template entries', () => {
    const entry = buildOfflineSentenceEntry(WORD, 'plain-past');
    const prompt = buildSentencePromptModel({ entry, word: WORD, type: 'plain-past' });

    expect(prompt.mode).toBe('forward-cloze');
    expect(prompt.sentence).toContain('[______]');
    expect(prompt.audioText).toContain('買った');
    expect(prompt.cue).toBe('');
    expect(prompt.source).toBe('offline');
  });
});

describe('sentencePartsFromSegments', () => {
  it('fills the placeholder with the requested replacement and ruby', () => {
    expect(sentencePartsFromSegments(ENTRY.segments, '買った', 'かった')).toEqual([
      { text: '昼', ruby: 'ひる' },
      { text: 'に', ruby: '' },
      { text: '買った', ruby: 'かった' },
      { text: '。', ruby: '' },
    ]);
  });
});
