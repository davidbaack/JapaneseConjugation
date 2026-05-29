import { STORAGE_KEY, DEFAULT_PREFS } from '../data/defaults.js';
import {
  CONJ_TYPES,
  ADJ_TYPES,
  ALL_CARD_TYPES,
  TYPE_PACKS,
  INTRODUCED_DEFAULT_TYPE_IDS,
} from '../data/conjugationTypes.js';
import {
  RULES,
  isRedundantPracticeType,
  enabledTypeIdsFor,
  filterWordsForPrefs,
} from './conjugator.js';
import { retryWithBackoff } from './retry.js';

export const DAY = 86400000;

export function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Detect the browser's various flavors of "localStorage is full".
export function isQuotaExceeded(e) {
  return !!(
    e &&
    (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22)
  );
}

export function saveAll(
  state,
  customVerbs,
  customAdjectives,
  wordLists,
  syncConfig,
  lastSyncedAt,
  practicePrefs = DEFAULT_PREFS,
) {
  const payload = JSON.stringify({
    state,
    customVerbs,
    customAdjectives,
    wordLists,
    syncConfig,
    lastSyncedAt,
    practicePrefs,
  });
  try {
    localStorage.setItem(STORAGE_KEY, payload);
  } catch (e) {
    if (!isQuotaExceeded(e)) return;
    // Quota hit: the regenerable AI cache is the safest thing to drop. Evict it
    // and retry once before surfacing an error, so the user's actual progress
    // is never lost to a full cache (improvement #15).
    pruneAICache();
    clearAICache();
    try {
      localStorage.setItem(STORAGE_KEY, payload);
    } catch (e2) {
      if (isQuotaExceeded(e2)) {
        throw Object.assign(
          new Error('Storage full — export your data in Settings to free up space.'),
          { isQuotaError: true },
        );
      }
    }
  }
}

// ============================================================================
// AI CACHE WITH TTL
// ============================================================================
const AI_CACHE_TTL = 7 * DAY;
const AI_CACHE_KEYS = [
  'katachiya_ai_explanations_cache',
  'katachiya_ai_pitch_cache',
  'katachiya_ai_sentence_cache',
];

export function getAICache(storageKey, cacheKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const store = JSON.parse(raw);
    const entry = store[cacheKey];
    if (!entry) return null;
    if (entry && typeof entry === 'object' && entry.ts) {
      if (Date.now() - entry.ts > AI_CACHE_TTL) return null;
      return entry.v;
    }
    return entry;
  } catch {
    return null;
  }
}

export function setAICache(storageKey, cacheKey, value) {
  try {
    const raw = localStorage.getItem(storageKey);
    const store = raw ? JSON.parse(raw) : {};
    store[cacheKey] = { ts: Date.now(), v: value };
    localStorage.setItem(storageKey, JSON.stringify(store));
  } catch {}
}

export function pruneAICache() {
  const now = Date.now();
  for (const key of AI_CACHE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const store = JSON.parse(raw);
      let changed = false;
      for (const k of Object.keys(store)) {
        const entry = store[k];
        if (entry && typeof entry === 'object' && entry.ts && now - entry.ts > AI_CACHE_TTL) {
          delete store[k];
          changed = true;
        }
      }
      if (changed) localStorage.setItem(key, JSON.stringify(store));
    } catch {}
  }
}

// Drop the entire AI cache (used as a last-resort eviction when storage is
// full). The cache is purely a network/cost optimization, so clearing it only
// costs a re-fetch — never user progress.
export function clearAICache() {
  for (const key of AI_CACHE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
}

// Rough estimate of how many bytes this app is using in localStorage (UTF-16,
// so ~2 bytes/char). Used by Settings to warn before the user hits the wall.
export function estimateStorageBytes() {
  if (typeof localStorage === 'undefined') return 0;
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const isAppKey =
        key === STORAGE_KEY || key.startsWith('katachiya') || key.startsWith('jp-verb');
      if (!isAppKey) continue;
      const value = localStorage.getItem(key) || '';
      total += (key.length + value.length) * 2;
    }
  } catch {
    return total;
  }
  return total;
}

export function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveThemePreference(theme = 'system', systemTheme = getSystemTheme()) {
  return theme === 'dark' || theme === 'light' ? theme : systemTheme;
}

// ============================================================================
// CLOUD SYNC
// ============================================================================
import { supabase } from './supabase.js';

export function syncReady() {
  return !!supabase;
}

export async function cloudFetch() {
  if (!supabase) throw new Error('Supabase client is not configured');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  // Retry transient network/5xx failures so a flaky connection doesn't abort
  // the read; auth/RLS errors fail fast (non-transient) (improvement #14).
  return retryWithBackoff(async () => {
    const { data, error } = await supabase
      .from('srs_sync')
      .select('data, updated_at')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  });
}

export async function cloudUpsert(payload) {
  if (!supabase) throw new Error('Supabase client is not configured');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('User is not authenticated');

  // Retry transient failures so a momentary network blip doesn't drop the
  // user's progress; a fresh timestamp is written on each attempt.
  await retryWithBackoff(async () => {
    const { error } = await supabase.from('srs_sync').upsert({
      id: session.user.id,
      data: payload,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  });
}

// Parse the cloud row's updated_at into epoch millis (0 when absent/invalid).
export function cloudTimestamp(cloud) {
  if (!cloud || !cloud.updated_at) return 0;
  const t = new Date(cloud.updated_at).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// Decide what to do after a cloud fetch, given the timestamp of our last
// successful sync. This is the conflict-resolution core, kept pure so it can
// be tested without rendering the app:
//   - 'pull'  cloud is newer than what we last synced → adopt cloud data
//   - 'push'  local is newer, or the cloud row is empty/new → upload local
//   - 'noop'  timestamps match → already in sync
export function resolveSyncAction(cloud, localSyncedAt = 0) {
  if (!cloud || !cloud.data) return 'push';
  const cloudAt = cloudTimestamp(cloud);
  if (cloudAt > localSyncedAt) return 'pull';
  if (cloudAt < localSyncedAt) return 'push';
  return 'noop';
}

// ============================================================================
// SRS STATE LOGIC
// ============================================================================
export function localDateKey(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function normalizeReferenceState(ref = null) {
  if (!ref) ref = {};
  const recentSearches = Array.isArray(ref.recentSearches)
    ? ref.recentSearches
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const history = Array.isArray(ref.history)
    ? ref.history
        .filter((w) => w && w.dict && w.reading && w.group)
        .map((w) => ({
          dict: w.dict,
          reading: w.reading,
          meaning: w.meaning || '',
          group: w.group,
          lastAt: w.lastAt || Date.now(),
          count: w.count || 1,
        }))
        .slice(0, 24)
    : [];
  return { recentSearches, history };
}

export function defaultState() {
  return {
    cards: {},
    verbStats: {},
    mistakes: [],
    shadow: { attempted: 0, totalRating: 0, byScenario: {} },
    ambient: { sessions: 0, played: 0, lastAt: null },
    game: { played: 0, bestScore: 0, bestCombo: 0 },
    onbin: { attempted: 0, correct: 0, hints: 0, streak: 0, bestStreak: 0, byPattern: {} },
    meaning: { attempted: 0, correct: 0, byWord: {} },
    mock: {
      taken: 0,
      bestPct: 0,
      lastPct: 0,
      lastScore: 0,
      lastTotal: 0,
      lastAt: null,
      bySkill: {},
    },
    reader: { sessions: 0, chars: 0, encounters: 0, wordSeen: {}, lastAt: null },
    production: { attempted: 0, correct: 0, lastScore: 0, lastAt: null },
    reference: normalizeReferenceState(),
    enabledTypes: [
      ...CONJ_TYPES.filter((t) => t.id !== 'plain-present').map((t) => t.id),
      ...ADJ_TYPES.filter((t) => t.id !== 'adj-plain-present').map((t) => t.id),
    ],
    session: { reviewed: 0, correct: 0, skipped: 0 },
    daily: {
      date: localDateKey(),
      count: 0,
      goalHit: false,
      goalStreak: 0,
      bestGoalStreak: 0,
      currentAnswerStreak: 0,
      bestAnswerStreak: 0,
    },
    classify: { attempted: 0, correct: 0, byGroup: {} },
  };
}

export function mergeState(saved, sessionOverride) {
  const base = defaultState();
  const merged = {
    ...base,
    ...(saved || {}),
    verbStats: (saved && saved.verbStats) || {},
    mistakes: Array.isArray(saved && saved.mistakes) ? saved.mistakes : [],
    shadow: (saved && saved.shadow) || base.shadow,
    ambient: (saved && saved.ambient) || base.ambient,
    game: (saved && saved.game) || base.game,
    onbin: (saved && saved.onbin) || base.onbin,
    meaning: (saved && saved.meaning) || base.meaning,
    mock: (saved && saved.mock) || base.mock,
    reader: {
      ...base.reader,
      ...((saved && saved.reader) || {}),
      wordSeen: (saved && saved.reader && saved.reader.wordSeen) || {},
    },
    production: (saved && saved.production) || base.production,
    reference: normalizeReferenceState(saved && saved.reference ? saved.reference : null),
    daily: (saved && saved.daily) || base.daily,
    classify: (saved && saved.classify) || base.classify,
    session: sessionOverride || base.session,
  };

  if (
    saved &&
    Array.isArray(saved.enabledTypes) &&
    !saved.enabledTypes.some((id) => id.startsWith('adj-'))
  ) {
    merged.enabledTypes = [
      ...saved.enabledTypes,
      ...base.enabledTypes.filter((id) => id.startsWith('adj-')),
    ];
  }

  if (saved && Array.isArray(saved.enabledTypes)) {
    const enabledSet = new Set(merged.enabledTypes);
    const previousDefaultIds = base.enabledTypes.filter(
      (id) => !INTRODUCED_DEFAULT_TYPE_IDS.includes(id),
    );
    if (previousDefaultIds.every((id) => enabledSet.has(id))) {
      merged.enabledTypes = [...new Set([...merged.enabledTypes, ...INTRODUCED_DEFAULT_TYPE_IDS])];
    }
  }

  return merged;
}

export function bumpDaily(daily, correct, dailyGoal) {
  const today = localDateKey(),
    yesterday = localDateKey(-1);
  let d = daily || {};
  if (d.date !== today) {
    const keepGoalStreak = d.date === yesterday && d.goalHit;
    d = {
      date: today,
      count: 0,
      goalHit: false,
      goalStreak: keepGoalStreak ? d.goalStreak || 0 : 0,
      bestGoalStreak: d.bestGoalStreak || 0,
      currentAnswerStreak: 0,
      bestAnswerStreak: d.bestAnswerStreak || 0,
    };
  }
  const count = (d.count || 0) + 1;
  const wasGoalHit = !!d.goalHit;
  const goalHit = count >= dailyGoal;
  const goalStreak = (d.goalStreak || 0) + (!wasGoalHit && goalHit ? 1 : 0);
  const currentAnswerStreak = correct ? (d.currentAnswerStreak || 0) + 1 : 0;
  return {
    ...d,
    count,
    goalHit,
    goalStreak,
    bestGoalStreak: Math.max(d.bestGoalStreak || 0, goalStreak),
    currentAnswerStreak,
    bestAnswerStreak: Math.max(d.bestAnswerStreak || 0, currentAnswerStreak),
  };
}

export function recordMistake(mistakes, item, type, promptType, userAnswer, expected) {
  const key = `${item.group}|${item.dict}|${type}|${promptType || 'dictionary'}`;
  const now = Date.now();
  const prior = (mistakes || []).find((m) => m.key === key);
  const fresh = {
    key,
    dict: item.dict,
    reading: item.reading,
    meaning: item.meaning,
    group: item.group,
    type,
    promptType: promptType || null,
    userAnswer,
    expected,
    at: now,
    count: (prior?.count || 0) + 1,
    resolved: false,
  };
  return [fresh, ...(mistakes || []).filter((m) => m.key !== key)].slice(0, 50);
}

export function markMistakeResolved(mistakes, key) {
  return (mistakes || []).map((m) =>
    m.key === key ? { ...m, resolved: true, resolvedAt: Date.now() } : m,
  );
}

export function gradeCard(card, correct) {
  const now = Date.now();
  if (!card)
    card = {
      ease: 2.5,
      interval: 0,
      reps: 0,
      nextReview: 0,
      correct: 0,
      incorrect: 0,
      lastSeen: 0,
    };
  if (correct) {
    let iv;
    if (card.reps === 0) iv = 1;
    else if (card.reps === 1) iv = 3;
    else iv = Math.ceil(card.interval * card.ease);
    return {
      ease: card.ease,
      reps: card.reps + 1,
      interval: iv,
      nextReview: now + iv * DAY,
      correct: card.correct + 1,
      incorrect: card.incorrect,
      lastSeen: now,
    };
  }
  return {
    ease: Math.max(1.3, card.ease - 0.2),
    reps: 0,
    interval: 0,
    nextReview: now + 60000,
    correct: card.correct,
    incorrect: card.incorrect + 1,
    lastSeen: now,
  };
}

export function ruleWeakScore(state, ruleId) {
  const card = (state.cards || {})[ruleId] || {};
  const reviews = (card.correct || 0) + (card.incorrect || 0);
  const missRate = reviews ? (card.incorrect || 0) / reviews : 0;
  const unresolved = (state.mistakes || [])
    .filter((m) => !m.resolved && ruleId.endsWith(`|${m.type}`))
    .reduce((sum, m) => sum + (m.count || 1), 0);
  const verbStats = Object.values(state.verbStats || {})
    .map((vs) => vs[ruleId])
    .filter(Boolean);
  const verbMisses = verbStats.reduce((sum, s) => sum + (s.incorrect || 0), 0);
  return (card.incorrect || 0) * 2 + missRate * 4 + unresolved * 3 + verbMisses;
}

export function weakTypeIdsForState(state, fallbackIds = []) {
  const scores = new Map();
  for (const rule of RULES) {
    const score = ruleWeakScore(state, rule.id);
    if (score > 0) scores.set(rule.type, (scores.get(rule.type) || 0) + score);
  }
  for (const m of state.mistakes || []) {
    if (!m.resolved && m.type) scores.set(m.type, (scores.get(m.type) || 0) + (m.count || 1) * 4);
  }
  const ranked = [...scores.entries()]
    .filter(([id]) => ALL_CARD_TYPES.some((t) => t.id === id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  if (ranked.length) return ranked.slice(0, 12);
  return (fallbackIds.length ? fallbackIds : TYPE_PACKS[0].typeIds).filter((id) =>
    ALL_CARD_TYPES.some((t) => t.id === id),
  );
}

export function pickWeakWeighted(pool, state) {
  const scored = pool.map((p) => ({ ...p, weakScore: ruleWeakScore(state, p.rule.id) }));
  if (!scored.some((p) => p.weakScore > 0)) return null;
  const weights = scored.map((p) => 1 + p.weakScore * p.weakScore);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < scored.length; i++) {
    r -= weights[i];
    if (r <= 0) return scored[i];
  }
  return scored[scored.length - 1];
}

export function selectNext(state, verbs, enabledTypes, lastRuleId, prefs = DEFAULT_PREFS) {
  const now = Date.now(),
    pool = [];
  for (const rule of RULES) {
    if (!enabledTypes.includes(rule.type)) continue;
    const candidates = rule
      .verbFilter(verbs)
      .filter((item) => !isRedundantPracticeType(item, rule.type, enabledTypes, prefs));
    if (!candidates.length) continue;
    pool.push({ rule, candidates });
  }
  if (!pool.length) return null;
  const avail = pool.length > 1 ? pool.filter((p) => p.rule.id !== lastRuleId) : pool;
  const due = avail.filter((p) => {
    const c = state.cards[p.rule.id];
    return c && c.nextReview <= now;
  });
  const fresh = avail.filter((p) => !state.cards[p.rule.id]);
  const future = avail.filter((p) => {
    const c = state.cards[p.rule.id];
    return c && c.nextReview > now;
  });
  let chosen;
  if ((prefs.practiceFocus || 'balanced') === 'weak') {
    const weakPool = [...due, ...future, ...fresh];
    chosen = pickWeakWeighted(weakPool, state);
  }
  if (!chosen) {
    if (due.length) {
      due.sort((a, b) => state.cards[a.rule.id].nextReview - state.cards[b.rule.id].nextReview);
      const sl = due.slice(0, Math.min(5, due.length));
      chosen = sl[Math.floor(Math.random() * sl.length)];
    } else if (fresh.length) {
      chosen = fresh[Math.floor(Math.random() * fresh.length)];
    } else {
      future.sort((a, b) => state.cards[a.rule.id].nextReview - state.cards[b.rule.id].nextReview);
      chosen = future[0];
    }
  }
  if (!chosen) return null;
  const verb = pickVerb(chosen.candidates, chosen.rule.id, state.verbStats);
  return {
    id: chosen.rule.id,
    verb,
    type: chosen.rule.type,
    card: state.cards[chosen.rule.id],
    ruleLabel: chosen.rule.label,
  };
}

// Build a Study card for a SPECIFIC word + form — used when "Practice this
// verb" is tapped in Check. Returns the same shape as selectNext (so it can be
// dropped straight into StudyView's `current`), or null when no rule covers
// this word/form, letting the caller fall back to normal selection. Matching
// on verbFilter([word]) rather than on the id string means the 行く exception
// and any other rule quirks resolve themselves.
export function buildFocusCard(state, word, type) {
  if (!word || !type) return null;
  const rule = RULES.find((r) => r.type === type && r.verbFilter([word]).length === 1);
  if (!rule) return null;
  return {
    id: rule.id,
    verb: word,
    type: rule.type,
    card: state.cards[rule.id],
    ruleLabel: rule.label,
  };
}

export function buildPracticePoolSummary(state, words, prefs = DEFAULT_PREFS, wordLists = []) {
  const filtered = filterWordsForPrefs(words, prefs, wordLists);
  const enabled = enabledTypeIdsFor(state.enabledTypes);
  const now = Date.now();
  const activeTypes = new Set();
  const activeRules = [];
  let prompts = 0;
  for (const rule of RULES) {
    if (!enabled.includes(rule.type)) continue;
    const candidates = rule
      .verbFilter(filtered)
      .filter((item) => !isRedundantPracticeType(item, rule.type, enabled, prefs));
    if (!candidates.length) continue;
    prompts += candidates.length;
    activeTypes.add(rule.type);
    activeRules.push(rule);
  }
  let due = 0,
    fresh = 0,
    weak = 0,
    mastered = 0;
  for (const rule of activeRules) {
    const card = (state.cards || {})[rule.id];
    if (!card) fresh++;
    else if (card.nextReview <= now) due++;
    if (ruleWeakScore(state, rule.id) > 0) weak++;
    if (card && card.reps > 0 && getCardLevel(card) >= 4) mastered++;
  }
  return {
    words: filtered.length,
    prompts,
    forms: activeTypes.size,
    rules: activeRules.length,
    due,
    fresh,
    weak,
    mastered,
  };
}

export function pickVerb(candidates, ruleId, verbStats) {
  const vs = verbStats || {};
  const withS = candidates.map((v) => {
    const s = (vs[v.dict] || {})[ruleId] || { seen: 0, incorrect: 0 };
    return { v, seen: s.seen, incorrect: s.incorrect };
  });
  const unseen = withS.filter((x) => x.seen === 0);
  if (unseen.length) return unseen[Math.floor(Math.random() * unseen.length)].v;
  const weights = withS.map((x) => x.incorrect + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < withS.length; i++) {
    r -= weights[i];
    if (r <= 0) return withS[i].v;
  }
  return withS[withS.length - 1].v;
}

export function fmtInterval(d) {
  if (!d) return 'new';
  if (d < 1) return '<1d';
  if (d < 30) return Math.round(d) + 'd';
  if (d < 365) return Math.round(d / 30) + 'mo';
  return (d / 365).toFixed(1) + 'y';
}

export const SRS_LEVELS = [
  {
    id: 0,
    name: 'Raw',
    sub: 'Not started',
    bg: 'bg-stone-100',
    text: 'text-stone-500',
    border: 'border-stone-200',
    dot: 'bg-stone-400',
  },
  {
    id: 1,
    name: 'Shard',
    sub: '1–3 day intervals',
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    dot: 'bg-sky-400',
  },
  {
    id: 2,
    name: 'Crystal',
    sub: '4–13 day intervals',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    dot: 'bg-indigo-500',
  },
  {
    id: 3,
    name: 'Gem',
    sub: '2–8 week intervals',
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    dot: 'bg-teal-500',
  },
  {
    id: 4,
    name: 'Jewel',
    sub: '2–6 month intervals',
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    border: 'border-violet-200',
    dot: 'bg-violet-500',
  },
  {
    id: 5,
    name: 'Treasure',
    sub: '6+ month intervals',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
];

export function getCardLevel(card) {
  if (!card || card.reps === 0) return 0;
  const iv = card.interval;
  if (iv < 4) return 1;
  if (iv < 14) return 2;
  if (iv < 60) return 3;
  if (iv < 180) return 4;
  return 5;
}

export function referenceRuleIdFor(item, typeId) {
  if (!item || !typeId) return '';
  if (
    item.group === 'godan' &&
    (typeId === 'plain-past' || typeId === 'te-form') &&
    String(item.reading || '').endsWith('いく')
  ) {
    return `exception-いく|${typeId}`;
  }
  return `${item.group}|${typeId}`;
}

export function referenceProgressFor(state, item, typeId) {
  const ruleId = referenceRuleIdFor(item, typeId);
  const card = (state.cards || {})[ruleId];
  const level = getCardLevel(card);
  const levelInfo = SRS_LEVELS[level] || SRS_LEVELS[0];
  const reviews = (card?.correct || 0) + (card?.incorrect || 0);
  if (!card || reviews === 0) {
    return {
      ruleId,
      level,
      status: 'new',
      label: 'New',
      tone: 'bg-stone-100 text-stone-500 border-stone-200',
      levelInfo,
      reviews,
      detail: 'Not practiced yet',
    };
  }
  if (card.nextReview <= Date.now()) {
    return {
      ruleId,
      level,
      status: 'due',
      label: 'Due',
      tone: 'bg-amber-50 text-amber-700 border-amber-200',
      levelInfo,
      reviews,
      detail: `${reviews} review${reviews === 1 ? '' : 's'} · ready now`,
    };
  }
  if (level >= 4) {
    return {
      ruleId,
      level,
      status: 'mastered',
      label: 'Mastered',
      tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      levelInfo,
      reviews,
      detail: `${levelInfo.name} · next in ${fmtInterval(Math.max(0, (card.nextReview - Date.now()) / DAY))}`,
    };
  }
  return {
    ruleId,
    level,
    status: 'learning',
    label: levelInfo.name,
    tone: `${levelInfo.bg} ${levelInfo.text} ${levelInfo.border}`,
    levelInfo,
    reviews,
    detail: `${reviews} review${reviews === 1 ? '' : 's'} · next in ${fmtInterval(Math.max(0, (card.nextReview - Date.now()) / DAY))}`,
  };
}
