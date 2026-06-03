import { describe, expect, it } from 'vitest';
import { getOfflineTemplateSentence } from '../utils/conjugatorExplain.js';

// getOfflineTemplateSentence powers cued Sentence mode: a per-type example
// frame with the answer blanked out and a grammar cue. These guard the wiring
// against type-id drift and confirm the fields we render never leak the reading.
const VERB = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
const ADJ = { dict: '高い', reading: 'たかい', meaning: 'expensive', group: 'i-adjective' };

describe('getOfflineTemplateSentence (cued cloze frames)', () => {
  const verbTypes = [
    'plain-past',
    'te-form',
    'polite-present',
    'potential',
    'passive',
    'plain-negative',
    'masu-stem',
    'volitional',
  ];

  it('returns a blanked frame and a cue for each enabled verb form', () => {
    for (const type of verbTypes) {
      const out = getOfflineTemplateSentence(VERB, type);
      expect(out.sentence).toContain('[______]');
      expect(typeof out.cue).toBe('string');
      expect(out.cue.length).toBeGreaterThan(0);
      // The rendered fields must not spoil the kana reading.
      expect(out.sentence).not.toContain(VERB.reading);
      expect(out.cue).not.toContain(VERB.reading);
    }
  });

  it('handles adjectives with their own frames', () => {
    const out = getOfflineTemplateSentence(ADJ, 'adj-plain-past');
    expect(out.sentence).toContain('[______]');
    expect(out.cue).toBeTruthy();
    expect(out.sentence).not.toContain(ADJ.reading);
  });
});
