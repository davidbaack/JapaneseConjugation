import { getTypeInfo, FORM_GROUPS } from '../data/conjugationTypes.js';
import { RULES, enabledTypeIdsFor } from './conjugator.js';

export const FAST_RESPONSE_MS = 8000;

export const READINESS_DIMENSIONS = [
  {
    id: 'recognition',
    label: 'Recognition',
    hint: 'Choose or identify the form without typing it from scratch.',
  },
  {
    id: 'production',
    label: 'Production',
    hint: 'Produce the requested conjugation from the prompt.',
  },
  {
    id: 'speed',
    label: 'Speed',
    hint: 'Answer accurately before the form needs deliberate reconstruction.',
  },
];

const DIMENSION_IDS = new Set(READINESS_DIMENSIONS.map((dimension) => dimension.id));
const STATUS_WEIGHT = { weak: 0, developing: 1, untested: 2, strong: 3 };

function cleanNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
}

function pct(correct, attempted) {
  return attempted ? Math.round((correct / attempted) * 100) : 0;
}

function normalizeMetric(metric = {}) {
  const attempted = cleanNumber(metric.attempted);
  const correct = Math.min(cleanNumber(metric.correct), attempted);
  const totalResponseMs = cleanNumber(metric.totalResponseMs);
  const correctResponseMs = cleanNumber(metric.correctResponseMs);
  const fastCorrect = Math.min(cleanNumber(metric.fastCorrect), correct);
  const fastestMs = cleanNumber(metric.fastestMs);
  return {
    attempted,
    correct,
    totalResponseMs,
    correctResponseMs,
    fastCorrect,
    fastestMs: fastestMs || null,
    lastMs: cleanNumber(metric.lastMs) || null,
    lastAt: cleanNumber(metric.lastAt) || null,
  };
}

function hasAttempts(metric) {
  return cleanNumber(metric?.attempted) > 0;
}

function metricWithAttempt(metric, correct, responseMs, now) {
  const base = normalizeMetric(metric);
  const ms = cleanNumber(responseMs);
  return {
    ...base,
    attempted: base.attempted + 1,
    correct: base.correct + (correct ? 1 : 0),
    totalResponseMs: base.totalResponseMs + ms,
    correctResponseMs: base.correctResponseMs + (correct ? ms : 0),
    lastMs: ms || null,
    lastAt: now,
  };
}

function speedWithAttempt(metric, correct, responseMs, now) {
  const base = normalizeMetric(metric);
  const ms = cleanNumber(responseMs);
  const fastestMs =
    correct && ms ? Math.min(base.fastestMs || Number.POSITIVE_INFINITY, ms) : base.fastestMs;
  return {
    ...base,
    attempted: base.attempted + 1,
    correct: base.correct + (correct ? 1 : 0),
    totalResponseMs: base.totalResponseMs + ms,
    correctResponseMs: base.correctResponseMs + (correct ? ms : 0),
    fastCorrect: base.fastCorrect + (correct && ms > 0 && ms <= FAST_RESPONSE_MS ? 1 : 0),
    fastestMs: Number.isFinite(fastestMs) ? fastestMs : null,
    lastMs: ms || null,
    lastAt: now,
  };
}

function mergeMetric(left, right) {
  const a = normalizeMetric(left);
  const b = normalizeMetric(right);
  const lastFromRight = (b.lastAt || 0) > (a.lastAt || 0);
  const fastest = [a.fastestMs, b.fastestMs].filter(Boolean);
  return {
    attempted: a.attempted + b.attempted,
    correct: a.correct + b.correct,
    totalResponseMs: a.totalResponseMs + b.totalResponseMs,
    correctResponseMs: a.correctResponseMs + b.correctResponseMs,
    fastCorrect: a.fastCorrect + b.fastCorrect,
    fastestMs: fastest.length ? Math.min(...fastest) : null,
    lastMs: lastFromRight ? b.lastMs : a.lastMs,
    lastAt: Math.max(a.lastAt || 0, b.lastAt || 0) || null,
  };
}

export function defaultReadinessState() {
  return { byRule: {} };
}

export function normalizeReadinessState(readiness) {
  const byRule = {};
  const source = readiness?.byRule || {};
  for (const [ruleId, ruleMetrics] of Object.entries(source)) {
    const nextRule = {};
    for (const id of DIMENSION_IDS) {
      const metric = normalizeMetric(ruleMetrics?.[id]);
      if (hasAttempts(metric)) nextRule[id] = metric;
    }
    if (Object.keys(nextRule).length) byRule[ruleId] = nextRule;
  }
  return { byRule };
}

export function readinessDimensionForAttempt({ answerMode = 'input', reverseDrill = false } = {}) {
  if (reverseDrill || answerMode === 'choice' || answerMode === 'self-check') {
    return 'recognition';
  }
  return 'production';
}

export function recordReadinessAttempt(readiness, ruleId, details = {}) {
  if (!ruleId) return normalizeReadinessState(readiness);
  const normalized = normalizeReadinessState(readiness);
  const now = details.now || Date.now();
  const responseMs = cleanNumber(details.responseMs);
  const dimension = readinessDimensionForAttempt(details);
  const ruleMetrics = normalized.byRule[ruleId] || {};
  return {
    byRule: {
      ...normalized.byRule,
      [ruleId]: {
        ...ruleMetrics,
        [dimension]: metricWithAttempt(ruleMetrics[dimension], !!details.correct, responseMs, now),
        speed: speedWithAttempt(ruleMetrics.speed, !!details.correct, responseMs, now),
      },
    },
  };
}

export function mergeReadinessState(local, cloud) {
  const left = normalizeReadinessState(local);
  const right = normalizeReadinessState(cloud);
  const byRule = { ...left.byRule };
  for (const [ruleId, ruleMetrics] of Object.entries(right.byRule)) {
    const mergedRule = { ...(byRule[ruleId] || {}) };
    for (const id of DIMENSION_IDS) {
      mergedRule[id] = mergeMetric(mergedRule[id], ruleMetrics[id]);
      if (!hasAttempts(mergedRule[id])) delete mergedRule[id];
    }
    if (Object.keys(mergedRule).length) byRule[ruleId] = mergedRule;
  }
  return { byRule };
}

function statusForAccuracy(metric, legacy = false) {
  const attempted = cleanNumber(metric?.attempted);
  const correct = cleanNumber(metric?.correct);
  if (!attempted) {
    return {
      status: 'untested',
      label: 'Untested',
      detail: 'No reps yet',
      score: 0,
      attempted: 0,
      correct: 0,
      accuracy: 0,
      legacy,
    };
  }
  const accuracy = pct(correct, attempted);
  const status =
    attempted >= 3 && accuracy >= 85 ? 'strong' : accuracy >= 60 ? 'developing' : 'weak';
  return {
    status,
    label: status === 'strong' ? 'Strong' : status === 'developing' ? 'Developing' : 'Weak',
    detail: `${correct}/${attempted}`,
    score: accuracy,
    attempted,
    correct,
    accuracy,
    legacy,
  };
}

function statusForSpeed(metric) {
  const attempted = cleanNumber(metric?.attempted);
  const correct = cleanNumber(metric?.correct);
  if (!attempted || !cleanNumber(metric?.totalResponseMs)) {
    return {
      status: 'untested',
      label: 'Untested',
      detail: 'No timed reps',
      score: 0,
      attempted: 0,
      correct: 0,
      accuracy: 0,
      avgMs: 0,
    };
  }
  const avgMs = Math.round(metric.totalResponseMs / attempted);
  const accuracy = pct(correct, attempted);
  const status =
    attempted >= 3 && accuracy >= 80 && avgMs <= FAST_RESPONSE_MS
      ? 'strong'
      : accuracy >= 60 && avgMs <= FAST_RESPONSE_MS * 2
        ? 'developing'
        : 'weak';
  const avgSeconds = avgMs >= 10000 ? Math.round(avgMs / 1000) : (avgMs / 1000).toFixed(1);
  return {
    status,
    label: status === 'strong' ? 'Strong' : status === 'developing' ? 'Developing' : 'Weak',
    detail: `${avgSeconds}s avg`,
    score: accuracy,
    attempted,
    correct,
    accuracy,
    avgMs,
    fastCorrect: cleanNumber(metric.fastCorrect),
  };
}

function legacyMetricFromCard(card) {
  if (!card) return null;
  const correct = cleanNumber(card.correct);
  const incorrect = cleanNumber(card.incorrect);
  const attempted = correct + incorrect;
  return attempted ? { attempted, correct } : null;
}

export function buildReadinessMap(state, words = []) {
  const enabled = new Set(enabledTypeIdsFor(state?.enabledTypes || []));
  const readiness = normalizeReadinessState(state?.readiness);
  const cards = state?.cards || {};
  const rows = [];

  for (const rule of RULES) {
    if (!enabled.has(rule.type)) continue;
    const candidates = rule.verbFilter(words);
    if (!candidates.length) continue;
    const type = getTypeInfo(rule.type);
    const metrics = readiness.byRule[rule.id] || {};
    const usedLegacyProduction = !hasAttempts(metrics.production);
    const productionMetric = usedLegacyProduction
      ? legacyMetricFromCard(cards[rule.id])
      : metrics.production;
    const cells = {
      recognition: statusForAccuracy(metrics.recognition),
      production: statusForAccuracy(productionMetric, usedLegacyProduction && !!productionMetric),
      speed: statusForSpeed(metrics.speed),
    };
    const weakestWeight = Math.min(
      ...Object.values(cells).map((cell) => STATUS_WEIGHT[cell.status]),
    );
    const practiced = Object.values(cells).reduce((sum, cell) => sum + cell.attempted, 0);
    rows.push({
      ruleId: rule.id,
      typeId: rule.type,
      family: type.label,
      group: rule.label,
      skill: `${type.label} ${rule.label}`,
      hint: type.hint,
      wordCount: candidates.length,
      cells,
      weakestWeight,
      practiced,
    });
  }

  return rows.sort((a, b) => {
    if (a.weakestWeight !== b.weakestWeight) return a.weakestWeight - b.weakestWeight;
    if (a.practiced !== b.practiced) return b.practiced - a.practiced;
    return a.skill.localeCompare(b.skill);
  });
}

export function buildConjugationSpeedRows(state, words = []) {
  const enabled = new Set(enabledTypeIdsFor(state?.enabledTypes || []));
  const readiness = normalizeReadinessState(state?.readiness);
  const byType = new Map();

  for (const rule of RULES) {
    if (!enabled.has(rule.type)) continue;
    const candidates = rule.verbFilter(words);
    if (!candidates.length) continue;

    const metric = normalizeMetric(readiness.byRule[rule.id]?.speed);
    if (!hasAttempts(metric) || !cleanNumber(metric.totalResponseMs)) continue;

    const type = getTypeInfo(rule.type);
    const current = byType.get(rule.type) || {
      typeId: rule.type,
      label: type.label,
      hint: type.hint,
      attempted: 0,
      correct: 0,
      totalResponseMs: 0,
      correctResponseMs: 0,
      fastCorrect: 0,
      fastestMs: null,
      lastMs: null,
      lastAt: null,
      ruleCount: 0,
      wordCount: 0,
    };
    const fastest = [current.fastestMs, metric.fastestMs].filter(Boolean);
    const lastFromMetric = (metric.lastAt || 0) > (current.lastAt || 0);
    byType.set(rule.type, {
      ...current,
      attempted: current.attempted + metric.attempted,
      correct: current.correct + metric.correct,
      totalResponseMs: current.totalResponseMs + metric.totalResponseMs,
      correctResponseMs: current.correctResponseMs + metric.correctResponseMs,
      fastCorrect: current.fastCorrect + metric.fastCorrect,
      fastestMs: fastest.length ? Math.min(...fastest) : null,
      lastMs: lastFromMetric ? metric.lastMs : current.lastMs,
      lastAt: Math.max(current.lastAt || 0, metric.lastAt || 0) || null,
      ruleCount: current.ruleCount + 1,
      wordCount: current.wordCount + candidates.length,
    });
  }

  return [...byType.values()]
    .map((row) => ({
      ...row,
      avgMs: Math.round(row.totalResponseMs / row.attempted),
      correctAvgMs: row.correct ? Math.round(row.correctResponseMs / row.correct) : 0,
      accuracy: pct(row.correct, row.attempted),
      fastPct: row.correct ? pct(row.fastCorrect, row.correct) : 0,
    }))
    .sort((a, b) => {
      if (a.avgMs !== b.avgMs) return b.avgMs - a.avgMs;
      if (a.attempted !== b.attempted) return b.attempted - a.attempted;
      return a.label.localeCompare(b.label);
    });
}

// Readiness is stored per word-form card id (`kind:group:dict:reading|type`),
// so the type id is the segment after the final pipe.
function typeIdFromReadinessKey(ruleKey) {
  const id = String(ruleKey || '');
  const marker = id.lastIndexOf('|');
  return marker >= 0 ? id.slice(marker + 1) : id;
}

function readinessCellsFromMetrics(metrics) {
  return {
    recognition: statusForAccuracy(metrics.recognition),
    production: statusForAccuracy(metrics.production),
    speed: statusForSpeed(metrics.speed),
  };
}

// The weakest dimension that actually has reps (untested cells are not "weak").
function weakestMeasuredDimension(cells) {
  let weakest = null;
  for (const dimension of READINESS_DIMENSIONS) {
    const cell = cells[dimension.id];
    if (!cell || cell.status === 'untested') continue;
    if (!weakest || STATUS_WEIGHT[cell.status] < STATUS_WEIGHT[weakest.cell.status]) {
      weakest = { id: dimension.id, label: dimension.label, cell };
    }
  }
  return weakest;
}

// Rolls recorded readiness up to the learner-facing form families. Aggregates
// the raw per-card metrics (recognition / production / speed) across every form
// in a family, then derives a status per dimension, the per-type breakdown, and
// the family's weakest measured dimension. Reads state.readiness directly
// because that data is keyed per word-form, not per rule.
export function buildReadinessFamilyRows(state, families = FORM_GROUPS) {
  const readiness = normalizeReadinessState(state?.readiness);
  const byRule = readiness.byRule;

  return families.map((family) => {
    const typeIds = new Set(family.typeIds || []);
    const familyMetrics = { recognition: {}, production: {}, speed: {} };
    const byType = new Map();
    for (const [ruleKey, ruleMetrics] of Object.entries(byRule)) {
      const typeId = typeIdFromReadinessKey(ruleKey);
      if (!typeIds.has(typeId)) continue;
      const typeMetrics = byType.get(typeId) || { recognition: {}, production: {}, speed: {} };
      for (const dimension of READINESS_DIMENSIONS) {
        familyMetrics[dimension.id] = mergeMetric(
          familyMetrics[dimension.id],
          ruleMetrics[dimension.id],
        );
        typeMetrics[dimension.id] = mergeMetric(
          typeMetrics[dimension.id],
          ruleMetrics[dimension.id],
        );
      }
      byType.set(typeId, typeMetrics);
    }

    const cells = readinessCellsFromMetrics(familyMetrics);
    const measured = READINESS_DIMENSIONS.filter((d) => cells[d.id].status !== 'untested').map(
      (d) => d.id,
    );
    const practiced = READINESS_DIMENSIONS.reduce((sum, d) => sum + cells[d.id].attempted, 0);
    const types = [...byType.entries()]
      .map(([typeId, metrics]) => {
        const typeCells = readinessCellsFromMetrics(metrics);
        return {
          typeId,
          label: getTypeInfo(typeId).label,
          cells: typeCells,
          measured: READINESS_DIMENSIONS.filter((d) => typeCells[d.id].status !== 'untested').map(
            (d) => d.id,
          ),
          practiced: READINESS_DIMENSIONS.reduce((sum, d) => sum + typeCells[d.id].attempted, 0),
        };
      })
      .filter((row) => row.practiced > 0)
      .sort((a, b) => b.practiced - a.practiced || a.label.localeCompare(b.label));

    return {
      id: family.id,
      label: family.label,
      typeIds: family.typeIds,
      cells,
      measured,
      practiced,
      types,
      weakest: weakestMeasuredDimension(cells),
    };
  });
}

// The single weakest form family + dimension worth drilling, for a one-line
// dashboard nudge. Only surfaces dimensions with reps that are weak/developing.
export function weakestReadinessSkill(state, families = FORM_GROUPS) {
  const actionable = buildReadinessFamilyRows(state, families).filter(
    (row) => row.weakest && ['weak', 'developing'].includes(row.weakest.cell.status),
  );
  if (!actionable.length) return null;
  actionable.sort((a, b) => {
    const byStatus = STATUS_WEIGHT[a.weakest.cell.status] - STATUS_WEIGHT[b.weakest.cell.status];
    if (byStatus !== 0) return byStatus;
    return b.weakest.cell.attempted - a.weakest.cell.attempted;
  });
  const top = actionable[0];
  return {
    familyId: top.id,
    label: top.label,
    dimension: top.weakest.id,
    dimensionLabel: top.weakest.label,
    status: top.weakest.cell.status,
    detail: top.weakest.cell.detail,
  };
}

export function launchPrefsForReadinessDimension(dimensionId) {
  const base = {
    reviewStyle: 'forms',
    sourceFormStrategy: 'dictionary',
    promptForm: 'dictionary',
    listeningPrompt: false,
  };
  if (dimensionId === 'recognition') {
    return { ...base, answerMode: 'choice', reviewStyle: 'auto' };
  }
  if (dimensionId === 'speed') {
    return {
      ...base,
      answerMode: 'input',
      autoAdvanceCorrect: true,
    };
  }
  return { ...base, answerMode: 'input' };
}
