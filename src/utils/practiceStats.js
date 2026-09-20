import { ALL_CARD_TYPES, FORM_GROUPS } from '../data/conjugationTypes.js';
import { topicForPracticeType } from './practiceSelection.js';

const TYPE_BY_ID = new Map(ALL_CARD_TYPES.map((type) => [type.id, type]));

function dateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function emptyTotals() {
  return { attempted: 0, correct: 0, responseMs: 0, byMode: {} };
}

export function defaultPracticeStats() {
  return {
    startedAt: 0,
    lifetime: emptyTotals(),
    byType: {},
    byDate: {},
    recent: [],
  };
}

function normalizeTotals(value) {
  return {
    attempted: Math.max(0, Number(value?.attempted) || 0),
    correct: Math.max(0, Number(value?.correct) || 0),
    responseMs: Math.max(0, Number(value?.responseMs) || 0),
    byMode:
      value?.byMode && typeof value.byMode === 'object'
        ? Object.fromEntries(
            Object.entries(value.byMode).map(([mode, totals]) => [mode, normalizeTotals(totals)]),
          )
        : {},
  };
}

export function normalizePracticeStats(value) {
  const base = defaultPracticeStats();
  if (!value || typeof value !== 'object') return base;
  return {
    startedAt: Math.max(0, Number(value.startedAt) || base.startedAt),
    lifetime: normalizeTotals(value.lifetime),
    byType: Object.fromEntries(
      Object.entries(value.byType || {})
        .filter(([typeId]) => TYPE_BY_ID.has(typeId))
        .map(([typeId, totals]) => [typeId, normalizeTotals(totals)]),
    ),
    byDate: Object.fromEntries(
      Object.entries(value.byDate || {}).map(([day, totals]) => [day, normalizeTotals(totals)]),
    ),
    recent: Array.isArray(value.recent) ? value.recent.slice(0, 120) : [],
  };
}

function incrementTotals(totals, correct, responseMs, mode, includeMode = true) {
  const current = normalizeTotals(totals);
  const next = {
    ...current,
    attempted: current.attempted + 1,
    correct: current.correct + (correct ? 1 : 0),
    responseMs: current.responseMs + Math.max(0, Number(responseMs) || 0),
  };
  if (!includeMode) return next;
  return {
    ...next,
    byMode: {
      ...current.byMode,
      [mode]: incrementTotals(current.byMode[mode], correct, responseMs, mode, false),
    },
  };
}

export function recordPracticeAnswer(stats, answer) {
  const current = normalizePracticeStats(stats);
  const typeId = String(answer?.typeId || '');
  if (!TYPE_BY_ID.has(typeId)) return current;
  const at = Number(answer?.at) || Date.now();
  const mode = String(answer?.mode || 'input');
  const correct = !!answer?.correct;
  const responseMs = Math.max(0, Number(answer?.responseMs) || 0);
  const day = dateKey(at);
  return {
    ...current,
    startedAt: current.startedAt || at,
    lifetime: incrementTotals(current.lifetime, correct, responseMs, mode),
    byType: {
      ...current.byType,
      [typeId]: incrementTotals(current.byType[typeId], correct, responseMs, mode),
    },
    byDate: {
      ...current.byDate,
      [day]: incrementTotals(current.byDate[day], correct, responseMs, mode),
    },
    recent: [
      {
        at,
        typeId,
        topicId: topicForPracticeType(typeId)?.id || '',
        correct,
        mode,
        responseMs,
      },
      ...current.recent,
    ].slice(0, 120),
  };
}

function mergeTotals(a, b) {
  const left = normalizeTotals(a);
  const right = normalizeTotals(b);
  const modes = new Set([...Object.keys(left.byMode), ...Object.keys(right.byMode)]);
  return {
    attempted: Math.max(left.attempted, right.attempted),
    correct: Math.max(left.correct, right.correct),
    responseMs: Math.max(left.responseMs, right.responseMs),
    byMode: Object.fromEntries(
      [...modes].map((mode) => [mode, mergeTotals(left.byMode[mode], right.byMode[mode])]),
    ),
  };
}

export function mergePracticeStats(local, cloud) {
  const left = normalizePracticeStats(local);
  const right = normalizePracticeStats(cloud);
  const typeIds = new Set([...Object.keys(left.byType), ...Object.keys(right.byType)]);
  const days = new Set([...Object.keys(left.byDate), ...Object.keys(right.byDate)]);
  const recentByKey = new Map();
  for (const row of [...left.recent, ...right.recent]) {
    const key = `${row.at}|${row.typeId}|${row.mode}|${row.correct}`;
    if (!recentByKey.has(key)) recentByKey.set(key, row);
  }
  const starts = [left.startedAt, right.startedAt].filter((value) => value > 0);
  return {
    startedAt: starts.length ? Math.min(...starts) : 0,
    lifetime: mergeTotals(left.lifetime, right.lifetime),
    byType: Object.fromEntries(
      [...typeIds].map((typeId) => [
        typeId,
        mergeTotals(left.byType[typeId], right.byType[typeId]),
      ]),
    ),
    byDate: Object.fromEntries(
      [...days].map((day) => [day, mergeTotals(left.byDate[day], right.byDate[day])]),
    ),
    recent: [...recentByKey.values()].sort((a, b) => b.at - a.at).slice(0, 120),
  };
}

export function accuracyForTotals(totals) {
  const attempted = Number(totals?.attempted) || 0;
  return attempted ? Math.round(((Number(totals?.correct) || 0) / attempted) * 100) : 0;
}

export function evidenceLabelForTotals(totals) {
  const attempted = Number(totals?.attempted) || 0;
  if (!attempted) return 'No attempts yet';
  if (attempted === 1) return 'First attempt';
  if (attempted === 2) return 'Early estimate';
  return `${accuracyForTotals(totals)}% right`;
}

export function totalsForPracticeTopic(stats, topicOrId) {
  const normalized = normalizePracticeStats(stats);
  const topic =
    typeof topicOrId === 'string' ? FORM_GROUPS.find((item) => item.id === topicOrId) : topicOrId;
  if (!topic) return emptyTotals();
  return topic.typeIds.reduce((total, typeId) => {
    const row = normalizeTotals(normalized.byType[typeId]);
    total.attempted += row.attempted;
    total.correct += row.correct;
    total.responseMs += row.responseMs;
    for (const [mode, modeTotals] of Object.entries(row.byMode)) {
      const current = total.byMode[mode] || emptyTotals();
      total.byMode[mode] = {
        ...current,
        attempted: current.attempted + modeTotals.attempted,
        correct: current.correct + modeTotals.correct,
        responseMs: current.responseMs + modeTotals.responseMs,
      };
    }
    return total;
  }, emptyTotals());
}

export function contextualStatsForType(stats, typeId) {
  const normalized = normalizePracticeStats(stats);
  const topic = topicForPracticeType(typeId);
  const exact = normalizeTotals(normalized.byType[typeId]);
  const recent = normalized.recent.filter((row) => row.typeId === typeId).slice(0, 10);
  const recentCorrect = recent.filter((row) => row.correct).length;
  return {
    type: TYPE_BY_ID.get(typeId) || null,
    topic,
    exact,
    topicTotals: totalsForPracticeTopic(normalized, topic),
    recent: {
      attempted: recent.length,
      correct: recentCorrect,
      accuracy: recent.length ? Math.round((recentCorrect / recent.length) * 100) : 0,
    },
  };
}

export function practiceTrendDays(stats, count = 14, now = Date.now()) {
  const normalized = normalizePracticeStats(stats);
  const rows = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const key = dateKey(date.getTime());
    const totals = normalizeTotals(normalized.byDate[key]);
    rows.push({
      key,
      label: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2),
      attempted: totals.attempted,
      correct: totals.correct,
      accuracy: accuracyForTotals(totals),
    });
  }
  return rows;
}
