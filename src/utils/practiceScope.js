import { ALL_CARD_TYPES, FORM_GROUPS } from '../data/conjugationTypes.js';

const CARD_TYPE_BY_ID = new Map(ALL_CARD_TYPES.map((type) => [type.id, type]));
const FAMILY_BY_ID = new Map(FORM_GROUPS.map((family) => [family.id, family]));
const FAMILY_ID_BY_TYPE_ID = new Map(
  FORM_GROUPS.flatMap((family) => family.typeIds.map((typeId) => [typeId, family.id])),
);

function isPolitePracticeType(type) {
  return (
    String(type?.id || '').includes('polite') ||
    /\bPolite\b/.test(type?.label || '') ||
    type?.id === 'request-kudasai' ||
    type?.id === 'negative-request'
  );
}

function isNegativePracticeType(type) {
  return (
    String(type?.id || '').includes('negative') ||
    /\bNegative\b/.test(type?.label || '') ||
    type?.id === 'prohibition'
  );
}

function isPastPracticeType(type) {
  return String(type?.id || '').includes('past') || /\bPast\b/.test(type?.label || '');
}

const POLITE_TYPE_IDS = ALL_CARD_TYPES.filter(isPolitePracticeType).map((type) => type.id);
const PLAIN_TYPE_IDS = ALL_CARD_TYPES.filter((type) => !isPolitePracticeType(type)).map(
  (type) => type.id,
);
const NEGATIVE_TYPE_IDS = ALL_CARD_TYPES.filter(isNegativePracticeType).map((type) => type.id);
const AFFIRMATIVE_TYPE_IDS = ALL_CARD_TYPES.filter((type) => !isNegativePracticeType(type)).map(
  (type) => type.id,
);
const PAST_TYPE_IDS = ALL_CARD_TYPES.filter(isPastPracticeType).map((type) => type.id);
const NON_PAST_TYPE_IDS = ALL_CARD_TYPES.filter((type) => !isPastPracticeType(type)).map(
  (type) => type.id,
);

export const PRACTICE_FORM_FILTER_GROUPS = [
  {
    id: 'register',
    label: 'Register',
    options: [
      { id: 'plain', label: 'Plain', typeIds: PLAIN_TYPE_IDS },
      { id: 'polite', label: 'Polite', typeIds: POLITE_TYPE_IDS },
    ],
  },
  {
    id: 'polarity',
    label: 'Polarity',
    options: [
      { id: 'affirmative', label: 'Affirmative', typeIds: AFFIRMATIVE_TYPE_IDS },
      { id: 'negative', label: 'Negative', typeIds: NEGATIVE_TYPE_IDS },
    ],
  },
  {
    id: 'time',
    label: 'Time',
    options: [
      { id: 'past', label: 'Past', typeIds: PAST_TYPE_IDS },
      { id: 'non-past', label: 'Non-past', typeIds: NON_PAST_TYPE_IDS },
    ],
  },
];

const FILTER_OPTION_BY_ID = new Map(
  PRACTICE_FORM_FILTER_GROUPS.flatMap((group) =>
    group.options.map((option) => [option.id, { ...option, groupId: group.id }]),
  ),
);

function validTypeIds(typeIds = []) {
  return [...new Set(typeIds)].filter((typeId) => CARD_TYPE_BY_ID.has(typeId));
}

function normalizedFilters(filters = null) {
  return Object.fromEntries(
    PRACTICE_FORM_FILTER_GROUPS.map((group) => {
      const valid = new Set(group.options.map((option) => option.id));
      const selected = Array.isArray(filters?.[group.id])
        ? [...new Set(filters[group.id])].filter((optionId) => valid.has(optionId))
        : [];
      return [group.id, selected.length ? selected : group.options.map((option) => option.id)];
    }),
  );
}

export function practiceTypeMatchesFilterOption(type, optionId) {
  switch (optionId) {
    case 'plain':
      return !isPolitePracticeType(type);
    case 'polite':
      return isPolitePracticeType(type);
    case 'affirmative':
      return !isNegativePracticeType(type);
    case 'negative':
      return isNegativePracticeType(type);
    case 'past':
      return isPastPracticeType(type);
    case 'non-past':
      return !isPastPracticeType(type);
    default:
      return false;
  }
}

export function practiceTypeMatchesScopeFilters(type, scope) {
  const filters = normalizedFilters(scope?.filters);
  return PRACTICE_FORM_FILTER_GROUPS.every((group) =>
    filters[group.id].some((optionId) => practiceTypeMatchesFilterOption(type, optionId)),
  );
}

function filtersFromEnabledTypes(enabledTypeIds = []) {
  const enabled = new Set(validTypeIds(enabledTypeIds));
  return Object.fromEntries(
    PRACTICE_FORM_FILTER_GROUPS.map((group) => {
      const selected = group.options
        .filter((option) => option.typeIds.some((typeId) => enabled.has(typeId)))
        .map((option) => option.id);
      return [group.id, selected.length ? selected : group.options.map((option) => option.id)];
    }),
  );
}

export function practiceScopeFromEnabledTypes(enabledTypeIds = []) {
  const currentTypeIds = validTypeIds(enabledTypeIds);
  const enabled = new Set(currentTypeIds);
  const filters = filtersFromEnabledTypes(currentTypeIds);
  const activeFamilyIds = FORM_GROUPS.filter((family) =>
    family.typeIds.some((typeId) => enabled.has(typeId)),
  ).map((family) => family.id);
  const filterScope = { filters };
  const selectedTypeIdsByFamily = Object.fromEntries(
    FORM_GROUPS.map((family) => {
      const familyIsActive = activeFamilyIds.includes(family.id);
      const selected = familyIsActive
        ? family.typeIds.filter((typeId) => {
            const type = CARD_TYPE_BY_ID.get(typeId);
            return (
              enabled.has(typeId) || (type && !practiceTypeMatchesScopeFilters(type, filterScope))
            );
          })
        : [...family.typeIds];
      return [family.id, selected];
    }),
  );

  return { filters, activeFamilyIds, selectedTypeIdsByFamily };
}

function normalizeExistingScope(scope) {
  const filters = normalizedFilters(scope?.filters);
  const activeFamilyIds = [...new Set(scope?.activeFamilyIds || [])].filter((familyId) =>
    FAMILY_BY_ID.has(familyId),
  );
  const selectedTypeIdsByFamily = Object.fromEntries(
    FORM_GROUPS.map((family) => {
      const saved = scope?.selectedTypeIdsByFamily?.[family.id];
      const allowed = new Set(family.typeIds);
      const selected = Array.isArray(saved)
        ? [...new Set(saved)].filter((typeId) => allowed.has(typeId))
        : [...family.typeIds];
      return [family.id, selected.length ? selected : [...family.typeIds]];
    }),
  );
  return { filters, activeFamilyIds, selectedTypeIdsByFamily };
}

export function enabledTypeIdsForPracticeScope(scope) {
  if (!scope) return [];
  const normalized = normalizeExistingScope(scope);
  const active = new Set(normalized.activeFamilyIds);
  return FORM_GROUPS.flatMap((family) => {
    if (!active.has(family.id)) return [];
    const selected = new Set(normalized.selectedTypeIdsByFamily[family.id]);
    return family.typeIds.filter((typeId) => {
      const type = CARD_TYPE_BY_ID.get(typeId);
      return selected.has(typeId) && type && practiceTypeMatchesScopeFilters(type, normalized);
    });
  });
}

export function normalizePracticeScope(scope, fallbackEnabledTypeIds = []) {
  if (!scope || typeof scope !== 'object') {
    return practiceScopeFromEnabledTypes(fallbackEnabledTypeIds);
  }
  const normalized = normalizeExistingScope(scope);
  return enabledTypeIdsForPracticeScope(normalized).length
    ? normalized
    : practiceScopeFromEnabledTypes(fallbackEnabledTypeIds);
}

export function practiceScopeOptionSelected(scope, optionId) {
  const option = FILTER_OPTION_BY_ID.get(optionId);
  if (!option) return false;
  const filters = normalizedFilters(scope?.filters);
  return filters[option.groupId].includes(optionId);
}

export function practiceScopeFilterSummary(scope) {
  const filters = normalizedFilters(scope?.filters);
  return PRACTICE_FORM_FILTER_GROUPS.map((group) => {
    const selected = group.options.filter((option) => filters[group.id].includes(option.id));
    if (selected.length === group.options.length) {
      return selected.map((option) => option.label).join(' + ');
    }
    return `${selected.map((option) => option.label).join(' + ')} only`;
  }).join(' · ');
}

export function practiceScopeFamilyState(scope, familyOrId) {
  const family = typeof familyOrId === 'string' ? FAMILY_BY_ID.get(familyOrId) : familyOrId;
  if (!family) return null;
  const normalized = normalizeExistingScope(scope);
  const active = normalized.activeFamilyIds.includes(family.id);
  const selectedTypeIds = normalized.selectedTypeIdsByFamily[family.id] || [];
  const selected = new Set(selectedTypeIds);
  const matchingTypeIds = family.typeIds.filter((typeId) => {
    const type = CARD_TYPE_BY_ID.get(typeId);
    return selected.has(typeId) && type && practiceTypeMatchesScopeFilters(type, normalized);
  });
  const enabledTypeIds = active ? matchingTypeIds : [];
  return {
    family,
    active,
    selectedTypeIds,
    matchingTypeIds,
    enabledTypeIds,
    canActivate: matchingTypeIds.length > 0,
    status:
      active && matchingTypeIds.length === 0
        ? 'filtered-out'
        : active && enabledTypeIds.length < family.typeIds.length
          ? 'partial'
          : active
            ? 'on'
            : matchingTypeIds.length === 0
              ? 'no-matches'
              : 'off',
  };
}

function finishScopeUpdate(current, next) {
  return enabledTypeIdsForPracticeScope(next).length ? next : current;
}

export function reducePracticeScope(scope, action = {}) {
  const current = normalizeExistingScope(scope);
  if (action.type === 'toggle-filter') {
    const option = FILTER_OPTION_BY_ID.get(action.optionId);
    if (!option) return current;
    const selected = new Set(current.filters[option.groupId]);
    if (selected.has(option.id)) {
      if (selected.size <= 1) return current;
      selected.delete(option.id);
    } else {
      selected.add(option.id);
    }
    return finishScopeUpdate(current, {
      ...current,
      filters: { ...current.filters, [option.groupId]: [...selected] },
    });
  }

  if (action.type === 'toggle-family') {
    const family = FAMILY_BY_ID.get(action.familyId);
    if (!family) return current;
    const active = new Set(current.activeFamilyIds);
    if (active.has(family.id)) active.delete(family.id);
    else {
      const familyState = practiceScopeFamilyState(current, family);
      if (!familyState?.canActivate) return current;
      active.add(family.id);
    }
    return finishScopeUpdate(current, { ...current, activeFamilyIds: [...active] });
  }

  if (action.type === 'toggle-form') {
    const familyId = FAMILY_ID_BY_TYPE_ID.get(action.typeId);
    const family = FAMILY_BY_ID.get(familyId);
    if (!family) return current;
    const selected = new Set(current.selectedTypeIdsByFamily[familyId] || family.typeIds);
    const active = new Set(current.activeFamilyIds);
    if (selected.has(action.typeId)) {
      if (selected.size <= 1) return current;
      selected.delete(action.typeId);
    } else {
      selected.add(action.typeId);
      const type = CARD_TYPE_BY_ID.get(action.typeId);
      if (type && practiceTypeMatchesScopeFilters(type, current)) active.add(familyId);
    }
    return finishScopeUpdate(current, {
      ...current,
      activeFamilyIds: [...active],
      selectedTypeIdsByFamily: {
        ...current.selectedTypeIdsByFamily,
        [familyId]: family.typeIds.filter((typeId) => selected.has(typeId)),
      },
    });
  }

  if (action.type === 'enable-family') {
    const family = FAMILY_BY_ID.get(action.familyId);
    if (!family) return current;
    const hasExplicitTypes = Array.isArray(action.typeIds);
    const requested = hasExplicitTypes
      ? action.typeIds.filter((typeId) => family.typeIds.includes(typeId))
      : [];
    const selected = new Set(
      hasExplicitTypes ? [] : current.selectedTypeIdsByFamily[family.id] || [],
    );
    requested.forEach((typeId) => selected.add(typeId));
    const next = {
      ...current,
      activeFamilyIds: [...new Set([...current.activeFamilyIds, family.id])],
      selectedTypeIdsByFamily: {
        ...current.selectedTypeIdsByFamily,
        [family.id]: family.typeIds.filter((typeId) => selected.has(typeId)),
      },
    };
    return finishScopeUpdate(current, next);
  }

  return current;
}

export function updateStatePracticeScope(state, action) {
  const currentScope = normalizePracticeScope(state?.practiceScope, state?.enabledTypes || []);
  const nextScope = reducePracticeScope(currentScope, action);
  const enabledTypes = enabledTypeIdsForPracticeScope(nextScope);
  return { ...state, practiceScope: nextScope, enabledTypes };
}

export function mergePracticeScopes(localScope, cloudScope, localEnabled = [], cloudEnabled = []) {
  const local = normalizePracticeScope(localScope, localEnabled);
  const cloud = normalizePracticeScope(cloudScope, cloudEnabled);
  const merged = {
    filters: Object.fromEntries(
      PRACTICE_FORM_FILTER_GROUPS.map((group) => [
        group.id,
        group.options
          .map((option) => option.id)
          .filter(
            (optionId) =>
              local.filters[group.id].includes(optionId) ||
              cloud.filters[group.id].includes(optionId),
          ),
      ]),
    ),
    activeFamilyIds: FORM_GROUPS.map((family) => family.id).filter(
      (familyId) =>
        local.activeFamilyIds.includes(familyId) || cloud.activeFamilyIds.includes(familyId),
    ),
    selectedTypeIdsByFamily: Object.fromEntries(
      FORM_GROUPS.map((family) => [
        family.id,
        family.typeIds.filter(
          (typeId) =>
            local.selectedTypeIdsByFamily[family.id].includes(typeId) ||
            cloud.selectedTypeIdsByFamily[family.id].includes(typeId),
        ),
      ]),
    ),
  };
  return normalizePracticeScope(merged, [...localEnabled, ...cloudEnabled]);
}
