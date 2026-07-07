import { describe, expect, it } from 'vitest';
import {
  analyzeSentenceRows,
  formatSentenceQualityReport,
  rowsFromCorpusChunks,
} from '../../scripts/sentenceCorpusQuality.js';

describe('sentence corpus quality report helpers', () => {
  it('flattens corpus chunks for analysis', () => {
    expect(
      rowsFromCorpusChunks([
        {
          type: 'adj-adverb',
          rows: [['i-adjective:good', 'x{w}', 'I make the text good.', [{ w: true }]]],
        },
      ]),
    ).toEqual([
      {
        type: 'adj-adverb',
        key: 'i-adjective:good',
        jaTemplate: 'x{w}',
        en: 'I make the text good.',
      },
    ]);
  });

  it('counts hard issues and samples them', () => {
    const result = analyzeSentenceRows(
      [
        {
          type: 'adj-adverb',
          key: 'i-adjective:good',
          jaTemplate:
            '\u7df4\u7fd2\u306e\u524d\u306b\u3001\u79c1\u306f\u6587\u7ae0\u3092{w}\u3059\u308b\u3002',
          en: 'I make the room good.',
        },
        {
          type: 'adj-plain-present',
          key: 'i-adjective:itchy',
          jaTemplate: '??{w}?',
          en: 'My skin is itchy.',
        },
      ],
      { repeatedEnglishThreshold: 3, repeatedTemplateThreshold: 3 },
    );

    expect(result.hardIssueCount).toBe(2);
    expect(result.issueCounts).toEqual({
      'en-ja-adverb-object-mismatch': 1,
      'ja-corrupt-question-marks': 1,
    });
    expect(formatSentenceQualityReport(result)).toContain('Hard issues: 2');
  });
});
