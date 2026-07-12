import { describe, expect, it } from 'vitest';
import { EVERYDAY_TYPE_IDS, FORM_GROUPS } from '../data/conjugationTypes.js';
import {
  enabledTypeIdsForPracticeScope,
  mergePracticeScopes,
  normalizePracticeScope,
  practiceScopeFamilyState,
  practiceScopeFromEnabledTypes,
  practiceScopeOptionSelected,
  reducePracticeScope,
} from '../utils/practiceScope.js';

const conditionalFamily = FORM_GROUPS.find((family) => family.id === 'conditional');

function toggle(scope, action) {
  return reducePracticeScope(scope, action);
}

describe('practice scope', () => {
  it('enables only category forms that match the current global filters', () => {
    const withoutConditionals = EVERYDAY_TYPE_IDS.filter(
      (typeId) => !conditionalFamily.typeIds.includes(typeId),
    );
    let scope = practiceScopeFromEnabledTypes(withoutConditionals);
    scope = toggle(scope, { type: 'toggle-filter', optionId: 'negative' });
    scope = toggle(scope, { type: 'toggle-family', familyId: 'conditional' });

    const enabled = enabledTypeIdsForPracticeScope(scope);
    expect(enabled).toContain('conditional-tara');
    expect(enabled).toContain('conditional-ba');
    expect(enabled).toContain('conditional-nara');
    expect(enabled).not.toContain('negative-conditional-tara');
    expect(enabled).not.toContain('negative-conditional-ba');
    expect(practiceScopeOptionSelected(scope, 'negative')).toBe(false);
  });

  it('remembers exact form choices when a category is turned off and back on', () => {
    let scope = practiceScopeFromEnabledTypes(EVERYDAY_TYPE_IDS);
    scope = toggle(scope, { type: 'toggle-form', typeId: 'conditional-ba' });
    scope = toggle(scope, { type: 'toggle-family', familyId: 'conditional' });
    scope = toggle(scope, { type: 'toggle-family', familyId: 'conditional' });

    const enabled = enabledTypeIdsForPracticeScope(scope);
    expect(enabled).toContain('conditional-tara');
    expect(enabled).not.toContain('conditional-ba');
  });

  it('restores filtered forms without restoring a manually excluded form', () => {
    let scope = practiceScopeFromEnabledTypes(EVERYDAY_TYPE_IDS);
    scope = toggle(scope, { type: 'toggle-form', typeId: 'conditional-ba' });
    scope = toggle(scope, { type: 'toggle-filter', optionId: 'negative' });

    expect(enabledTypeIdsForPracticeScope(scope)).not.toContain('negative-conditional-ba');

    scope = toggle(scope, { type: 'toggle-filter', optionId: 'negative' });
    const restored = enabledTypeIdsForPracticeScope(scope);
    expect(restored).toContain('negative-conditional-tara');
    expect(restored).toContain('negative-conditional-ba');
    expect(restored).not.toContain('conditional-ba');
  });

  it('reports no matches instead of changing filters to enable a category', () => {
    let scope = practiceScopeFromEnabledTypes(EVERYDAY_TYPE_IDS);
    scope = toggle(scope, { type: 'toggle-family', familyId: 'conditional' });
    scope = toggle(scope, { type: 'toggle-filter', optionId: 'plain' });

    const before = enabledTypeIdsForPracticeScope(scope);
    expect(practiceScopeFamilyState(scope, conditionalFamily).status).toBe('no-matches');

    const afterToggle = toggle(scope, { type: 'toggle-family', familyId: 'conditional' });
    expect(enabledTypeIdsForPracticeScope(afterToggle)).toEqual(before);
    expect(afterToggle.activeFamilyIds).not.toContain('conditional');
    expect(practiceScopeOptionSelected(afterToggle, 'plain')).toBe(false);
  });

  it('keeps active category intent while filters temporarily exclude every form', () => {
    let scope = practiceScopeFromEnabledTypes(EVERYDAY_TYPE_IDS);
    const originalCount = practiceScopeFamilyState(scope, conditionalFamily).enabledTypeIds.length;
    scope = toggle(scope, { type: 'toggle-filter', optionId: 'plain' });

    expect(practiceScopeFamilyState(scope, conditionalFamily).status).toBe('filtered-out');
    expect(scope.activeFamilyIds).toContain('conditional');

    scope = toggle(scope, { type: 'toggle-filter', optionId: 'plain' });
    expect(practiceScopeFamilyState(scope, conditionalFamily).enabledTypeIds).toHaveLength(
      originalCount,
    );
  });

  it('blocks a filter change that would empty the entire practice deck', () => {
    const scope = normalizePracticeScope(
      {
        filters: {
          register: ['plain', 'polite'],
          polarity: ['affirmative', 'negative'],
          time: ['past', 'non-past'],
        },
        activeFamilyIds: ['conditional'],
        selectedTypeIdsByFamily: { conditional: [...conditionalFamily.typeIds] },
      },
      ['conditional-ba'],
    );

    const next = toggle(scope, { type: 'toggle-filter', optionId: 'plain' });
    expect(practiceScopeOptionSelected(next, 'plain')).toBe(true);
    expect(enabledTypeIdsForPracticeScope(next)).toHaveLength(5);
  });

  it('normalizes legacy enabledTypes without changing the active deck', () => {
    const legacyEnabled = ['plain-past', 'te-form', 'plain-negative'];
    const scope = practiceScopeFromEnabledTypes(legacyEnabled);
    expect(new Set(enabledTypeIdsForPracticeScope(scope))).toEqual(new Set(legacyEnabled));
  });

  it('merges device scopes inclusively', () => {
    const local = practiceScopeFromEnabledTypes(['plain-past']);
    const cloud = practiceScopeFromEnabledTypes(['polite-negative']);
    const merged = mergePracticeScopes(local, cloud, ['plain-past'], ['polite-negative']);

    expect(practiceScopeOptionSelected(merged, 'plain')).toBe(true);
    expect(practiceScopeOptionSelected(merged, 'polite')).toBe(true);
    expect(practiceScopeOptionSelected(merged, 'affirmative')).toBe(true);
    expect(practiceScopeOptionSelected(merged, 'negative')).toBe(true);
    expect(enabledTypeIdsForPracticeScope(merged)).toEqual(
      expect.arrayContaining(['plain-past', 'polite-negative']),
    );
  });
});
