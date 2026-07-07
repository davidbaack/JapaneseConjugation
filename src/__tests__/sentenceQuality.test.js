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
    expect(
      sentenceSemanticQualityIssue({
        type: 'honorific',
        en: 'The teacher congradulationses today.',
      }),
    ).toBe('en-misspelled-congratulations');
  });

  it('rejects stale verb English artifacts from older generated rows', () => {
    expect(
      sentenceSemanticQualityIssue({
        type: 'negative-te',
        en: 'I go home after class without runing out.',
      }),
    ).toBe('en-bad-gerund');
    expect(
      sentenceSemanticQualityIssue({
        type: 'honorific',
        en: 'The teacher sympathizes with before leaving.',
      }),
    ).toBe('en-dangling-preposition-time');
    expect(
      sentenceSemanticQualityIssue({
        type: 'causative-passive-negative-conditional-ba',
        en: "If I am not forced to deliver the documents, I can focus on today's work.",
      }),
    ).toBe('');
    expect(
      sentenceSemanticQualityIssue({
        type: 'negative-zuni',
        en: 'I go home today without checking.',
      }),
    ).toBe('en-negative-te-stale-go-home');
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
    expect(
      sentenceSemanticQualityIssue({
        type: 'adj-plain-present',
        en: 'The proposal is hungry.',
      }),
    ).toBe('en-adjective-human-trait-context-mismatch');
    expect(
      sentenceSemanticQualityIssue({
        type: 'adj-te-form',
        en: 'The proposal is impolite, so I will check first.',
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

  it('rejects noun-like adjective gloss fragments', () => {
    expect(
      sentenceSemanticQualityIssue({
        type: 'adj-conditional',
        en: 'If this discussion is how, I will wait a little.',
      }),
    ).toBe('en-adjective-bad-gloss-fragment');
    expect(
      sentenceSemanticQualityIssue({
        type: 'adj-naru',
        en: 'The room gets have a headache.',
      }),
    ).toBe('en-adjective-bad-gloss-fragment');
  });

  it('rejects physical or personal adjectives on abstract subjects', () => {
    expect(
      sentenceSemanticQualityIssue({
        type: 'adj-conditional',
        en: 'If this discussion is square, I will wait a little.',
      }),
    ).toBe('en-adjective-abstract-context-mismatch');
    expect(
      sentenceSemanticQualityIssue({
        type: 'adj-naru',
        en: 'The plan gets smoky.',
      }),
    ).toBe('en-adjective-abstract-context-mismatch');
  });

  it('rejects adjective rows whose Japanese subject conflicts with English', () => {
    expect(
      sentenceRowQualityIssue({
        type: 'adj-conditional',
        jaTemplate:
          '\u3082\u3057\u4eca\u65e5\u306e\u4e88\u5b9a\u304c{w}\u3001\u65e9\u3081\u306b\u8abf\u6574\u3059\u308b\u3002',
        en: 'If the student is strong-willed, I want to go.',
      }),
    ).toBe('ja-en-adjective-subject-mismatch');
  });
});
