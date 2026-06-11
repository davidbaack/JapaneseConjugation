import { describe, expect, it } from 'vitest';
import { englishQualityIssue } from '../../scripts/sentencePipeline.js';
import { sentenceEnglish } from '../../scripts/sentenceEnglish.js';

const VERB = {
  dict: 'sample',
  reading: 'sample',
  meaning: 'to buy',
  group: 'godan',
};

const ADJECTIVE = {
  dict: 'sample',
  reading: 'sample',
  meaning: 'quiet',
  group: 'na-adjective',
};

function expectGood(en, type) {
  expect(en).not.toMatch(/practice sentence| form\b/i);
  expect(englishQualityIssue(en, type)).toBe('');
}

describe('sentenceEnglish', () => {
  it('writes natural English for simple verb templates', () => {
    expectGood(sentenceEnglish(VERB, 'plain-present'), 'plain-present');
    expect(sentenceEnglish(VERB, 'plain-present')).toBe('I also buy today.');
    expect(sentenceEnglish(VERB, 'plain-past')).toBe('I also bought today.');
    expect(sentenceEnglish(VERB, 'plain-negative')).toBe('I also do not buy today.');
  });

  it('conjugates the head verb of phrasal and irregular meanings', () => {
    const kaeru = { dict: '帰る', reading: 'かえる', meaning: 'to return home', group: 'godan' };
    const taoreru = { dict: '倒れる', reading: 'たおれる', meaning: 'to fall', group: 'ichidan' };
    expect(sentenceEnglish(kaeru, 'plain-past')).toBe('I also returned home today.');
    expect(sentenceEnglish(taoreru, 'plain-past')).toBe('I also fell today.');
  });

  it('writes natural English for advanced verb templates', () => {
    expect(sentenceEnglish(VERB, 'potential')).toBe('I can also buy today.');
    expect(sentenceEnglish(VERB, 'passive-past')).toBe('It was bought by a friend today.');
    expect(sentenceEnglish(VERB, 'causative-negative')).toBe(
      'The teacher does not make me buy today.',
    );
    expectGood(sentenceEnglish(VERB, 'causative-negative'), 'causative-negative');
  });

  it('writes natural English for adjective templates', () => {
    expect(sentenceEnglish(ADJECTIVE, 'adj-plain-present')).toBe('Today is quiet.');
    expect(sentenceEnglish(ADJECTIVE, 'adj-te-form')).toBe('Today it is quiet, so I feel good.');
    expect(sentenceEnglish(ADJECTIVE, 'adj-sou')).toBe('The sky looks quiet.');
    expectGood(sentenceEnglish(ADJECTIVE, 'adj-sou'), 'adj-sou');
  });
});
