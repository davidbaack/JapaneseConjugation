import { describe, expect, it } from 'vitest';
import { buildCorpusChunks, expectedSentencePairs } from '../../scripts/export-sentence-corpus.js';

const WORD = { dict: '買う', reading: 'かう', meaning: 'to buy', group: 'godan' };

describe('sentence corpus exporter helpers', () => {
  it('builds expected pairs from current conjugation rules', () => {
    expect(expectedSentencePairs([WORD], ['plain-past'])).toEqual([
      { word_key: 'godan:買う', type: 'plain-past' },
    ]);
  });

  it('filters stale rows and sorts corpus rows by word key', () => {
    const expected = [
      { word_key: 'godan:b', type: 'plain-past' },
      { word_key: 'godan:a', type: 'plain-past' },
    ];
    const result = buildCorpusChunks(expected, [
      {
        word_key: 'godan:stale',
        type: 'plain-past',
        ja_template: '古い{w}。',
        en: 'Stale.',
        segments: [{ w: true }],
      },
      {
        word_key: 'godan:b',
        type: 'plain-past',
        ja_template: 'ノートに{w}。',
        en: 'I wrote it in my notebook.',
        segments: [{ w: true }],
      },
      {
        word_key: 'godan:a',
        type: 'plain-past',
        ja_template: '昼に{w}。',
        en: 'I bought it at noon.',
        segments: [{ w: true }],
      },
    ]);

    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.stale).toEqual(['godan:stale|plain-past']);
    expect(result.chunks).toEqual([
      {
        type: 'plain-past',
        rows: [
          ['godan:a', '昼に{w}。', 'I bought it at noon.', [{ w: true }]],
          ['godan:b', 'ノートに{w}。', 'I wrote it in my notebook.', [{ w: true }]],
        ],
      },
    ]);
  });

  it('reports missing and invalid expected rows', () => {
    const result = buildCorpusChunks(
      [
        { word_key: 'godan:買う', type: 'plain-past' },
        { word_key: 'godan:書く', type: 'plain-past' },
      ],
      [
        {
          word_key: 'godan:買う',
          type: 'plain-past',
          ja_template: '昼に{w}。',
          en: 'I bought it at noon.',
          segments: null,
        },
      ],
    );

    expect(result.invalid).toEqual([{ key: 'godan:買う|plain-past', reason: 'missing-segments' }]);
    expect(result.missing).toEqual(['godan:買う|plain-past', 'godan:書く|plain-past']);
  });
});
