import { ALL_CARD_TYPES } from '../data/conjugationTypes.js';

const TYPE_IDS = new Set(ALL_CARD_TYPES.map((type) => type.id));
const RECENT_LIMIT = 30;
const ANSWER_WEIGHT = 0.2;

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function addCounts(totals, typeId, correct, incorrect) {
  if (!TYPE_IDS.has(typeId)) return;
  const right = count(correct);
  const wrong = count(incorrect);
  if (!right && !wrong) return;
  const current = totals.get(typeId) || { correct: 0, incorrect: 0 };
  totals.set(typeId, {
    correct: current.correct + right,
    incorrect: current.incorrect + wrong,
  });
}

function canonicalCountsByType(cards = {}) {
  const totals = new Map();
  for (const [cardId, card] of Object.entries(cards || {})) {
    const typeId = cardId.slice(cardId.lastIndexOf('|') + 1);
    if (typeId !== 'dictionary') {
      addCounts(totals, typeId, card?.correct, card?.incorrect);
      continue;
    }
    const sourceStats = Object.entries(card?.sourceTypeStats || {});
    let assignedCorrect = 0;
    let assignedIncorrect = 0;
    for (const [sourceType, stats] of sourceStats) {
      assignedCorrect += count(stats?.correct);
      assignedIncorrect += count(stats?.incorrect);
      addCounts(totals, sourceType, stats?.correct, stats?.incorrect);
    }
    // Older dictionary cards attributed their entire history through sourceType.
    // Keep that unassigned remainder as a derived projection: persisting it as
    // new source counters would duplicate the baseline across concurrent tabs.
    addCounts(
      totals,
      card?.sourceType,
      Math.max(0, count(card?.correct) - assignedCorrect),
      Math.max(0, count(card?.incorrect) - assignedIncorrect),
    );
  }
  return totals;
}

function compareText(left, right) {
  return left === right ? 0 : left < right ? -1 : 1;
}

function recentAttempts(rows) {
  const seen = new Set();
  return rows
    .filter((attempt) => Number.isFinite(Number(attempt?.at)) && Number(attempt.at) > 0)
    .map((attempt) => ({
      id: String(attempt.id || ''),
      at: Number(attempt.at),
      correct: !!attempt.correct,
      responseMs: count(attempt.responseMs),
      wordKey: String(attempt.wordKey || ''),
    }))
    .sort(
      (a, b) =>
        b.at - a.at || compareText(b.id, a.id) || compareText(JSON.stringify(a), JSON.stringify(b)),
    )
    .filter((attempt) => {
      const key =
        attempt.id ||
        [attempt.at, attempt.correct ? 1 : 0, attempt.responseMs, attempt.wordKey].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, RECENT_LIMIT);
}

/**
 * Saved exact-form strength shared by the Practice meters and card selection.
 * Recent answers dominate without a separately persisted score. Each lane keeps
 * 30 outcomes, so their union contains the latest 30 outcomes for an exact form.
 * The lifetime prior preserves older evidence whose outcome order is unknown.
 * Replaying a bounded window remains directional when its oldest answer leaves.
 */
export function buildFormStrengthRows(state = {}, typeIds = undefined) {
  const selected = typeIds === undefined ? TYPE_IDS : new Set(typeIds);
  const canonical = canonicalCountsByType(state.cards);
  const laneTotals = new Map();
  const recentByType = new Map();
  for (const [key, lane] of Object.entries(state.weakness?.byLane || {})) {
    const typeId = String(lane?.typeId || key.split('|')[0]);
    if (!TYPE_IDS.has(typeId)) continue;
    const attempted = count(lane?.attempted);
    const correct = Math.min(count(lane?.correct), attempted);
    addCounts(laneTotals, typeId, correct, attempted - correct);
    const recent = Array.isArray(lane?.recent) ? lane.recent : [];
    recentByType.set(typeId, [...(recentByType.get(typeId) || []), ...recent]);
  }

  return ALL_CARD_TYPES.filter((type) => selected.has(type.id)).map((type) => {
    const totals = canonical.get(type.id) || laneTotals.get(type.id);
    const recent = recentAttempts(recentByType.get(type.id) || []);
    const correct = totals?.correct ?? recent.filter((attempt) => attempt.correct).length;
    const incorrect = totals?.incorrect ?? recent.filter((attempt) => !attempt.correct).length;
    const attempted = correct + incorrect;
    let score = ((correct + 2) / (attempted + 4)) * 100;
    for (const attempt of [...recent].reverse()) {
      score = score * (1 - ANSWER_WEIGHT) + (attempt.correct ? 100 : 0) * ANSWER_WEIGHT;
    }
    const latest = recent[0];
    return {
      typeId: type.id,
      label: type.label,
      sub: type.sub || '',
      score,
      attempted,
      correct,
      incorrect,
      statusLabel:
        attempted === 0
          ? 'New'
          : attempted === 1
            ? 'First attempt'
            : attempted === 2
              ? 'Early estimate'
              : 'Strength',
      latestAttempt: latest ? { id: latest.id, at: latest.at, correct: latest.correct } : null,
    };
  });
}
