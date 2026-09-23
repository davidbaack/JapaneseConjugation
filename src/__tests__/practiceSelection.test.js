import { describe, expect, it } from 'vitest';
import { ALL_CARD_TYPES, EVERYDAY_TYPE_IDS } from '../data/conjugationTypes.js';
import { PRACTICE_CATEGORIES, practiceDimensionsForType } from '../data/practiceTaxonomy.js';
import {
  addPracticeTypeSelection,
  defaultPracticeSelection,
  effectiveTypeIdsForPracticeSelection,
  matchingPracticeTypeIdsForCategory,
  mergePracticeSelections,
  normalizePracticeSelection,
  practiceFilterConflictsForType,
  practiceSelectionForCategory,
  practiceSelectionForTopic,
  practiceSelectionForTypeIds,
  setPracticeFilterSelection,
  togglePracticeCategorySelection,
  togglePracticeTypeSelection,
} from '../utils/practiceSelection.js';

describe('practice selection', () => {
  it('partitions every exact form into one learner-facing category', () => {
    const categorized = PRACTICE_CATEGORIES.flatMap((category) => category.typeIds);

    expect(new Set(categorized).size).toBe(categorized.length);
    expect(new Set(categorized)).toEqual(new Set(ALL_CARD_TYPES.map((type) => type.id)));
  });

  it('gives every learner-facing category a structured ending preview', () => {
    for (const category of PRACTICE_CATEGORIES) {
      expect(category.previewParts.length).toBeGreaterThan(0);
      expect(
        category.previewParts.every((part) => part.pattern.trim() && part.meaning.trim()),
      ).toBe(true);
    }
  });

  it('starts fresh learners with Core forms and no cross-category filters', () => {
    const selection = defaultPracticeSelection();

    expect(selection.selectedCategoryIds).toEqual(['core-forms']);
    expect(selection.filters).toEqual({ time: 'all', polarity: 'all', style: 'all' });
    expect(effectiveTypeIdsForPracticeSelection(selection)).toEqual(
      PRACTICE_CATEGORIES.find((category) => category.id === 'core-forms').typeIds,
    );
  });

  it('adds and removes learner-facing categories without a Mixed override', () => {
    const initial = defaultPracticeSelection();
    const added = togglePracticeCategorySelection(initial, 'wants-intentions');
    const restored = togglePracticeCategorySelection(added, 'wants-intentions');

    expect(added.selectedCategoryIds).toEqual(['core-forms', 'wants-intentions']);
    expect(effectiveTypeIdsForPracticeSelection(added)).toContain('desiderative');
    expect(restored.selectedCategoryIds).toEqual(['core-forms']);
  });

  it('strictly intersects time, polarity, and style filters', () => {
    let selection = practiceSelectionForCategory('passive-causative');
    selection = setPracticeFilterSelection(selection, 'time', 'past');
    selection = setPracticeFilterSelection(selection, 'polarity', 'negative');
    selection = setPracticeFilterSelection(selection, 'style', 'polite');
    const enabled = effectiveTypeIdsForPracticeSelection(selection);

    expect(enabled).toContain('passive-polite-past-negative');
    expect(enabled).not.toContain('passive');
    expect(
      enabled.every((typeId) => {
        const dimensions = practiceDimensionsForType(typeId);
        return (
          dimensions.time === 'past' &&
          dimensions.polarity === 'negative' &&
          dimensions.style === 'polite'
        );
      }),
    ).toBe(true);
  });

  it('classifies plain volitional and positive polite commands for global filters', () => {
    expect(practiceDimensionsForType('volitional')).toMatchObject({ style: 'plain' });
    expect(practiceDimensionsForType('polite-volitional')).toMatchObject({ style: 'polite' });
    expect(practiceDimensionsForType('command-nasai')).toMatchObject({
      polarity: 'positive',
      style: 'polite',
    });
  });

  it('excludes neutral forms when a specific filter is active', () => {
    let selection = practiceSelectionForTypeIds(['te-form', 'plain-past']);
    selection = setPracticeFilterSelection(selection, 'time', 'past');

    expect(effectiveTypeIdsForPracticeSelection(selection)).toEqual(['plain-past']);
  });

  it('reports per-category matches under the current exact selection and filters', () => {
    const initial = defaultPracticeSelection();
    const past = setPracticeFilterSelection(initial, 'time', 'past');

    expect(matchingPracticeTypeIdsForCategory(initial, 'core-forms')).toHaveLength(8);
    expect(matchingPracticeTypeIdsForCategory(past, 'core-forms')).toHaveLength(4);
    expect(matchingPracticeTypeIdsForCategory(past, 'te-form')).toEqual([]);
  });

  it('adds one exact form from an off category without restoring its full saved mix', () => {
    const added = addPracticeTypeSelection(defaultPracticeSelection(), 'potential');

    expect(added.selectedCategoryIds).toEqual(['core-forms', 'ability-ongoing']);
    expect(added.selectedTypeIdsByCategory['ability-ongoing']).toEqual(['potential']);
    expect(effectiveTypeIdsForPracticeSelection(added)).toContain('potential');
    expect(effectiveTypeIdsForPracticeSelection(added)).not.toContain('progressive');
  });

  it('identifies filter conflicts and blocks hidden exact-form additions', () => {
    const past = setPracticeFilterSelection(defaultPracticeSelection(), 'time', 'past');
    const conflicts = practiceFilterConflictsForType('te-form', past.filters);

    expect(conflicts).toEqual([
      expect.objectContaining({ id: 'time', label: 'Time', valueLabel: 'Past' }),
    ]);
    expect(addPracticeTypeSelection(past, 'te-form')).toEqual(past);
  });

  it('refuses a filter or refinement that would leave zero forms', () => {
    const teForm = practiceSelectionForCategory('te-form');
    const blockedFilter = setPracticeFilterSelection(teForm, 'time', 'past');
    expect(blockedFilter.filters.time).toBe('all');

    const volitional = practiceSelectionForTopic('volitional');
    const oneForm = togglePracticeTypeSelection(volitional, 'polite-volitional');
    const blockedRemoval = togglePracticeTypeSelection(oneForm, 'volitional');
    expect(effectiveTypeIdsForPracticeSelection(oneForm)).toEqual(['volitional']);
    expect(blockedRemoval).toEqual(oneForm);
  });

  it('migrates the legacy Mixed pool without losing exact forms', () => {
    const migrated = normalizePracticeSelection({
      mixed: true,
      selectedTopicIds: ['volitional'],
      selectedTypeIdsByTopic: { volitional: ['volitional'] },
    });

    expect(new Set(effectiveTypeIdsForPracticeSelection(migrated))).toEqual(
      new Set(EVERYDAY_TYPE_IDS),
    );
    expect(migrated.filters).toEqual({ time: 'all', polarity: 'all', style: 'all' });
  });

  it('merges categories and relaxes conflicting cloud filters to All', () => {
    const left = setPracticeFilterSelection(
      practiceSelectionForCategory('wants-intentions'),
      'time',
      'past',
    );
    const right = setPracticeFilterSelection(
      practiceSelectionForCategory('ability-ongoing'),
      'style',
      'polite',
    );
    const merged = mergePracticeSelections(left, right);

    expect(merged.selectedCategoryIds).toEqual(['wants-intentions', 'ability-ongoing']);
    expect(merged.filters).toEqual({ time: 'all', polarity: 'all', style: 'all' });
    expect(effectiveTypeIdsForPracticeSelection(merged).length).toBeGreaterThan(0);
  });
});
