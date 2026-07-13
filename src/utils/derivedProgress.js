import { normalizeReadinessState } from './readiness.js';
import { normalizeWeaknessState, weaknessLaneForCard } from './subcategoryWeakness.js';

const DICTIONARY_TYPE_ID = 'dictionary';
const MAX_RECENT_ATTEMPTS = 30;

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number))
    : 0;
}

function parseCardId(cardId) {
  const id = String(cardId || '');
  const typeMarker = id.lastIndexOf('|');
  if (typeMarker <= 0 || typeMarker === id.length - 1) return null;
  const wordId = id.slice(0, typeMarker);
  const firstColon = wordId.indexOf(':');
  const secondColon = wordId.indexOf(':', firstColon + 1);
  const lastColon = wordId.lastIndexOf(':');
  if (firstColon <= 0 || secondColon <= firstColon || lastColon <= secondColon) return null;
  const word = {
    group: wordId.slice(firstColon + 1, secondColon),
    dict: wordId.slice(secondColon + 1, lastColon),
    reading: wordId.slice(lastColon + 1),
  };
  if (!word.group || !word.dict || !word.reading) return null;
  return { wordId, word, typeId: id.slice(typeMarker + 1) };
}

function addTotals(map, key, correct, incorrect, extra = {}) {
  const right = count(correct);
  const wrong = count(incorrect);
  if (!key || (!right && !wrong)) return;
  const current = map.get(key) || { correct: 0, incorrect: 0, ...extra };
  map.set(key, {
    ...current,
    ...extra,
    correct: current.correct + right,
    incorrect: current.incorrect + wrong,
    attempted: current.correct + current.incorrect + right + wrong,
  });
}

function buildCanonicalProgress(cards = {}) {
  const byRule = new Map();
  const byLane = new Map();

  function addWordType(parsed, typeId, correct, incorrect) {
    const lane = weaknessLaneForCard(parsed.word, typeId);
    addTotals(byRule, `${parsed.wordId}|${typeId}`, correct, incorrect);
    if (lane) addTotals(byLane, lane.key, correct, incorrect, { lane });
  }

  for (const [cardId, card] of Object.entries(cards || {})) {
    const parsed = parseCardId(cardId);
    if (!parsed) continue;
    if (parsed.typeId !== DICTIONARY_TYPE_ID) {
      addWordType(parsed, parsed.typeId, card?.correct, card?.incorrect);
    }
    if (parsed.typeId === DICTIONARY_TYPE_ID) {
      for (const [sourceTypeId, stats] of Object.entries(card?.sourceTypeStats || {})) {
        addWordType(parsed, sourceTypeId, stats?.correct, stats?.incorrect);
      }
    }
  }

  return { byRule, byLane };
}

function dedupeRecent(recent = [], limit = MAX_RECENT_ATTEMPTS) {
  const seen = new Set();
  return [...recent]
    .sort((a, b) => (b?.at || 0) - (a?.at || 0))
    .filter((attempt) => {
      const signature = [
        attempt?.at || 0,
        attempt?.correct ? 1 : 0,
        attempt?.responseMs || 0,
        attempt?.wordKey || '',
      ].join('|');
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .slice(0, Math.max(0, limit));
}

function scaledTotal(total, fromAttempts, toAttempts) {
  if (!fromAttempts || !toAttempts) return 0;
  return count((Number(total) / fromAttempts) * toAttempts);
}

function allocate(total, weights, capacities = weights.map(() => total)) {
  const target = count(total);
  if (!weights.length) return [];
  const normalizedWeights = weights.map(count);
  if (!normalizedWeights.some(Boolean)) {
    for (let i = 0; i < normalizedWeights.length; i += 1) normalizedWeights[i] = 1;
  }
  const allocations = weights.map(() => 0);
  let remaining = target;
  while (remaining > 0) {
    const available = allocations
      .map((value, index) => ({ index, room: count(capacities[index]) - value }))
      .filter((entry) => entry.room > 0);
    if (!available.length) break;
    const weightTotal = available.reduce((sum, entry) => sum + normalizedWeights[entry.index], 0);
    let assigned = 0;
    for (const entry of available) {
      const weight = weightTotal ? normalizedWeights[entry.index] : 1;
      const share = Math.max(
        1,
        Math.floor((remaining * weight) / (weightTotal || available.length)),
      );
      const next = Math.min(entry.room, share, remaining - assigned);
      allocations[entry.index] += next;
      assigned += next;
      if (assigned >= remaining) break;
    }
    if (!assigned) break;
    remaining -= assigned;
  }
  return allocations;
}

function rescaleMetric(metric, attempted, correct) {
  const nextAttempted = count(attempted);
  const nextCorrect = Math.min(count(correct), nextAttempted);
  const attemptedRatio = metric.attempted ? nextAttempted / metric.attempted : 0;
  const correctRatio = metric.correct ? nextCorrect / metric.correct : 0;
  return {
    ...metric,
    attempted: nextAttempted,
    correct: nextCorrect,
    totalResponseMs: count(metric.totalResponseMs * attemptedRatio),
    correctResponseMs: count(metric.correctResponseMs * correctRatio),
    fastCorrect: Math.min(nextCorrect, count(metric.fastCorrect * correctRatio)),
  };
}

function reconcileWeakness(weakness, canonicalByLane) {
  const normalized = normalizeWeaknessState(weakness);
  const byLane = {};
  for (const [key, row] of Object.entries(normalized.byLane)) {
    const canonical = canonicalByLane.get(key);
    if (!canonical?.attempted) {
      if (row.attempted > Number.MAX_SAFE_INTEGER) continue;
      byLane[key] = { ...row, recent: dedupeRecent(row.recent) };
      continue;
    }
    const recent = dedupeRecent(row.recent, Math.min(MAX_RECENT_ATTEMPTS, canonical.attempted));
    if (row.attempted > canonical.attempted) {
      byLane[key] = {
        ...row,
        attempted: canonical.attempted,
        correct: canonical.correct,
        incorrect: canonical.incorrect,
        totalResponseMs: scaledTotal(row.totalResponseMs, row.attempted, canonical.attempted),
        recent,
      };
    } else {
      byLane[key] = { ...row, recent };
    }
  }
  return { byLane };
}

function reconcileReadiness(readiness, canonicalByRule) {
  const normalized = normalizeReadinessState(readiness);
  const byRule = {};
  for (const [ruleId, rule] of Object.entries(normalized.byRule)) {
    const canonical = canonicalByRule.get(ruleId);
    if (!canonical?.attempted) {
      const corrupted = Object.values(rule).some(
        (metric) => metric?.attempted > Number.MAX_SAFE_INTEGER,
      );
      if (!corrupted) byRule[ruleId] = rule;
      continue;
    }
    const nextRule = { ...rule };
    const dimensionIds = ['recognition', 'production'].filter((id) => rule[id]?.attempted);
    const dimensionAttempted = dimensionIds.reduce((sum, id) => sum + rule[id].attempted, 0);
    if (dimensionAttempted > canonical.attempted) {
      const attempts = allocate(
        canonical.attempted,
        dimensionIds.map((id) => rule[id].attempted),
      );
      const correct = allocate(
        canonical.correct,
        dimensionIds.map((id) => rule[id].correct),
        attempts,
      );
      dimensionIds.forEach((id, index) => {
        nextRule[id] = rescaleMetric(rule[id], attempts[index], correct[index]);
      });
    }
    if (rule.speed?.attempted > canonical.attempted) {
      nextRule.speed = rescaleMetric(rule.speed, canonical.attempted, canonical.correct);
    }
    byRule[ruleId] = nextRule;
  }
  return { byRule };
}

export function reconcileDerivedProgressState(state = {}) {
  const canonical = buildCanonicalProgress(state.cards);
  const weakness = reconcileWeakness(state.weakness, canonical.byLane);
  const readiness = reconcileReadiness(state.readiness, canonical.byRule);
  const repaired =
    JSON.stringify(weakness) !== JSON.stringify(normalizeWeaknessState(state.weakness)) ||
    JSON.stringify(readiness) !== JSON.stringify(normalizeReadinessState(state.readiness));
  return {
    state: { ...state, weakness, readiness },
    repaired,
  };
}
