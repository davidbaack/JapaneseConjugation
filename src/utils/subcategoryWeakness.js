import {
  EVERYDAY_TYPE_IDS,
  FORM_GROUPS,
  getTypeInfo,
  normalizeFormGroupId,
} from '../data/conjugationTypes.js';
import { ONBIN_PATTERN_META, onbinPatternForVerb, wordKey } from './conjugator.js';
import { groupDisplayLabel } from './groupDisplay.js';
import { READINESS_DIMENSIONS, buildReadinessFamilyRows } from './readiness.js';

export const QUICK_WORKOUT_LIMIT = 12;
export const QUICK_PRACTICE_DEFAULT_TYPE_IDS = EVERYDAY_TYPE_IDS;

const MAX_RECENT_ATTEMPTS = 30;
export const RECENT_DECAY_MS = 14 * 86400000;
const TE_TA_TYPES = new Set(['te-form', 'plain-past']);
const MIN_SKILL_ATTEMPTS = 3;
const ONBIN_IDS = new Map([
  ['utsuru', { id: 'godan-onbin-utsuru', label: 'Godan u/tsu/ru sound changes' }],
  ['mnb', { id: 'godan-onbin-mnb', label: 'Godan mu/bu/nu sound changes' }],
  ['ku', { id: 'godan-onbin-ku', label: 'Godan ku sound changes' }],
  ['gu', { id: 'godan-onbin-gu', label: 'Godan gu sound changes' }],
  ['su', { id: 'godan-onbin-su', label: 'Godan su sound changes' }],
  ['iku', { id: 'iku-exception', label: 'iku exception' }],
]);

// Exponential half-life decay for per-card weakness signals. The lane scorer
// keeps its own linear decay; both cool over the same 14-day window.
export function recencyDecayFactor(at, now = Date.now(), halfLifeMs = RECENT_DECAY_MS) {
  return at > 0 ? Math.pow(0.5, Math.max(0, now - at) / halfLifeMs) : 1;
}

function cleanNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function compareText(left, right) {
  return left === right ? 0 : left > right ? 1 : -1;
}

function typeLabel(typeId) {
  return getTypeInfo(typeId).label || typeId;
}

function typeIdFromCardId(cardId) {
  const id = String(cardId || '');
  const marker = id.lastIndexOf('|');
  return marker >= 0 ? id.slice(marker + 1) : id;
}

function clampSkillScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function skillStatusFor(score, attempted) {
  if (attempted < MIN_SKILL_ATTEMPTS) {
    return { status: 'untested', label: attempted ? 'Gathering data' : 'Untested' };
  }
  if (score >= 85) return { status: 'strong', label: 'Strong' };
  if (score >= 60) return { status: 'developing', label: 'Developing' };
  return { status: 'weak', label: 'Needs practice' };
}

function cardHasIntroductionSignal(card = {}) {
  return Boolean(
    card?.introducedDate ||
    card?.createdAt ||
    cleanNumber(card?.lastSeen) > 0 ||
    cleanNumber(card?.reps) > 0 ||
    cleanNumber(card?.correct) > 0 ||
    cleanNumber(card?.incorrect) > 0,
  );
}

function cardTotalsForFamily(state = {}, family) {
  const typeIds = new Set(family.typeIds || []);
  let correct = 0;
  let incorrect = 0;
  let introduced = 0;
  for (const [cardId, card] of Object.entries(state.cards || {})) {
    const cardTypeId = typeIdFromCardId(cardId);
    if (cardTypeId === 'dictionary') {
      const sourceRows = Object.entries(card?.sourceTypeStats || {}).filter(([typeId]) =>
        typeIds.has(typeId),
      );
      if (sourceRows.length) {
        sourceRows.forEach(([, stats]) => {
          correct += cleanNumber(stats?.correct);
          incorrect += cleanNumber(stats?.incorrect);
        });
        introduced += sourceRows.length;
        continue;
      }
      if (!typeIds.has(card?.sourceType)) continue;
    } else if (!typeIds.has(cardTypeId)) {
      continue;
    }
    correct += cleanNumber(card?.correct);
    incorrect += cleanNumber(card?.incorrect);
    if (cardHasIntroductionSignal(card)) introduced += 1;
  }
  return { correct, incorrect, attempted: correct + incorrect, introduced };
}

function cardTotalsByType(state = {}) {
  const totals = new Map();
  function add(typeId, stats = {}) {
    if (!typeId) return;
    const current = totals.get(typeId) || { correct: 0, incorrect: 0, attempted: 0 };
    const correct = cleanNumber(stats.correct);
    const incorrect = cleanNumber(stats.incorrect);
    totals.set(typeId, {
      correct: current.correct + correct,
      incorrect: current.incorrect + incorrect,
      attempted: current.attempted + correct + incorrect,
    });
  }
  for (const [cardId, card] of Object.entries(state.cards || {})) {
    const cardTypeId = typeIdFromCardId(cardId);
    if (cardTypeId === 'dictionary') {
      const sourceRows = Object.entries(card?.sourceTypeStats || {});
      if (sourceRows.length) {
        sourceRows.forEach(([typeId, stats]) => add(typeId, stats));
        continue;
      }
      add(card?.sourceType, card);
    } else {
      add(cardTypeId, card);
    }
  }
  return totals;
}

function lanesByType(rows = []) {
  const byType = new Map();
  rows.forEach((row) => {
    const current = byType.get(row.typeId) || [];
    current.push(row);
    byType.set(row.typeId, current);
  });
  return byType;
}

function laneTotalsForFamily(rows = []) {
  const correct = rows.reduce((sum, row) => sum + cleanNumber(row.correct), 0);
  const incorrect = rows.reduce((sum, row) => sum + cleanNumber(row.incorrect), 0);
  const attempted = correct + incorrect;
  const totalResponseMs = rows.reduce((sum, row) => sum + cleanNumber(row.totalResponseMs), 0);
  const recent = rows
    .flatMap((row) => row.recent || [])
    .sort((a, b) => b.at - a.at)
    .slice(0, 12);
  return { correct, incorrect, attempted, totalResponseMs, recent };
}

function readinessSkillForFamily(row = {}) {
  const scoreByStatus = { strong: 92, developing: 68, weak: 35 };
  const measured = READINESS_DIMENSIONS.map((dimension) => row.cells?.[dimension.id]).filter(
    (cell) => cell && cell.status !== 'untested' && cell.attempted > 0,
  );
  const attempted = measured.reduce((sum, cell) => sum + cleanNumber(cell.attempted), 0);
  if (!attempted) return { readinessScore: null, readinessAttempted: 0 };
  const weighted = measured.reduce(
    (sum, cell) => sum + (scoreByStatus[cell.status] || 50) * cleanNumber(cell.attempted),
    0,
  );
  return {
    readinessScore: clampSkillScore(weighted / attempted),
    readinessAttempted: attempted,
  };
}

function readinessSkillForType(row = {}) {
  const scoreByStatus = { strong: 92, developing: 68, weak: 35 };
  const measured = READINESS_DIMENSIONS.map((dimension) => row.cells?.[dimension.id]).filter(
    (cell) => cell && cell.status !== 'untested' && cell.attempted > 0,
  );
  const attempted = measured.reduce((sum, cell) => sum + cleanNumber(cell.attempted), 0);
  const observedAttempted = measured.reduce(
    (highest, cell) => Math.max(highest, cleanNumber(cell.attempted)),
    0,
  );
  if (!attempted) {
    return { readinessScore: null, readinessAttempted: 0, observedAttempted: 0 };
  }
  const weighted = measured.reduce(
    (sum, cell) => sum + (scoreByStatus[cell.status] || 50) * cleanNumber(cell.attempted),
    0,
  );
  return {
    readinessScore: clampSkillScore(weighted / attempted),
    readinessAttempted: attempted,
    observedAttempted,
  };
}

function skillForFamily({
  correct,
  attempted,
  observedAttempted = null,
  laneAttempted,
  totalResponseMs,
  recent,
  readinessScore = null,
  readinessAttempted = 0,
}) {
  const hasReadiness = readinessAttempted > 0 && readinessScore !== null;
  const statusAttempted =
    observedAttempted === null
      ? Math.max(attempted, hasReadiness ? MIN_SKILL_ATTEMPTS : 0)
      : observedAttempted;
  if (statusAttempted < MIN_SKILL_ATTEMPTS) {
    const status = skillStatusFor(0, statusAttempted);
    return {
      accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
      skillScore: 0,
      skillStatus: status.status,
      skillLabel: status.label,
      avgResponseMs: laneAttempted ? Math.round(totalResponseMs / laneAttempted) : 0,
    };
  }
  const accuracy = attempted ? Math.round((correct / attempted) * 100) : readinessScore || 0;
  const recentAttempts = recent.length;
  const recentAccuracy = recentAttempts
    ? Math.round((recent.filter((attempt) => attempt.correct).length / recentAttempts) * 100)
    : accuracy;
  const avgResponseMs = laneAttempted ? Math.round(totalResponseMs / laneAttempted) : 0;
  const slowPenalty = avgResponseMs > 8000 ? Math.min(15, ((avgResponseMs - 8000) / 8000) * 10) : 0;
  const answerSkill =
    attempted >= MIN_SKILL_ATTEMPTS
      ? clampSkillScore(accuracy * 0.65 + recentAccuracy * 0.35 - slowPenalty)
      : null;
  const skillScore =
    answerSkill === null
      ? readinessScore
      : hasReadiness
        ? clampSkillScore(answerSkill * 0.75 + readinessScore * 0.25)
        : answerSkill;
  const status = skillStatusFor(skillScore, statusAttempted);
  return {
    accuracy,
    skillScore,
    skillStatus: status.status,
    skillLabel: status.label,
    avgResponseMs,
  };
}

function learnerStateForFamily({
  introduced = false,
  skillStatus = 'untested',
  weakRows = 0,
} = {}) {
  if (!introduced) return { id: 'not-introduced', label: 'Not introduced' };
  if (skillStatus === 'weak' || weakRows > 0) {
    return { id: 'needs-review', label: 'Needs review' };
  }
  if (skillStatus === 'strong') {
    return { id: 'reliable', label: 'Reliable' };
  }
  return { id: 'learning', label: 'Learning' };
}

function typeHistoryStatus(skill, observedAttempted) {
  if (observedAttempted <= 0) {
    return { id: 'not-practiced', label: 'Not practiced', countKey: 'notPracticed' };
  }
  if (observedAttempted < MIN_SKILL_ATTEMPTS) {
    return { id: 'gathering', label: 'Gathering data', countKey: 'learning' };
  }
  if (skill.skillScore >= 85) {
    return { id: 'strong', label: 'Strong', countKey: 'strong' };
  }
  if (skill.skillScore >= 60) {
    return { id: 'developing', label: 'Developing', countKey: 'learning' };
  }
  return { id: 'weak', label: 'Needs practice', countKey: 'needsPractice' };
}

function typeHistoryRowsForFamily(family, cardTotalsByTypeId, lanesByTypeId, readinessFamily) {
  const readinessByType = new Map((readinessFamily?.types || []).map((row) => [row.typeId, row]));
  return (family.typeIds || []).map((typeId) => {
    const lanes = lanesByTypeId.get(typeId) || [];
    const laneTotals = laneTotalsForFamily(lanes);
    const cardTotals = cardTotalsByTypeId.get(typeId) || {
      correct: 0,
      incorrect: 0,
      attempted: 0,
    };
    const totals = cardTotals.attempted ? cardTotals : laneTotals;
    const readiness = readinessSkillForType(readinessByType.get(typeId));
    const observedAttempted = Math.max(
      totals.attempted,
      laneTotals.attempted,
      readiness.observedAttempted,
    );
    const skill = skillForFamily({
      ...totals,
      observedAttempted,
      laneAttempted: laneTotals.attempted,
      totalResponseMs: laneTotals.totalResponseMs,
      recent: laneTotals.recent,
      readinessScore: readiness.readinessScore,
      readinessAttempted: readiness.readinessAttempted,
    });
    const status = typeHistoryStatus(skill, observedAttempted);
    const type = getTypeInfo(typeId);
    return {
      id: typeId,
      typeId,
      label: type.label || typeId,
      sub: type.sub || '',
      attempted: observedAttempted,
      correct: totals.correct,
      incorrect: totals.incorrect,
      accuracy: skill.accuracy,
      skillScore: skill.skillScore,
      avgResponseMs: skill.avgResponseMs,
      readinessAttempted: readiness.readinessAttempted,
      status: status.id,
      statusLabel: status.label,
      statusCountKey: status.countKey,
    };
  });
}

function statusCountsForTypeRows(typeRows) {
  return typeRows.reduce(
    (counts, row) => ({ ...counts, [row.statusCountKey]: counts[row.statusCountKey] + 1 }),
    { strong: 0, needsPractice: 0, learning: 0, notPracticed: 0 },
  );
}

export function deriveWeaknessSubcategory(word, typeId = '') {
  if (!word?.group) return null;
  if (word.group === 'godan' && TE_TA_TYPES.has(typeId)) {
    const pattern = onbinPatternForVerb(word);
    const patternId = Object.entries(ONBIN_PATTERN_META).find(([, meta]) => meta === pattern)?.[0];
    const onbin = ONBIN_IDS.get(patternId || '');
    if (onbin) return onbin;
  }
  return {
    id: word.group,
    label: groupDisplayLabel(word.group),
  };
}

export function weaknessLaneKey(typeId, subcategoryId) {
  return typeId && subcategoryId ? `${typeId}|${subcategoryId}` : '';
}

export function weaknessLaneForCard(word, typeId) {
  const subcategory = deriveWeaknessSubcategory(word, typeId);
  if (!subcategory || !typeId) return null;
  return {
    key: weaknessLaneKey(typeId, subcategory.id),
    typeId,
    typeLabel: typeLabel(typeId),
    subcategoryId: subcategory.id,
    subcategoryLabel: subcategory.label,
    label: `${typeLabel(typeId)} - ${subcategory.label}`,
  };
}

function normalizeRecentAttempt(attempt = {}) {
  const at = cleanNumber(attempt.at);
  if (!at) return null;
  return {
    correct: !!attempt.correct,
    at,
    responseMs: cleanNumber(attempt.responseMs),
    wordKey: String(attempt.wordKey || ''),
  };
}

function normalizeLane(row = {}, fallbackKey = '') {
  const attempted = cleanNumber(row.attempted);
  const correct = Math.min(cleanNumber(row.correct), attempted);
  const incorrect = Math.min(cleanNumber(row.incorrect), Math.max(0, attempted - correct));
  const typeId = String(row.typeId || fallbackKey.split('|')[0] || '');
  const subcategoryId = String(row.subcategoryId || fallbackKey.split('|')[1] || '');
  const recent = (Array.isArray(row.recent) ? row.recent : [])
    .map(normalizeRecentAttempt)
    .filter(Boolean)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_RECENT_ATTEMPTS);
  return {
    key: fallbackKey || weaknessLaneKey(typeId, subcategoryId),
    typeId,
    typeLabel: String(row.typeLabel || typeLabel(typeId)),
    subcategoryId,
    subcategoryLabel: String(row.subcategoryLabel || subcategoryId),
    attempted,
    correct,
    incorrect,
    totalResponseMs: cleanNumber(row.totalResponseMs),
    lastAt: cleanNumber(row.lastAt),
    recent,
  };
}

export function defaultWeaknessState() {
  return { byLane: {} };
}

export function normalizeWeaknessState(weakness = null) {
  const byLane = {};
  for (const [key, row] of Object.entries(weakness?.byLane || {})) {
    const normalized = normalizeLane(row, key);
    if (normalized.key && normalized.attempted > 0) byLane[normalized.key] = normalized;
  }
  return { byLane };
}

export function recordWeaknessAttempt(weakness, details = {}) {
  const lane = weaknessLaneForCard(details.word, details.typeId);
  if (!lane) return normalizeWeaknessState(weakness);
  const normalized = normalizeWeaknessState(weakness);
  const current = normalizeLane(normalized.byLane[lane.key], lane.key);
  const now = details.now || Date.now();
  const responseMs = cleanNumber(details.responseMs);
  const correct = !!details.correct;
  const attempt = {
    correct,
    at: now,
    responseMs,
    wordKey: details.word ? wordKey(details.word) : '',
  };
  return {
    byLane: {
      ...normalized.byLane,
      [lane.key]: {
        ...current,
        ...lane,
        attempted: current.attempted + 1,
        correct: current.correct + (correct ? 1 : 0),
        incorrect: current.incorrect + (correct ? 0 : 1),
        totalResponseMs: current.totalResponseMs + responseMs,
        lastAt: now,
        recent: [attempt, ...current.recent].slice(0, MAX_RECENT_ATTEMPTS),
      },
    },
  };
}

export function mergeWeaknessState(local, cloud) {
  const left = normalizeWeaknessState(local);
  const right = normalizeWeaknessState(cloud);
  const byLane = { ...left.byLane };
  for (const [key, row] of Object.entries(right.byLane)) {
    const a = normalizeLane(byLane[key], key);
    const b = normalizeLane(row, key);
    const tied = a.attempted === b.attempted && (a.lastAt || 0) === (b.lastAt || 0);
    const preferred =
      b.attempted > a.attempted ||
      (b.attempted === a.attempted && (b.lastAt || 0) > (a.lastAt || 0))
        ? b
        : tied && JSON.stringify(b) > JSON.stringify(a)
          ? b
          : a;
    const recentKeys = new Set();
    const recent = [...a.recent, ...b.recent]
      .sort((x, y) => y.at - x.at || compareText(JSON.stringify(x), JSON.stringify(y)))
      .filter((attempt) => {
        const signature = [
          attempt.at,
          attempt.correct ? 1 : 0,
          attempt.responseMs || 0,
          attempt.wordKey || '',
        ].join('|');
        if (recentKeys.has(signature)) return false;
        recentKeys.add(signature);
        return true;
      })
      .slice(0, MAX_RECENT_ATTEMPTS);
    byLane[key] = {
      ...preferred,
      typeId: preferred.typeId || a.typeId || b.typeId,
      typeLabel: preferred.typeLabel || a.typeLabel || b.typeLabel,
      subcategoryId: preferred.subcategoryId || a.subcategoryId || b.subcategoryId,
      subcategoryLabel: preferred.subcategoryLabel || a.subcategoryLabel || b.subcategoryLabel,
      lastAt: Math.max(a.lastAt || 0, b.lastAt || 0),
      recent,
    };
  }
  return { byLane };
}

export function weaknessLaneScore(weakness, typeId, subcategoryId, options = {}) {
  const lane = normalizeWeaknessState(weakness).byLane[weaknessLaneKey(typeId, subcategoryId)];
  if (!lane?.attempted) return 0;
  if (!lane.incorrect) return 0;
  const now = options.now || Date.now();
  const recentScore = lane.recent.reduce((sum, attempt) => {
    const age = Math.max(0, now - attempt.at);
    const decay = Math.max(0.2, 1 - age / RECENT_DECAY_MS);
    return sum + (attempt.correct ? 0 : 3.5) * decay;
  }, 0);
  const missRate = lane.attempted ? lane.incorrect / lane.attempted : 0;
  const avgMs = lane.attempted ? lane.totalResponseMs / lane.attempted : 0;
  const slowBonus = avgMs > 8000 ? Math.min(2, (avgMs - 8000) / 8000) : 0;
  return recentScore + lane.incorrect * 0.75 + missRate * 4 + slowBonus;
}

export function weaknessScoreForCard(weakness, word, typeId, options = {}) {
  const lane = weaknessLaneForCard(word, typeId);
  if (!lane) return 0;
  return weaknessLaneScore(weakness, lane.typeId, lane.subcategoryId, options);
}

export function rankedWeaknessLanes(weakness, options = {}) {
  const normalized = normalizeWeaknessState(weakness);
  return Object.values(normalized.byLane)
    .map((lane) => ({
      ...lane,
      accuracy: lane.attempted ? Math.round((lane.correct / lane.attempted) * 100) : 0,
      score: weaknessLaneScore(normalized, lane.typeId, lane.subcategoryId, options),
    }))
    .filter((lane) => lane.score > 0)
    .sort((a, b) => b.score - a.score || b.lastAt - a.lastAt);
}

export function buildWeaknessFamilyRows(state = {}, families = FORM_GROUPS) {
  const normalized = normalizeWeaknessState(state.weakness);
  const allLanes = Object.values(normalized.byLane);
  const cardTotalsByTypeId = cardTotalsByType(state);
  const lanesByTypeId = lanesByType(allLanes);
  const rankedLanes = rankedWeaknessLanes(normalized);
  const readinessByFamily = new Map(
    buildReadinessFamilyRows(state, families).map((row) => [row.id, row]),
  );
  return families.map((family) => {
    const typeIds = new Set(family.typeIds || []);
    const familyLanes = allLanes.filter((lane) => typeIds.has(lane.typeId));
    const laneTotals = laneTotalsForFamily(familyLanes);
    const cardTotals = cardTotalsForFamily(state, family);
    const totals = cardTotals.attempted ? cardTotals : laneTotals;
    const readiness = readinessSkillForFamily(readinessByFamily.get(family.id));
    const typeRows = typeHistoryRowsForFamily(
      family,
      cardTotalsByTypeId,
      lanesByTypeId,
      readinessByFamily.get(family.id),
    );
    const skill = skillForFamily({
      ...totals,
      laneAttempted: laneTotals.attempted,
      totalResponseMs: laneTotals.totalResponseMs,
      recent: laneTotals.recent,
      ...readiness,
    });
    const rows = rankedLanes
      .filter((lane) => typeIds.has(lane.typeId))
      .map((lane) => ({
        ...lane,
        status:
          lane.attempted >= 3 && lane.accuracy >= 85
            ? 'strong'
            : lane.accuracy >= 60
              ? 'developing'
              : 'weak',
      }));
    const introduced =
      cardTotals.introduced > 0 || laneTotals.attempted > 0 || readiness.readinessAttempted > 0;
    const learnerState = learnerStateForFamily({
      introduced,
      skillStatus: skill.skillStatus,
      weakRows: rows.length,
    });
    const displayLearnerState =
      learnerState.id === 'not-introduced'
        ? { ...learnerState, label: 'Not introduced' }
        : learnerState;
    const displaySkillLabel = introduced ? skill.skillLabel : 'Not introduced';
    return {
      id: family.id,
      label: family.label,
      introduced,
      learnerState: displayLearnerState,
      attempted: totals.attempted,
      correct: totals.correct,
      incorrect: totals.incorrect,
      accuracy: skill.accuracy,
      avgResponseMs: skill.avgResponseMs,
      readinessAttempted: readiness.readinessAttempted,
      skillScore: skill.skillScore,
      skillStatus: skill.skillStatus,
      skillLabel: displaySkillLabel,
      rows,
      top: rows[0] || null,
      typeRows,
      statusCounts: statusCountsForTypeRows(typeRows),
    };
  });
}

export function activeWorkoutTypeIdsForFamilies(enabledTypes = [], familyId = '') {
  const selected = uniqueStrings(enabledTypes);
  const family = FORM_GROUPS.find((group) => group.id === normalizeFormGroupId(familyId));
  if (!family) return selected;
  const familyTypeIds = new Set(family.typeIds || []);
  return selected.filter((typeId) => familyTypeIds.has(typeId));
}
