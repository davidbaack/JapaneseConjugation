import { describe, expect, it } from 'vitest';
import { LEARNER_DEFAULT_TYPE_IDS } from '../data/conjugationTypes.js';
import { STARTER_ADJECTIVES, STARTER_VERBS } from '../data/starterWords.js';
import { buildOfflineCuedCloze } from '../utils/clozeSentences.js';
import { getOfflineTemplateSentence } from '../utils/conjugatorExplain.js';

const VERB = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
const I_ADJ = { dict: '高い', reading: 'たかい', meaning: 'expensive', group: 'i-adjective' };
const NA_ADJ = { dict: '静か', reading: 'しずか', meaning: 'quiet', group: 'na-adjective' };

function blankCount(sentence) {
  return sentence.split('[______]').length - 1;
}

function expectSafeCloze(out, word) {
  expect(blankCount(out.sentence)).toBe(1);
  expect(typeof out.cue).toBe('string');
  expect(out.cue.length).toBeGreaterThan(0);
  expect(typeof out.note).toBe('string');
  expect(out.note.length).toBeGreaterThan(0);
  expect(typeof out.variantId).toBe('string');
  expect(out.variantId.length).toBeGreaterThan(0);
  expect(out.sentence).not.toContain(word.reading);
  expect(out.cue).not.toContain(word.reading);
}

describe('buildOfflineCuedCloze', () => {
  it('returns a safe curated cloze for every learner-default form', () => {
    for (const type of LEARNER_DEFAULT_TYPE_IDS) {
      const word = type.startsWith('adj-') ? I_ADJ : VERB;
      expectSafeCloze(buildOfflineCuedCloze(word, type), word);
    }
  });

  it('keeps the legacy getOfflineTemplateSentence API compatible', () => {
    const direct = buildOfflineCuedCloze(VERB, 'plain-past');
    const legacy = getOfflineTemplateSentence(VERB, 'plain-past');

    expect(legacy).toEqual(direct);
  });

  it('uses varied plain-past frames instead of one repeated generic sentence', () => {
    const sentences = STARTER_VERBS.slice(0, 16).map(
      (word) => buildOfflineCuedCloze(word, 'plain-past').sentence,
    );

    expect(new Set(sentences).size).toBeGreaterThan(3);
    expect(sentences).not.toContain('昨日、友達と一緒に [______]。');
  });

  it('selects deterministic variants for the same word and type', () => {
    const first = buildOfflineCuedCloze(STARTER_VERBS[0], 'te-form');
    const second = buildOfflineCuedCloze(STARTER_VERBS[0], 'te-form');

    expect(second.variantId).toBe(first.variantId);
    expect(second.sentence).toBe(first.sentence);
  });

  it('varies deterministic variants across sampled words', () => {
    const variantIds = STARTER_VERBS.slice(0, 12).map(
      (word) => buildOfflineCuedCloze(word, 'plain-past').variantId,
    );

    expect(new Set(variantIds).size).toBeGreaterThan(1);
  });

  it('uses adjective-specific cues for い- and な-adjectives', () => {
    const iOut = buildOfflineCuedCloze(I_ADJ, 'adj-plain-past');
    const naOut = buildOfflineCuedCloze(NA_ADJ, 'adj-plain-past');

    expectSafeCloze(iOut, I_ADJ);
    expectSafeCloze(naOut, NA_ADJ);
    expect(iOut.cue).toContain('い-adjective');
    expect(naOut.cue).toContain('な-adjective');
  });

  it('falls back cleanly for advanced verb and adjective forms', () => {
    const passive = buildOfflineCuedCloze(STARTER_VERBS[1], 'passive');
    const attributive = buildOfflineCuedCloze(STARTER_ADJECTIVES[2], 'adj-attributive');

    expectSafeCloze(passive, STARTER_VERBS[1]);
    expectSafeCloze(attributive, STARTER_ADJECTIVES[2]);
  });
});
