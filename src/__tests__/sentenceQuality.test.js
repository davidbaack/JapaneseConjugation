import { describe, expect, it } from 'vitest';
import { sentenceRowQualityIssue, sentenceSemanticQualityIssue } from '../utils/sentenceQuality.js';

describe('sentence row quality checks', () => {
  it('rejects corrupted Japanese templates with replacement question marks', () => {
    expect(
      sentenceRowQualityIssue({
        type: 'adj-plain-present',
        jaTemplate: '??{w}?',
        en: 'My skin is itchy.',
      }),
    ).toBe('ja-corrupt-question-marks');
  });

  it('rejects adjective adverb rows whose English object contradicts the Japanese object', () => {
    expect(
      sentenceRowQualityIssue({
        type: 'adj-adverb',
        jaTemplate:
          '\u7df4\u7fd2\u306e\u524d\u306b\u3001\u79c1\u306f\u6587\u7ae0\u3092{w}\u3059\u308b\u3002',
        en: 'I make the room good.',
      }),
    ).toBe('en-ja-adverb-object-mismatch');
  });

  it('allows adjective adverb rows when the English object matches the Japanese object', () => {
    expect(
      sentenceRowQualityIssue({
        type: 'adj-adverb',
        jaTemplate:
          '\u7df4\u7fd2\u306e\u524d\u306b\u3001\u79c1\u306f\u6587\u7ae0\u3092{w}\u3059\u308b\u3002',
        en: 'I make the text good.',
      }),
    ).toBe('');
  });

  it('keeps the existing body-sensation semantic quarantine', () => {
    expect(
      sentenceSemanticQualityIssue({
        type: 'adj-tara',
        en: 'If this task is itchy, I will add a break.',
      }),
    ).toBe('en-adjective-body-context-mismatch');
  });

  it('rejects stale generic verb conditional results', () => {
    expect(
      sentenceSemanticQualityIssue({
        type: 'conditional-tara',
        en: 'If I buy tomorrow, I will feel relieved.',
      }),
    ).toBe('en-generic-verb-conditional-result');
  });

  it('does not apply the verb conditional quarantine to adjective conditionals', () => {
    expect(
      sentenceSemanticQualityIssue({
        type: 'adj-tara',
        en: 'If tomorrow is calm, I will feel relieved.',
      }),
    ).toBe('');
  });

  it('rejects stale adjective negated glosses', () => {
    expect(
      sentenceSemanticQualityIssue({
        type: 'adj-negative-conditional',
        en: "If the explanation is not be beyond one's power, I will wait.",
      }),
    ).toBe('en-adjective-negated-gloss-mismatch');
  });

  it('rejects misspelled congratulations glosses', () => {
    expect(
      sentenceSemanticQualityIssue({
        type: 'causative-negative',
        en: 'The teacher does not make me congradulations today.',
      }),
    ).toBe('en-misspelled-congratulations');
  });

  it('rejects human-trait adjectives on inanimate subjects', () => {
    expect(
      sentenceSemanticQualityIssue({
        type: 'adj-conditional',
        en: 'If this shirt color is quick tempered, I will choose it.',
      }),
    ).toBe('en-adjective-human-trait-context-mismatch');
    expect(
      sentenceSemanticQualityIssue({
        type: 'adj-attributive',
        en: 'I choose a clever meal.',
      }),
    ).toBe('en-adjective-human-trait-context-mismatch');
    expect(
      sentenceSemanticQualityIssue({
        type: 'adj-adverb',
        en: 'I make the screen timid.',
      }),
    ).toBe('en-adjective-human-trait-context-mismatch');
  });

  it('allows human-trait adjectives on people', () => {
    expect(
      sentenceSemanticQualityIssue({
        type: 'adj-conditional',
        en: 'If the student is clever, I will prepare another explanation.',
      }),
    ).toBe('');
  });
});
