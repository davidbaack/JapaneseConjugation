import { wordKey } from './conjugator.js';

const VERB_GROUPS = ['ichidan', 'godan', 'suru', 'kuru'];
const GODAN_ONBIN_ENDINGS = ['う', 'つ', 'る', 'む', 'ぶ', 'ぬ', 'く', 'ぐ', 'す'];

function endsWithAny(value, endings) {
  return endings.some((ending) => String(value || '').endsWith(ending));
}

function passiveOrPotential(typeId) {
  if (String(typeId || '').startsWith('passive')) return 'passive';
  if (String(typeId || '').startsWith('potential')) return 'potential';
  return '';
}

function causativeOrPassive(typeId) {
  if (String(typeId || '').startsWith('causative')) return 'causative';
  if (String(typeId || '').startsWith('passive')) return 'passive';
  return '';
}

function godanOnbinContrast(word) {
  const reading = String(word?.reading || word?.dict || '');
  if (word?.group !== 'godan') return '';
  if (reading.endsWith('いく')) return 'iku-exception';
  const last = reading.slice(-1);
  if (['う', 'つ', 'る'].includes(last)) return 'small-tsu';
  if (['む', 'ぶ', 'ぬ'].includes(last)) return 'n-voiced';
  if (last === 'く') return 'ku';
  if (last === 'ぐ') return 'gu';
  if (last === 'す') return 'su';
  return '';
}

export const MINIMAL_PAIR_SETS = [
  {
    id: 'ichidan-godan-ru',
    label: 'Ichidan ru vs godan ru',
    description: 'Mixes ru-ending ichidan verbs with godan verbs that only look like ru-verbs.',
    typeIds: ['plain-past', 'te-form', 'plain-negative', 'potential'],
    wordTypes: ['verb'],
    wordGroups: ['ichidan', 'godan'],
    matchesWord: (word) =>
      word?.group === 'ichidan' ||
      (word?.group === 'godan' && endsWithAny(word.reading || word.dict, ['る'])),
    contrastFor: (word) =>
      word?.group === 'ichidan' ? 'ichidan-ru' : word?.group === 'godan' ? 'godan-ru' : '',
    contrasts: [
      {
        id: 'ichidan-ru',
        label: 'Ichidan ru',
        cue: 'Drop final ru, then add the ending: taberu -> tabeta / tabete.',
      },
      {
        id: 'godan-ru',
        label: 'Godan ru',
        cue: 'Treat final ru as a godan ending: hashiru -> hashitta / hashitte.',
      },
    ],
  },
  {
    id: 'i-adj-na-adj',
    label: 'i-adjective vs na-adjective',
    description: 'Forces the i-ending stem change against the na-adjective da/desu pattern.',
    typeIds: [
      'adj-plain-past',
      'adj-plain-negative',
      'adj-plain-past-negative',
      'adj-polite-negative',
      'adj-te-form',
    ],
    wordTypes: ['i-adjective', 'na-adjective'],
    wordGroups: ['i-adjective', 'na-adjective'],
    matchesWord: (word) => word?.group === 'i-adjective' || word?.group === 'na-adjective',
    contrastFor: (word) => word?.group || '',
    contrasts: [
      {
        id: 'i-adjective',
        label: 'i-adjective',
        cue: 'Change final i before endings: takai -> takakunai / takakatta.',
      },
      {
        id: 'na-adjective',
        label: 'na-adjective',
        cue: 'Keep the stem and conjugate da/desu: shizuka -> shizuka dewa nai.',
      },
    ],
  },
  {
    id: 'passive-potential',
    label: 'Passive vs potential',
    description: 'Compares being acted on with being able to do the action.',
    typeIds: [
      'passive',
      'potential',
      'passive-negative',
      'potential-negative',
      'passive-polite',
      'potential-polite',
      'passive-past',
      'potential-past',
    ],
    wordTypes: ['verb'],
    wordGroups: ['godan', 'suru', 'kuru'],
    matchesWord: (word) => ['godan', 'suru', 'kuru'].includes(word?.group),
    contrastFor: (_word, typeId) => passiveOrPotential(typeId),
    contrasts: [
      {
        id: 'passive',
        label: 'Passive',
        cue: 'The subject receives the action: kakareru, sareru, korareru.',
      },
      {
        id: 'potential',
        label: 'Potential',
        cue: 'The subject can do it: kakeru, dekiru, korareru.',
      },
    ],
  },
  {
    id: 'godan-onbin',
    label: 'Godan sound-change clusters',
    description: 'Mixes the past and te-form sound changes across godan endings.',
    typeIds: ['plain-past', 'te-form'],
    wordTypes: ['verb'],
    wordGroups: ['godan'],
    matchesWord: (word) =>
      word?.group === 'godan' && endsWithAny(word.reading || word.dict, GODAN_ONBIN_ENDINGS),
    contrastFor: (word) => godanOnbinContrast(word),
    contrasts: [
      {
        id: 'small-tsu',
        label: 'u / tsu / ru',
        cue: 'Compress to small tsu: kau -> katta, matsu -> matte, hashiru -> hashitte.',
      },
      {
        id: 'n-voiced',
        label: 'mu / bu / nu',
        cue: 'Change to n plus a voiced ending: nomu -> nonda / nonde.',
      },
      { id: 'ku', label: 'ku', cue: 'Use i before ta/te: kaku -> kaita / kaite.' },
      { id: 'gu', label: 'gu', cue: 'Use i plus voiced da/de: oyogu -> oyoida / oyoide.' },
      { id: 'su', label: 'su', cue: 'Change su to shi: hanasu -> hanashita / hanashite.' },
      {
        id: 'iku-exception',
        label: 'iku exception',
        cue: 'Iku patterns with small tsu here: iku -> itta / itte.',
      },
    ],
  },
  {
    id: 'causative-passive',
    label: 'Causative vs passive',
    description: 'Keeps make/let forms separate from be-done-to forms.',
    typeIds: ['causative', 'passive', 'causative-negative', 'passive-negative'],
    wordTypes: ['verb'],
    wordGroups: VERB_GROUPS,
    matchesWord: (word) => VERB_GROUPS.includes(word?.group),
    contrastFor: (_word, typeId) => causativeOrPassive(typeId),
    contrasts: [
      {
        id: 'causative',
        label: 'Causative',
        cue: 'Someone makes or lets the action happen: kakaseru, tabesaseru.',
      },
      {
        id: 'passive',
        label: 'Passive',
        cue: 'The subject receives the action: kakareru, taberareru.',
      },
    ],
  },
];

export function getMinimalPairSet(setId) {
  return MINIMAL_PAIR_SETS.find((set) => set.id === setId) || null;
}

export function minimalPairSetMatchesWord(set, word) {
  return !!(set && word && set.matchesWord(word));
}

export function minimalPairSetMatchesType(set, typeId) {
  return !!(set && set.typeIds.includes(typeId));
}

export function minimalPairSetMatchesCard(set, word, typeId) {
  return minimalPairSetMatchesWord(set, word) && minimalPairSetMatchesType(set, typeId);
}

export function contrastForMinimalPair(set, word, typeId) {
  if (!minimalPairSetMatchesCard(set, word, typeId)) return null;
  const contrastId = set.contrastFor(word, typeId);
  return set.contrasts.find((contrast) => contrast.id === contrastId) || null;
}

export function minimalPairEligibleWords(words, set) {
  if (!set) return [];
  return (words || []).filter((word) => minimalPairSetMatchesWord(set, word));
}

function copyArray(value) {
  return Array.isArray(value) ? [...value] : undefined;
}

function minimalPairReturnFromPrefs(prefs = {}, options = {}) {
  const snapshot = {};
  const wordListIds = copyArray(prefs.wordListIds);
  const wordTypes = copyArray(prefs.wordTypes);
  const wordGroups = copyArray(prefs.wordGroups);
  const enabledTypes = copyArray(options.enabledTypes);
  if (typeof prefs.drillMode === 'string') snapshot.drillMode = prefs.drillMode;
  if (wordListIds) snapshot.wordListIds = wordListIds;
  if (wordTypes) snapshot.wordTypes = wordTypes;
  if (wordGroups) snapshot.wordGroups = wordGroups;
  if (enabledTypes) snapshot.enabledTypes = enabledTypes;
  return snapshot;
}

function restoreMinimalPairReturn(prefs = {}) {
  const saved = prefs.minimalPairReturn;
  if (!saved || typeof saved !== 'object') return { ...prefs };
  const restored = { ...prefs };
  if (typeof saved.drillMode === 'string') restored.drillMode = saved.drillMode;
  if (Array.isArray(saved.wordListIds)) restored.wordListIds = [...saved.wordListIds];
  if (Array.isArray(saved.wordTypes)) restored.wordTypes = [...saved.wordTypes];
  if (Array.isArray(saved.wordGroups)) restored.wordGroups = [...saved.wordGroups];
  return restored;
}

export function minimalPairReturnEnabledTypes(prefs = {}) {
  const enabledTypes = prefs.minimalPairReturn?.enabledTypes;
  return Array.isArray(enabledTypes) ? [...enabledTypes] : null;
}

export function practicePrefsForMinimalPairSet(set, prefs = {}, options = {}) {
  const minimalPairReturn =
    prefs.minimalPairSetId && prefs.minimalPairReturn
      ? prefs.minimalPairReturn
      : minimalPairReturnFromPrefs(prefs, options);
  return {
    ...prefs,
    minimalPairSetId: set?.id || '',
    minimalPairReturn,
    drillMode: 'word',
    wordListIds: [],
    wordTypes: set?.wordTypes || prefs.wordTypes,
    wordGroups: set?.wordGroups || prefs.wordGroups,
  };
}

export function clearMinimalPairPrefs(prefs = {}) {
  return { ...restoreMinimalPairReturn(prefs), minimalPairSetId: '', minimalPairReturn: null };
}

export function minimalPairFeedbackForCard(set, word, typeId) {
  const active = contrastForMinimalPair(set, word, typeId);
  if (!set || !active) return null;
  return {
    label: set.label,
    active,
    intro: `This drill is testing ${active.label} against the nearby pattern, so check the class before applying the ending.`,
    contrasts: set.contrasts,
  };
}

export function recordMinimalPairResult(minimalPairs, setId, word, typeId, correct) {
  const set = getMinimalPairSet(setId);
  if (!minimalPairSetMatchesCard(set, word, typeId)) {
    return minimalPairs || { bySet: {} };
  }
  const contrast = contrastForMinimalPair(set, word, typeId);
  const contrastId = contrast?.id || 'mixed';
  const now = Date.now();
  const root = minimalPairs || { bySet: {} };
  const bySet = root.bySet || {};
  const previous = bySet[set.id] || {
    attempted: 0,
    correct: 0,
    incorrect: 0,
    streak: 0,
    bestStreak: 0,
    lastAt: null,
    byContrast: {},
  };
  const previousContrast = previous.byContrast?.[contrastId] || {
    attempted: 0,
    correct: 0,
    incorrect: 0,
  };
  const nextStreak = correct ? (previous.streak || 0) + 1 : 0;
  const next = {
    ...previous,
    attempted: (previous.attempted || 0) + 1,
    correct: (previous.correct || 0) + (correct ? 1 : 0),
    incorrect: (previous.incorrect || 0) + (correct ? 0 : 1),
    streak: nextStreak,
    bestStreak: Math.max(previous.bestStreak || 0, nextStreak),
    lastAt: now,
    byContrast: {
      ...(previous.byContrast || {}),
      [contrastId]: {
        ...previousContrast,
        attempted: (previousContrast.attempted || 0) + 1,
        correct: (previousContrast.correct || 0) + (correct ? 1 : 0),
        incorrect: (previousContrast.incorrect || 0) + (correct ? 0 : 1),
      },
    },
  };
  return { ...root, bySet: { ...bySet, [set.id]: next } };
}

function maxNum(a, b) {
  return Math.max(Number(a) || 0, Number(b) || 0);
}

export function mergeMinimalPairProgress(local = {}, cloud = {}) {
  const localBySet = (local || {}).bySet || {};
  const cloudBySet = (cloud || {}).bySet || {};
  const bySet = {};
  for (const setId of new Set([...Object.keys(cloudBySet), ...Object.keys(localBySet)])) {
    const l = localBySet[setId] || {};
    const c = cloudBySet[setId] || {};
    const byContrast = {};
    for (const contrastId of new Set([
      ...Object.keys(c.byContrast || {}),
      ...Object.keys(l.byContrast || {}),
    ])) {
      const lc = l.byContrast?.[contrastId] || {};
      const cc = c.byContrast?.[contrastId] || {};
      byContrast[contrastId] = {
        attempted: maxNum(lc.attempted, cc.attempted),
        correct: maxNum(lc.correct, cc.correct),
        incorrect: maxNum(lc.incorrect, cc.incorrect),
      };
    }
    bySet[setId] = {
      attempted: maxNum(l.attempted, c.attempted),
      correct: maxNum(l.correct, c.correct),
      incorrect: maxNum(l.incorrect, c.incorrect),
      streak: maxNum(l.streak, c.streak),
      bestStreak: maxNum(l.bestStreak, c.bestStreak),
      lastAt: maxNum(l.lastAt, c.lastAt) || null,
      byContrast,
    };
  }
  return { bySet };
}

export function minimalPairStatsSummary(minimalPairs, setId) {
  const stats = minimalPairs?.bySet?.[setId] || null;
  if (!stats) return { attempted: 0, correct: 0, incorrect: 0, accuracy: 0, bestStreak: 0 };
  const attempted = stats.attempted || 0;
  return {
    ...stats,
    attempted,
    accuracy: attempted ? Math.round(((stats.correct || 0) / attempted) * 100) : 0,
  };
}

function itemFromMistake(mistake) {
  return {
    dict: mistake.dict,
    reading: mistake.reading || mistake.dict,
    meaning: mistake.meaning || '',
    group: mistake.group,
  };
}

export function scoreMinimalPairSet(state, words, set) {
  const wordByKey = new Map((words || []).map((word) => [wordKey(word), word]));
  let mistakeScore = 0;
  let statScore = 0;
  const contrastIds = new Set();

  for (const mistake of state?.mistakes || []) {
    if (mistake.resolved) continue;
    const item = itemFromMistake(mistake);
    if (!minimalPairSetMatchesCard(set, item, mistake.type)) continue;
    const count = mistake.count || 1;
    mistakeScore += count;
    const contrast = contrastForMinimalPair(set, item, mistake.type);
    if (contrast) contrastIds.add(contrast.id);
  }

  for (const word of wordByKey.values()) {
    if (!minimalPairSetMatchesWord(set, word)) continue;
    const wordStats = state?.verbStats?.[word.dict] || {};
    for (const [ruleId, stats] of Object.entries(wordStats)) {
      const typeId = ruleId.split('|').pop();
      if (!minimalPairSetMatchesType(set, typeId)) continue;
      statScore += stats?.incorrect || 0;
      const contrast = contrastForMinimalPair(set, word, typeId);
      if (contrast && stats?.incorrect) contrastIds.add(contrast.id);
    }
  }

  const total = mistakeScore + statScore;
  return {
    set,
    score: total,
    mistakeScore,
    statScore,
    contrastIds: [...contrastIds],
    recommended: total >= 2,
  };
}

export function recommendMinimalPairSets(state, words, limit = 2) {
  return MINIMAL_PAIR_SETS.map((set) => scoreMinimalPairSet(state, words, set))
    .filter((result) => result.recommended)
    .sort((a, b) => b.score - a.score || a.set.label.localeCompare(b.set.label))
    .slice(0, limit);
}
