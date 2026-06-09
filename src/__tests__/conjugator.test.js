import { describe, it, expect } from 'vitest';
import {
  conjugate,
  conjugateAdjective,
  conjugateItem,
  isRedundantPracticeType,
  normalizePromptFormSetting,
  pickPromptType,
} from '../utils/conjugator.js';
import {
  getConjugationDebugInfo,
  inferMistakenConjugationPattern,
  stepCoachHint,
} from '../utils/conjugatorExplain.js';

// ─── Test verbs ───────────────────────────────────────────────────────────────
const TABERU = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
const KAKU = { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' };
const HANASU = { dict: '話す', reading: 'はなす', meaning: 'to speak', group: 'godan' };
const MATSU = { dict: '待つ', reading: 'まつ', meaning: 'to wait', group: 'godan' };
const NOMU = { dict: '飲む', reading: 'のむ', meaning: 'to drink', group: 'godan' };
const YOMU = { dict: '読む', reading: 'よむ', meaning: 'to read', group: 'godan' };
const KAEРУ = { dict: '買う', reading: 'かう', meaning: 'to buy', group: 'godan' };
const OYOGU = { dict: '泳ぐ', reading: 'およぐ', meaning: 'to swim', group: 'godan' };
const SHINU = { dict: '死ぬ', reading: 'しぬ', meaning: 'to die', group: 'godan' };
const IKU = { dict: '行く', reading: 'いく', meaning: 'to go', group: 'godan' };
const SURU = { dict: 'する', reading: 'する', meaning: 'to do', group: 'suru' };
const BENKYOU = { dict: '勉強する', reading: 'べんきょうする', meaning: 'to study', group: 'suru' };
const KURU = { dict: '来る', reading: 'くる', meaning: 'to come', group: 'kuru' };

// ─── Test adjectives ──────────────────────────────────────────────────────────
const TAKAI = { dict: '高い', reading: 'たかい', meaning: 'expensive', group: 'i-adjective' };
const II = {
  dict: 'いい',
  reading: 'いい',
  meaning: 'good',
  group: 'i-adjective',
  irregular: true,
};
const SHIZUKA = { dict: '静か', reading: 'しずか', meaning: 'quiet', group: 'na-adjective' };

// ─── Ichidan verb (食べる) ────────────────────────────────────────────────────
describe('ichidan verb: 食べる', () => {
  it('plain forms', () => {
    expect(conjugate(TABERU, 'plain-present')).toBe('たべる');
    expect(conjugate(TABERU, 'plain-past')).toBe('たべた');
    expect(conjugate(TABERU, 'plain-negative')).toBe('たべない');
    expect(conjugate(TABERU, 'plain-past-negative')).toBe('たべなかった');
  });

  it('polite forms', () => {
    expect(conjugate(TABERU, 'polite-present')).toBe('たべます');
    expect(conjugate(TABERU, 'polite-past')).toBe('たべました');
    expect(conjugate(TABERU, 'polite-negative')).toBe('たべません');
    expect(conjugate(TABERU, 'polite-past-negative')).toBe('たべませんでした');
  });

  it('te-form and related', () => {
    expect(conjugate(TABERU, 'te-form')).toBe('たべて');
    expect(conjugate(TABERU, 'negative-te')).toBe('たべないで');
    expect(conjugate(TABERU, 'request-kudasai')).toBe('たべてください');
  });

  it('potential forms', () => {
    expect(conjugate(TABERU, 'potential')).toBe('たべられる');
    expect(conjugate(TABERU, 'potential-negative')).toBe('たべられない');
    expect(conjugate(TABERU, 'potential-polite')).toBe('たべられます');
    expect(conjugate(TABERU, 'potential-past')).toBe('たべられた');
    expect(conjugate(TABERU, 'potential-past-negative')).toBe('たべられなかった');
  });

  it('volitional and conditional', () => {
    expect(conjugate(TABERU, 'volitional')).toBe('たべよう');
    expect(conjugate(TABERU, 'polite-volitional')).toBe('たべましょう');
    expect(conjugate(TABERU, 'conditional-tara')).toBe('たべたら');
    expect(conjugate(TABERU, 'conditional-ba')).toBe('たべれば');
    expect(conjugate(TABERU, 'conditional-nara')).toBe('たべるなら');
    expect(conjugate(TABERU, 'negative-conditional-tara')).toBe('たべなかったら');
    expect(conjugate(TABERU, 'negative-conditional-ba')).toBe('たべなければ');
  });

  it('passive, causative, causative-passive', () => {
    expect(conjugate(TABERU, 'passive')).toBe('たべられる');
    expect(conjugate(TABERU, 'causative')).toBe('たべさせる');
    expect(conjugate(TABERU, 'causative-passive')).toBe('たべさせられる');
  });

  it('desiderative forms', () => {
    expect(conjugate(TABERU, 'desiderative')).toBe('たべたい');
    expect(conjugate(TABERU, 'desiderative-polite')).toBe('たべたいです');
    expect(conjugate(TABERU, 'desiderative-negative')).toBe('たべたくない');
    expect(conjugate(TABERU, 'desiderative-past')).toBe('たべたかった');
  });

  it('progressive forms', () => {
    expect(conjugate(TABERU, 'progressive')).toBe('たべている');
    expect(conjugate(TABERU, 'progressive-polite')).toBe('たべています');
    expect(conjugate(TABERU, 'progressive-negative')).toBe('たべていない');
    expect(conjugate(TABERU, 'progressive-past')).toBe('たべていた');
  });

  it('misc forms', () => {
    expect(conjugate(TABERU, 'imperative')).toBe('たべろ');
    expect(conjugate(TABERU, 'prohibition')).toBe('たべるな');
    expect(conjugate(TABERU, 'permission')).toBe('たべてもいい');
    expect(conjugate(TABERU, 'obligation')).toBe('たべなければならない');
    expect(conjugate(TABERU, 'conjectural')).toBe('たべるだろう');
    expect(conjugate(TABERU, 'masu-stem')).toBe('たべ');
    expect(conjugate(TABERU, 'negative-zuni')).toBe('たべずに');
  });
});

// ─── Godan く verb (書く) ────────────────────────────────────────────────────
describe('godan verb く: 書く', () => {
  it('plain forms', () => {
    expect(conjugate(KAKU, 'plain-past')).toBe('かいた');
    expect(conjugate(KAKU, 'plain-negative')).toBe('かかない');
    expect(conjugate(KAKU, 'te-form')).toBe('かいて');
  });

  it('polite forms', () => {
    expect(conjugate(KAKU, 'polite-present')).toBe('かきます');
    expect(conjugate(KAKU, 'polite-past')).toBe('かきました');
  });

  it('potential and volitional', () => {
    expect(conjugate(KAKU, 'potential')).toBe('かける');
    expect(conjugate(KAKU, 'volitional')).toBe('かこう');
  });
});

// ─── Godan す verb (話す) ────────────────────────────────────────────────────
describe('godan verb す: 話す', () => {
  it('key forms', () => {
    expect(conjugate(HANASU, 'plain-past')).toBe('はなした');
    expect(conjugate(HANASU, 'te-form')).toBe('はなして');
    expect(conjugate(HANASU, 'plain-negative')).toBe('はなさない');
    expect(conjugate(HANASU, 'polite-present')).toBe('はなします');
    expect(conjugate(HANASU, 'potential')).toBe('はなせる');
    expect(conjugate(HANASU, 'passive')).toBe('はなされる');
    expect(conjugate(HANASU, 'causative')).toBe('はなさせる');
  });
});

// ─── Godan つ verb (待つ) ────────────────────────────────────────────────────
describe('godan verb つ: 待つ', () => {
  it('key forms', () => {
    expect(conjugate(MATSU, 'plain-past')).toBe('まった');
    expect(conjugate(MATSU, 'te-form')).toBe('まって');
    expect(conjugate(MATSU, 'plain-negative')).toBe('またない');
    expect(conjugate(MATSU, 'potential')).toBe('まてる');
  });
});

// ─── Godan む verb (飲む) ────────────────────────────────────────────────────
describe('godan verb む: 飲む', () => {
  it('key forms', () => {
    expect(conjugate(NOMU, 'plain-past')).toBe('のんだ');
    expect(conjugate(NOMU, 'te-form')).toBe('のんで');
    expect(conjugate(NOMU, 'plain-negative')).toBe('のまない');
  });
});

// ─── Godan う verb (買う) ────────────────────────────────────────────────────
describe('godan verb う: 買う', () => {
  it('key forms', () => {
    expect(conjugate(KAEРУ, 'plain-past')).toBe('かった');
    expect(conjugate(KAEРУ, 'te-form')).toBe('かって');
    expect(conjugate(KAEРУ, 'plain-negative')).toBe('かわない');
  });
});

// ─── Godan ぐ verb (泳ぐ) ────────────────────────────────────────────────────
describe('godan verb ぐ: 泳ぐ', () => {
  it('key forms', () => {
    expect(conjugate(OYOGU, 'plain-past')).toBe('およいだ');
    expect(conjugate(OYOGU, 'te-form')).toBe('およいで');
    expect(conjugate(OYOGU, 'plain-negative')).toBe('およがない');
  });
});

// ─── Godan ぬ verb (死ぬ) ────────────────────────────────────────────────────
describe('godan verb ぬ: 死ぬ', () => {
  it('key forms', () => {
    expect(conjugate(SHINU, 'plain-past')).toBe('しんだ');
    expect(conjugate(SHINU, 'te-form')).toBe('しんで');
    expect(conjugate(SHINU, 'plain-negative')).toBe('しなない');
  });
});

// ─── Godan 行く irregular past/te ─────────────────────────────────────────────
describe('godan irregular: 行く', () => {
  it('uses った for past (not いた)', () => {
    expect(conjugate(IKU, 'plain-past')).toBe('いった');
    expect(conjugate(IKU, 'te-form')).toBe('いって');
  });

  it('negative is regular', () => {
    expect(conjugate(IKU, 'plain-negative')).toBe('いかない');
  });
});

// ─── Suru verb ───────────────────────────────────────────────────────────────
describe('suru verb: する', () => {
  it('plain forms', () => {
    expect(conjugate(SURU, 'plain-present')).toBe('する');
    expect(conjugate(SURU, 'plain-past')).toBe('した');
    expect(conjugate(SURU, 'plain-negative')).toBe('しない');
    expect(conjugate(SURU, 'plain-past-negative')).toBe('しなかった');
  });

  it('polite forms', () => {
    expect(conjugate(SURU, 'polite-present')).toBe('します');
    expect(conjugate(SURU, 'polite-past')).toBe('しました');
    expect(conjugate(SURU, 'polite-negative')).toBe('しません');
  });

  it('te-form and potential', () => {
    expect(conjugate(SURU, 'te-form')).toBe('して');
    expect(conjugate(SURU, 'potential')).toBe('できる');
  });

  it('passive and causative', () => {
    expect(conjugate(SURU, 'passive')).toBe('される');
    expect(conjugate(SURU, 'causative')).toBe('させる');
  });

  it('volitional and imperative', () => {
    expect(conjugate(SURU, 'volitional')).toBe('しよう');
    expect(conjugate(SURU, 'imperative')).toBe('しろ');
  });
});

// ─── Compound suru verb (勉強する) ───────────────────────────────────────────
describe('compound suru verb: 勉強する', () => {
  it('prepends compound stem', () => {
    expect(conjugate(BENKYOU, 'plain-past')).toBe('べんきょうした');
    expect(conjugate(BENKYOU, 'polite-present')).toBe('べんきょうします');
    expect(conjugate(BENKYOU, 'te-form')).toBe('べんきょうして');
    expect(conjugate(BENKYOU, 'potential')).toBe('べんきょうできる');
  });
});

// ─── Kuru verb ───────────────────────────────────────────────────────────────
describe('kuru verb: 来る', () => {
  it('plain forms', () => {
    expect(conjugate(KURU, 'plain-present')).toBe('くる');
    expect(conjugate(KURU, 'plain-past')).toBe('きた');
    expect(conjugate(KURU, 'plain-negative')).toBe('こない');
    expect(conjugate(KURU, 'plain-past-negative')).toBe('こなかった');
  });

  it('polite forms', () => {
    expect(conjugate(KURU, 'polite-present')).toBe('きます');
    expect(conjugate(KURU, 'polite-past')).toBe('きました');
    expect(conjugate(KURU, 'polite-negative')).toBe('きません');
    expect(conjugate(KURU, 'polite-past-negative')).toBe('きませんでした');
    expect(conjugate(KURU, 'polite-volitional')).toBe('きましょう');
    expect(conjugate(KURU, 'polite-te')).toBe('きまして');
    expect(conjugate(KURU, 'polite-conditional-tara')).toBe('きましたら');
  });

  it('te-form and potential', () => {
    expect(conjugate(KURU, 'te-form')).toBe('きて');
    expect(conjugate(KURU, 'potential')).toBe('こられる');
  });

  it('volitional and imperative', () => {
    expect(conjugate(KURU, 'volitional')).toBe('こよう');
    expect(conjugate(KURU, 'imperative')).toBe('こい');
  });
});

// ─── I-adjective (高い) ───────────────────────────────────────────────────────
describe('i-adjective: 高い', () => {
  it('plain forms', () => {
    expect(conjugateAdjective(TAKAI, 'adj-plain-present')).toBe('たかい');
    expect(conjugateAdjective(TAKAI, 'adj-plain-past')).toBe('たかかった');
    expect(conjugateAdjective(TAKAI, 'adj-plain-negative')).toBe('たかくない');
    expect(conjugateAdjective(TAKAI, 'adj-plain-past-negative')).toBe('たかくなかった');
  });

  it('polite forms', () => {
    expect(conjugateAdjective(TAKAI, 'adj-polite-present')).toBe('たかいです');
    expect(conjugateAdjective(TAKAI, 'adj-polite-past')).toBe('たかかったです');
    expect(conjugateAdjective(TAKAI, 'adj-polite-negative')).toBe('たかくないです');
  });

  it('derivational forms', () => {
    expect(conjugateAdjective(TAKAI, 'adj-te-form')).toBe('たかくて');
    expect(conjugateAdjective(TAKAI, 'adj-adverb')).toBe('たかく');
    expect(conjugateAdjective(TAKAI, 'adj-conditional')).toBe('たかければ');
    expect(conjugateAdjective(TAKAI, 'adj-tara')).toBe('たかかったら');
    expect(conjugateAdjective(TAKAI, 'adj-sou')).toBe('たかそう');
    expect(conjugateAdjective(TAKAI, 'adj-sugiru')).toBe('たかすぎる');
    expect(conjugateAdjective(TAKAI, 'adj-naru')).toBe('たかくなる');
  });
});

// ─── Irregular i-adjective (いい) ─────────────────────────────────────────────
describe('irregular i-adjective: いい', () => {
  it('uses よ stem for all inflected forms', () => {
    expect(conjugateAdjective(II, 'adj-plain-past')).toBe('よかった');
    expect(conjugateAdjective(II, 'adj-plain-negative')).toBe('よくない');
    expect(conjugateAdjective(II, 'adj-plain-past-negative')).toBe('よくなかった');
    expect(conjugateAdjective(II, 'adj-polite-present')).toBe('いいです');
    expect(conjugateAdjective(II, 'adj-te-form')).toBe('よくて');
    expect(conjugateAdjective(II, 'adj-adverb')).toBe('よく');
  });
});

// ─── Na-adjective (静か) ──────────────────────────────────────────────────────
describe('na-adjective: 静か', () => {
  it('plain forms', () => {
    expect(conjugateAdjective(SHIZUKA, 'adj-plain-present')).toBe('しずかだ');
    expect(conjugateAdjective(SHIZUKA, 'adj-plain-past')).toBe('しずかだった');
    expect(conjugateAdjective(SHIZUKA, 'adj-plain-negative')).toBe('しずかではない');
    expect(conjugateAdjective(SHIZUKA, 'adj-plain-past-negative')).toBe('しずかではなかった');
  });

  it('polite forms', () => {
    expect(conjugateAdjective(SHIZUKA, 'adj-polite-present')).toBe('しずかです');
    expect(conjugateAdjective(SHIZUKA, 'adj-polite-past')).toBe('しずかでした');
    expect(conjugateAdjective(SHIZUKA, 'adj-polite-negative')).toBe('しずかではありません');
    expect(conjugateAdjective(SHIZUKA, 'adj-polite-past-negative')).toBe(
      'しずかではありませんでした',
    );
  });

  it('derivational forms', () => {
    expect(conjugateAdjective(SHIZUKA, 'adj-te-form')).toBe('しずかで');
    expect(conjugateAdjective(SHIZUKA, 'adj-adverb')).toBe('しずかに');
    expect(conjugateAdjective(SHIZUKA, 'adj-attributive')).toBe('しずかな');
    expect(conjugateAdjective(SHIZUKA, 'adj-sou')).toBe('しずかそう');
    expect(conjugateAdjective(SHIZUKA, 'adj-naru')).toBe('しずかになる');
  });
});

// ─── conjugateItem dispatch ───────────────────────────────────────────────────
describe('conjugateItem', () => {
  it('routes verbs to conjugate', () => {
    expect(conjugateItem(TABERU, 'plain-past')).toBe('たべた');
    expect(conjugateItem(SURU, 'te-form')).toBe('して');
  });

  it('routes adjectives to conjugateAdjective', () => {
    expect(conjugateItem(TAKAI, 'adj-plain-past')).toBe('たかかった');
    expect(conjugateItem(SHIZUKA, 'adj-adverb')).toBe('しずかに');
  });

  it('returns empty string for unknown type', () => {
    expect(conjugateItem(TABERU, 'nonexistent-type')).toBe('');
  });
});

// ─── Deterministic step-coach hint ──────────────────────────────────────────
describe('stepCoachHint (offline hint)', () => {
  const TYPE = 'potential-past-negative';
  const ANSWER = conjugateItem(MATSU, TYPE); // まてなかった

  it('includes the multi-step build recipe once typing has started', () => {
    const { text } = stepCoachHint(MATSU, TYPE, 'ま');
    expect(text).toContain('potential');
    expect(text).toContain('なかった');
  });

  it('does not reveal the full answer when nothing or only part is typed', () => {
    expect(stepCoachHint(MATSU, TYPE, '').text).not.toContain(ANSWER);
    expect(stepCoachHint(MATSU, TYPE, 'まて').text).not.toContain(ANSWER);
  });

  it('is not masked for a regular (derivable) verb', () => {
    expect(stepCoachHint(MATSU, TYPE, '').masked).toBe(false);
  });

  it('nudges the next thinking step when nothing is typed', () => {
    const { text } = stepCoachHint(MATSU, TYPE, '');
    expect(text).toMatch(/have not typed/);
    expect(text).toContain('identify the verb group');
    expect(text).toContain('final kana');
    expect(text).not.toContain('potential');
    expect(text).not.toContain('なかった');
  });

  it('does not give away the godan plain negative recipe before typing', () => {
    const { text } = stepCoachHint(OYOGU, 'plain-negative', '');
    expect(text).toContain('identify the verb group');
    expect(text).toContain('final kana');
    expect(text).not.toContain('あ-row');
    expect(text).not.toContain('ない');
    expect(text).not.toContain('およがない');
  });

  it('acknowledges a correct prefix and counts remaining kana', () => {
    const { text } = stepCoachHint(MATSU, TYPE, 'まて');
    expect(text).toContain('「まて」');
    expect(text).toContain(`${ANSWER.length - 2} more kana`);
  });

  it('flags where a wrong kana goes off course', () => {
    const { text } = stepCoachHint(MATSU, TYPE, 'まと'); // 2nd kana wrong
    expect(text).toContain('You are at 「ま」; build the potential form first');
    expect(text).toContain('「と」 is not the next kana');
    expect(text).not.toContain(ANSWER);
  });

  it('guides 来る compound mistakes with the missing intermediate form', () => {
    const answer = conjugateItem(KURU, TYPE); // こられなかった
    const { text, masked } = stepCoachHint(KURU, TYPE, 'kore');
    expect(masked).toBe(false);
    expect(text).toContain('First make the potential form: こられる');
    expect(text).toContain('You are at 「こ」; build the potential form first: こられる');
    expect(text).toContain('「れ」 comes later');
    expect(text).toContain('なかった');
    expect(text).not.toContain(answer);
  });

  it('accepts romaji input and converts it', () => {
    // "mate" -> まて, a correct prefix of まてなかった
    expect(stepCoachHint(MATSU, TYPE, 'mate').text).toContain('「まて」');
  });

  it('tells the student to press Enter once the full answer is typed', () => {
    expect(stepCoachHint(MATSU, TYPE, ANSWER).text).toMatch(/press Enter/);
  });

  // Irregular verbs: the rule spells out the answer, so the first hint masks it.
  it('masks the irregular する form on the first hint, then reveals on request', () => {
    const SHITA = conjugateItem(SURU, 'plain-past'); // した
    const first = stepCoachHint(SURU, 'plain-past', '');
    expect(first.masked).toBe(true);
    expect(first.text).not.toContain(SHITA);
    expect(first.text).toMatch(/irregular/i);

    const revealed = stepCoachHint(SURU, 'plain-past', '', true);
    expect(revealed.masked).toBe(false);
    expect(revealed.text).toContain(SHITA);
  });

  it('does not mask the unchanged dictionary form of an irregular verb', () => {
    // plain-present of する is する itself — nothing to spoil.
    expect(stepCoachHint(SURU, 'plain-present', '').masked).toBe(false);
  });
});

describe('visual conjugation debugger metadata', () => {
  it('exposes stem, ending, replacement, rule, and result for godan te-form', () => {
    const debug = getConjugationDebugInfo(KAKU, 'te-form');

    expect(debug.stem).toBe('か');
    expect(debug.originalEnding).toBe('く');
    expect(debug.replacement).toBe('いて');
    expect(debug.result).toBe('かいて');
    expect(debug.formula.expression).toBe('か + いて = かいて');
    expect(debug.rule.family).toBe('godan sound change');
    expect(debug.rule.short).toContain('く -> いて');
  });

  it('shows common adjective and irregular transformations as structured rules', () => {
    const adjective = getConjugationDebugInfo(TAKAI, 'adj-plain-past');
    expect(adjective.stem).toBe('たか');
    expect(adjective.originalEnding).toBe('い');
    expect(adjective.replacement).toBe('かった');
    expect(adjective.rule.family).toBe('i-adjective');

    const irregular = getConjugationDebugInfo(SURU, 'plain-past');
    expect(irregular.originalEnding).toBe('する');
    expect(irregular.replacement).toBe('した');
    expect(irregular.rule.family).toBe('suru irregular');
  });

  it('infers a likely mistaken godan sound-change pattern', () => {
    const mistake = inferMistakenConjugationPattern(KAKU, 'te-form', 'かって');

    expect(mistake.kind).toBe('onbin');
    expect(mistake.userRule).toContain('う/つ/る -> って');
    expect(mistake.expectedRule).toContain('く -> いて');
    expect(mistake.expectedResult).toBe('かいて');
  });

  it('infers when a learner used a different valid target form', () => {
    const mistake = getConjugationDebugInfo(TABERU, 'plain-past', 'たべない').mistake;

    expect(mistake.kind).toBe('form');
    expect(mistake.userRule).toContain('Plain Negative');
    expect(mistake.expectedResult).toBe('たべた');
  });

  it('infers when a learner keeps a godan dictionary ending before a row-shift suffix', () => {
    const mistake = getConjugationDebugInfo(YOMU, 'plain-negative', 'よむない').mistake;

    expect(mistake.kind).toBe('row-shift');
    expect(mistake.userRule).toBe('Kept dictionary ending む + ない');
    expect(mistake.expectedRule).toBe('む -> ま + ない');
    expect(mistake.detail).toContain('change む to ま first');
  });
});

// ─── isRedundantPracticeType: never offer an unconjugatable form ─────────────
describe('isRedundantPracticeType', () => {
  // short-causative-passive has no valid conjugation for ichidan/す-godan/する.
  const EMPTY = 'short-causative-passive';

  it('treats a form with no conjugation as redundant (excluded)', () => {
    expect(conjugateItem(TABERU, EMPTY)).toBe(''); // sanity: truly empty
    expect(isRedundantPracticeType(TABERU, EMPTY, [EMPTY])).toBe(true);
  });

  it('excludes the empty form even when duplicate-skipping is OFF', () => {
    expect(isRedundantPracticeType(TABERU, EMPTY, [EMPTY], { skipDuplicateForms: false })).toBe(
      true,
    );
    expect(isRedundantPracticeType(SURU, EMPTY, [EMPTY], { skipDuplicateForms: false })).toBe(true);
  });

  it('keeps a valid form practiceable when duplicate-skipping is OFF', () => {
    expect(conjugateItem(KAKU, EMPTY)).toBe('かかされる'); // sanity: valid for 書く
    expect(isRedundantPracticeType(KAKU, EMPTY, [EMPTY], { skipDuplicateForms: false })).toBe(
      false,
    );
  });
});

describe('prompt form settings', () => {
  it('keeps the restored Dictionary, Masu, and Mixed prompt sources explicit', () => {
    expect(normalizePromptFormSetting('dictionary')).toBe('dictionary');
    expect(normalizePromptFormSetting('masu')).toBe('polite-present');
    expect(normalizePromptFormSetting('polite-present')).toBe('polite-present');
    expect(normalizePromptFormSetting('mixed')).toBe('random');
    expect(normalizePromptFormSetting('random')).toBe('random');
    expect(normalizePromptFormSetting('te-form')).toBe('dictionary');
  });

  it('uses the Masu source when it is compatible with the prompt word', () => {
    expect(pickPromptType(TABERU, 'plain-past', { promptForm: 'masu' })).toBe('polite-present');
    expect(pickPromptType(TAKAI, 'adj-plain-past', { promptForm: 'masu' })).toBeNull();
  });
});
