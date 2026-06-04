import { ALL_CARD_TYPES, FORM_GROUPS } from '../data/conjugationTypes.js';
import { wordKey } from './conjugator.js';

const MAX_RECOMMENDATIONS = 8;

export function defaultReviewScope() {
  return {
    excludedWordKeys: [],
    excludedFormFamilyIds: [],
    recommendations: [],
  };
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizePracticeCopy(value = '') {
  return String(value || '')
    .replace(/\bReviews\b/g, 'Practice')
    .replace(/\breviews\b/g, 'practice')
    .replace(/\bReview\b/g, 'Practice')
    .replace(/\breview\b/g, 'practice')
    .replace(/\bSRS\b/g, 'Practice history');
}

export function normalizeReviewScope(scope = null) {
  const familyIds = new Set(FORM_GROUPS.map((group) => group.id));
  return {
    excludedWordKeys: uniqueStrings(scope?.excludedWordKeys),
    excludedFormFamilyIds: uniqueStrings(scope?.excludedFormFamilyIds).filter((id) =>
      familyIds.has(id),
    ),
    recommendations: (Array.isArray(scope?.recommendations) ? scope.recommendations : [])
      .filter((rec) => rec && rec.id && rec.label)
      .map((rec) => ({
        id: String(rec.id),
        source: String(rec.source || 'lab'),
        label: normalizePracticeCopy(rec.label),
        detail: normalizePracticeCopy(rec.detail),
        wordKeys: uniqueStrings(rec.wordKeys),
        typeIds: uniqueStrings(rec.typeIds).filter((id) =>
          ALL_CARD_TYPES.some((type) => type.id === id),
        ),
        suggestedCount: Math.max(0, Number(rec.suggestedCount) || 0),
        createdAt: Number(rec.createdAt) || Date.now(),
      }))
      .slice(0, MAX_RECOMMENDATIONS),
  };
}

export function formFamilyForType(typeId) {
  return FORM_GROUPS.find((group) => (group.typeIds || []).includes(typeId)) || null;
}

export function formFamilyTypeIds(familyId) {
  return FORM_GROUPS.find((group) => group.id === familyId)?.typeIds || [];
}

export function isWordExcludedFromReview(state = {}, word) {
  if (!word) return false;
  const scope = normalizeReviewScope(state.reviewScope);
  return scope.excludedWordKeys.includes(wordKey(word));
}

export function isFormFamilyExcludedFromReview(state = {}, familyId) {
  if (!familyId) return false;
  const scope = normalizeReviewScope(state.reviewScope);
  return scope.excludedFormFamilyIds.includes(familyId);
}

export function isTypeExcludedFromReview(state = {}, typeId) {
  const family = formFamilyForType(typeId);
  return !!family && isFormFamilyExcludedFromReview(state, family.id);
}

export function reviewTypeIdsForState(state = {}, enabledTypeIds = []) {
  const excludedFamilies = new Set(normalizeReviewScope(state.reviewScope).excludedFormFamilyIds);
  const excludedTypeIds = new Set(
    FORM_GROUPS.filter((group) => excludedFamilies.has(group.id)).flatMap(
      (group) => group.typeIds || [],
    ),
  );
  return (enabledTypeIds || state.enabledTypes || [])
    .filter((typeId) => ALL_CARD_TYPES.some((type) => type.id === typeId))
    .filter((typeId) => !excludedTypeIds.has(typeId));
}

function updateReviewScope(state = {}, updater) {
  return {
    ...state,
    reviewScope: normalizeReviewScope(updater(normalizeReviewScope(state.reviewScope))),
  };
}

export function excludeWordFromReviewState(state = {}, word) {
  if (!word) return state;
  const key = wordKey(word);
  return updateReviewScope(state, (scope) => ({
    ...scope,
    excludedWordKeys: uniqueStrings([...scope.excludedWordKeys, key]),
  }));
}

export function includeWordInReviewState(state = {}, word) {
  if (!word) return state;
  return includeWordKeyInReviewState(state, wordKey(word));
}

export function includeWordKeyInReviewState(state = {}, key) {
  if (!key) return state;
  return updateReviewScope(state, (scope) => ({
    ...scope,
    excludedWordKeys: scope.excludedWordKeys.filter((item) => item !== key),
  }));
}

export function excludeFormFamilyFromReviewState(state = {}, familyId) {
  if (!familyId) return state;
  return updateReviewScope(state, (scope) => ({
    ...scope,
    excludedFormFamilyIds: uniqueStrings([...scope.excludedFormFamilyIds, familyId]),
  }));
}

export function includeFormFamilyInReviewState(state = {}, familyId) {
  if (!familyId) return state;
  return updateReviewScope(state, (scope) => ({
    ...scope,
    excludedFormFamilyIds: scope.excludedFormFamilyIds.filter((item) => item !== familyId),
  }));
}

export function includeTypeFamilyInReviewState(state = {}, typeId) {
  const family = formFamilyForType(typeId);
  return family ? includeFormFamilyInReviewState(state, family.id) : state;
}

export function upsertReviewRecommendationState(state = {}, recommendation = {}) {
  const id = recommendation.id || `rec-${Date.now().toString(36)}`;
  return updateReviewScope(state, (scope) => ({
    ...scope,
    recommendations: [
      {
        ...recommendation,
        id,
        createdAt: recommendation.createdAt || Date.now(),
      },
      ...scope.recommendations.filter((rec) => rec.id !== id),
    ].slice(0, MAX_RECOMMENDATIONS),
  }));
}

export function removeReviewRecommendationState(state = {}, recommendationId) {
  if (!recommendationId) return state;
  return updateReviewScope(state, (scope) => ({
    ...scope,
    recommendations: scope.recommendations.filter((rec) => rec.id !== recommendationId),
  }));
}
