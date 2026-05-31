import { ALL_CARD_TYPES, getTypeInfo } from '../data/conjugationTypes.js';
import { compatibleTypes, conjugateItem, isAdjective, wordKey } from './conjugator.js';
import { toHiragana } from './romaji.js';

const K = {
  U: '\u3046',
  KU: '\u304f',
  GU: '\u3050',
  SU: '\u3059',
  TSU: '\u3064',
  NU: '\u306c',
  BU: '\u3076',
  MU: '\u3080',
  RU: '\u308b',
  I: '\u3044',
  KI: '\u304d',
  YO: '\u3088',
  IKU: '\u3044\u304f',
  II: '\u3044\u3044',
  YOI_KANJI: '\u826f\u3044',
};

const ONBIN_TAILS = {
  'te-form': {
    utsuru: '\u3063\u3066',
    mnb: '\u3093\u3067',
    ku: '\u3044\u3066',
    gu: '\u3044\u3067',
    su: '\u3057\u3066',
    iku: '\u3063\u3066',
    ichidan: '\u3066',
  },
  'plain-past': {
    utsuru: '\u3063\u305f',
    mnb: '\u3093\u3060',
    ku: '\u3044\u305f',
    gu: '\u3044\u3060',
    su: '\u3057\u305f',
    iku: '\u3063\u305f',
    ichidan: '\u305f',
  },
};

const ONBIN_LABELS = {
  utsuru: 'u/tsu/ru',
  mnb: 'mu/bu/nu',
  ku: 'ku',
  gu: 'gu',
  su: 'su',
  iku: 'iku exception',
  ichidan: 'ichidan ru',
};

const GROUP_LABELS = {
  ichidan: 'ichidan',
  godan: 'godan',
  suru: 'suru irregular',
  kuru: 'kuru irregular',
  'i-adjective': 'i-adjective',
  'na-adjective': 'na-adjective',
};

const CATEGORY_LABELS = {
  'source-form-repeated': 'Source form repeated',
  'politeness-mismatch': 'Politeness mismatch',
  'polarity-mismatch': 'Negative/affirmative mismatch',
  'tense-mismatch': 'Tense mismatch',
  'wrong-target-form': 'Wrong target form',
  'verb-group-confusion': 'Verb group confusion',
  'adjective-type-confusion': 'Adjective type confusion',
  'godan-sound-change': 'Godan sound-change confusion',
  'irregular-exception': 'Irregular exception',
};

const ALL_TYPE_IDS = new Set(ALL_CARD_TYPES.map((t) => t.id));

function safeConjugate(item, typeId) {
  if (!item || !typeId) return '';
  try {
    return conjugateItem(item, typeId) || '';
  } catch {
    return '';
  }
}

function normalizeAnswer(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  if (text === '(revealed)' || text === '--' || text.toLowerCase().startsWith('self-check:')) {
    return '';
  }
  return toHiragana(text).trim();
}

function formFeatures(typeId) {
  const text = String(typeId || '').toLowerCase();
  return {
    polite: text.includes('polite'),
    negative: text.includes('negative'),
    past: text.includes('past'),
  };
}

function patternKey(category, typeId) {
  return `${category}:${typeId}`;
}

function diagnosis({
  category,
  patternId,
  label,
  feedback,
  detail = '',
  item,
  type,
  guessedType = null,
  repairTypeIds = [],
  repairScope = null,
}) {
  return {
    category,
    patternId,
    label,
    feedback,
    detail,
    targetType: type,
    guessedType,
    repairTypeIds: [...new Set(repairTypeIds.filter((id) => ALL_TYPE_IDS.has(id)))],
    repairScope,
    exampleWordKey: item ? wordKey(item) : null,
  };
}

function sourceFormDiagnosis(item, type, promptType, got) {
  const source = promptType ? safeConjugate(item, promptType) : item?.reading || '';
  if (!source || got !== source || promptType === type) return null;
  const sourceLabel = promptType ? getTypeInfo(promptType).label.toLowerCase() : 'dictionary form';
  const targetLabel = getTypeInfo(type).label.toLowerCase();
  return diagnosis({
    category: 'source-form-repeated',
    patternId: patternKey('source-form-repeated', type),
    label: `Source form repeated: ${getTypeInfo(type).label}`,
    feedback: `You kept the ${sourceLabel}, but the prompt asked for ${targetLabel}.`,
    item,
    type,
    guessedType: promptType || 'dictionary',
    repairTypeIds: [type],
    repairScope: { groupIds: [item.group] },
  });
}

function exactWrongTypeDiagnosis(item, type, got) {
  for (const t of compatibleTypes(item)) {
    if (t.id === type) continue;
    if (safeConjugate(item, t.id) !== got) continue;
    const targetInfo = getTypeInfo(type);
    const guessedInfo = getTypeInfo(t.id);
    const target = formFeatures(type);
    const guessed = formFeatures(t.id);
    let category = 'wrong-target-form';
    if (target.polite !== guessed.polite && target.negative === guessed.negative) {
      category = 'politeness-mismatch';
    } else if (target.negative !== guessed.negative) {
      category = 'polarity-mismatch';
    } else if (target.past !== guessed.past) {
      category = 'tense-mismatch';
    }
    return diagnosis({
      category,
      patternId: patternKey(category, type),
      label: `${CATEGORY_LABELS[category]}: ${targetInfo.label}`,
      feedback: `You made ${guessedInfo.label.toLowerCase()}, but the prompt asked for ${targetInfo.label.toLowerCase()}.`,
      item,
      type,
      guessedType: t.id,
      repairTypeIds: [type],
      repairScope: { groupIds: [item.group] },
    });
  }
  return null;
}

function alternateGroupDiagnosis(item, type, got) {
  if (isAdjective(item)) {
    const otherGroup = item.group === 'i-adjective' ? 'na-adjective' : 'i-adjective';
    const alt = safeConjugate({ ...item, group: otherGroup }, type);
    if (alt && alt === got) {
      return diagnosis({
        category: 'adjective-type-confusion',
        patternId: `adjective-type:${item.group}:${type}`,
        label: `${CATEGORY_LABELS['adjective-type-confusion']}: ${getTypeInfo(type).label}`,
        feedback: `You used the ${GROUP_LABELS[otherGroup]} pattern, but this word is ${GROUP_LABELS[item.group]}.`,
        item,
        type,
        repairTypeIds: [type],
        repairScope: { groupIds: [item.group] },
      });
    }
    return null;
  }

  for (const otherGroup of ['ichidan', 'godan'].filter((group) => group !== item.group)) {
    const alt = safeConjugate({ ...item, group: otherGroup }, type);
    if (!alt || alt !== got) continue;
    return diagnosis({
      category: 'verb-group-confusion',
      patternId: `verb-group:${item.group}:${type}`,
      label: `${CATEGORY_LABELS['verb-group-confusion']}: ${getTypeInfo(type).label}`,
      feedback: `You conjugated this as ${GROUP_LABELS[otherGroup]}, but this word is ${GROUP_LABELS[item.group] || item.group}.`,
      item,
      type,
      repairTypeIds: [type],
      repairScope: { groupIds: [item.group] },
    });
  }
  return null;
}

function godanOnbinPattern(item) {
  const reading = String(item?.reading || '');
  if (reading === K.IKU || reading.endsWith(K.IKU)) return 'iku';
  const last = reading.slice(-1);
  if ([K.U, K.TSU, K.RU].includes(last)) return 'utsuru';
  if ([K.MU, K.BU, K.NU].includes(last)) return 'mnb';
  if (last === K.KU) return 'ku';
  if (last === K.GU) return 'gu';
  if (last === K.SU) return 'su';
  return null;
}

function onbinPatternId(pattern) {
  if (pattern === 'iku') return 'iku-exception';
  if (pattern === 'ku' || pattern === 'gu') return 'godan-onbin-ku-gu';
  if (pattern === 'mnb') return 'godan-onbin-mu-bu-nu';
  if (pattern === 'utsuru') return 'godan-onbin-u-tsu-ru';
  if (pattern === 'su') return 'godan-onbin-su';
  return `godan-onbin-${pattern}`;
}

function onbinScope(pattern) {
  if (pattern === 'iku') return { groupIds: ['godan'], endings: [K.IKU] };
  if (pattern === 'ku' || pattern === 'gu') return { groupIds: ['godan'], endings: [K.KU, K.GU] };
  if (pattern === 'mnb') return { groupIds: ['godan'], endings: [K.MU, K.BU, K.NU] };
  if (pattern === 'utsuru') return { groupIds: ['godan'], endings: [K.U, K.TSU, K.RU] };
  if (pattern === 'su') return { groupIds: ['godan'], endings: [K.SU] };
  return { groupIds: ['godan'] };
}

function onbinDiagnosis(item, type, got) {
  if (item.group !== 'godan' || !ONBIN_TAILS[type]) return null;
  const actualPattern = godanOnbinPattern(item);
  if (!actualPattern) return null;
  const stem = String(item.reading || '').slice(0, -1);
  const tails = ONBIN_TAILS[type];

  for (const [usedPattern, tail] of Object.entries(tails)) {
    if (usedPattern === actualPattern) continue;
    if (stem + tail !== got) continue;
    const category = actualPattern === 'iku' ? 'irregular-exception' : 'godan-sound-change';
    const actualLabel = ONBIN_LABELS[actualPattern] || actualPattern;
    const usedLabel = ONBIN_LABELS[usedPattern] || usedPattern;
    return diagnosis({
      category,
      patternId: onbinPatternId(actualPattern),
      label: actualPattern === 'iku' ? 'Iku exception' : `Godan ${actualLabel} sound changes`,
      feedback:
        actualPattern === 'iku'
          ? 'This is the iku exception, so the regular ku pattern does not apply.'
          : `You used the ${usedLabel} ${getTypeInfo(type).label.toLowerCase()} pattern, but this verb belongs to the ${actualLabel} pattern.`,
      item,
      type,
      repairTypeIds: ['te-form', 'plain-past'],
      repairScope: onbinScope(actualPattern),
    });
  }

  if (actualPattern === 'iku') {
    const regularStem = stem + K.KI;
    const regularTail = type === 'te-form' ? '\u3066' : '\u305f';
    if (got === regularStem + regularTail) {
      return diagnosis({
        category: 'irregular-exception',
        patternId: 'iku-exception',
        label: 'Iku exception',
        feedback: 'This is the iku exception, so the regular ku pattern does not apply.',
        item,
        type,
        repairTypeIds: ['te-form', 'plain-past'],
        repairScope: onbinScope(actualPattern),
      });
    }
  }

  return null;
}

function irregularAdjectiveDiagnosis(item, type, got, expected) {
  if (!isAdjective(item)) return null;
  const reading = String(item.reading || '');
  const dict = String(item.dict || '');
  const iiLike = reading === K.II || dict === K.II || dict === K.YOI_KANJI;
  if (!iiLike || !expected?.startsWith(K.YO) || !got.startsWith(K.I)) return null;
  return diagnosis({
    category: 'irregular-exception',
    patternId: `ii-adjective-exception:${type}`,
    label: `Ii adjective exception: ${getTypeInfo(type).label}`,
    feedback: 'This adjective conjugates from yoi, so the regular ii stem does not apply.',
    item,
    type,
    repairTypeIds: [type],
    repairScope: { groupIds: ['i-adjective'], wordKeys: [wordKey(item)] },
  });
}

export function diagnoseMistake({ item, type, promptType = null, userAnswer, expected = '' }) {
  if (!item || !type) return null;
  const got = normalizeAnswer(userAnswer);
  const target = expected || safeConjugate(item, type);
  if (!got || !target || got === target) return null;

  return (
    sourceFormDiagnosis(item, type, promptType, got) ||
    exactWrongTypeDiagnosis(item, type, got) ||
    onbinDiagnosis(item, type, got) ||
    alternateGroupDiagnosis(item, type, got) ||
    irregularAdjectiveDiagnosis(item, type, got, target) ||
    null
  );
}

export function bumpSessionMistakePattern(session = {}, mistakeDiagnosis = null) {
  if (!mistakeDiagnosis?.patternId) return session || {};
  const patterns = session.mistakePatterns || {};
  const current = patterns[mistakeDiagnosis.patternId] || {
    patternId: mistakeDiagnosis.patternId,
    category: mistakeDiagnosis.category,
    label: mistakeDiagnosis.label,
    feedback: mistakeDiagnosis.feedback,
    detail: mistakeDiagnosis.detail,
    targetType: mistakeDiagnosis.targetType,
    repairTypeIds: mistakeDiagnosis.repairTypeIds || [],
    repairScope: mistakeDiagnosis.repairScope || null,
    exampleWordKey: mistakeDiagnosis.exampleWordKey || null,
    count: 0,
  };
  return {
    ...session,
    mistakePatterns: {
      ...patterns,
      [mistakeDiagnosis.patternId]: {
        ...current,
        feedback: mistakeDiagnosis.feedback || current.feedback,
        detail: mistakeDiagnosis.detail || current.detail,
        latestAt: Date.now(),
        count: (current.count || 0) + 1,
      },
    },
  };
}

export function rankSessionMistakePatterns(patterns = {}) {
  return Object.values(patterns || {})
    .filter((p) => p?.patternId && (p.count || 0) > 0)
    .sort((a, b) => (b.count || 0) - (a.count || 0) || (b.latestAt || 0) - (a.latestAt || 0));
}

export function aggregateDiagnosedMistakes(mistakes = []) {
  const byPattern = new Map();
  for (const m of mistakes || []) {
    const item = m
      ? { dict: m.dict, reading: m.reading, meaning: m.meaning, group: m.group }
      : null;
    const inferred =
      m?.diagnosis ||
      diagnoseMistake({
        item,
        type: m?.type,
        promptType: m?.promptType,
        userAnswer: m?.userAnswer,
        expected: m?.expected,
      });
    if (!inferred?.patternId) continue;
    const prior = byPattern.get(inferred.patternId) || {
      patternId: inferred.patternId,
      category: inferred.category,
      label: inferred.label,
      feedback: inferred.feedback,
      detail: inferred.detail,
      targetType: inferred.targetType,
      repairTypeIds: inferred.repairTypeIds || [],
      repairScope: inferred.repairScope || null,
      exampleWordKey: inferred.exampleWordKey || null,
      count: 0,
      unresolved: 0,
      latestAt: 0,
      examples: [],
    };
    const count = Number(m?.count) || 1;
    prior.count += count;
    if (!m?.resolved) prior.unresolved += count;
    prior.latestAt = Math.max(prior.latestAt || 0, m?.at || 0);
    if (prior.examples.length < 3 && m?.dict) {
      prior.examples.push({ dict: m.dict, type: m.type, expected: m.expected });
    }
    byPattern.set(inferred.patternId, prior);
  }
  return [...byPattern.values()].sort(
    (a, b) => b.unresolved - a.unresolved || b.count - a.count || b.latestAt - a.latestAt,
  );
}

function matchesScope(word, scope) {
  if (!scope) return true;
  const key = wordKey(word);
  if (Array.isArray(scope.wordKeys) && scope.wordKeys.includes(key)) return true;
  if (
    Array.isArray(scope.groupIds) &&
    scope.groupIds.length &&
    !scope.groupIds.includes(word.group)
  ) {
    return false;
  }
  if (Array.isArray(scope.endings) && scope.endings.length) {
    const reading = String(word?.reading || '');
    return scope.endings.some((ending) => reading.endsWith(ending));
  }
  return true;
}

function safeListName(label) {
  const base = String(label || 'Mistake repair')
    .replace(/\s+/g, ' ')
    .trim();
  return `Repair: ${base}`.slice(0, 48);
}

function safeListId() {
  return 'repair-drill';
}

export function buildRepairDrillPlan(pattern, words = []) {
  const rawTypeIds =
    Array.isArray(pattern?.repairTypeIds) && pattern.repairTypeIds.length
      ? pattern.repairTypeIds
      : [pattern?.targetType].filter(Boolean);
  const typeIds = [...new Set(rawTypeIds)].filter((id) => ALL_TYPE_IDS.has(id)).slice(0, 8);
  const candidates = (words || [])
    .filter((word) => matchesScope(word, pattern?.repairScope))
    .filter((word) => typeIds.some((typeId) => safeConjugate(word, typeId)))
    .map((word) => wordKey(word));
  const fallbackKeys = pattern?.exampleWordKey ? [pattern.exampleWordKey] : [];
  const wordKeys = [...new Set(candidates.length ? candidates : fallbackKeys)].slice(0, 24);
  return {
    patternId: pattern?.patternId || 'mistake',
    label: pattern?.label || 'Mistake repair',
    feedback: pattern?.feedback || '',
    typeIds,
    wordKeys,
    listId: safeListId(),
    listName: safeListName(pattern?.label),
    reviewLimit: 10,
  };
}

export function upsertRepairWordList(wordLists = [], plan) {
  if (!plan?.wordKeys?.length) return wordLists || [];
  const next = { id: plan.listId, name: plan.listName, wordKeys: plan.wordKeys };
  return (wordLists || []).some((list) => list.id === plan.listId)
    ? wordLists.map((list) => (list.id === plan.listId ? next : list))
    : [...(wordLists || []), next];
}

export function repairPrefsForPlan(practicePrefs = {}, plan) {
  return {
    ...practicePrefs,
    drillMode: 'word',
    drillDirection: 'forward',
    promptForm: 'dictionary',
    reviewLimit: plan?.reviewLimit || 10,
    reviewLimitSource: 'repair',
    wordListIds: plan?.wordKeys?.length ? [plan.listId] : [],
  };
}
