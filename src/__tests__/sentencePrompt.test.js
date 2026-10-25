import { describe, expect, it } from 'vitest';
import {
  buildOfflineSentenceEntry,
  buildSentencePromptModel,
  sentenceBlankFeedback,
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
      completedSentence: '昼に買った。',
      cue: '',
      note: 'I bought it at noon.',
      source: 'bundled',
    });
    expect(prompt.parts[2]).toEqual({ text: '[______]', ruby: '' });
    expect(prompt.completedParts[2]).toEqual({ text: '買った', ruby: 'かった' });
    expect(prompt.cloze).toEqual({
      prefix: '昼に',
      suffix: '。',
      prefixReading: 'ひるに',
      suffixReading: '。',
    });
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
    expect(prompt.cloze).toBeNull();
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
    expect(prompt.cloze).toBeNull();
  });

  it('does not manufacture offline context for an unreviewed word', () => {
    const entry = buildOfflineSentenceEntry(WORD, 'plain-past');
    expect(entry).toBeNull();
    expect(buildSentencePromptModel({ entry, word: WORD, type: 'plain-past' })).toBeNull();
  });
});

describe('sentence blank boundary feedback', () => {
  const word = { dict: '元気', reading: 'げんき', meaning: 'energetic', group: 'na-adjective' };
  const entry = {
    jaTemplate: 'この子は{w}だ。',
    surface: '元気そう',
    kanaSurface: 'げんきそう',
    source: 'bundled',
    segments: [
      { t: 'この', r: '' },
      { t: '子', r: 'こ' },
      { t: 'は', r: '' },
      { w: true },
      { t: 'だ。', r: '' },
    ],
  };
  const prompt = buildSentencePromptModel({ entry, word, type: 'adj-sou' });

  it.each(['genkisouda', 'げんきそうだ', '元気そうだ'])(
    'explains the printed ending for %s while preserving the target',
    (answer) => {
      expect(sentenceBlankFeedback(prompt, answer)).toEqual({
        copiedPrefix: '',
        copiedSuffix: 'だ',
        message: 'The sentence already includes だ; enter 元気そう here.',
      });
      expect(prompt.kanaSurface).toBe('げんきそう');
      expect(prompt.completedSentence).toBe('この子は元気そうだ。');
    },
  );

  it('identifies a copied prefix using the reviewed segment reading', () => {
    expect(sentenceBlankFeedback(prompt, 'konokohagenkisou')).toMatchObject({
      copiedPrefix: 'このこは',
      copiedSuffix: '',
    });
  });

  it('identifies both copied sides of a sentence blank', () => {
    expect(sentenceBlankFeedback(prompt, 'この子は元気そうだ')).toMatchObject({
      copiedPrefix: 'この子は',
      copiedSuffix: 'だ',
    });
  });

  it.each(['genkisou', 'げんきそう', 'genki', 'genkisouna', 'genkidesu', ''])(
    'does not claim a boundary mistake for %s',
    (answer) => {
      expect(sentenceBlankFeedback(prompt, answer)).toBeNull();
    },
  );

  it('stays silent for reverse, listening, missing, or ambiguous sentence context', () => {
    for (const options of [{ reverseDrill: true }, { listeningPrompt: true }]) {
      const otherPrompt = buildSentencePromptModel({ entry, word, type: 'adj-sou', ...options });
      expect(sentenceBlankFeedback(otherPrompt, 'genkisouda')).toBeNull();
    }
    expect(sentenceBlankFeedback(null, 'genkisouda')).toBeNull();
    const repeatedBlank = buildSentencePromptModel({
      entry: { ...entry, jaTemplate: '{w}と{w}だ。' },
      word,
      type: 'adj-sou',
    });
    expect(repeatedBlank.cloze).toBeNull();
    expect(sentenceBlankFeedback(repeatedBlank, 'genkisouda')).toBeNull();
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
