// Monotonic contributions preserve independent work without retaining every
// answer forever. A writer is one running app instance, never a shared device.
const VERSION = 1;
const ROOTS = new Set([
  'cards',
  'verbStats',
  'practiceStats',
  'readiness',
  'weakness',
  'guide',
  'session',
  'classify',
  'game',
  'onbin',
  'register',
  'meaning',
  'mock',
  'reader',
  'production',
  'transformation',
  'minimalPairs',
  'shadow',
  'ambient',
]);
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
let runtimeWriterId;

export function getProgressWriterId() {
  if (!runtimeWriterId) {
    const uuid = globalThis.crypto?.randomUUID?.();
    runtimeWriterId = `writer:${uuid || `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`}`;
  }
  return runtimeWriterId;
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isAdditivePath(path) {
  if (path.some((part) => UNSAFE_KEYS.has(part))) return false;
  if (path[0] === 'mistakes') return path.length === 3 && !!path[1] && path[2] === 'count';
  if (path[0] === 'reference')
    return path.length === 4 && path[1] === 'history' && !!path[2] && path[3] === 'count';
  if (path.length < 2 || !ROOTS.has(path[0]) || path.some((part) => !part)) return false;
  const leaf = path.at(-1);
  if (path[0] === 'cards')
    return (
      ['correct', 'incorrect'].includes(leaf) &&
      (path.length === 3 || (path.length === 5 && path[2] === 'sourceTypeStats'))
    );
  if (path[0] === 'verbStats') return path.length === 4 && ['seen', 'incorrect'].includes(leaf);
  if (path[0] === 'practiceStats') {
    if (!['attempted', 'correct', 'responseMs'].includes(leaf)) return false;
    if (path[1] === 'lifetime')
      return path.length === 3 || (path.length === 5 && path[2] === 'byMode');
    return (
      ['byType', 'byDate'].includes(path[1]) &&
      (path.length === 4 || (path.length === 6 && path[3] === 'byMode'))
    );
  }
  if (path[0] === 'readiness')
    return (
      path.length === 5 &&
      path[1] === 'byRule' &&
      ['recognition', 'production', 'speed'].includes(path[3]) &&
      ['attempted', 'correct', 'totalResponseMs', 'correctResponseMs', 'fastCorrect'].includes(leaf)
    );
  if (path[0] === 'weakness')
    return (
      path.length === 4 &&
      path[1] === 'byLane' &&
      ['attempted', 'correct', 'incorrect', 'totalResponseMs'].includes(leaf)
    );
  if (path[0] === 'guide')
    return (
      ['attempted', 'correct', 'assisted'].includes(leaf) &&
      (path.length === 2 ||
        (path.length === 4 &&
          path[1] === 'byStep' &&
          ['base', 'group', 'answer'].includes(path[2])))
    );
  if (path[0] === 'session')
    return (
      (path.length === 2 && ['reviewed', 'correct', 'skipped'].includes(leaf)) ||
      (path.length === 4 && path[1] === 'mistakePatterns' && leaf === 'count')
    );
  if (path[0] === 'reader')
    return (
      (path.length === 2 && ['sessions', 'chars', 'encounters'].includes(leaf)) ||
      (path.length === 3 && path[1] === 'wordSeen')
    );
  if (path[0] === 'minimalPairs')
    return (
      ['attempted', 'correct', 'incorrect'].includes(leaf) &&
      path[1] === 'bySet' &&
      (path.length === 4 || (path.length === 6 && path[3] === 'byContrast'))
    );
  const metrics = {
    classify: ['attempted', 'correct'],
    game: ['played'],
    onbin: ['attempted', 'correct', 'hints'],
    register: ['attempted', 'correct'],
    meaning: ['attempted', 'correct'],
    mock: ['taken'],
    production: ['attempted', 'correct'],
    transformation: ['attempted', 'correct'],
    shadow: ['attempted', 'totalRating'],
    ambient: ['sessions', 'played'],
  };
  if (path.length === 2) return metrics[path[0]]?.includes(leaf) || false;
  const maps = {
    classify: ['byGroup'],
    game: ['byType', 'byWord'],
    onbin: ['byPattern'],
    register: ['byPattern', 'byVerb'],
    meaning: ['byWord'],
    mock: ['bySkill'],
    transformation: ['bySource', 'byTarget', 'byPair', 'byDirection'],
    shadow: ['byScenario'],
  };
  if (path.length !== 4 || !maps[path[0]]?.includes(path[1])) return false;
  const rowMetrics =
    path[0] === 'game'
      ? ['attempted', 'correct', 'incorrect']
      : path[0] === 'mock'
        ? ['attempted', 'correct']
        : metrics[path[0]];
  return rowMetrics?.includes(leaf) || false;
}

function additiveSnapshot(state) {
  const result = {};
  function visit(value, path) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      if (isAdditivePath(path)) result[JSON.stringify(path)] = value;
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
  }
  for (const root of ROOTS) visit(state?.[root], [root]);
  for (const row of state?.mistakes || []) {
    if (row?.key && Number.isFinite(row.count) && row.count >= 0)
      result[JSON.stringify(['mistakes', row.key, 'count'])] = row.count;
  }
  for (const row of state?.reference?.history || []) {
    if (row?.group && row?.dict && row?.reading && Number.isFinite(row.count) && row.count >= 0)
      result[JSON.stringify(['reference', 'history', historyKey(row), 'count'])] = row.count;
  }
  return result;
}

function historyKey(row) {
  return JSON.stringify([row.group, row.dict, row.reading]);
}

function invalid(message) {
  throw Object.assign(new Error(`Progress contributions: ${message}`), {
    code: 'LEARNER_DATA_INVALID',
  });
}

export function validateProgressContributions(value) {
  if (!isRecord(value) || value.version !== VERSION) invalid('unsupported version.');
  if (typeof value.epoch !== 'string' || !isRecord(value.baseline) || !isRecord(value.writers))
    invalid('malformed snapshot.');
  if (value.legacyBaseline !== undefined && typeof value.legacyBaseline !== 'boolean')
    invalid('invalid baseline provenance.');
  function validateMap(map) {
    if (!isRecord(map)) invalid('malformed writer.');
    for (const [key, amount] of Object.entries(map)) {
      let path;
      try {
        path = JSON.parse(key);
      } catch {
        invalid('invalid counter path.');
      }
      if (
        !Array.isArray(path) ||
        !path.every((part) => typeof part === 'string') ||
        !isAdditivePath(path)
      )
        invalid('unsupported counter path.');
      if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER)
        invalid('invalid counter amount.');
    }
    validateTotals(map);
  }
  validateMap(value.baseline);
  for (const [writerId, counters] of Object.entries(value.writers)) {
    if (!writerId || UNSAFE_KEYS.has(writerId)) invalid('invalid writer identity.');
    validateMap(counters);
  }
  return value;
}

export function seedProgressContributions(state, epoch = '', options = {}) {
  return {
    version: VERSION,
    epoch,
    baseline: additiveSnapshot(state),
    writers: {},
    ...(options.legacyBaseline ? { legacyBaseline: true } : {}),
  };
}

function validateTotals(map) {
  const groups = new Map();
  for (const [key, amount] of Object.entries(map)) {
    const path = JSON.parse(key);
    const groupKey = JSON.stringify(path.slice(0, -1));
    const row = groups.get(groupKey) || { root: path[0], path, values: {} };
    row.values[path.at(-1)] = amount;
    groups.set(groupKey, row);
  }
  for (const { root, path, values } of groups.values()) {
    const hasAttempts =
      [
        'practiceStats',
        'readiness',
        'weakness',
        'guide',
        'classify',
        'onbin',
        'register',
        'meaning',
        'production',
        'transformation',
        'minimalPairs',
      ].includes(root) ||
      (root === 'game' && path.length === 4) ||
      (root === 'mock' && path.length === 4);
    const attempts =
      root === 'session'
        ? values.reviewed
        : hasAttempts
          ? values.attempted
          : root === 'verbStats'
            ? values.seen
            : undefined;
    if (attempts !== undefined || hasAttempts || root === 'session' || root === 'verbStats') {
      if ((values.correct || 0) > (attempts || 0) || (values.incorrect || 0) > (attempts || 0))
        invalid('correct or incorrect exceeds attempts.');
    }
    if (hasAttempts && (values.correct || 0) + (values.incorrect || 0) > (values.attempted || 0))
      invalid('answer outcomes exceed attempts.');
    if ((values.fastCorrect || 0) > (values.correct || 0))
      invalid('fast answers exceed correct answers.');
    if ((values.correctResponseMs || 0) > (values.totalResponseMs || 0))
      invalid('correct response time exceeds total response time.');
  }
}

function mapsEqual(left, right) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].every(
    (key) => (left[key] || 0) === (right[key] || 0),
  );
}

export function validateProgressContributionsState(state, value, expectedEpoch = value?.epoch) {
  validateProgressContributions(value);
  if (value.epoch !== expectedEpoch) invalid('reset lineage does not match.');
  const materialized = materializeProgressContributions(state, value);
  if (!mapsEqual(additiveSnapshot(state), additiveSnapshot(materialized)))
    invalid(
      'saved counters do not match their sync evidence. Export this browser data and restore the intended backup in Settings.',
    );
  return value;
}

function mergeMap(left = {}, right = {}) {
  const result = {};
  for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort())
    result[key] = Math.max(left[key] || 0, right[key] || 0);
  return result;
}

export function stampProgressContributions(value, beforeState, afterState, options = {}) {
  const epoch = options.epoch || '';
  const current = value
    ? validateProgressContributions(value)
    : seedProgressContributions(beforeState, epoch);
  if (current.epoch !== epoch) invalid('reset lineage does not match.');
  const before = additiveSnapshot(beforeState);
  const after = additiveSnapshot(afterState);
  const delta = {};
  for (const [key, amount] of Object.entries(after)) {
    const increase = amount - (before[key] || 0);
    if (increase > 0) delta[key] = increase;
  }
  if (!Object.keys(delta).length) return current;
  const writerId = options.writerId || getProgressWriterId();
  const counters = { ...(current.writers[writerId] || {}) };
  for (const [key, amount] of Object.entries(delta))
    counters[key] = Math.min(Number.MAX_SAFE_INTEGER, (counters[key] || 0) + amount);
  return { ...current, writers: { ...current.writers, [writerId]: counters } };
}

export function mergeProgressContributions(left, right, epoch = '') {
  const active = [left, right]
    .filter(Boolean)
    .map(validateProgressContributions)
    .filter((value) => value.epoch === epoch);
  let baseline = {};
  const writers = {};
  for (const legacy of active.filter((value) => value.legacyBaseline)) {
    if (!Object.values(legacy.baseline).some(Boolean)) continue;
    for (const observed of active) {
      if (!Object.keys(observed.writers).length || mapsEqual(legacy.baseline, observed.baseline))
        continue;
      invalid(
        'older app progress overlaps a newer sync snapshot. Automatic merge is paused. Export the browser data, reload every app tab, then restore the backup you want in Settings.',
      );
    }
  }
  for (const value of active) {
    baseline = mergeMap(baseline, value.baseline);
    for (const [writerId, counters] of Object.entries(value.writers))
      writers[writerId] = mergeMap(writers[writerId], counters);
  }
  return {
    version: VERSION,
    epoch,
    baseline,
    ...(active.some((value) => value.legacyBaseline) ? { legacyBaseline: true } : {}),
    writers: Object.fromEntries(Object.entries(writers).sort(([a], [b]) => a.localeCompare(b))),
  };
}

export function materializeProgressContributions(state, value) {
  validateProgressContributions(value);
  const totals = { ...value.baseline };
  for (const counters of Object.values(value.writers)) {
    for (const [key, amount] of Object.entries(counters))
      totals[key] = Math.min(Number.MAX_SAFE_INTEGER, (totals[key] || 0) + amount);
  }
  validateTotals(totals);
  const next = JSON.parse(JSON.stringify(state || {}));
  for (const [key, amount] of Object.entries(totals)) {
    const path = JSON.parse(key);
    if (path[0] === 'mistakes') {
      const row = next.mistakes?.find((entry) => entry.key === path[1]);
      if (row) row.count = amount;
      continue;
    }
    if (path[0] === 'reference') {
      const row = next.reference?.history?.find((entry) => historyKey(entry) === path[2]);
      if (row) row.count = amount;
      continue;
    }
    let target = next;
    for (const segment of path.slice(0, -1)) {
      if (target[segment] !== undefined && !isRecord(target[segment]))
        invalid('counter path would replace saved data.');
      if (!isRecord(target[segment])) target[segment] = {};
      target = target[segment];
    }
    target[path.at(-1)] = amount;
  }
  return next;
}
