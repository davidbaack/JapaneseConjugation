import { DEFAULT_PREFS } from '../data/defaults.js';
import { RULES, enabledTypeIdsFor, practiceTypesForItem } from './conjugator.js';
import { minimalPairSetMatchesType, minimalPairSetMatchesWord } from './minimalPairs.js';

export function activeTypeIdsForCandidates(enabledTypeIds, minimalPairSet = null) {
  return minimalPairSet ? minimalPairSet.typeIds : enabledTypeIdsFor(enabledTypeIds);
}

function canUseWeakMapKey(value) {
  return !!value && (typeof value === 'object' || typeof value === 'function');
}

export function buildRuleCandidates(
  words = [],
  enabledTypeIds = [],
  prefs = DEFAULT_PREFS,
  options = {},
) {
  const minimalPairSet = options.minimalPairSet || null;
  const activeTypes = Array.isArray(options.activeTypes)
    ? options.activeTypes
    : activeTypeIdsForCandidates(enabledTypeIds, minimalPairSet);
  const activeTypeSet = new Set(activeTypes);
  const wordsByGroup = new Map();
  const typeIdsByWord = new WeakMap();
  for (const word of words || []) {
    const list = wordsByGroup.get(word?.group) || [];
    list.push(word);
    wordsByGroup.set(word?.group, list);
  }
  const entries = [];

  for (const rule of options.rules || RULES) {
    if (!activeTypeSet.has(rule.type)) continue;
    if (minimalPairSet && !minimalPairSetMatchesType(minimalPairSet, rule.type)) continue;
    const sourceWords = rule.group ? wordsByGroup.get(rule.group) || [] : words || [];
    const candidates = rule
      .verbFilter(sourceWords)
      .filter((item) => !minimalPairSet || minimalPairSetMatchesWord(minimalPairSet, item))
      .filter((item) => {
        if (!canUseWeakMapKey(item)) {
          return practiceTypesForItem(item, activeTypes, prefs).some(
            (type) => type.id === rule.type,
          );
        }
        let typeIds = typeIdsByWord.get(item);
        if (!typeIds) {
          typeIds = new Set(practiceTypesForItem(item, activeTypes, prefs).map((type) => type.id));
          typeIdsByWord.set(item, typeIds);
        }
        return typeIds.has(rule.type);
      });
    if (candidates.length) entries.push({ rule, candidates });
  }

  return entries;
}

export function ruleCandidateTypeSet(ruleCandidates = []) {
  return new Set(ruleCandidates.map(({ rule }) => rule.type));
}
