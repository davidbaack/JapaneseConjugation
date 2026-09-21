import { ALL_CARD_TYPES, EVERYDAY_TYPE_IDS, FORM_GROUPS } from '../data/conjugationTypes.js';
import {
  DEFAULT_PRACTICE_CATEGORY_ID,
  DEFAULT_PRACTICE_FILTERS,
  PRACTICE_CATEGORIES,
  PRACTICE_FILTERS,
  practiceCategoryForType,
  practiceDimensionsForType,
} from '../data/practiceTaxonomy.js';

const PRACTICE_SELECTION_VERSION = 2;
const TYPE_ID_SET = new Set(ALL_CARD_TYPES.map((type) => type.id));
const TOPIC_BY_ID = new Map(FORM_GROUPS.map((topic) => [topic.id, topic]));
const TOPIC_ID_BY_TYPE_ID = new Map(
  FORM_GROUPS.flatMap((topic) => topic.typeIds.map((typeId) => [typeId, topic.id])),
);
const CATEGORY_BY_ID = new Map(PRACTICE_CATEGORIES.map((category) => [category.id, category]));
const FILTER_VALUES_BY_ID = new Map(
  PRACTICE_FILTERS.map((filter) => [filter.id, new Set(filter.options.map((option) => option.id))]),
);

function uniqueValidTypeIds(typeIds = []) {
  return [...new Set(typeIds)].filter((typeId) => TYPE_ID_SET.has(typeId));
}

function defaultSelectedTypeIdsByCategory() {
  return Object.fromEntries(
    PRACTICE_CATEGORIES.map((category) => [category.id, [...category.typeIds]]),
  );
}

function normalizedFilters(filters = {}) {
  return Object.fromEntries(
    PRACTICE_FILTERS.map((filter) => {
      const requested = filters?.[filter.id];
      const value = FILTER_VALUES_BY_ID.get(filter.id)?.has(requested)
        ? requested
        : DEFAULT_PRACTICE_FILTERS[filter.id];
      return [filter.id, value];
    }),
  );
}

function baseTypeIdsForSelection(selection) {
  const selected = new Set(selection.selectedCategoryIds);
  return PRACTICE_CATEGORIES.flatMap((category) =>
    selected.has(category.id)
      ? selection.selectedTypeIdsByCategory[category.id] || category.typeIds
      : [],
  );
}

function typeMatchesFilters(typeId, filters) {
  const dimensions = practiceDimensionsForType(typeId);
  return PRACTICE_FILTERS.every((filter) => {
    const selected = filters[filter.id];
    return selected === 'all' || dimensions[filter.id] === selected;
  });
}

function filteredTypeIdsForSelection(selection) {
  return baseTypeIdsForSelection(selection).filter((typeId) =>
    typeMatchesFilters(typeId, selection.filters),
  );
}

function selectionForRequestedTypeIds(typeIds, selection = null) {
  const requested = uniqueValidTypeIds(typeIds);
  if (!requested.length) return normalizePracticeSelection(selection);
  const normalized = normalizePracticeSelection(selection);
  const requestedSet = new Set(requested);
  const selectedCategoryIds = PRACTICE_CATEGORIES.filter((category) =>
    category.typeIds.some((typeId) => requestedSet.has(typeId)),
  ).map((category) => category.id);
  const selectedTypeIdsByCategory = { ...normalized.selectedTypeIdsByCategory };
  for (const categoryId of selectedCategoryIds) {
    const category = CATEGORY_BY_ID.get(categoryId);
    selectedTypeIdsByCategory[categoryId] = category.typeIds.filter((typeId) =>
      requestedSet.has(typeId),
    );
  }
  return {
    version: PRACTICE_SELECTION_VERSION,
    selectedCategoryIds,
    selectedTypeIdsByCategory,
    filters: { ...DEFAULT_PRACTICE_FILTERS },
  };
}

function legacyTypeIdsForSelection(selection) {
  if (!selection || typeof selection !== 'object') return null;
  if (selection.mixed !== false) return [...EVERYDAY_TYPE_IDS];
  const selectedTopicIds = [...new Set(selection.selectedTopicIds || [])].filter((topicId) =>
    TOPIC_BY_ID.has(topicId),
  );
  if (!selectedTopicIds.length) return [...EVERYDAY_TYPE_IDS];
  const selected = new Set(selectedTopicIds);
  return FORM_GROUPS.flatMap((topic) => {
    if (!selected.has(topic.id)) return [];
    const requested = uniqueValidTypeIds(selection.selectedTypeIdsByTopic?.[topic.id] || []).filter(
      (typeId) => topic.typeIds.includes(typeId),
    );
    return requested.length ? requested : topic.typeIds;
  });
}

export function defaultPracticeSelection() {
  return {
    version: PRACTICE_SELECTION_VERSION,
    selectedCategoryIds: [DEFAULT_PRACTICE_CATEGORY_ID],
    selectedTypeIdsByCategory: defaultSelectedTypeIdsByCategory(),
    filters: { ...DEFAULT_PRACTICE_FILTERS },
  };
}

export function normalizePracticeSelection(selection) {
  const base = defaultPracticeSelection();
  if (!selection || typeof selection !== 'object') return base;
  const isCurrentSelection =
    selection.version === PRACTICE_SELECTION_VERSION ||
    Array.isArray(selection.selectedCategoryIds);
  if (!isCurrentSelection) {
    const legacyTypeIds = legacyTypeIdsForSelection(selection);
    return legacyTypeIds?.length ? selectionForRequestedTypeIds(legacyTypeIds, base) : base;
  }

  const selectedCategoryIds = [...new Set(selection.selectedCategoryIds || [])].filter(
    (categoryId) => CATEGORY_BY_ID.has(categoryId),
  );
  const resolvedCategoryIds = selectedCategoryIds.length
    ? selectedCategoryIds
    : [DEFAULT_PRACTICE_CATEGORY_ID];
  const selectedTypeIdsByCategory = Object.fromEntries(
    PRACTICE_CATEGORIES.map((category) => {
      const requested = uniqueValidTypeIds(
        selection.selectedTypeIdsByCategory?.[category.id] || [],
      ).filter((typeId) => category.typeIds.includes(typeId));
      return [category.id, requested.length ? requested : [...category.typeIds]];
    }),
  );
  const normalized = {
    version: PRACTICE_SELECTION_VERSION,
    selectedCategoryIds: PRACTICE_CATEGORIES.map((category) => category.id).filter((categoryId) =>
      resolvedCategoryIds.includes(categoryId),
    ),
    selectedTypeIdsByCategory,
    filters: normalizedFilters(selection.filters),
  };
  if (filteredTypeIdsForSelection(normalized).length) return normalized;
  return { ...normalized, filters: { ...DEFAULT_PRACTICE_FILTERS } };
}

export function effectiveTypeIdsForPracticeSelection(selection) {
  return filteredTypeIdsForSelection(normalizePracticeSelection(selection));
}

export function togglePracticeCategorySelection(selection, categoryId) {
  const category = CATEGORY_BY_ID.get(categoryId);
  if (!category) return normalizePracticeSelection(selection);
  const normalized = normalizePracticeSelection(selection);
  const selected = new Set(normalized.selectedCategoryIds);
  if (selected.has(categoryId)) {
    if (selected.size === 1) return normalized;
    selected.delete(categoryId);
  } else {
    selected.add(categoryId);
  }
  const next = {
    ...normalized,
    selectedCategoryIds: PRACTICE_CATEGORIES.map((item) => item.id).filter((id) =>
      selected.has(id),
    ),
  };
  return filteredTypeIdsForSelection(next).length ? next : normalized;
}

export function setPracticeFilterSelection(selection, filterId, value) {
  if (!FILTER_VALUES_BY_ID.get(filterId)?.has(value)) {
    return normalizePracticeSelection(selection);
  }
  const normalized = normalizePracticeSelection(selection);
  const next = {
    ...normalized,
    filters: { ...normalized.filters, [filterId]: value },
  };
  return filteredTypeIdsForSelection(next).length ? next : normalized;
}

export function togglePracticeTypeSelection(selection, typeId) {
  const category = practiceCategoryForType(typeId);
  if (!category) return normalizePracticeSelection(selection);
  const normalized = normalizePracticeSelection(selection);
  const current = new Set(normalized.selectedTypeIdsByCategory[category.id] || category.typeIds);
  if (current.has(typeId)) {
    if (current.size === 1) return normalized;
    current.delete(typeId);
  } else {
    current.add(typeId);
  }
  const selectedCategoryIds = normalized.selectedCategoryIds.includes(category.id)
    ? normalized.selectedCategoryIds
    : PRACTICE_CATEGORIES.map((item) => item.id).filter(
        (id) => normalized.selectedCategoryIds.includes(id) || id === category.id,
      );
  const next = {
    ...normalized,
    selectedCategoryIds,
    selectedTypeIdsByCategory: {
      ...normalized.selectedTypeIdsByCategory,
      [category.id]: category.typeIds.filter((id) => current.has(id)),
    },
  };
  return filteredTypeIdsForSelection(next).length ? next : normalized;
}

export function practiceSelectionForCategory(categoryId, selection = null) {
  const category = CATEGORY_BY_ID.get(categoryId);
  if (!category) return normalizePracticeSelection(selection);
  return selectionForRequestedTypeIds(category.typeIds, selection);
}

export function practiceSelectionForTopic(topicId, selection = null) {
  const topic = TOPIC_BY_ID.get(topicId);
  if (!topic) return normalizePracticeSelection(selection);
  return selectionForRequestedTypeIds(topic.typeIds, selection);
}

export function practiceSelectionForTypeIds(typeIds, selection = null) {
  return selectionForRequestedTypeIds(typeIds, selection);
}

export function updateStatePracticeSelection(state, nextSelection) {
  const practiceSelection = normalizePracticeSelection(nextSelection);
  return {
    ...state,
    practiceSelection,
    enabledTypes: effectiveTypeIdsForPracticeSelection(practiceSelection),
  };
}

export function mergePracticeSelections(local, cloud) {
  const left = normalizePracticeSelection(local);
  const right = normalizePracticeSelection(cloud);
  const selected = new Set([...left.selectedCategoryIds, ...right.selectedCategoryIds]);
  const merged = normalizePracticeSelection({
    version: PRACTICE_SELECTION_VERSION,
    selectedCategoryIds: PRACTICE_CATEGORIES.map((category) => category.id).filter((categoryId) =>
      selected.has(categoryId),
    ),
    selectedTypeIdsByCategory: Object.fromEntries(
      PRACTICE_CATEGORIES.map((category) => [
        category.id,
        category.typeIds.filter(
          (typeId) =>
            left.selectedTypeIdsByCategory[category.id]?.includes(typeId) ||
            right.selectedTypeIdsByCategory[category.id]?.includes(typeId),
        ),
      ]),
    ),
    filters: Object.fromEntries(
      PRACTICE_FILTERS.map((filter) => [
        filter.id,
        left.filters[filter.id] === right.filters[filter.id] ? left.filters[filter.id] : 'all',
      ]),
    ),
  });
  return effectiveTypeIdsForPracticeSelection(merged).length
    ? merged
    : { ...merged, filters: { ...DEFAULT_PRACTICE_FILTERS } };
}

export function topicForPracticeType(typeId) {
  return TOPIC_BY_ID.get(TOPIC_ID_BY_TYPE_ID.get(typeId)) || null;
}

export function selectedPracticeCategories(selection) {
  const normalized = normalizePracticeSelection(selection);
  const selected = new Set(normalized.selectedCategoryIds);
  return PRACTICE_CATEGORIES.filter((category) => selected.has(category.id));
}

export function selectedPracticeTopics(selection) {
  const selectedTypes = new Set(effectiveTypeIdsForPracticeSelection(selection));
  return FORM_GROUPS.filter((topic) => topic.typeIds.some((typeId) => selectedTypes.has(typeId)));
}
