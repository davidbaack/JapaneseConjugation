import { describe, expect, it } from 'vitest';
import {
  checkTeachingRepair,
  resolveTeachingCandidates,
} from '../../scripts/repair-teaching-corpus.js';
import { checkLexicalTeachingReview } from '../../scripts/check-lexical-teaching-review.js';

const candidate = {
  id: 'godan:弾く|causative',
  target: { kana: 'ひかせる' },
  targetFingerprint: 'current-reviewed-target',
  needsReview: true,
  automaticDisposition: null,
};
const decision = {
  id: candidate.id,
  targetFingerprint: candidate.targetFingerprint,
  reviewer: 'independent-editorial-reviewer',
  decision: 'accept',
  reason: 'The piano context uses the selected ひく reading and its causative.',
};

describe('source-bound teaching repair', () => {
  it('accounts for every original lexical identity and closes every mandatory lexical flag', () => {
    expect(checkLexicalTeachingReview()).toEqual({
      originalLexicalIdentities: 2162,
      currentLexicalIdentities: 2091,
      unresolvedMandatoryFlags: 0,
      uncoveredCurrentIdentities: 0,
    });
  });
  it('requires an exact, explained review for every changed or previously flagged pair', () => {
    expect(() => resolveTeachingCandidates([candidate], [])).toThrow(/missing editorial/i);
    expect(() => resolveTeachingCandidates([candidate], [{ ...decision, reason: '' }])).toThrow(
      /incomplete/i,
    );
    expect(() =>
      resolveTeachingCandidates([candidate], [{ ...decision, targetFingerprint: 'old-target' }]),
    ).toThrow(/different content/i);
    expect(() => resolveTeachingCandidates([candidate], [decision, decision])).toThrow(
      /duplicate/i,
    );
    expect(resolveTeachingCandidates([candidate], [decision])[0].disposition).toBe('repaired');
  });

  it('cannot reapprove a context that the reviewed source no longer supplies', () => {
    const withheld = { ...candidate, target: null, targetFingerprint: null };
    expect(() =>
      resolveTeachingCandidates([withheld], [{ ...decision, targetFingerprint: null }]),
    ).toThrow(/unavailable/i);
    const review = {
      ...decision,
      targetFingerprint: null,
      decision: 'withhold',
      reason: 'The selected sense has no reviewed context for this form.',
    };
    expect(resolveTeachingCandidates([withheld], [review])[0].disposition).toBe('withheld');
  });

  it('accounts for the whole frozen corpus and rejects stale or withheld published rows', () => {
    const result = checkTeachingRepair();
    expect(result.originalPairs).toBe(23075);
    expect(result.publishedPairs).toBe(result.counts.retained + result.counts.repaired);
    expect(result.counts.retained + result.counts.repaired + result.counts.withheld).toBe(23075);
  });
});
