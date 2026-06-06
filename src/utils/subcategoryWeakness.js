import {
  EVERYDAY_TYPE_IDS,
  FORM_GROUPS,
  getTypeInfo,
  normalizeFormGroupId,
} from '../data/conjugationTypes.js';
import { ONBIN_PATTERN_META, onbinPatternForVerb, wordKey } from './conjugator.js';
import { groupDisplayLabel } from './groupDisplay.js';

export const QUICK_WORKOUT_LIMIT = 12;
export const QUICK_PRACTICE_DEFAULT_TYPE_IDS = EVERYDAY_TYPE_IDS;

const MAX_RECENT_ATTEMPTS = 30;
const RECENT_DECAY_MS = 14 * 86400000;
const TE_TA_TYPES = new Set(['te-form', 'plain-past']);
const ONBIN_IDS = new Map([
  ['utsuru', { id: 'godan-onbin-utsuru', label: 'Godan u/tsu/ru sound changes' }],
  ['mnb', { id: 'godan-onbin-mnb', label: 'Godan mu/bu/nu sound changes' }],
  ['ku', { id: 'godan-onbin-ku', label: 'Godan ku sound changes' }],
  ['gu', { id: 'godan-onbin-gu', label: 'Godan gu sound changes' }],
  ['su', { id: 'godan-onbin-su', label: 'Godan su sound changes' }],
  ['iku', { id: 'iku-exception', label: 'iku exception' }],
]);

function cleanNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function typeLabel(typeId) {
  return getTypeInfo(typeId).label || typeId;
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
    const recent = [...a.recent, ...b.recent]
      .sort((x, y) => y.at - x.at)
      .slice(0, MAX_RECENT_ATTEMPTS);
    byLane[key] = {
      ...a,
      typeId: a.typeId || b.typeId,
      typeLabel: a.typeLabel || b.typeLabel,
      subcategoryId: a.subcategoryId || b.subcategoryId,
      subcategoryLabel: a.subcategoryLabel || b.subcategoryLabel,
      attempted: a.attempted + b.attempted,
      correct: a.correct + b.correct,
      incorrect: a.incorrect + b.incorrect,
      totalResponseMs: a.totalResponseMs + b.totalResponseMs,
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
  const lanes = rankedWeaknessLanes(state.weakness);
  return families.map((family) => {
    const typeIds = new Set(family.typeIds || []);
    const rows = lanes
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
    return {
      id: family.id,
      label: family.label,
      rows,
      top: rows[0] || null,
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
