import { describe, expect, it } from 'vitest';
import { englishQualityIssue } from '../../scripts/sentencePipeline.js';
import { adjectivePhrase, sentenceEnglish } from '../../scripts/sentenceEnglish.js';

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

  it('writes conditional verb fallbacks with subjects and non-generic outcomes', () => {
    expect(sentenceEnglish(VERB, 'conditional-tara')).toBe(
      'If I buy tomorrow, I can plan around it.',
    );
    expect(sentenceEnglish(VERB, 'potential-conditional-ba')).toBe(
      'If I can buy tomorrow, we can move forward.',
    );
    expect(sentenceEnglish(VERB, 'causative-passive-conditional-ba')).toBe(
      'If I am made to buy tomorrow, it will be easier to check.',
    );
  });

  it('completes active phrasal actions before time phrases', () => {
    const sympathize = {
      dict: 'sample',
      reading: 'sample',
      meaning: 'to sympathize with',
      group: 'godan',
    };
    const run = { dict: 'sample', reading: 'sample', meaning: 'to run', group: 'godan' };
    const doVerb = { dict: 'sample', reading: 'sample', meaning: 'to do', group: 'godan' };
    expect(sentenceEnglish(sympathize, 'conditional-tara')).toBe(
      'If I sympathize with someone tomorrow, I can plan around it.',
    );
    expect(sentenceEnglish(run, 'negative-te')).toBe('Today, I went home without running.');
    expect(
      sentenceEnglish(
        { dict: 'sample', reading: 'sample', meaning: 'to be furnished with', group: 'godan' },
        'causative-negative',
      ),
    ).toBe('The teacher does not make me have the right equipment today.');
    expect(
      sentenceEnglish(
        { dict: 'sample', reading: 'sample', meaning: 'to be furnished with', group: 'godan' },
        'causative-passive-negative',
      ),
    ).toBe('I am not made to have the right equipment today.');
    expect(
      sentenceEnglish(
        { dict: 'sample', reading: 'sample', meaning: 'to be in time for', group: 'godan' },
        'causative',
      ),
    ).toBe('The teacher makes me arrive in time today.');
    expect(sentenceEnglish(doVerb, 'conditional-tara')).toBe(
      'If I do it tomorrow, I can plan around it.',
    );
  });

  it('writes natural English for adjective templates', () => {
    expect(sentenceEnglish(ADJECTIVE, 'adj-plain-present')).toBe('Today is quiet.');
    expect(sentenceEnglish(ADJECTIVE, 'adj-te-form')).toBe('Today it is quiet, so I feel good.');
    expect(sentenceEnglish(ADJECTIVE, 'adj-sou')).toBe('The sky looks quiet.');
    expectGood(sentenceEnglish(ADJECTIVE, 'adj-sou'), 'adj-sou');
  });

  it('repairs nounish adjective glosses before sentence rewrites', () => {
    expect(adjectivePhrase({ meaning: 'counter for letters' })).toBe('knowledgeable');
    expect(adjectivePhrase({ meaning: 'must not do, bad, wrong' })).toBe('unacceptable');
    expect(adjectivePhrase({ meaning: 'stability, equilibrium' })).toBe('stable');
    expect(adjectivePhrase({ meaning: "there isn't, doesn't have" })).toBe('missing');
    expect(adjectivePhrase({ meaning: 'hey' })).toBe('many');
    expect(adjectivePhrase({ meaning: 'abundantly, innumerably' })).toBe('abundant');
    expect(adjectivePhrase({ meaning: 'how, in what way' })).toBe('appropriate');
    expect(adjectivePhrase({ meaning: 'overcoat; over, exceeding, exaggeration' })).toBe(
      'excessive',
    );
    expect(adjectivePhrase({ meaning: 'looking forward to' })).toBe('eager');
    expect(adjectivePhrase({ meaning: 'Unpleasent, Disgusting' })).toBe('unpleasant');
  });

  it('uses compatible subjects for special adjective glosses', () => {
    expect(
      sentenceEnglish({ ...ADJECTIVE, meaning: 'be good at, skillful' }, 'adj-plain-negative'),
    ).toBe('The student is not skillful.');
    expect(
      sentenceEnglish({ ...ADJECTIVE, meaning: "there isn't, doesn't have" }, 'adj-negative-tara'),
    ).toBe('If the item is not missing, I will stay home.');
    expect(
      sentenceEnglish(
        { ...ADJECTIVE, meaning: "be beyond one's power, be unable" },
        'adj-negative-te-form',
      ),
    ).toBe('The task is not overwhelming, so I am having trouble.');
  });

  it('uses person-compatible wording for human-trait adjectives', () => {
    expect(
      sentenceEnglish({ ...ADJECTIVE, meaning: 'Quick tempered' }, 'adj-negative-conditional'),
    ).toBe('If the student is not quick-tempered, I want to go.');
    expect(sentenceEnglish({ ...ADJECTIVE, meaning: 'Slow tempered' }, 'adj-attributive')).toBe(
      'I met a patient student today.',
    );
    expect(sentenceEnglish({ ...ADJECTIVE, meaning: 'Nervous' }, 'adj-naru')).toBe(
      'The student gets nervous.',
    );
    expect(
      sentenceEnglish({ ...ADJECTIVE, meaning: 'Competetive, Unyielding' }, 'adj-conditional'),
    ).toBe('If the student is competitive, I want to go.');
    expect(sentenceEnglish({ ...ADJECTIVE, meaning: 'Fawn' }, 'adj-plain-present')).toBe(
      'The student is hungry.',
    );
    expect(sentenceEnglish({ ...ADJECTIVE, meaning: 'Impolite' }, 'adj-te-form')).toBe(
      'The student is impolite, so I feel good.',
    );
  });
});
