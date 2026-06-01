import { describe, it, expect } from 'vitest';
import {
  assignmentMatchesWanikaniScope,
  groupFromWanikaniParts,
  wanikaniListId,
  wanikaniSubjectToWord,
} from '../utils/wanikani.js';

function subject(data, id = 1) {
  return { id, data };
}

describe('WaniKani import helpers', () => {
  it('maps WaniKani godan vocabulary to a custom word', () => {
    const word = wanikaniSubjectToWord(
      subject({
        characters: '語る',
        level: 17,
        meanings: [{ meaning: 'To Talk', primary: true, accepted_answer: true }],
        readings: [{ reading: 'かたる', primary: true, accepted_answer: true }],
        parts_of_speech: ['transitive_verb', 'godan_verb'],
      }),
    );

    expect(word).toMatchObject({
      dict: '語る',
      reading: 'かたる',
      meaning: 'To Talk',
      group: 'godan',
      source: 'wanikani',
      wanikaniLevel: 17,
    });
  });

  it('adds する for WaniKani noun-style suru verb subjects', () => {
    const word = wanikaniSubjectToWord(
      subject({
        characters: '勉強',
        level: 2,
        meanings: [{ meaning: 'Study', primary: true, accepted_answer: true }],
        readings: [{ reading: 'べんきょう', primary: true, accepted_answer: true }],
        parts_of_speech: ['noun', 'suru_verb'],
      }),
    );

    expect(word).toMatchObject({
      dict: '勉強する',
      reading: 'べんきょうする',
      group: 'suru',
    });
  });

  it('skips unsupported non-conjugatable subjects', () => {
    const word = wanikaniSubjectToWord(
      subject({
        characters: '水',
        meanings: [{ meaning: 'Water', primary: true, accepted_answer: true }],
        readings: [{ reading: 'みず', primary: true, accepted_answer: true }],
        parts_of_speech: ['noun'],
      }),
    );

    expect(word).toBe(null);
  });

  it('recognizes WaniKani adjective and verb part labels', () => {
    expect(groupFromWanikaniParts(['ichidan_verb'])).toBe('ichidan');
    expect(groupFromWanikaniParts(['い_adjective'])).toBe('i-adjective');
    expect(groupFromWanikaniParts(['な_adjective'])).toBe('na-adjective');
  });

  it('filters assignments for import scopes', () => {
    const assignment = {
      data: {
        unlocked_at: '2026-01-01T00:00:00.000000Z',
        started_at: '2026-01-02T00:00:00.000000Z',
        passed_at: '2026-01-03T00:00:00.000000Z',
        burned_at: null,
        srs_stage: 5,
      },
    };

    expect(assignmentMatchesWanikaniScope(assignment, 'unlocked')).toBe(true);
    expect(assignmentMatchesWanikaniScope(assignment, 'started')).toBe(true);
    expect(assignmentMatchesWanikaniScope(assignment, 'passed')).toBe(true);
    expect(assignmentMatchesWanikaniScope(assignment, 'burned')).toBe(false);
  });

  it('uses stable list ids per scope', () => {
    expect(wanikaniListId('passed')).toBe('wanikani-passed');
    expect(wanikaniListId('missing')).toBe('wanikani-passed');
  });
});
