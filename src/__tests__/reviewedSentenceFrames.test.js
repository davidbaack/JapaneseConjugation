import { describe, expect, it } from 'vitest';
import { ALL_CARD_TYPES } from '../data/conjugationTypes.js';
import { loadSentenceWordMap } from '../../scripts/sentenceEnglish.js';
import {
  reviewedSentenceRestriction,
  sentenceWordReview,
} from '../data/reviewedSentenceProfiles.js';
import { buildReviewedSentence } from '../utils/reviewedSentenceFrames.js';
import { exerciseEnglishForForm, exerciseMeaningForWord } from '../utils/exerciseMeaning.js';

const words = loadSentenceWordMap();
const word = (key) => words.get(key);
const pendingRepairedIdentities = new Map([
  ['godan:いただく', 'いただく'],
  ['i-adjective:うれしい', 'うれしい'],
  ['na-adjective:いっぱい', 'いっぱい'],
  ['suru:あいさつする', 'あいさつする'],
  ['godan:終わる', 'おわる'],
  ['godan:曲がる', 'まがる'],
  ['ichidan:落ちる', 'おちる'],
  ['godan:落とす', 'おとす'],
  ['godan:楽しむ', 'たのしむ'],
]);
const filled = (key, type) => {
  const sentence = buildReviewedSentence(word(key), type);
  return sentence && { ja: sentence.jaTemplate.replace('{w}', sentence.surface), en: sentence.en };
};

describe('explicit reviewed sentence content', () => {
  it('keeps approved preference contexts unchanged after display-only gloss repair', () => {
    for (const key of ['na-adjective:好き', 'na-adjective:嫌い']) {
      const item = word(key);
      const original = JSON.stringify(item);
      const before = buildReviewedSentence(item, 'adj-plain-present');
      expect(before).not.toBeNull();
      expect(exerciseMeaningForWord(item)).toMatch(/^(?:dis)?like \(something\)$/);
      expect(exerciseEnglishForForm(item, 'adj-sou')).toMatch(/^seems to /);
      expect(JSON.stringify(item)).toBe(original);
      expect(buildReviewedSentence(item, 'adj-plain-present')).toEqual(before);
    }
  });

  it('classifies beginner entries or explicitly awaits review of repaired identities', () => {
    const counts = new Map();
    let supported = 0;
    for (const item of words.values()) {
      const review = sentenceWordReview(item);
      if (pendingRepairedIdentities.get(review.key) === item.reading)
        expect(review.status).toBe('needs-review');
      else if (['N5', 'N4'].includes(item.jlpt)) expect(review.status).not.toBe('needs-review');
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

  it('binds each passive and keigo frame to its actual object and recipient', () => {
    const praise = buildReviewedSentence(word('ichidan:褒める'), 'passive-polite-past');
    expect(praise.sense).toBe('be praised by the teacher');
    expect(filled('ichidan:褒める', 'passive-polite-past')).toEqual({
      ja: '私は先生に褒められました。',
      en: 'I was praised by the teacher.',
    });
    expect(buildReviewedSentence(word('ichidan:褒める'), 'passive').sense).toBe(
      'be praised by the teacher',
    );
    const tea = buildReviewedSentence(word('godan:飲む'), 'humble');
    expect(tea.sense).toBe('drink tea received from the teacher');
    expect(filled('godan:飲む', 'humble')).toEqual({
      ja: '私は先生にいただいたお茶をいただく。',
      en: 'I drink the tea I received from the teacher.',
    });
    expect(buildReviewedSentence(word('godan:飲む'), 'humble-polite').sense).toBe(
      'drink tea received from the teacher',
    );
    expect(buildReviewedSentence(word('godan:飲む'), 'plain-present').sense).toBe('drink water');
    expect(buildReviewedSentence(word('godan:買う'), 'passive').sense).toBe('buy a book');
    expect(buildReviewedSentence(word('godan:洗う'), 'passive-negative').sense).toBe(
      'wash a plate',
    );
    expect(buildReviewedSentence(word('ichidan:見る'), 'honorific').sense).toBe('look at a photo');
    expect(buildReviewedSentence(word('ichidan:教える'), 'humble').sense).toBe(
      'explain how to use it to the teacher',
    );
  });

  it('does not invent ongoing motion for resulting states', () => {
    expect(filled('godan:死ぬ', 'progressive')).toEqual({
      ja: '金魚が死んでいる。',
      en: 'The goldfish is dead.',
    });
    expect(filled('ichidan:着る', 'progressive').en).toBe('I am wearing my jacket.');
    expect(filled('godan:走る', 'progressive').en).toBe('I am running in the park.');
    expect(filled('godan:止まる', 'progressive').en).toBe('The train is stopped.');
    expect(filled('godan:始まる', 'progressive-negative').en).toBe('The class has not started.');
    expect(filled('godan:始まる', 'progressive-polite-past-negative').en).toBe(
      'The class had not started.',
    );
    expect(filled('ichidan:覚える', 'progressive-negative').en).toBe(
      'I do not remember the kanji.',
    );
    expect(filled('godan:すく', 'progressive-negative').en).toBe(
      'The road is not lightly trafficked.',
    );
    expect(filled('godan:残る', 'plain-negative').en).toBe('No bread remains.');
    expect(filled('godan:残る', 'progressive-past-negative').en).toBe('There was no bread left.');
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
      ja: '私は休んで、日記を書いた。',
      en: 'I rested, then wrote in my diary.',
    });
    expect(filled('godan:歩く', 'causative').ja).toBe('先生は私に公園を歩かせる。');
    expect(filled('godan:有る', 'plain-present').ja).toBe('机の上に本が有る。');
    expect(filled('na-adjective:色々', 'adj-plain-present').en).toBe('The types are varied.');
  });

  it('uses factual reactions for adjective linking forms and identifies the experiencer', () => {
    expect(filled('na-adjective:静か', 'adj-te-form')).toEqual({
      ja: 'この部屋は静かで、私は驚いた。',
      en: 'This room was quiet, and I was surprised.',
    });
    expect(filled('i-adjective:おいしい', 'adj-negative-te-form')).toEqual({
      ja: 'この料理はおいしくなくて、私は驚いた。',
      en: 'This dish was not delicious, and I was surprised.',
    });
    expect(filled('na-adjective:心配', 'adj-conditional')).toEqual({
      ja: 'もし子どものことが心配なら、私は先生に伝える。',
      en: 'If I am worried about the child, I will tell the teacher.',
    });
    expect(filled('na-adjective:残念', 'adj-sou')).toEqual({
      ja: 'この結果を見て、先生は残念そうだ。',
      en: 'After seeing this result, the teacher looks disappointed.',
    });
  });

  it('keeps English grammar and inference aligned with the named subject', () => {
    expect(filled('na-adjective:邪魔', 'adj-attributive').en).toBe(
      'I talked about this box that was in the way.',
    );
    expect(filled('na-adjective:邪魔', 'adj-naru').en).toBe('This box gets in the way.');
    expect(filled('na-adjective:変', 'adj-plain-present').en).toBe('This sound is strange.');
    expect(filled('godan:書く', 'causative-passive-conditional-ba')).toEqual({
      ja: 'もし私が先生に手紙を書かせられれば、どうなりますか。',
      en: 'What happens if I am made to write a letter by the teacher?',
    });
    expect(filled('godan:読む', 'passive-conditional-ba').ja).toBe(
      'もしこの本が学生に読まれれば、どうなりますか。',
    );
    expect(filled('godan:書く', 'passive')).toEqual({
      ja: 'この説明は専門家によって書かれる。',
      en: 'This explanation is written by an expert.',
    });
  });

  it('gives accompaniment, ability, rest and relatives unambiguous contexts', () => {
    expect(filled('ichidan:連れる', 'plain-present')).toEqual({
      ja: '私は子どもを連れる。',
      en: 'I take a child along.',
    });
    expect(filled('suru:する', 'potential-conditional-ba')).toEqual({
      ja: 'もし宿題ができれば、どうなりますか。',
      en: 'What happens if I can do my homework?',
    });
    expect(filled('godan:休む', 'plain-negative')).toEqual({
      ja: '私は休まない。',
      en: 'I do not rest.',
    });
    expect(filled('godan:手伝う', 'request-kudasai')).toEqual({
      ja: '私の母を手伝ってください。',
      en: 'Please help my mother.',
    });
    expect(filled('godan:起こす', 'prohibition')).toEqual({
      ja: '私の弟を起こすな。',
      en: 'Do not wake my younger brother!',
    });
  });

  it('withholds named unsettled contexts without declaring every variant invalid', () => {
    for (const [key, type] of [
      ['i-adjective:かわいい', 'adj-sou'],
      ['i-adjective:白い', 'adj-sou'],
      ['na-adjective:結構', 'adj-plain-negative'],
      ['na-adjective:適当', 'adj-sugiru'],
      ['na-adjective:変', 'adj-sou'],
      ['i-adjective:ない', 'adj-polite-past-negative'],
      ['godan:知る', 'progressive-negative'],
      ['godan:おる', 'plain-present'],
    ]) {
      expect(reviewedSentenceRestriction(word(key), type)).not.toBe('');
      expect(buildReviewedSentence(word(key), type)).toBeNull();
    }
    expect(filled('i-adjective:白い', 'adj-plain-present')).not.toBeNull();
    expect(filled('suru:修理する', 'plain-present')).not.toBeNull();
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
    for (const key of ['godan:しまう', 'i-adjective:辛い']) {
      const item = word(key);
      if (item) expect(sentenceWordReview(item).status).toBe('unsuitable');
      expect(buildReviewedSentence(item, 'plain-present')).toBeNull();
    }
    for (const [key, reading] of pendingRepairedIdentities) {
      const item = word(key);
      expect(item.reading).toBe(reading);
      expect(sentenceWordReview(item).status).toBe('needs-review');
      expect(buildReviewedSentence(item, 'plain-present')).toBeNull();
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
