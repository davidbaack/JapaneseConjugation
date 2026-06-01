import { describe, expect, it } from 'vitest';
import { WORD_GROUP_OPTIONS } from '../data/starterWords.js';
import {
  GROUP_DECODER_ROWS,
  GROUP_SENTENCE_LABELS,
  VERB_GROUP_IDS,
  groupAliasText,
  groupDisplayLabel,
  groupRecognitionClue,
  groupTrapText,
} from '../utils/groupDisplay.js';

describe('group display metadata', () => {
  it('uses teachable primary labels for verb groups', () => {
    expect(groupDisplayLabel('ichidan')).toBe('ichidan: drop る');
    expect(groupDisplayLabel('godan')).toBe('godan: row-shift');
    expect(groupDisplayLabel('suru')).toBe('irregular: する');
    expect(groupDisplayLabel('kuru')).toBe('irregular: 来る');
  });

  it('keeps older textbook names as secondary aliases', () => {
    expect(groupAliasText('ichidan')).toBe('also called る-verb / Group 2');
    expect(groupAliasText('godan')).toBe('also called う-verb / Group 1');
    expect(GROUP_SENTENCE_LABELS.ichidan).toContain('ichidan: drop る');
    expect(GROUP_SENTENCE_LABELS.ichidan).toContain('also called る-verb / Group 2');
  });

  it('feeds settings word-group options from the same labels', () => {
    for (const id of VERB_GROUP_IDS) {
      expect(WORD_GROUP_OPTIONS.find((option) => option.id === id)?.label).toBe(
        groupDisplayLabel(id),
      );
    }
  });

  it('offers the compact group decoder model', () => {
    expect(GROUP_DECODER_ROWS.map((row) => row.decoder)).toEqual([
      'remove final る, attach ending.',
      'final kana moves rows, then ending attaches.',
      'memorize the core pattern.',
    ]);
  });

  it('calls out る-ending godan traps', () => {
    const kaeru = { dict: '帰る', reading: 'かえる', meaning: 'to return', group: 'godan' };
    const hashiru = { dict: '走る', reading: 'はしる', meaning: 'to run', group: 'godan' };

    expect(groupRecognitionClue(kaeru)).toContain('still godan');
    expect(groupTrapText(kaeru)).toContain('帰る and 走る');
    expect(groupTrapText(hashiru)).toContain('る-ending godan traps');
  });
});
