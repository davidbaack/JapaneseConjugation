import { ALL_CARD_TYPES } from '../data/conjugationTypes.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { validateProgressContributionsState } from './progressContributions.js';
import { progressEpoch } from './syncMetadata.js';

const TYPE_IDS = new Set(['dictionary', ...ALL_CARD_TYPES.map((type) => type.id)]);
const STRING_KEYS = new Set([
  'dict',
  'reading',
  'meaning',
  'group',
  'label',
  'hint',
  'feedback',
  'detail',
  'userAnswer',
  'expected',
  'typeId',
  'cardId',
  'wordKey',
  'patternId',
]);
const STATE_OBJECTS = [
  'cards',
  'verbStats',
  'shadow',
  'ambient',
  'game',
  'onbin',
  'register',
  'readiness',
  'meaning',
  'mock',
  'reader',
  'production',
  'guide',
  'transformation',
  'minimalPairs',
  'reference',
  'reviewScope',
  'practiceSelection',
  'practiceStats',
  'weakness',
  'session',
  'classify',
];
const STATE_ARRAYS = ['retryQueue', 'mistakes', 'enabledTypes'];
const ARRAY_KEYS = new Set([
  'retryQueue',
  'mistakes',
  'enabledTypes',
  'recent',
  'recentOutcomes',
  'history',
  'recentSearches',
  'weakRules',
  'excludedWordKeys',
  'excludedFormFamilyIds',
  'recommendations',
  'selectedCategoryIds',
  'selectedTypeIds',
  'wordKeys',
  'typeIds',
]);
const OBJECT_KEYS = new Set([
  'byType',
  'byWord',
  'byPattern',
  'byVerb',
  'byScenario',
  'byGroup',
  'bySkill',
  'byStep',
  'bySource',
  'byTarget',
  'byPair',
  'byDirection',
  'bySet',
  'byContrast',
  'byRule',
  'byLane',
  'byDate',
  'byMode',
  'lifetime',
  'wordSeen',
  'mistakePatterns',
  'sourceTypeStats',
  'selectedTypeIdsByCategory',
  'selectedTypeIdsByTopic',
  'filters',
]);
const NUMBER_KEYS = new Set([
  'attempted',
  'assisted',
  'incorrect',
  'reps',
  'interval',
  'ease',
  'nextReview',
  'lastSeen',
  'recentMiss',
  'createdAt',
  'addedAt',
  'selectedAt',
  'lastAt',
  'at',
  'startedAt',
  'reviewed',
  'skipped',
  'currentStreak',
  'bestStreak',
  'streak',
  'hints',
  'responseMs',
  'totalResponseMs',
  'correctResponseMs',
  'fastCorrect',
  'fastestMs',
  'lastMs',
  'played',
  'sessions',
  'taken',
  'bestScore',
  'bestCombo',
  'bestPct',
  'lastPct',
  'lastScore',
  'lastTotal',
  'chars',
  'encounters',
  'totalRating',
  'count',
  'seen',
  'suggestedCount',
]);

export function learnerDataError(message) {
  return Object.assign(new Error(message), { code: 'LEARNER_DATA_INVALID' });
}

export function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

function requireValue(test, path, expected) {
  if (!test) throw learnerDataError(`${path}: expected ${expected}.`);
}

export function validateSafeJson(value, { allowUndefined = false } = {}) {
  let nodes = 0;
  function visit(item, depth) {
    requireValue(++nodes <= 500000 && depth <= 40, 'Backup', 'a bounded JSON snapshot');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      requireValue(Number.isFinite(item), 'Backup number', 'a finite number');
      return;
    }
    requireValue(Array.isArray(item) || isRecord(item), 'Backup value', 'JSON data');
    for (const [key, child] of Object.entries(item)) {
      requireValue(
        !['__proto__', 'prototype', 'constructor'].includes(key),
        'Backup key',
        'a safe property name',
      );
      if (allowUndefined && child === undefined && !Array.isArray(item)) continue;
      visit(child, depth + 1);
    }
  }
  visit(value, 0);
}

function validateProgressTree(value, path) {
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const location = `${path}.${key}`;
    if (
      child !== undefined &&
      STRING_KEYS.has(key) &&
      (Object.hasOwn(value, 'dict') ||
        [
          'label',
          'hint',
          'feedback',
          'detail',
          'userAnswer',
          'expected',
          'cardId',
          'wordKey',
          'patternId',
        ].includes(key))
    )
      requireValue(typeof child === 'string', location, 'text');
    if (ARRAY_KEYS.has(key)) requireValue(Array.isArray(child), location, 'an array');
    if (OBJECT_KEYS.has(key)) requireValue(isRecord(child), location, 'an object');
    if (['recent', 'mistakes', 'history', 'weakRules', 'recommendations'].includes(key)) {
      requireValue(child.every(isRecord), location, 'object entries');
    }
    if (
      [
        'retryQueue',
        'enabledTypes',
        'recentSearches',
        'excludedWordKeys',
        'excludedFormFamilyIds',
        'selectedCategoryIds',
        'selectedTypeIds',
        'wordKeys',
        'typeIds',
      ].includes(key)
    ) {
      requireValue(
        child.every((entry) => typeof entry === 'string'),
        location,
        'text entries',
      );
    }
    if (key === 'recentOutcomes')
      requireValue(
        child.every(
          (entry) =>
            isRecord(entry) &&
            ['correct', 'missed', 'skipped'].includes(entry.kind) &&
            typeof entry.cardId === 'string' &&
            typeof entry.label === 'string' &&
            typeof entry.at === 'number',
        ),
        location,
        'practice outcome entries',
      );
    if (OBJECT_KEYS.has(key)) {
      if (key === 'wordSeen')
        requireValue(
          Object.values(child).every(
            (entry) => typeof entry === 'number' && Number.isFinite(entry) && entry >= 0,
          ),
          location,
          'numeric counters',
        );
      else if (['selectedTypeIdsByCategory', 'selectedTypeIdsByTopic'].includes(key))
        requireValue(
          Object.values(child).every(
            (entry) => Array.isArray(entry) && entry.every((id) => typeof id === 'string'),
          ),
          location,
          'arrays of form identifiers',
        );
      else if (!['lifetime', 'filters'].includes(key))
        requireValue(Object.values(child).every(isRecord), location, 'object entries');
    }
    if (
      NUMBER_KEYS.has(key) &&
      child !== null &&
      !(key === 'assisted' && typeof child === 'boolean' && !Object.hasOwn(value, 'attempted'))
    )
      requireValue(
        typeof child === 'number' && Number.isFinite(child) && child >= 0,
        location,
        'a nonnegative number',
      );
    if (key === 'correct')
      requireValue(
        (typeof child === 'boolean' && !Object.hasOwn(value, 'attempted')) ||
          (typeof child === 'number' && Number.isFinite(child) && child >= 0),
        location,
        'a counter or an outcome',
      );
    if (typeof value.attempted === 'number' && typeof value.correct === 'number')
      requireValue(value.correct <= value.attempted, path, 'correct no greater than attempted');
    if (Array.isArray(child))
      child.forEach((row, index) => validateProgressTree(row, `${location}[${index}]`));
    else validateProgressTree(child, location);
  }
}

export function validateLearnerState(source, { allowMissingFields = true } = {}) {
  validateSafeJson(source, { allowUndefined: allowMissingFields });
  requireValue(isRecord(source), 'Learner state', 'an object');
  requireValue(source.schemaVersion === 4, 'Learner state schema', 'supported version 4');
  if (!allowMissingFields || Object.hasOwn(source, 'cards'))
    requireValue(isRecord(source.cards), 'Learner state cards', 'an object');
  for (const key of STATE_OBJECTS) {
    if (!allowMissingFields || Object.hasOwn(source, key))
      requireValue(isRecord(source[key]), `state.${key}`, 'an object');
  }
  for (const key of STATE_ARRAYS) {
    if (!allowMissingFields || Object.hasOwn(source, key))
      requireValue(Array.isArray(source[key]), `state.${key}`, 'an array');
  }
  for (const [id, card] of Object.entries(source.cards || {})) {
    // Stored current snapshots can contain historical synthetic identifiers;
    // imports require current identities before replacement is authorized.
    if (!allowMissingFields)
      requireValue(
        /^(verb|i-adjective|na-adjective):[^:|]+:[^:|]+:[^|]+\|[^|]+$/.test(id) &&
          TYPE_IDS.has(id.slice(id.lastIndexOf('|') + 1)),
        `Card ${id}`,
        'a current word and form identifier',
      );
    requireValue(isRecord(card), `Card ${id}`, 'an object');
    for (const [key, value] of Object.entries(card)) {
      if (NUMBER_KEYS.has(key) || key === 'correct')
        requireValue(
          typeof value === 'number' && Number.isFinite(value) && value >= 0,
          `Card ${id}.${key}`,
          'a nonnegative number',
        );
    }
    if (!allowMissingFields)
      for (const key of [
        'ease',
        'interval',
        'reps',
        'nextReview',
        'correct',
        'incorrect',
        'lastSeen',
      ])
        requireValue(typeof card[key] === 'number', `Card ${id}.${key}`, 'a number');
  }
  if (source.retryQueue)
    requireValue(
      source.retryQueue.every((id) => typeof id === 'string'),
      'Retry queue',
      'card identifiers',
    );
  if (source.enabledTypes && !allowMissingFields)
    requireValue(
      source.enabledTypes.every((id) => TYPE_IDS.has(id)),
      'Enabled forms',
      'supported form identifiers',
    );
  validateProgressTree(source, 'state');
  if (!allowMissingFields) {
    const totals = (row, path) => {
      requireValue(isRecord(row), path, 'statistics');
      for (const key of ['attempted', 'correct', 'responseMs'])
        requireValue(
          typeof row[key] === 'number' && row[key] >= 0,
          `${path}.${key}`,
          'a saved nonnegative counter',
        );
      requireValue(row.correct <= row.attempted, path, 'correct no greater than attempted');
      for (const [mode, value] of Object.entries(row.byMode || {}))
        totals(value, `${path}.byMode.${mode}`);
    };
    totals(source.practiceStats.lifetime, 'state.practiceStats.lifetime');
    for (const key of ['byType', 'byDate'])
      for (const [id, row] of Object.entries(source.practiceStats[key]))
        totals(row, `state.practiceStats.${key}.${id}`);
    for (const row of source.practiceStats.recent)
      requireValue(
        typeof row.correct === 'boolean' &&
          typeof row.at === 'number' &&
          typeof row.responseMs === 'number' &&
          typeof row.mode === 'string' &&
          TYPE_IDS.has(row.typeId),
        'Practice history',
        'complete answer outcomes',
      );
    for (const row of source.guide.recent)
      requireValue(
        typeof row.correct === 'boolean' &&
          typeof row.assisted === 'boolean' &&
          typeof row.at === 'number',
        'Guide history',
        'complete answer outcomes',
      );
    for (const row of source.mistakes)
      requireValue(
        ['dict', 'reading', 'group', 'type', 'userAnswer', 'expected'].every(
          (key) => typeof row[key] === 'string',
        ),
        'Mistake history',
        'complete mistake entries',
      );
    for (const row of source.reference.history)
      requireValue(
        ['dict', 'reading', 'group'].every((key) => typeof row[key] === 'string'),
        'Reference history',
        'complete words',
      );
  }
}

// A normalizer must never silently discard imported evidence. New defaults may
// be added, but each value the file actually supplied must survive restoration.
export function validatePreservedSnapshot(original, normalized, path = 'state') {
  if (Array.isArray(original)) {
    requireValue(
      Array.isArray(normalized) && original.length === normalized.length,
      path,
      'history that can be restored completely',
    );
    original.forEach((value, index) =>
      validatePreservedSnapshot(value, normalized[index], `${path}[${index}]`),
    );
  } else if (isRecord(original)) {
    requireValue(isRecord(normalized), path, 'restorable data');
    for (const [key, value] of Object.entries(original))
      validatePreservedSnapshot(value, normalized[key], `${path}.${key}`);
  } else requireValue(original === normalized, path, 'a value supported by this app without loss');
}

export function validateSnapshotShape(source, template, path = 'state') {
  for (const [key, example] of Object.entries(template)) {
    const value = source[key];
    const location = `${path}.${key}`;
    requireValue(Object.hasOwn(source, key), location, 'a saved field');
    if (Array.isArray(example)) requireValue(Array.isArray(value), location, 'an array');
    else if (isRecord(example)) {
      requireValue(isRecord(value), location, 'an object');
      validateSnapshotShape(value, example, location);
    } else if (example !== null)
      requireValue(typeof value === typeof example, location, `a ${typeof example}`);
  }
}

export function validateBackupContent(data, options = {}) {
  validateSafeJson(data, options);
  for (const key of ['customVerbs', 'customAdjectives', 'wordLists'])
    requireValue(Array.isArray(data[key]), key, 'an array');
  const groups = new Set([
    'ichidan',
    'godan',
    'suru',
    'kuru',
    'i-adjective',
    'na-adjective',
    'irregular-adjective',
    'noun',
  ]);
  for (const key of ['customVerbs', 'customAdjectives']) {
    for (const word of data[key])
      requireValue(
        isRecord(word) &&
          ['dict', 'reading', 'meaning', 'group'].every(
            (field) => typeof word[field] === 'string',
          ) &&
          !!word.dict.trim() &&
          !!word.reading.trim() &&
          groups.has(word.group),
        key,
        'complete custom words',
      );
  }
  const listIds = new Set();
  for (const list of data.wordLists) {
    requireValue(
      isRecord(list) &&
        typeof list.id === 'string' &&
        !!list.id &&
        !listIds.has(list.id) &&
        typeof list.name === 'string' &&
        Array.isArray(list.wordKeys) &&
        list.wordKeys.every((key) => typeof key === 'string'),
      'Word list',
      'a unique id, name, and word keys',
    );
    listIds.add(list.id);
  }
  requireValue(isRecord(data.practicePrefs), 'Practice preferences', 'an object');
  for (const [key, value] of Object.entries(data.practicePrefs)) {
    if (!Object.hasOwn(DEFAULT_PREFS, key) || DEFAULT_PREFS[key] === null) continue;
    const expected = DEFAULT_PREFS[key];
    requireValue(
      Array.isArray(expected)
        ? Array.isArray(value) &&
            value.every((item) =>
              ['genkiLessons', 'minnaLessons'].includes(key)
                ? (typeof item === 'number' || typeof item === 'string') &&
                  Number.isInteger(Number(item)) &&
                  Number(item) >= 0
                : typeof item === 'string',
            )
        : isRecord(expected)
          ? isRecord(value)
          : typeof value === typeof expected,
      `Preference ${key}`,
      'a value of the supported type',
    );
  }
  for (const key of ['displayScripts', 'autoAdvanceCorrectByAnswerForm'])
    if (data.practicePrefs[key])
      requireValue(
        Object.values(data.practicePrefs[key]).every((value) => typeof value === 'boolean'),
        `Preference ${key}`,
        'boolean values',
      );
}

export function validateLearnerBundle(data) {
  requireValue(isRecord(data), 'Saved learner data', 'an object');
  validateLearnerState(data.state);
  if (data.syncMeta) {
    requireValue([1, 2].includes(data.syncMeta.version), 'Sync metadata', 'a supported protocol');
    if (data.syncMeta.version === 2)
      validateProgressContributionsState(
        data.state,
        data.syncMeta.progressContributions,
        progressEpoch(data.syncMeta),
      );
  }
  validateBackupContent(
    {
      ...data,
      customVerbs: Object.hasOwn(data, 'customVerbs') ? data.customVerbs : [],
      customAdjectives: Object.hasOwn(data, 'customAdjectives') ? data.customAdjectives : [],
      wordLists: Object.hasOwn(data, 'wordLists') ? data.wordLists : [],
      practicePrefs: Object.hasOwn(data, 'practicePrefs') ? data.practicePrefs : {},
    },
    { allowUndefined: true },
  );
}
