import { describe, expect, it } from 'vitest';
import { ALL_CARD_TYPES } from '../data/conjugationTypes.js';
import { loadSentenceWordMap } from '../../scripts/sentenceEnglish.js';
import { sentenceWordReview } from '../data/reviewedSentenceProfiles.js';
import { buildReviewedSentence } from '../utils/reviewedSentenceFrames.js';

const words = loadSentenceWordMap();
const word = (key) => words.get(key);
const filled = (key, type) => {
  const sentence = buildReviewedSentence(word(key), type);
  return sentence && { ja: sentence.jaTemplate.replace('{w}', sentence.surface), en: sentence.en };
};

describe('explicit reviewed sentence content', () => {
  it('classifies every beginner entry and keeps real coverage in every form', () => {
    const counts = new Map();
    let supported = 0;
    for (const item of words.values()) {
      const review = sentenceWordReview(item);
      if (['N5', 'N4'].includes(item.jlpt)) expect(review.status).not.toBe('needs-review');
      if (review.status === 'supported') supported += 1;
      for (const { id } of ALL_CARD_TYPES) {
        const sentence = buildReviewedSentence(item, id);
        if (!sentence) continue;
        counts.set(id, (counts.get(id) || 0) + 1);
        expect(sentence.jaTemplate.split('{w}')).toHaveLength(2);
        expect(sentence.kana).toMatch(/^[\u3040-\u30ff\s]+$/u);
        expect(sentence.en).not.toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/u);
      }
    }
    expect(supported).toBeGreaterThan(500);
    for (const { id } of ALL_CARD_TYPES) expect(counts.get(id)).toBeGreaterThan(0);
  });

  it('pairs a human subject with energetic and preserves it across languages', () => {
    expect(filled('na-adjective:元気', 'adj-sou')).toEqual({
      ja: 'この子は元気そうだ。',
      en: 'This child looks energetic.',
    });
    expect(filled('na-adjective:元気', 'adj-adverb')).toEqual({
      ja: '子どもは元気に遊ぶ。',
      en: 'The child plays energetically.',
    });
    expect(filled('na-adjective:丁寧', 'adj-plain-present')).toEqual({
      ja: 'この先生は丁寧だ。',
      en: 'This teacher is polite.',
    });
  });

  it('uses the listener and group viewpoint in instructions and invitations', () => {
    expect(filled('godan:洗う', 'request-kudasai').en).toBe('Please wash your hands.');
    expect(filled('godan:言う', 'request-kudasai').en).toBe('Please say your name.');
    expect(filled('godan:洗う', 'volitional').en).toBe("Let's wash our hands.");
    expect(filled('godan:言う', 'volitional').en).toBe("Let's say our names.");
    expect(filled('ichidan:上げる', 'volitional').en).toBe("Let's raise our hands.");
  });

  it('binds an explicitly different adverb sense to its actual context', () => {
    for (const [key, expected] of [
      ['na-adjective:丁寧', 'careful'],
      ['i-adjective:高い', 'high (height)'],
      ['i-adjective:優しい', 'gentle'],
      ['i-adjective:大きい', 'large (letter size)'],
    ]) {
      expect(buildReviewedSentence(word(key), 'adj-adverb').sense).toBe(expected);
    }
    expect(buildReviewedSentence(word('na-adjective:丁寧'), 'adj-plain-present').sense).toBe(
      'polite',
    );
    expect(buildReviewedSentence(word('i-adjective:高い'), 'adj-plain-present').sense).toBe('tall');
  });

  it('does not invent ongoing motion for resulting states', () => {
    expect(filled('godan:死ぬ', 'progressive')).toEqual({
      ja: '金魚が死んでいる。',
      en: 'The goldfish is dead.',
    });
    expect(filled('ichidan:着る', 'progressive').en).toBe('I am wearing my jacket.');
    expect(filled('godan:走る', 'progressive').en).toBe('I am running in the park.');
    expect(filled('godan:止まる', 'progressive').en).toBe('The train is stopped.');
  });

  it('keeps Japanese and English tense, polarity, and receiver aligned', () => {
    expect(filled('godan:読む', 'passive-polite-past-negative')).toEqual({
      ja: 'この本は学生に読まれませんでした。',
      en: 'This book was not read by a student.',
    });
    expect(filled('godan:書く', 'causative-passive-past-negative')).toEqual({
      ja: '私は先生に手紙を書かせられなかった。',
      en: 'I was not made to write a letter by the teacher.',
    });
    expect(filled('godan:知る', 'plain-negative').en).toBe('I do not know that fact.');
    expect(filled('godan:知る', 'plain-past').en).toBe('I found out that fact.');
    expect(filled('na-adjective:好き', 'adj-polite-past-negative').en).toBe(
      'I did not like this song.',
    );
  });

  it('does not compose contradictory or duplicate narrative clauses', () => {
    expect(filled('godan:帰る', 'negative-te')).toEqual({
      ja: '私は家に帰らないで、そのことを後悔した。',
      en: 'I regretted not returning home.',
    });
    expect(filled('godan:休む', 'te-form')).toEqual({
      ja: '私は少し休んで、日記を書いた。',
      en: 'I rested a little, then wrote in my diary.',
    });
    expect(filled('godan:歩く', 'causative').ja).toBe('先生は私に公園を歩かせる。');
    expect(filled('godan:有る', 'plain-present').ja).toBe('机の上に本が有る。');
    expect(filled('na-adjective:色々', 'adj-plain-present').en).toBe('The types are varied.');
  });

  it('rejects changed readings, changed senses, custom homographs, and malformed kana', () => {
    const original = word('godan:読む');
    expect(
      buildReviewedSentence({ ...original, meaning: 'to read minds' }, 'plain-present'),
    ).toBeNull();
    expect(buildReviewedSentence({ ...original, reading: 'はなす' }, 'plain-present')).toBeNull();
    expect(
      buildReviewedSentence({ ...original, exerciseMeaning: 'read minds' }, 'plain-present'),
    ).toBeNull();
    expect(buildReviewedSentence(original, 'plain-present')).not.toBeNull();
    expect(buildReviewedSentence(word('ichidan:食べる'), 'plain-present')).not.toBeNull();
    expect(
      buildReviewedSentence(
        { dict: '造語する', reading: 'ぞうごする', group: 'suru', meaning: 'invent a word' },
        'plain-present',
      ),
    ).toBeNull();
    for (const key of [
      'godan:いただく',
      'i-adjective:うれしい',
      'na-adjective:いっぱい',
      'suru:あいさつする',
      'godan:しまう',
      'i-adjective:辛い',
    ]) {
      expect(sentenceWordReview(word(key)).status).toBe('unsuitable');
      expect(buildReviewedSentence(word(key), 'plain-present')).toBeNull();
    }
  });

  it('leaves unreviewed semantic constructions unavailable', () => {
    expect(buildReviewedSentence(word('godan:死ぬ'), 'request-kudasai')).toBeNull();
    expect(buildReviewedSentence(word('godan:行く'), 'passive')).toBeNull();
    expect(buildReviewedSentence(word('ichidan:寝る'), 'humble')).toBeNull();
    expect(buildReviewedSentence(word('na-adjective:好き'), 'adj-attributive')).toBeNull();
    expect(buildReviewedSentence(word('i-adjective:近い'), 'adj-naru')).toBeNull();
  });
});
