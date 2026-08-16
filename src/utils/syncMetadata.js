import { DEFAULT_PREFS } from '../data/defaults.js';

const SYNC_META_VERSION = 1;
const DEVICE_STORAGE_KEY = 'katachiya_sync_device_id';

const TRACKED_PREFIXES = {
  prefs: 'prefs.',
  customVerbs: 'customVerbs.',
  customAdjectives: 'customAdjectives.',
  lists: 'lists.',
  practiceScope: 'state.practiceScope',
  enabledTypes: 'state.enabledTypes',
  excludedWords: 'state.reviewScope.excludedWordKeys.',
  excludedFamilies: 'state.reviewScope.excludedFormFamilyIds.',
  recommendations: 'state.reviewScope.recommendations.',
};

const PROGRESS_FIELDS = [
  'cards',
  'verbStats',
  'retryQueue',
  'mistakes',
  'readiness',
  'weakness',
  'daily',
  'classify',
  'game',
  'onbin',
  'register',
  'meaning',
  'mock',
  'guide',
  'transformation',
  'minimalPairs',
  'shadow',
  'ambient',
  'reader',
  'production',
  'reference',
  'session',
];

const SET_PREF_KEYS = new Set([
  'jlptLevels',
  'genkiLessons',
  'minnaLessons',
  'wordTypes',
  'wordGroups',
  'wordListIds',
]);

function randomId(prefix = 'event') {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}:${uuid}`;
  return `${prefix}:${Math.random().toString(36).slice(2)}:${Date.now().toString(36)}`;
}

export function createSyncEventId() {
  return randomId('event');
}

export function getLocalSyncDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (existing) return existing;
    const created = randomId('device');
    localStorage.setItem(DEVICE_STORAGE_KEY, created);
    return created;
  } catch {
    return randomId('device');
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function compareText(left, right) {
  return left === right ? 0 : left > right ? 1 : -1;
}

function hashValue(value) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function encode(value) {
  return encodeURIComponent(String(value || ''));
}

function decode(value) {
  return decodeURIComponent(value);
}

function wordIdentity(word) {
  if (!word || typeof word !== 'object') return stableStringify(word);
  return [word.group || word.kind || '', word.dict || ''].join(':');
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function addNestedPreferenceValues(values, path, value) {
  if (!isPlainObject(value)) {
    values.set(path, value);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    addNestedPreferenceValues(values, `${path}.leaves.${encode(key)}`, child);
  }
}

function guideTotals(guide = {}) {
  const total = {
    attempted: Number(guide.attempted) || 0,
    correct: Number(guide.correct) || 0,
    assisted: Number(guide.assisted) || 0,
    byStep: {},
  };
  for (const stepId of ['base', 'group', 'answer']) {
    total.byStep[stepId] = {
      attempted: Number(guide.byStep?.[stepId]?.attempted) || 0,
      correct: Number(guide.byStep?.[stepId]?.correct) || 0,
      assisted: Number(guide.byStep?.[stepId]?.assisted) || 0,
    };
  }
  return total;
}

function addGuideTotals(left = {}, right = {}) {
  const result = guideTotals(left);
  const delta = guideTotals(right);
  for (const key of ['attempted', 'correct', 'assisted']) result[key] += delta[key];
  for (const stepId of ['base', 'group', 'answer']) {
    for (const key of ['attempted', 'correct', 'assisted']) {
      result.byStep[stepId][key] += delta.byStep[stepId][key];
    }
  }
  return result;
}

function guideDelta(before = {}, after = {}) {
  const left = guideTotals(before);
  const right = guideTotals(after);
  const result = guideTotals();
  for (const key of ['attempted', 'correct', 'assisted']) {
    result[key] = Math.max(0, right[key] - left[key]);
  }
  for (const stepId of ['base', 'group', 'answer']) {
    for (const key of ['attempted', 'correct', 'assisted']) {
      result.byStep[stepId][key] = Math.max(
        0,
        right.byStep[stepId][key] - left.byStep[stepId][key],
      );
    }
  }
  return result;
}

function hasGuideDelta(delta) {
  return delta.attempted || delta.correct || delta.assisted;
}

function normalizeRecent(recent = []) {
  return (Array.isArray(recent) ? recent : []).map((row) => ({
    ...row,
    id: row?.id || `legacy-attempt:${hashValue(row)}`,
  }));
}

function trackedSnapshot(payload = {}) {
  const values = new Map();
  for (const [key, value] of Object.entries(payload.practicePrefs || {})) {
    if (SET_PREF_KEYS.has(key) && Array.isArray(value)) {
      for (const member of value) {
        values.set(
          `${TRACKED_PREFIXES.prefs}${encode(key)}.members.${encode(stableStringify(member))}`,
          true,
        );
      }
    } else {
      addNestedPreferenceValues(values, `${TRACKED_PREFIXES.prefs}${encode(key)}`, value);
    }
  }
  for (const [kind, prefix] of [
    ['customVerbs', TRACKED_PREFIXES.customVerbs],
    ['customAdjectives', TRACKED_PREFIXES.customAdjectives],
  ]) {
    for (const word of payload[kind] || [])
      values.set(`${prefix}${encode(wordIdentity(word))}`, word);
  }
  for (const list of payload.wordLists || []) {
    if (!list?.id) continue;
    const record = { ...list };
    delete record.wordKeys;
    delete record.words;
    values.set(`${TRACKED_PREFIXES.lists}${encode(list.id)}.record`, record);
    for (const key of list.wordKeys || list.words || []) {
      values.set(`${TRACKED_PREFIXES.lists}${encode(list.id)}.members.${encode(key)}`, true);
    }
  }
  if (payload.state?.practiceScope !== undefined) {
    values.set(TRACKED_PREFIXES.practiceScope, payload.state.practiceScope);
  }
  if (payload.state?.enabledTypes !== undefined) {
    values.set(TRACKED_PREFIXES.enabledTypes, payload.state.enabledTypes);
  }
  for (const key of payload.state?.reviewScope?.excludedWordKeys || []) {
    values.set(`${TRACKED_PREFIXES.excludedWords}${encode(key)}`, true);
  }
  for (const key of payload.state?.reviewScope?.excludedFormFamilyIds || []) {
    values.set(`${TRACKED_PREFIXES.excludedFamilies}${encode(key)}`, true);
  }
  for (const item of payload.state?.reviewScope?.recommendations || []) {
    if (item?.id) values.set(`${TRACKED_PREFIXES.recommendations}${encode(item.id)}`, item);
  }
  return values;
}

function normalizeClock(clock) {
  return clock && typeof clock === 'object'
    ? {
        deviceId: String(clock.deviceId || ''),
        revision: Math.max(0, Number(clock.revision) || 0),
        eventId: String(clock.eventId || ''),
      }
    : null;
}

function normalizePendingReset(pendingReset) {
  if (!pendingReset || typeof pendingReset !== 'object') return null;
  const eventId = String(pendingReset.eventId || '');
  const domains = [...new Set((pendingReset.domains || []).map(String).filter(Boolean))];
  const clock = normalizeClock(pendingReset.clock);
  if (!eventId || !domains.length || !clock) return null;
  return {
    eventId,
    domains,
    clock,
    ownerUserId: String(pendingReset.ownerUserId || ''),
  };
}

export function pendingSyncResetIntent(payloadOrMeta, expectedUserId = '') {
  const meta = payloadOrMeta?.syncMeta || payloadOrMeta;
  const pendingReset = normalizePendingReset(meta?.pendingReset);
  if (pendingReset?.ownerUserId && expectedUserId && pendingReset.ownerUserId !== expectedUserId) {
    return null;
  }
  return pendingReset;
}

export function clearPendingSyncReset(payloadValue, eventId) {
  const pendingReset = pendingSyncResetIntent(payloadValue);
  if (!pendingReset || pendingReset.eventId !== eventId) return payloadValue;
  return {
    ...payloadValue,
    syncMeta: { ...payloadValue.syncMeta, pendingReset: null },
  };
}

export function bindPendingSyncReset(payloadValue, ownerUserId) {
  const pendingReset = pendingSyncResetIntent(payloadValue);
  const owner = String(ownerUserId || '');
  if (!pendingReset || !owner || pendingReset.ownerUserId) return payloadValue;
  return {
    ...payloadValue,
    syncMeta: {
      ...payloadValue.syncMeta,
      pendingReset: { ...pendingReset, ownerUserId: owner },
    },
  };
}

export function assertPendingSyncResetOwner(payloadOrMeta, expectedUserId) {
  const pendingReset = pendingSyncResetIntent(payloadOrMeta);
  const expectedOwner = String(expectedUserId || '');
  if (pendingReset?.ownerUserId && expectedOwner && pendingReset.ownerUserId !== expectedOwner) {
    throw Object.assign(new Error('Pending reset belongs to a different sync account'), {
      code: 'SYNC_OWNER_MISMATCH',
    });
  }
  return pendingReset;
}

export function stripPendingSyncReset(payloadValue) {
  if (!payloadValue?.syncMeta?.pendingReset) return payloadValue;
  return {
    ...payloadValue,
    syncMeta: { ...payloadValue.syncMeta, pendingReset: null },
  };
}

export function compareSyncClocks(left, right) {
  const a = normalizeClock(left);
  const b = normalizeClock(right);
  if (!a) return b ? -1 : 0;
  if (!b) return 1;
  if (a.revision !== b.revision) return a.revision - b.revision;
  const device = compareText(a.deviceId, b.deviceId);
  if (device) return device;
  return compareText(a.eventId, b.eventId);
}

function newerClock(left, right) {
  return compareSyncClocks(left, right) >= 0 ? left : right;
}

function effectivePathState(meta, path) {
  const liveClock = meta?.clocks?.[path];
  const tombstoneClock = meta?.tombstones?.[path];
  const comparison = compareSyncClocks(liveClock, tombstoneClock);
  if (comparison > 0) return { kind: 'live', clock: liveClock };
  if (comparison < 0) return { kind: 'deleted', clock: tombstoneClock };
  if (tombstoneClock) return { kind: 'deleted', clock: tombstoneClock };
  return liveClock ? { kind: 'live', clock: liveClock } : { kind: '', clock: null };
}

export function createSyncMeta(deviceId = getLocalSyncDeviceId()) {
  return {
    version: SYNC_META_VERSION,
    deviceId,
    revision: 0,
    clocks: {},
    tombstones: {},
    resetEpochs: {},
    guideCounters: {},
    guideCounterClocks: {},
    pendingReset: null,
    legacyAdopted: false,
  };
}

function normalizeMeta(meta, deviceId) {
  const base = createSyncMeta(deviceId || meta?.deviceId || getLocalSyncDeviceId());
  return {
    ...base,
    ...(meta || {}),
    deviceId: deviceId || meta?.deviceId || base.deviceId,
    revision: Math.max(0, Number(meta?.revision) || 0),
    clocks: { ...(meta?.clocks || {}) },
    tombstones: { ...(meta?.tombstones || {}) },
    resetEpochs: { ...(meta?.resetEpochs || {}) },
    guideCounters: { ...(meta?.guideCounters || {}) },
    guideCounterClocks: { ...(meta?.guideCounterClocks || {}) },
    pendingReset: normalizePendingReset(meta?.pendingReset),
  };
}

/**
 * @param {any} payload
 * @param {string} [deviceId]
 * @returns {any}
 */
export function adoptSyncMetadata(payload = {}, deviceId = '') {
  if (payload.syncMeta?.version === SYNC_META_VERSION) {
    const meta = normalizeMeta(payload.syncMeta, deviceId || payload.syncMeta.deviceId);
    const guide = payload.state?.guide
      ? { ...payload.state.guide, recent: normalizeRecent(payload.state.guide.recent) }
      : payload.state?.guide;
    return {
      ...payload,
      state: { ...(payload.state || {}), ...(guide ? { guide } : {}) },
      syncMeta: meta,
    };
  }

  const legacyDeviceId = `legacy:${hashValue({
    customVerbs: payload.customVerbs,
    customAdjectives: payload.customAdjectives,
    wordLists: payload.wordLists,
    practicePrefs: payload.practicePrefs,
    practiceScope: payload.state?.practiceScope,
    reviewScope: payload.state?.reviewScope,
  })}`;
  const clock = { deviceId: legacyDeviceId, revision: 1, eventId: `${legacyDeviceId}:adopt` };
  const clocks = {};
  const defaultPrefValues = trackedSnapshot({ practicePrefs: DEFAULT_PREFS });
  for (const [path, value] of trackedSnapshot(payload)) {
    const isUnchangedDefaultPref =
      path.startsWith(TRACKED_PREFIXES.prefs) &&
      defaultPrefValues.has(path) &&
      stableStringify(defaultPrefValues.get(path)) === stableStringify(value);
    if (!isUnchangedDefaultPref) clocks[path] = clock;
  }
  const guide = payload.state?.guide
    ? { ...payload.state.guide, recent: normalizeRecent(payload.state.guide.recent) }
    : payload.state?.guide;
  return {
    ...payload,
    state: { ...(payload.state || {}), ...(guide ? { guide } : {}) },
    syncMeta: {
      ...createSyncMeta(deviceId || getLocalSyncDeviceId()),
      revision: 1,
      clocks,
      guideCounters: (Number(guide?.attempted) || 0) > 0 ? { legacy: guideTotals(guide) } : {},
      guideCounterClocks: (Number(guide?.attempted) || 0) > 0 ? { legacy: clock } : {},
      legacyAdopted: true,
    },
  };
}

export function stampSyncChanges(metaValue, before = {}, after = {}, options = {}) {
  const meta = normalizeMeta(metaValue);
  const beforeValues = trackedSnapshot(before);
  const afterValues = trackedSnapshot(after);
  const paths = new Set([...beforeValues.keys(), ...afterValues.keys()]);
  const changed = [...paths].filter(
    (path) => stableStringify(beforeValues.get(path)) !== stableStringify(afterValues.get(path)),
  );
  const guideChange = guideDelta(before.state?.guide, after.state?.guide);
  const resetDomains = [...new Set(options.resetDomains || [])];
  if (!changed.length && !hasGuideDelta(guideChange) && !resetDomains.length) {
    return metaValue || meta;
  }

  const revision = meta.revision + 1;
  const clock = { deviceId: meta.deviceId, revision, eventId: createSyncEventId() };
  const clocks = { ...meta.clocks };
  const tombstones = { ...meta.tombstones };
  for (const path of changed) {
    if (afterValues.has(path)) {
      clocks[path] = clock;
      delete tombstones[path];
    } else {
      tombstones[path] = clock;
      delete clocks[path];
    }
  }
  const resetsGuide = resetDomains.includes('progress') || resetDomains.includes('factory');
  const guideCounters = resetsGuide ? {} : { ...meta.guideCounters };
  const guideCounterClocks = resetsGuide ? {} : { ...meta.guideCounterClocks };
  if (hasGuideDelta(guideChange)) {
    guideCounters[meta.deviceId] = addGuideTotals(guideCounters[meta.deviceId], guideChange);
    guideCounterClocks[meta.deviceId] = clock;
  }
  const resetEpochs = { ...meta.resetEpochs };
  for (const domain of resetDomains) resetEpochs[domain] = clock;
  const previousPendingReset = normalizePendingReset(meta.pendingReset);
  const nextPendingOwnerUserId = String(
    options.pendingResetOwnerUserId || previousPendingReset?.ownerUserId || '',
  );
  const pendingOwnersAreCompatible =
    !previousPendingReset?.ownerUserId ||
    !nextPendingOwnerUserId ||
    previousPendingReset.ownerUserId === nextPendingOwnerUserId;
  const pendingResetDomains = pendingOwnersAreCompatible
    ? [...new Set([...(previousPendingReset?.domains || []), ...resetDomains])]
    : resetDomains;
  const pendingReset = resetDomains.length
    ? {
        eventId: clock.eventId,
        domains: pendingResetDomains,
        clock,
        ownerUserId: nextPendingOwnerUserId,
      }
    : meta.pendingReset;
  return {
    ...meta,
    revision,
    clocks,
    tombstones,
    resetEpochs,
    guideCounters,
    guideCounterClocks,
    pendingReset,
    legacyAdopted: true,
  };
}

function mergeCounterMaps(leftMeta, rightMeta) {
  const left = leftMeta.guideCounters || {};
  const right = rightMeta.guideCounters || {};
  const merged = {};
  for (const deviceId of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const a = guideTotals(left[deviceId]);
    const b = guideTotals(right[deviceId]);
    const clockComparison = compareSyncClocks(
      leftMeta.guideCounterClocks?.[deviceId],
      rightMeta.guideCounterClocks?.[deviceId],
    );
    if (clockComparison > 0) {
      merged[deviceId] = a;
      continue;
    }
    if (clockComparison < 0) {
      merged[deviceId] = b;
      continue;
    }
    const next = guideTotals();
    for (const key of ['attempted', 'correct', 'assisted']) next[key] = Math.max(a[key], b[key]);
    for (const stepId of ['base', 'group', 'answer']) {
      for (const key of ['attempted', 'correct', 'assisted']) {
        next.byStep[stepId][key] = Math.max(a.byStep[stepId][key], b.byStep[stepId][key]);
      }
    }
    merged[deviceId] = next;
  }
  return merged;
}

export function mergeSyncMetadata(leftValue, rightValue, deviceId = '') {
  const left = normalizeMeta(leftValue, deviceId || leftValue?.deviceId);
  const right = normalizeMeta(rightValue, deviceId || left.deviceId);
  const mergeClockMap = (a, b) => {
    const merged = {};
    for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
      merged[key] = newerClock(a?.[key], b?.[key]);
    }
    return merged;
  };
  const clocks = {};
  const tombstones = {};
  const paths = new Set([
    ...Object.keys(left.clocks || {}),
    ...Object.keys(left.tombstones || {}),
    ...Object.keys(right.clocks || {}),
    ...Object.keys(right.tombstones || {}),
  ]);
  for (const path of paths) {
    const leftState = effectivePathState(left, path);
    const rightState = effectivePathState(right, path);
    const comparison = compareSyncClocks(leftState.clock, rightState.clock);
    const winner =
      comparison > 0
        ? leftState
        : comparison < 0
          ? rightState
          : leftState.kind === 'deleted' || rightState.kind === 'deleted'
            ? { kind: 'deleted', clock: leftState.clock || rightState.clock }
            : leftState.clock
              ? leftState
              : rightState;
    if (winner.kind === 'deleted') tombstones[path] = winner.clock;
    else if (winner.kind === 'live') clocks[path] = winner.clock;
  }
  return {
    ...left,
    version: SYNC_META_VERSION,
    deviceId: deviceId || left.deviceId,
    revision: Math.max(left.revision, right.revision),
    clocks,
    tombstones,
    resetEpochs: mergeClockMap(left.resetEpochs, right.resetEpochs),
    guideCounters: mergeCounterMaps(left, right),
    guideCounterClocks: mergeClockMap(left.guideCounterClocks, right.guideCounterClocks),
    legacyAdopted: !!(left.legacyAdopted || right.legacyAdopted),
  };
}

function domainForPath(path) {
  if (path.startsWith(TRACKED_PREFIXES.prefs)) {
    return path.startsWith(`${TRACKED_PREFIXES.prefs}${encode('wordListIds')}`)
      ? 'custom-content'
      : 'settings';
  }
  if (
    path.startsWith(TRACKED_PREFIXES.customVerbs) ||
    path.startsWith(TRACKED_PREFIXES.customAdjectives) ||
    path.startsWith(TRACKED_PREFIXES.lists)
  ) {
    return 'custom-content';
  }
  if (path === TRACKED_PREFIXES.practiceScope || path === TRACKED_PREFIXES.enabledTypes)
    return 'settings';
  return 'review';
}

function resetClockForDomain(meta, domain) {
  return newerClock(meta?.resetEpochs?.[domain], meta?.resetEpochs?.factory);
}

function clockRevision(clock) {
  return Math.max(0, Number(clock?.revision) || 0);
}

export function rebaseSyncReset(payloadValue, observedValue, resetDomains = []) {
  const domains = new Set(resetDomains || []);
  if (!domains.size || !observedValue) return payloadValue;

  const payload = adoptSyncMetadata(payloadValue, payloadValue?.syncMeta?.deviceId);
  const observed = adoptSyncMetadata(observedValue);
  const meta = normalizeMeta(payload.syncMeta, payload.syncMeta?.deviceId);
  const observedMeta = normalizeMeta(observed.syncMeta);
  const pendingReset = pendingSyncResetIntent(meta);
  const everyClock = [
    ...Object.values(meta.clocks),
    ...Object.values(meta.tombstones),
    ...Object.values(meta.resetEpochs),
    ...Object.values(meta.guideCounterClocks),
    ...Object.values(observedMeta.clocks),
    ...Object.values(observedMeta.tombstones),
    ...Object.values(observedMeta.resetEpochs),
    ...Object.values(observedMeta.guideCounterClocks),
  ];
  const resetRevision =
    Math.max(meta.revision, observedMeta.revision, ...everyClock.map(clockRevision)) + 1;
  const resetClock = {
    deviceId: meta.deviceId,
    revision: resetRevision,
    eventId: pendingReset?.eventId || createSyncEventId(),
  };
  const postResetClock = {
    deviceId: meta.deviceId,
    revision: resetRevision + 1,
    eventId: createSyncEventId(),
  };
  const clocks = { ...meta.clocks };
  const tombstones = { ...meta.tombstones };
  const payloadValues = trackedSnapshot(payload);
  const observedValues = trackedSnapshot(observed);
  const paths = new Set([
    ...payloadValues.keys(),
    ...observedValues.keys(),
    ...Object.keys(meta.clocks),
    ...Object.keys(meta.tombstones),
    ...Object.keys(observedMeta.clocks),
    ...Object.keys(observedMeta.tombstones),
  ]);
  let hasPostResetMutation = false;
  const domainIsReset = (domain, path = '') =>
    domains.has('factory') ||
    domains.has(domain) ||
    (domains.has('settings') &&
      path.startsWith(`${TRACKED_PREFIXES.prefs}${encode('wordListIds')}`));

  for (const path of paths) {
    const domain = domainForPath(path);
    if (!domainIsReset(domain, path)) continue;
    const oldReset = resetClockForDomain(meta, domain);
    const localState = effectivePathState(meta, path);
    const isPostReset =
      oldReset && localState.clock && compareSyncClocks(localState.clock, oldReset) > 0;
    if (isPostReset) {
      hasPostResetMutation = true;
      if (localState.kind === 'deleted') {
        tombstones[path] = postResetClock;
        delete clocks[path];
      } else {
        clocks[path] = postResetClock;
        delete tombstones[path];
      }
    } else if (payloadValues.has(path)) {
      clocks[path] = resetClock;
      delete tombstones[path];
    } else {
      tombstones[path] = resetClock;
      delete clocks[path];
    }
  }

  const guideCounterClocks = { ...meta.guideCounterClocks };
  if (domainIsReset('progress')) {
    const oldProgressReset = resetClockForDomain(meta, 'progress');
    for (const [replicaId, counterClock] of Object.entries(guideCounterClocks)) {
      if (oldProgressReset && compareSyncClocks(counterClock, oldProgressReset) > 0) {
        guideCounterClocks[replicaId] = postResetClock;
        hasPostResetMutation = true;
      }
    }
  }

  const resetEpochs = { ...meta.resetEpochs };
  for (const domain of domains) resetEpochs[domain] = resetClock;
  return {
    ...payload,
    syncMeta: {
      ...meta,
      revision: hasPostResetMutation ? postResetClock.revision : resetClock.revision,
      clocks,
      tombstones,
      resetEpochs,
      guideCounterClocks,
      pendingReset: pendingReset
        ? {
            ...pendingReset,
            domains: [...new Set([...pendingReset.domains, ...domains])],
            clock: resetClock,
          }
        : meta.pendingReset,
    },
  };
}

function effectivePathClock(meta, path) {
  return effectivePathState(meta, path).clock;
}

function pathWinner(path, local, cloud, localMeta, cloudMeta) {
  const domain = domainForPath(path);
  const localClock = effectivePathClock(localMeta, path);
  const cloudClock = effectivePathClock(cloudMeta, path);
  const localReset = resetClockForDomain(localMeta, domain);
  const cloudReset = resetClockForDomain(cloudMeta, domain);
  const localSuppressed =
    cloudReset &&
    (!localClock || compareSyncClocks(localClock, cloudReset) < 0 || !localMeta.legacyAdopted);
  const cloudSuppressed =
    localReset &&
    (!cloudClock || compareSyncClocks(cloudClock, localReset) < 0 || !cloudMeta.legacyAdopted);
  if (localSuppressed && !cloudSuppressed) return 'cloud';
  if (cloudSuppressed && !localSuppressed) return 'local';
  return compareSyncClocks(localClock, cloudClock) >= 0 ? 'local' : 'cloud';
}

function chooseTrackedValues(local, cloud, localMeta, cloudMeta) {
  const localValues = trackedSnapshot(local);
  const cloudValues = trackedSnapshot(cloud);
  const result = new Map();
  for (const path of new Set([
    ...localValues.keys(),
    ...cloudValues.keys(),
    ...Object.keys(localMeta.clocks || {}),
    ...Object.keys(cloudMeta.clocks || {}),
    ...Object.keys(localMeta.tombstones || {}),
    ...Object.keys(cloudMeta.tombstones || {}),
  ])) {
    const winner = pathWinner(path, local, cloud, localMeta, cloudMeta);
    const source = winner === 'local' ? localValues : cloudValues;
    const meta = winner === 'local' ? localMeta : cloudMeta;
    if (path.startsWith(TRACKED_PREFIXES.lists) && path.includes('.members.')) {
      const encodedId = path.slice(TRACKED_PREFIXES.lists.length).split('.')[0];
      const recordPath = `${TRACKED_PREFIXES.lists}${encodedId}.record`;
      const recordWinner = pathWinner(recordPath, local, cloud, localMeta, cloudMeta);
      const recordMeta = recordWinner === 'local' ? localMeta : cloudMeta;
      const recordState = effectivePathState(recordMeta, recordPath);
      const recordTombstone = recordState.kind === 'deleted' ? recordState.clock : null;
      const memberClock = effectivePathClock(meta, path);
      if (recordTombstone && compareSyncClocks(memberClock, recordTombstone) <= 0) continue;
    }
    if (source.has(path) && effectivePathState(meta, path).kind !== 'deleted') {
      result.set(path, source.get(path));
    }
  }
  return result;
}

function materializeTracked(base, values) {
  const next = { ...base, state: { ...(base.state || {}) } };
  const prefs = {};
  const prefSets = new Map();
  const verbs = [];
  const adjectives = [];
  const lists = new Map();
  const excludedWordKeys = [];
  const excludedFormFamilyIds = [];
  const recommendations = [];
  const setNestedPreference = (key, encodedPath, value) => {
    const root = isPlainObject(prefs[key]) ? prefs[key] : {};
    let target = root;
    for (const [index, encodedPart] of encodedPath.entries()) {
      const part = decode(encodedPart);
      if (index === encodedPath.length - 1) target[part] = value;
      else {
        target[part] = isPlainObject(target[part]) ? target[part] : {};
        target = target[part];
      }
    }
    prefs[key] = root;
  };
  for (const [path, value] of [...values].sort(([left], [right]) => compareText(left, right))) {
    if (path.startsWith(TRACKED_PREFIXES.prefs)) {
      const rest = path.slice(TRACKED_PREFIXES.prefs.length);
      const [encodedKey, kind, ...encodedParts] = rest.split('.');
      const key = decode(encodedKey);
      if (kind === 'members') {
        const members = prefSets.get(key) || [];
        members.push(JSON.parse(decode(encodedParts[0])));
        prefSets.set(key, members);
      } else if (kind === 'leaves') {
        setNestedPreference(key, encodedParts, value);
      } else {
        prefs[key] = value;
      }
    } else if (path.startsWith(TRACKED_PREFIXES.customVerbs)) verbs.push(value);
    else if (path.startsWith(TRACKED_PREFIXES.customAdjectives)) adjectives.push(value);
    else if (path.startsWith(TRACKED_PREFIXES.lists)) {
      const rest = path.slice(TRACKED_PREFIXES.lists.length);
      const [encodedId, kind, encodedMember] = rest.split('.');
      const id = decode(encodedId);
      const list = lists.get(id) || { id, record: { id }, members: [] };
      if (kind === 'record') list.record = value;
      if (kind === 'members') list.members.push(decode(encodedMember));
      lists.set(id, list);
    } else if (path === TRACKED_PREFIXES.practiceScope) next.state.practiceScope = value;
    else if (path === TRACKED_PREFIXES.enabledTypes) next.state.enabledTypes = value;
    else if (path.startsWith(TRACKED_PREFIXES.excludedWords))
      excludedWordKeys.push(decode(path.slice(TRACKED_PREFIXES.excludedWords.length)));
    else if (path.startsWith(TRACKED_PREFIXES.excludedFamilies))
      excludedFormFamilyIds.push(decode(path.slice(TRACKED_PREFIXES.excludedFamilies.length)));
    else if (path.startsWith(TRACKED_PREFIXES.recommendations)) recommendations.push(value);
  }
  for (const [key, members] of prefSets) {
    const defaultOrder = new Map(
      (Array.isArray(DEFAULT_PREFS[key]) ? DEFAULT_PREFS[key] : []).map((value, index) => [
        stableStringify(value),
        index,
      ]),
    );
    prefs[key] = members.sort((a, b) => {
      const left = stableStringify(a);
      const right = stableStringify(b);
      const leftIndex = defaultOrder.get(left);
      const rightIndex = defaultOrder.get(right);
      if (leftIndex !== undefined || rightIndex !== undefined) {
        if (leftIndex === undefined) return 1;
        if (rightIndex === undefined) return -1;
        return leftIndex - rightIndex;
      }
      return compareText(left, right);
    });
  }
  next.practicePrefs = prefs;
  next.customVerbs = verbs;
  next.customAdjectives = adjectives;
  next.wordLists = [...lists.values()].map(({ record, members }) => ({
    ...record,
    wordKeys: members,
  }));
  next.state.reviewScope = { excludedWordKeys, excludedFormFamilyIds, recommendations };
  return next;
}

function resetWinner(localMeta, cloudMeta, domain) {
  const localClock = newerClock(localMeta.resetEpochs?.[domain], localMeta.resetEpochs?.factory);
  const cloudClock = newerClock(cloudMeta.resetEpochs?.[domain], cloudMeta.resetEpochs?.factory);
  const comparison = compareSyncClocks(localClock, cloudClock);
  return comparison === 0 ? '' : comparison > 0 ? 'local' : 'cloud';
}

function guideFromMeta(meta, localGuide, cloudGuide, progressWinner = '') {
  let totals = guideTotals();
  const resetClock = newerClock(meta.resetEpochs?.progress, meta.resetEpochs?.factory);
  for (const [deviceId, value] of Object.entries(meta.guideCounters || {})) {
    const counterClock = meta.guideCounterClocks?.[deviceId];
    if (resetClock && compareSyncClocks(counterClock, resetClock) <= 0) continue;
    totals = addGuideTotals(totals, value);
  }
  const recentById = new Map();
  const recentRows =
    progressWinner === 'local'
      ? normalizeRecent(localGuide?.recent)
      : progressWinner === 'cloud'
        ? normalizeRecent(cloudGuide?.recent)
        : [...normalizeRecent(cloudGuide?.recent), ...normalizeRecent(localGuide?.recent)];
  for (const row of recentRows) {
    recentById.set(row.id, row);
  }
  return {
    ...totals,
    recent: [...recentById.values()]
      .sort((a, b) => (b.at || 0) - (a.at || 0) || compareText(a.id, b.id))
      .slice(0, 20),
  };
}

export function mergeSyncSidecar(localValue, cloudValue, mergedBase, deviceId = '') {
  const local = adoptSyncMetadata(localValue, deviceId || localValue?.syncMeta?.deviceId);
  const cloud = adoptSyncMetadata(cloudValue);
  const syncMeta = mergeSyncMetadata(
    local.syncMeta,
    cloud.syncMeta,
    deviceId || local.syncMeta.deviceId,
  );
  let next = materializeTracked(
    mergedBase,
    chooseTrackedValues(local, cloud, local.syncMeta, cloud.syncMeta),
  );
  const progressWinner = resetWinner(local.syncMeta, cloud.syncMeta, 'progress');
  if (progressWinner) {
    const source = progressWinner === 'local' ? local.state || {} : cloud.state || {};
    next = { ...next, state: { ...next.state } };
    for (const field of PROGRESS_FIELDS) next.state[field] = source[field];
  }
  next.state = {
    ...next.state,
    guide: guideFromMeta(syncMeta, local.state?.guide, cloud.state?.guide, progressWinner),
  };
  return { ...next, syncMeta };
}

export function resetDomainsForKind(kind) {
  if (kind === 'factory') return ['factory', 'progress', 'settings', 'custom-content', 'review'];
  if (kind === 'custom-content') return ['custom-content'];
  return [kind];
}
