import { describe, expect, it } from 'vitest';
import {
  defaultPracticeSelection,
  effectiveTypeIdsForPracticeSelection,
  practiceSelectionForTopic,
  toggleMixedPracticeSelection,
  togglePracticeTopicSelection,
  togglePracticeTypeSelection,
} from '../utils/practiceSelection.js';

describe('practice selection', () => {
  it('uses Mixed as a reversible override without discarding the custom mix', () => {
    const custom = practiceSelectionForTopic('volitional', defaultPracticeSelection());
    const mixed = toggleMixedPracticeSelection(custom);
    const restored = toggleMixedPracticeSelection(mixed);

    expect(mixed.mixed).toBe(true);
    expect(mixed.selectedTopicIds).toEqual(['volitional']);
    expect(restored).toEqual(custom);
  });

  it('starts a new single-topic selection when a topic is chosen from Mixed', () => {
    const selected = togglePracticeTopicSelection(defaultPracticeSelection(), 'wanting');

    expect(selected.mixed).toBe(false);
    expect(selected.selectedTopicIds).toEqual(['wanting']);
    expect(effectiveTypeIdsForPracticeSelection(selected)).toContain('desiderative');
    expect(effectiveTypeIdsForPracticeSelection(selected)).not.toContain('volitional');
  });

  it('keeps at least one exact form inside a selected topic', () => {
    let selected = practiceSelectionForTopic('volitional', defaultPracticeSelection());
    selected = togglePracticeTypeSelection(selected, 'polite-volitional');
    const unchanged = togglePracticeTypeSelection(selected, 'volitional');

    expect(effectiveTypeIdsForPracticeSelection(selected)).toEqual(['volitional']);
    expect(unchanged).toEqual(selected);
  });
});
