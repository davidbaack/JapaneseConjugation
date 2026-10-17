import {
  CONJ_TYPES,
  ADJ_TYPES,
  ALL_CARD_TYPES,
  FORM_GROUPS,
  getTypeInfo,
  TYPE_PREVIEW_VERBS,
  TYPE_PREVIEW_ADJECTIVES,
} from '../data/conjugationTypes.js';
import {
  WORD_META,
  JLPT_LEVELS,
  WORD_TYPE_OPTIONS,
  WORD_GROUP_OPTIONS,
  GENKI_LESSONS,
  MINNA_LESSONS,
} from '../data/starterWords.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { groupDisplayLabel, groupShortLabel } from './groupDisplay.js';

// ============================================================================
// DEFECTIVE / STATIVE VERB FORM SUPPRESSION
// ----------------------------------------------------------------------------
// A few verbs don't actually inflect across the full 126-form matrix.
// Conjugating them mechanically yields forms that don't exist in real Japanese
// (e.g. passive 在られる, progressive あっている, potential 要れる, passive
// 生まれられる). We return '' for those (verb, form) pairs so the rest of the
// engine treats them as non-existent: practiceTypesForItem and
// isRedundantPracticeType drop them from practice, and the sentence-library
// pipeline (buildPair / validateGenerated in scripts/sentencePipeline.js) never
// asks the model to write — or accepts — a sentence for them. This is the same
// '' contract the engine already uses for forms like short-causative-passive on
// ichidan verbs. See docs/sentence-library.md.
const FORM_GROUP_TYPE_IDS = Object.fromEntries(FORM_GROUPS.map((g) => [g.id, g.typeIds]));

// ある (在る・有る・或る) and the godan 要る ("to need") are inanimate / stative:
// no potential, passive, causative, progressive, desiderative, keigo,
// volitional, command, or request forms exist. Reduce them to the core everyday
// forms only — plain/polite tenses, te-form, conditionals, conjectural, and the
// negative te-forms (which use the suppletive ない for ある).
const STATIVE_DEFECTIVE_SUPPRESSED = new Set([
  ...FORM_GROUP_TYPE_IDS.potential,
  ...FORM_GROUP_TYPE_IDS.progressive,
  ...FORM_GROUP_TYPE_IDS.passive,
  ...FORM_GROUP_TYPE_IDS.causative, // plain + short causative
  ...FORM_GROUP_TYPE_IDS['causative-passive'], // plain + short causative-passive
  ...FORM_GROUP_TYPE_IDS.honorific,
  ...FORM_GROUP_TYPE_IDS.humble,
  ...FORM_GROUP_TYPE_IDS.volitional,
  ...FORM_GROUP_TYPE_IDS.wanting,
  ...FORM_GROUP_TYPE_IDS.commands,
  ...FORM_GROUP_TYPE_IDS.requests,
  ...FORM_GROUP_TYPE_IDS.permission,
  ...FORM_GROUP_TYPE_IDS.obligation,
  'negative-zuni',
  'prohibition',
]);

// 生まれる ("to be born") is intransitive and spontaneous: most forms are fine
// (desiderative 生まれたい, volitional 生まれよう, progressive 生まれている, plain
// causative 生まれさせる), but it has no passive and no causative-passive, and the
// colloquial short causative is not used. Suppress only those families.
const SPONTANEOUS_INTRANSITIVE_SUPPRESSED = new Set([
  ...FORM_GROUP_TYPE_IDS.passive,
  ...FORM_GROUP_TYPE_IDS['causative-passive'], // incl. short-causative-passive
  ...FORM_GROUP_TYPE_IDS.causative.filter((id) => id.startsWith('short-causative')),
]);

function isStativeDefectiveVerb(verb) {
  if (!verb) return false;
  // 在る・有る・或る all read あ・る; 要る is keyed by its dictionary form so we do
  // not catch other godan いる verbs (e.g. 煎る "to roast") or the ichidan 居る.
  return verb.reading === 'ある' || verb.dict === '要る';
}

function isSpontaneousIntransitiveVerb(verb) {
  return !!verb && (verb.dict === '生まれる' || verb.reading === 'うまれる');
}

// Forms unavailable in this practice lane, including constructions that need
// individual lexical/context review. An empty answer does not certify nonexistence.
function isSuppressedVerbForm(verb, type) {
  // 間に合う already expresses being able to make a deadline in this lane.
  if (verb?.reading === 'まにあう' && type.startsWith('potential')) return true;
  // These lexical suru verbs do not use noun + できる. Their individual
  // potential paradigms need their own reviewed lane rather than 愛できる etc.
  if (
    verb?.group === 'suru' &&
    type.startsWith('potential') &&
    /^(愛|関|接|属|対|達|適|熱|罰|値|害|恋|察|称|制|即|題|脱|徹|反|面|有|要)する$/.test(verb.dict)
  )
    return true;
  if (isStativeDefectiveVerb(verb)) return STATIVE_DEFECTIVE_SUPPRESSED.has(type);
  if (isSpontaneousIntransitiveVerb(verb)) return SPONTANEOUS_INTRANSITIVE_SUPPRESSED.has(type);
  return false;
}

// ============================================================================
// DATA FILTERING & METADATA HELPERS
// ============================================================================
export function normalizeJlptLevel(value) {
  const m = String(value || '')
    .trim()
    .toUpperCase()
    .match(/^N[1-5]$/);
  return m ? m[0] : null;
}

function normalizeLessonList(...values) {
  return [
    ...new Set(
      values
        .flatMap((value) => (Array.isArray(value) ? value : value == null ? [] : [value]))
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].sort((a, b) => a - b);
}

export function getWordMeta(word) {
  const embedded = {};
  const jlpt = normalizeJlptLevel(word?.jlpt || word?.level);
  if (jlpt) embedded.jlpt = jlpt;
  const lessons = normalizeLessonList(word?.lessons, word?.genkiLessons, word?.lesson);
  const minnaLessons = normalizeLessonList(word?.minnaLessons, word?.minnaLesson);
  if (lessons.length) {
    embedded.lessons = lessons;
    embedded.lesson = lessons[0];
  }
  if (minnaLessons.length) {
    embedded.minnaLessons = minnaLessons;
    embedded.minnaLesson = minnaLessons[0];
  }
  const mapped = WORD_META[word?.dict] || {};
  const mappedLessons = normalizeLessonList(mapped.lessons, mapped.genkiLessons, mapped.lesson);
  const mappedMinnaLessons = normalizeLessonList(mapped.minnaLessons, mapped.minnaLesson);
  const mergedLessons = normalizeLessonList(mappedLessons, embedded.lessons, embedded.lesson);
  const mergedMinnaLessons = normalizeLessonList(
    mappedMinnaLessons,
    embedded.minnaLessons,
    embedded.minnaLesson,
  );
  return {
    jlpt: 'N3',
    lesson: null,
    lessons: [],
    minnaLesson: null,
    minnaLessons: [],
    common: false,
    ...mapped,
    ...(mergedLessons.length
      ? { lesson: mappedLessons[0] || lessons[0] || mergedLessons[0], lessons: mergedLessons }
      : {}),
    ...(mergedMinnaLessons.length
      ? {
          minnaLesson: mappedMinnaLessons[0] || minnaLessons[0] || mergedMinnaLessons[0],
          minnaLessons: mergedMinnaLessons,
        }
      : {}),
    ...(!mapped.jlpt && embedded.jlpt ? { jlpt: embedded.jlpt } : {}),
    ...(!mapped.common && word?.common ? { common: true } : {}),
  };
}

export function isIrregularAdjective(word) {
  return !!(
    word &&
    word.group === 'i-adjective' &&
    (usesYoiAdjectiveStem(word) || word.dict === '良い')
  );
}

export function wordKind(word) {
  return isAdjective(word) ? word.group : 'verb';
}

export function wordGroupId(word) {
  return isIrregularAdjective(word) ? 'irregular-adjective' : word.group;
}

export function classifyGroupId(word) {
  return wordGroupId(word);
}

export function wordKey(word) {
  return `${word.group}:${word.dict}`;
}

export function filterWordsForPrefs(words, prefs = DEFAULT_PREFS, wordLists = []) {
  const levels = prefs.jlptLevels && prefs.jlptLevels.length ? prefs.jlptLevels : JLPT_LEVELS;
  const types =
    prefs.wordTypes && prefs.wordTypes.length
      ? prefs.wordTypes
      : WORD_TYPE_OPTIONS.map((o) => o.id);
  const groups =
    prefs.wordGroups && prefs.wordGroups.length
      ? prefs.wordGroups
      : WORD_GROUP_OPTIONS.map((o) => o.id);
  const lessonFilter =
    Array.isArray(prefs.genkiLessons) &&
    prefs.genkiLessons.length &&
    prefs.genkiLessons.length < GENKI_LESSONS.length
      ? new Set(prefs.genkiLessons.map(Number))
      : null;
  const minnaFilter =
    Array.isArray(prefs.minnaLessons) &&
    prefs.minnaLessons.length &&
    prefs.minnaLessons.length < MINNA_LESSONS.length
      ? new Set(prefs.minnaLessons.map(Number))
      : null;
  const selectedLists = prefs.wordListIds && prefs.wordListIds.length ? prefs.wordListIds : [];
  const allowedKeys = selectedLists.length
    ? new Set(
        wordLists.filter((l) => selectedLists.includes(l.id)).flatMap((l) => l.wordKeys || []),
      )
    : null;
  return words.filter((w) => {
    const meta = getWordMeta(w);
    const genkiLessons = meta.lessons?.length ? meta.lessons : meta.lesson ? [meta.lesson] : [];
    const minnaLessons = meta.minnaLessons?.length
      ? meta.minnaLessons
      : meta.minnaLesson
        ? [meta.minnaLesson]
        : [];
    const passesLesson =
      (!lessonFilter && !minnaFilter) ||
      (lessonFilter && genkiLessons.some((lesson) => lessonFilter.has(lesson))) ||
      (minnaFilter && minnaLessons.some((lesson) => minnaFilter.has(lesson)));
    return (
      levels.includes(meta.jlpt) &&
      types.includes(wordKind(w)) &&
      groups.includes(wordGroupId(w)) &&
      passesLesson &&
      (!allowedKeys || allowedKeys.has(wordKey(w)))
    );
  });
}

export function typePreviewItems(typeId) {
  return ADJ_TYPES.some((t) => t.id === typeId) ? TYPE_PREVIEW_ADJECTIVES : TYPE_PREVIEW_VERBS;
}

export function typePreviewValues(typeId) {
  return typePreviewItems(typeId)
    .map((item) => ({ item, answer: conjugateItem(item, typeId) }))
    .filter((x) => x.answer);
}

// Several stative verbs are defective: the conjugation rules can mechanically
// build advanced forms (あれる, あろう, あらせる, ありたい…) that don't occur in
// natural Japanese, so the app must never select or present them. Each verb is
// restricted to the forms that genuinely exist, by profile:
//   - existence (ある, 要る): basic tenses, te-form, conditionals, conjectural.
//   - stative w/ progressive (できる, 見える, わかる…): the above plus ～ている.
//   - cognition (分かる): the above plus causative (わからせる is real).
// Matched by exact word key so true verbs that merely share a reading keep all
// forms (煎る/炒る/煮る, and 居る the normal ichidan existence verb).
const STATIVE_BASE_FORMS = [
  'plain-present',
  'plain-past',
  'plain-negative',
  'plain-past-negative',
  'polite-present',
  'polite-past',
  'polite-negative',
  'polite-past-negative',
  'te-form',
  'conditional-tara',
  'negative-conditional-tara',
  'conditional-ba',
  'negative-conditional-ba',
  'conditional-nara',
  'conjectural',
];
const PROGRESSIVE_FORMS = [
  'progressive',
  'progressive-polite',
  'progressive-negative',
  'progressive-polite-negative',
  'progressive-past',
  'progressive-polite-past',
  'progressive-past-negative',
  'progressive-polite-past-negative',
];
const CAUSATIVE_FORMS = [
  'causative',
  'causative-polite',
  'causative-negative',
  'causative-polite-negative',
  'causative-polite-past',
  'causative-polite-past-negative',
  'causative-past',
  'causative-past-negative',
  'causative-conditional-ba',
  'causative-negative-conditional-ba',
];

const STATIVE_EXISTENCE = new Set(STATIVE_BASE_FORMS);
const STATIVE_PROGRESSIVE = new Set([...STATIVE_BASE_FORMS, ...PROGRESSIVE_FORMS]);
const STATIVE_COGNITION = new Set([
  ...STATIVE_BASE_FORMS,
  ...PROGRESSIVE_FORMS,
  ...CAUSATIVE_FORMS,
]);

const DEFECTIVE_STATIVE_FORMS = new Map([
  ['godan:在る', STATIVE_EXISTENCE], // ある — to exist/live
  ['godan:有る', STATIVE_EXISTENCE], // ある — to be/have
  ['godan:ある', STATIVE_EXISTENCE], // ある (kana)
  ['godan:要る', STATIVE_EXISTENCE], // いる — to need
  ['godan:違う', STATIVE_PROGRESSIVE], // to differ / be wrong
  ['ichidan:できる', STATIVE_PROGRESSIVE], // to be able to
  ['ichidan:見える', STATIVE_PROGRESSIVE], // to be visible
  ['ichidan:聞こえる', STATIVE_PROGRESSIVE], // to be audible
  ['ichidan:足りる', STATIVE_PROGRESSIVE], // to be enough
  ['ichidan:似る', STATIVE_PROGRESSIVE], // to resemble
  ['ichidan:優れる', STATIVE_PROGRESSIVE], // to excel
  ['godan:異なる', STATIVE_PROGRESSIVE], // to differ (formal)
  ['godan:分かる', STATIVE_COGNITION], // to understand (keeps わからせる)
]);

function defectiveStativeForms(item) {
  return DEFECTIVE_STATIVE_FORMS.get(wordKey(item)) || null;
}

export function compatibleTypes(item) {
  const allowed = defectiveStativeForms(item);
  const types = isAdjective(item)
    ? ADJ_TYPES
    : allowed
      ? CONJ_TYPES.filter((t) => allowed.has(t.id))
      : CONJ_TYPES;
  return types.filter((type) => conjugateItem(item, type.id));
}

export function isTypeCompatible(item, typeId) {
  return compatibleTypes(item).some((t) => t.id === typeId);
}

export function enabledTypeIdsFor(enabledTypeIds) {
  return enabledTypeIds && enabledTypeIds.length ? enabledTypeIds : ALL_CARD_TYPES.map((t) => t.id);
}

export function practiceTypesForItem(item, enabledTypeIds, prefs = DEFAULT_PREFS) {
  const enabled = new Set(enabledTypeIdsFor(enabledTypeIds));
  const skip = prefs.skipDuplicateForms !== false;
  const seen = new Set();
  return compatibleTypes(item).filter((t) => {
    if (!enabled.has(t.id)) return false;
    const answer = conjugateItem(item, t.id);
    if (!answer) return false;
    if (skip && seen.has(answer)) return false;
    seen.add(answer);
    return true;
  });
}

export function isRedundantPracticeType(item, typeId, enabledTypeIds, prefs = DEFAULT_PREFS) {
  // A form with no valid conjugation (e.g. short causative-passive on an
  // ichidan/す-godan/する verb) can never be practiced — it would surface as a
  // blank card. Exclude it regardless of the duplicate-skipping preference.
  if (!conjugateItem(item, typeId)) return true;
  if (prefs.skipDuplicateForms === false) return false;
  return !practiceTypesForItem(item, enabledTypeIds, prefs).some((t) => t.id === typeId);
}

export function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function resolveDisplayScripts(prefs = DEFAULT_PREFS) {
  const ds = prefs.displayScripts;
  if (ds && (ds.kanji || ds.kana || ds.romaji))
    return { kanji: !!ds.kanji, kana: !!ds.kana, romaji: !!ds.romaji };
  if (prefs.scriptMode === 'hiragana') return { kanji: false, kana: true, romaji: false };
  if (prefs.scriptMode === 'romaji') return { kanji: false, kana: false, romaji: true };
  if (prefs.scriptMode === 'all') return { kanji: true, kana: true, romaji: true };
  return { kanji: true, kana: true, romaji: false };
}

export function normalizePromptFormSetting(promptForm) {
  if (promptForm === 'random' || promptForm === 'mixed') return 'random';
  if (promptForm === 'polite-present' || promptForm === 'masu') return 'polite-present';
  if (promptForm === 'dict-masu') return 'dict-masu';
  return 'dictionary';
}

export function pickPromptType(item, targetType, prefs = DEFAULT_PREFS) {
  const source = normalizePromptFormSetting(prefs.promptForm);
  const allowTrick = !!prefs.trickQuestions;
  const types = compatibleTypes(item).filter((t) => allowTrick || t.id !== targetType);
  if (source === 'dictionary' || !types.length) return null;
  if (source === 'random')
    return types[
      hashString(
        `${item.dict}|${targetType}|${allowTrick ? 'trick' : 'normal'}|${JSON.stringify(resolveDisplayScripts(prefs))}`,
      ) % types.length
    ].id;
  if (source === 'dict-masu') {
    const candidates = /** @type {(string | null)[]} */ ([null]);
    if (isTypeCompatible(item, 'polite-present') && (allowTrick || 'polite-present' !== targetType))
      candidates.push('polite-present');
    if (candidates.length === 1) return null;
    return candidates[
      hashString(`dm|${item.dict}|${targetType}|${allowTrick ? 'trick' : 'normal'}`) %
        candidates.length
    ];
  }
  if (isTypeCompatible(item, source) && (allowTrick || source !== targetType)) return source;
  return null;
}

export function promptFormLabel(item, promptType) {
  if (!promptType) {
    return isAdjective(item) ? 'Dictionary adjective' : 'Dictionary verb';
  }
  return getTypeInfo(promptType).label;
}

// ============================================================================
// CONJUGATION ENGINE
// ============================================================================
export const A_ROW = {
  う: 'わ',
  く: 'か',
  ぐ: 'が',
  す: 'さ',
  つ: 'た',
  ぬ: 'な',
  ぶ: 'ば',
  む: 'ま',
  る: 'ら',
};
export const I_ROW = {
  う: 'い',
  く: 'き',
  ぐ: 'ぎ',
  す: 'し',
  つ: 'ち',
  ぬ: 'に',
  ぶ: 'び',
  む: 'み',
  る: 'り',
};
export const E_ROW = {
  う: 'え',
  く: 'け',
  ぐ: 'げ',
  す: 'せ',
  つ: 'て',
  ぬ: 'ね',
  ぶ: 'べ',
  む: 'め',
  る: 'れ',
};
export const O_ROW = {
  う: 'お',
  く: 'こ',
  ぐ: 'ご',
  す: 'そ',
  つ: 'と',
  ぬ: 'の',
  ぶ: 'ぼ',
  む: 'も',
  る: 'ろ',
};
export const PAST_END = {
  く: 'いた',
  ぐ: 'いだ',
  す: 'した',
  つ: 'った',
  う: 'った',
  る: 'った',
  ぬ: 'んだ',
  ぶ: 'んだ',
  む: 'んだ',
};
export const TE_END = {
  く: 'いて',
  ぐ: 'いで',
  す: 'して',
  つ: 'って',
  う: 'って',
  る: 'って',
  ぬ: 'んで',
  ぶ: 'んで',
  む: 'んで',
};
export const ONBIN_TE_CHOICES = ['て', 'って', 'んで', 'いて', 'いで', 'して', 'きて'];
export const ONBIN_TA_CHOICES = ['た', 'った', 'んだ', 'いた', 'いだ', 'した', 'きた'];

export const ONBIN_PATTERN_META = {
  ichidan: { label: 'ichidan る', cue: 'Drop る, add て / た.', group: 'る' },
  utsuru: { label: 'う・つ・る', cue: 'う・つ・る compress to small っ.', group: 'っ' },
  mnb: { label: 'む・ぶ・ぬ', cue: 'む・ぶ・ぬ become ん + voiced ending.', group: 'ん' },
  ku: { label: 'く', cue: 'く becomes いて / いた.', group: 'い' },
  gu: { label: 'ぐ', cue: 'ぐ becomes いで / いだ.', group: 'い' },
  su: { label: 'す', cue: 'す becomes して / した.', group: 'し' },
  iku: {
    label: '行く exception',
    cue: '行く is the famous exception: いって / いった.',
    group: 'っ',
  },
  suru: { label: 'する', cue: 'する becomes して / した.', group: 'し' },
  kuru: { label: '来る', cue: '来る becomes きて / きた.', group: 'き' },
};

export function onbinPatternForVerb(verb) {
  if (!verb) return ONBIN_PATTERN_META.ichidan;
  if (verb.group === 'ichidan') return ONBIN_PATTERN_META.ichidan;
  if (verb.group === 'suru') return ONBIN_PATTERN_META.suru;
  if (verb.group === 'kuru') return ONBIN_PATTERN_META.kuru;
  if (verb.group === 'godan') {
    const r = verb.reading;
    if (r === 'いく' || r.endsWith('いく')) return ONBIN_PATTERN_META.iku;
    const last = r.slice(-1);
    if (['う', 'つ', 'る'].includes(last)) return ONBIN_PATTERN_META.utsuru;
    if (['む', 'ぶ', 'ぬ'].includes(last)) return ONBIN_PATTERN_META.mnb;
    if (last === 'く') return ONBIN_PATTERN_META.ku;
    if (last === 'ぐ') return ONBIN_PATTERN_META.gu;
    if (last === 'す') return ONBIN_PATTERN_META.su;
  }
  return ONBIN_PATTERN_META.ichidan;
}

export function onbinStem(verb) {
  if (!verb) return '';
  if (verb.group === 'suru' && verb.reading.endsWith('する')) return verb.reading.slice(0, -2);
  if (verb.group === 'kuru' && verb.reading.endsWith('くる')) return verb.reading.slice(0, -2);
  return verb.reading.slice(0, -1);
}

export function onbinTailFor(verb, targetType) {
  const expected = conjugate(verb, targetType);
  const stem = onbinStem(verb);
  return expected.startsWith(stem) ? expected.slice(stem.length) : expected;
}

export function desiderativeStem(verb) {
  const { reading, group } = verb;
  if (group === 'ichidan') return reading.slice(0, -1);
  if (group === 'godan') {
    const last = reading.slice(-1);
    return reading.slice(0, -1) + I_ROW[last];
  }
  if (group === 'suru') return (reading.endsWith('する') ? reading.slice(0, -2) : '') + 'し';
  if (group === 'kuru') return (reading.endsWith('くる') ? reading.slice(0, -2) : '') + 'き';
  return reading;
}

export function shortCausativePassive(verb) {
  const { reading, group } = verb;
  if (group === 'godan') {
    const stem = reading.slice(0, -1),
      last = reading.slice(-1);
    if (last === 'す') return '';
    return stem + A_ROW[last] + 'される';
  }
  return '';
}

export function shortCausative(verb) {
  const { reading, group } = verb;
  if (group === 'ichidan') return reading.slice(0, -1) + 'さす';
  if (group === 'godan') {
    const last = reading.slice(-1),
      stem = reading.slice(0, -1);
    return stem + A_ROW[last] + 'す';
  }
  if (group === 'suru') return (reading.endsWith('する') ? reading.slice(0, -2) : '') + 'さす';
  if (group === 'kuru') return (reading.endsWith('くる') ? reading.slice(0, -2) : '') + 'こさす';
  return '';
}

export function conjugateShortCausative(verb, targetType) {
  const form = shortCausative(verb);
  return form
    ? conjugate({ reading: form, dict: form, meaning: verb.meaning, group: 'godan' }, targetType)
    : '';
}

export const KEIGO_SPECIALS = {
  たべる: { honorific: 'めしあがる', humble: 'いただく' },
  のむ: { honorific: 'めしあがる', humble: 'いただく' },
  みる: { honorific: 'ごらんになる', humble: 'はいけんする' },
  きる: { honorific: 'おめしになる', humble: '' },
  ねる: { honorific: 'おやすみになる', humble: '' },
  しぬ: { honorific: 'おなくなりになる', humble: '' },
  いく: { honorific: 'いらっしゃる', humble: 'まいる' },
  くる: { honorific: 'いらっしゃる', humble: 'まいる' },
  いる: { honorific: 'いらっしゃる', humble: 'おる' },
  する: { honorific: 'なさる', humble: 'いたす' },
  いう: { honorific: 'おっしゃる', humble: 'もうす' },
  きく: { honorific: 'おききになる', humble: 'うかがう' },
  たずねる: { honorific: 'おたずねになる', humble: 'うかがう' },
  あう: { honorific: 'おあいになる', humble: 'おめにかかる' },
  かりる: { honorific: 'おかりになる', humble: 'はいしゃくする' },
  あげる: { honorific: 'くださる', humble: 'さしあげる' },
  もらう: { honorific: 'おもらいになる', humble: 'いただく' },
  くれる: { honorific: 'くださる', humble: '' },
  しる: { honorific: 'ごぞんじである', humble: 'ぞんじる' },
};

export const KEIGO_POLITE_OVERRIDES = {
  なさる: 'なさいます',
  いらっしゃる: 'いらっしゃいます',
  おっしゃる: 'おっしゃいます',
  くださる: 'くださいます',
  ござる: 'ございます',
  ぞんじる: 'ぞんじます',
  さしあげる: 'さしあげます',
  ごぞんじである: 'ごぞんじです',
};

// These are ordinary lexical sources for special replacements, not reading-only
// rules: 切る, 煎る, 練る, 刷る, 合う and other homographs have different senses.
const KEIGO_SOURCE_SPELLINGS = {
  'ichidan:たべる': '食べる',
  'godan:のむ': '飲む',
  'ichidan:みる': '見る',
  'ichidan:きる': '着る',
  'ichidan:ねる': '寝る',
  'godan:しぬ': '死ぬ',
  'godan:いく': '行く',
  'kuru:くる': '来る',
  'ichidan:いる': '居る',
  'suru:する': 'する',
  'godan:いう': '言う',
  'godan:きく': '聞く',
  'ichidan:たずねる': '尋ねる|訪ねる',
  'godan:あう': '会う',
  'ichidan:かりる': '借りる',
  'ichidan:あげる': 'あげる',
  'godan:もらう': 'もらう',
  'ichidan:くれる': 'くれる',
  'godan:しる': '知る',
};

// Kana-only homographs need the reviewed ordinary sense as well as the group.
const KEIGO_KANA_SENSES = {
  あげる: 'to give',
  くれる: 'to give, to do for',
};

// Remaining ordinary sources with individually reviewed honorific/humble
// contexts in reviewedSentenceFrames. Other words need their own context review.
// This includes already-polite words: conventional layered expressions exist,
// but they cannot be inferred by applying お〜になる / お〜する indiscriminately.
const REVIEWED_REGULAR_KEIGO = {
  'godan:読む': 'よむ',
  'godan:書く': 'かく',
  'godan:話す': 'はなす',
  'godan:待つ': 'まつ',
  'godan:持つ': 'もつ',
  'ichidan:見せる': 'みせる',
  'ichidan:教える': 'おしえる',
};

export function getSpecialKeigoBase(word, type) {
  const kind =
    type === 'humble' || type === 'humble-polite'
      ? 'humble'
      : type === 'honorific' || type === 'honorific-polite'
        ? 'honorific'
        : null;
  if (!kind) return undefined;
  const source = KEIGO_SOURCE_SPELLINGS[`${word?.group}:${word?.reading}`];
  if (!source || !source.split('|').includes(word.dict)) return undefined;
  if (KEIGO_KANA_SENSES[word.reading] && word.meaning !== KEIGO_KANA_SENSES[word.reading])
    return undefined;
  return KEIGO_SPECIALS[word.reading]?.[kind];
}

export function keigoForm(verb, kind) {
  const special = getSpecialKeigoBase(verb, kind);
  if (special !== undefined) return special;
  if (!verb?.reading || REVIEWED_REGULAR_KEIGO[wordKey(verb)] !== verb.reading) return '';
  const stem = conjugate(verb, 'masu-stem');
  return stem ? 'お' + stem + (kind === 'honorific' ? 'になる' : 'する') : '';
}

export function regularHonorificForm(verb) {
  return keigoForm(verb, 'honorific');
}

export function regularHumbleForm(verb) {
  return keigoForm(verb, 'humble');
}

export function politeKeigoForm(form) {
  if (!form) return '';
  for (const [plain, polite] of Object.entries(KEIGO_POLITE_OVERRIDES)) {
    if (form.endsWith(plain)) return form.slice(0, -plain.length) + polite;
  }
  if (form.endsWith('する')) return form.slice(0, -2) + 'します';
  const last = form.slice(-1),
    stem = form.slice(0, -1);
  if (I_ROW[last]) return stem + I_ROW[last] + 'ます';
  return '';
}

const ruEnding = (ending) => (form) =>
  form && form.endsWith('る') ? form.slice(0, -1) + ending : '';
export const politeRuForm = ruEnding('ます');
export const politePastRuForm = ruEnding('ました');
export const pastRuForm = ruEnding('た');
export const pastNegativeRuForm = ruEnding('なかった');
export const conditionalRuForm = ruEnding('れば');
export const negativeRuForm = ruEnding('ない');
export const politeNegativeRuForm = ruEnding('ません');
export const politePastNegativeRuForm = ruEnding('ませんでした');
export function negativeBaForm(form) {
  return form && form.endsWith('ない') ? form.slice(0, -2) + 'なければ' : '';
}
export function negativeTeConnectiveForm(form) {
  return form && form.endsWith('ない') ? form.slice(0, -2) + 'なくて' : '';
}

export function negativeZuForm(verb) {
  const { reading, group } = verb;
  if (group === 'ichidan') return reading.slice(0, -1) + 'ず';
  if (group === 'godan') {
    const stem = reading.slice(0, -1),
      last = reading.slice(-1);
    return stem + A_ROW[last] + 'ず';
  }
  if (group === 'suru') return (reading.endsWith('する') ? reading.slice(0, -2) : '') + 'せず';
  if (group === 'kuru') return (reading.endsWith('くる') ? reading.slice(0, -2) : '') + 'こず';
  return '';
}

export function negativeZuniForm(verb) {
  const form = negativeZuForm(verb);
  return form ? form + 'に' : '';
}
export function progressiveAspectForm(verb, ending) {
  const te = conjugate(verb, 'te-form');
  return te ? te + ending : '';
}

export function commandNasaiForm(verb) {
  // These honorific ます-stems would produce duplicates such as なさいなさい.
  if (/(?:なさ|いらっしゃ|おっしゃ|くださ|ござ)る$/.test(verb.reading)) return '';
  const stem = conjugate(verb, 'masu-stem');
  return stem ? stem + 'なさい' : '';
}

export function conjugate(verb, type) {
  const { reading, group } = verb;
  if (isSuppressedVerbForm(verb, type)) return '';
  if (type === 'honorific') return keigoForm(verb, 'honorific');
  if (type === 'humble') return keigoForm(verb, 'humble');
  if (type === 'honorific-polite') return politeKeigoForm(keigoForm(verb, 'honorific'));
  if (type === 'humble-polite') return politeKeigoForm(keigoForm(verb, 'humble'));
  const shortCausativeBase =
    type.startsWith('short-') && FORM_GROUP_TYPE_IDS.causative.includes(type)
      ? {
          '': 'plain-present',
          polite: 'polite-present',
          negative: 'plain-negative',
          past: 'plain-past',
          'past-negative': 'plain-past-negative',
        }[type.slice(16)] || type.slice(16)
      : null;
  if (shortCausativeBase) return conjugateShortCausative(verb, shortCausativeBase);
  const derived = type.match(
    /^(potential|passive|causative(?:-passive)?|short-causative-passive)-(.+)$/,
  );
  const transform =
    derived &&
    {
      polite: politeRuForm,
      'polite-past': politePastRuForm,
      past: pastRuForm,
      'past-negative': pastNegativeRuForm,
      'conditional-ba': conditionalRuForm,
      negative: negativeRuForm,
      'negative-conditional-ba': (form) => negativeBaForm(negativeRuForm(form)),
      'polite-negative': politeNegativeRuForm,
      'polite-past-negative': politePastNegativeRuForm,
    }[derived[2]];
  if (transform) return transform(conjugate(verb, derived[1]));
  if (type === 'negative-conditional-ba') return negativeBaForm(conjugate(verb, 'plain-negative'));
  if (type === 'negative-te-connective')
    return negativeTeConnectiveForm(conjugate(verb, 'plain-negative'));
  if (type === 'negative-zu') return negativeZuForm(verb);
  if (type === 'negative-zuni') return negativeZuniForm(verb);
  const progressiveEnding = {
    progressive: 'いる',
    'progressive-polite': 'います',
    'progressive-negative': 'いない',
    'progressive-polite-negative': 'いません',
    'progressive-past': 'いた',
    'progressive-polite-past': 'いました',
    'progressive-past-negative': 'いなかった',
    'progressive-polite-past-negative': 'いませんでした',
  }[type];
  if (progressiveEnding) return progressiveAspectForm(verb, progressiveEnding);
  if (type === 'command-nasai') return commandNasaiForm(verb);
  if (type === 'short-causative-passive') return shortCausativePassive(verb);
  const desiderativeEnding = {
    desiderative: 'たい',
    'desiderative-polite': 'たいです',
    'desiderative-negative': 'たくない',
    'desiderative-polite-negative': 'たくないです',
    'desiderative-past': 'たかった',
    'desiderative-polite-past': 'たかったです',
    'desiderative-past-negative': 'たくなかった',
    'desiderative-polite-past-negative': 'たくなかったです',
  }[type];
  if (desiderativeEnding) return desiderativeStem(verb) + desiderativeEnding;
  if (group === 'ichidan') {
    const stem = reading.slice(0, -1);
    const te = stem + 'て',
      neg = stem + 'ない',
      past = stem + 'た';
    const M = {
      'plain-present': reading,
      'plain-past': past,
      'plain-negative': neg,
      'plain-past-negative': stem + 'なかった',
      'polite-present': stem + 'ます',
      'polite-past': stem + 'ました',
      'polite-negative': stem + 'ません',
      'polite-past-negative': stem + 'ませんでした',
      'masu-stem': stem,
      'polite-volitional': stem + 'ましょう',
      'polite-te': stem + 'まして',
      'polite-conditional-tara': stem + 'ましたら',
      'te-form': te,
      potential: stem + 'られる',
      volitional: stem + 'よう',
      'conditional-tara': past + 'ら',
      'negative-conditional-tara': stem + 'なかったら',
      'conditional-ba': stem + 'れば',
      'conditional-nara': reading + 'なら',
      conjectural: reading + 'だろう',
      imperative: stem + 'ろ',
      passive: stem + 'られる',
      causative: stem + 'させる',
      'causative-passive': stem + 'させられる',
      'negative-te': neg + 'で',
      prohibition: reading + 'な',
      'request-kudasai': te + 'ください',
      'negative-request': neg + 'でください',
      permission: te + 'もいい',
      obligation: neg.slice(0, -1) + 'ければならない',
    };
    return M[type] || '';
  }
  if (group === 'godan') {
    const stem = reading.slice(0, -1),
      last = reading.slice(-1);
    let pastEnd = PAST_END[last],
      teEnd = TE_END[last];
    if (reading === 'いく' || reading.endsWith('いく')) {
      pastEnd = 'った';
      teEnd = 'って';
    }
    if (['とう', 'こう'].includes(reading)) {
      pastEnd = 'うた';
      teEnd = 'うて';
    }
    const neg = reading === 'ある' ? 'ない' : stem + A_ROW[last] + 'ない';
    const pastNeg = reading === 'ある' ? 'なかった' : stem + A_ROW[last] + 'なかった';
    const te = stem + teEnd,
      past = stem + pastEnd,
      iStem = /(?:なさ|いらっしゃ|おっしゃ|くださ|ござ)る$/.test(reading)
        ? stem + 'い'
        : stem + I_ROW[last],
      aStem = stem + A_ROW[last],
      eStem = stem + E_ROW[last],
      oStem = stem + O_ROW[last];
    const M = {
      'plain-present': reading,
      'plain-past': past,
      'plain-negative': neg,
      'plain-past-negative': pastNeg,
      'polite-present': iStem + 'ます',
      'polite-past': iStem + 'ました',
      'polite-negative': iStem + 'ません',
      'polite-past-negative': iStem + 'ませんでした',
      'masu-stem': iStem,
      'polite-volitional': iStem + 'ましょう',
      'polite-te': iStem + 'まして',
      'polite-conditional-tara': iStem + 'ましたら',
      'te-form': te,
      potential: eStem + 'る',
      volitional: oStem + 'う',
      'conditional-tara': past + 'ら',
      'negative-conditional-tara': pastNeg + 'ら',
      'conditional-ba': eStem + 'ば',
      'conditional-nara': reading + 'なら',
      conjectural: reading + 'だろう',
      imperative: /(?:なさ|いらっしゃ|おっしゃ|くださ)る$/.test(reading) ? iStem : eStem,
      passive: aStem + 'れる',
      causative: aStem + 'せる',
      'causative-passive': aStem + 'せられる',
      'negative-te': neg + 'で',
      prohibition: reading + 'な',
      'request-kudasai': te + 'ください',
      'negative-request': neg + 'でください',
      permission: te + 'もいい',
      obligation: neg.slice(0, -1) + 'ければならない',
    };
    return M[type] || '';
  }
  if (group === 'suru') {
    const stem = reading.endsWith('する') && reading !== 'する' ? reading.slice(0, -2) : '';
    const M = {
      'plain-present': 'する',
      'plain-past': 'した',
      'plain-negative': 'しない',
      'plain-past-negative': 'しなかった',
      'polite-present': 'します',
      'polite-past': 'しました',
      'polite-negative': 'しません',
      'polite-past-negative': 'しませんでした',
      'masu-stem': 'し',
      'polite-volitional': 'しましょう',
      'polite-te': 'しまして',
      'polite-conditional-tara': 'しましたら',
      'te-form': 'して',
      potential: 'できる',
      volitional: 'しよう',
      'conditional-tara': 'したら',
      'negative-conditional-tara': 'しなかったら',
      'conditional-ba': 'すれば',
      'conditional-nara': 'するなら',
      conjectural: 'するだろう',
      imperative: 'しろ',
      passive: 'される',
      causative: 'させる',
      'causative-passive': 'させられる',
      'negative-te': 'しないで',
      prohibition: 'するな',
      'request-kudasai': 'してください',
      'negative-request': 'しないでください',
      permission: 'してもいい',
      obligation: 'しなければならない',
    };
    return stem + (M[type] || '');
  }
  if (group === 'kuru') {
    const stem = reading.endsWith('くる') ? reading.slice(0, -2) : '';
    const M = {
      'plain-present': 'くる',
      'plain-past': 'きた',
      'plain-negative': 'こない',
      'plain-past-negative': 'こなかった',
      'polite-present': 'きます',
      'polite-past': 'きました',
      'polite-negative': 'きません',
      'polite-past-negative': 'きませんでした',
      'masu-stem': 'き',
      'polite-volitional': 'きましょう',
      'polite-te': 'きまして',
      'polite-conditional-tara': 'きましたら',
      'te-form': 'きて',
      potential: 'こられる',
      volitional: 'こよう',
      'conditional-tara': 'きたら',
      'negative-conditional-tara': 'こなかったら',
      'conditional-ba': 'くれば',
      'conditional-nara': 'くるなら',
      conjectural: 'くるだろう',
      imperative: 'こい',
      passive: 'こられる',
      causative: 'こさせる',
      'causative-passive': 'こさせられる',
      'negative-te': 'こないで',
      prohibition: 'くるな',
      'request-kudasai': 'きてください',
      'negative-request': 'こないでください',
      permission: 'きてもいい',
      obligation: 'こなければならない',
    };
    return stem + (M[type] || '');
  }
  return '';
}

export function adjectiveStem(adj) {
  const reading = adj.reading;
  if (usesYoiAdjectiveStem(adj)) return reading.slice(0, -2) + 'よ';
  return reading.endsWith('い') ? reading.slice(0, -1) : reading;
}

function usesYoiAdjectiveStem(adj) {
  const reading = adj?.reading || '';
  return !!(
    adj?.irregular ||
    reading === 'いい' ||
    reading === 'よい' ||
    reading === 'かっこいい' ||
    reading === 'ちょうどいい' ||
    reading.endsWith('がいい')
  );
}

function yoiSurfaceStem(adj) {
  if (adj?.dict?.endsWith('いい')) return adj.dict.slice(0, -2) + 'よ';
  if (adj?.dict === '良い') return adj.dict.slice(0, -1);
  return '';
}

export function conjugateAdjective(adj, type) {
  const { reading, group } = adj;
  if (group === 'i-adjective') {
    const stem = adjectiveStem(adj);
    // かわいそう is the lexical word "pitiable", not "looks cute".
    const sou =
      reading === 'かわいい'
        ? ''
        : stem + (usesYoiAdjectiveStem(adj) || reading === 'ない' ? 'さそう' : 'そう');
    const past = stem + 'かった',
      neg = stem + 'くない',
      pastNeg = stem + 'くなかった';
    const M = {
      'adj-plain-present': reading,
      'adj-plain-past': past,
      'adj-plain-negative': neg,
      'adj-plain-past-negative': pastNeg,
      'adj-polite-present': reading + 'です',
      'adj-polite-past': past + 'です',
      'adj-polite-negative': neg + 'です',
      'adj-polite-past-negative': pastNeg + 'です',
      'adj-te-form': stem + 'くて',
      'adj-negative-te-form': negativeTeConnectiveForm(neg),
      'adj-adverb': stem + 'く',
      'adj-attributive': reading,
      'adj-conditional': stem + 'ければ',
      'adj-negative-conditional': negativeBaForm(neg),
      'adj-tara': past + 'ら',
      'adj-negative-tara': pastNeg + 'ら',
      'adj-sou': sou,
      'adj-sugiru': stem + (reading === 'ない' ? 'さすぎる' : 'すぎる'),
      'adj-naru': stem + 'くなる',
    };
    return M[type] || '';
  }
  if (group === 'na-adjective') {
    const stem = reading.replace(/na$/, '').replace(/な$/, '');
    const M = {
      'adj-plain-present': stem + 'だ',
      'adj-plain-past': stem + 'だった',
      'adj-plain-negative': stem + 'ではない',
      'adj-plain-past-negative': stem + 'ではなかった',
      'adj-polite-present': stem + 'です',
      'adj-polite-past': stem + 'でした',
      'adj-polite-negative': stem + 'ではありません',
      'adj-polite-past-negative': stem + 'ではありませんでした',
      'adj-te-form': stem + 'で',
      'adj-negative-te-form': negativeTeConnectiveForm(stem + 'ではない'),
      'adj-adverb': stem + 'に',
      'adj-attributive':
        stem +
        (['ふつう', 'ほんと', 'ほんとう', 'きいろ', 'たくさん'].includes(stem)
          ? 'の'
          : stem === 'おなじ'
            ? ''
            : 'な'),
      'adj-conditional': stem + 'なら',
      'adj-negative-conditional': negativeBaForm(stem + 'ではない'),
      'adj-tara': stem + 'だったら',
      'adj-negative-tara': stem + 'ではなかったら',
      'adj-sou': stem + 'そう',
      'adj-sugiru': stem + 'すぎる',
      'adj-naru': stem + 'になる',
    };
    return M[type] || '';
  }
  return '';
}

export function conjugateItem(item, type) {
  return item.group === 'i-adjective' || item.group === 'na-adjective'
    ? conjugateAdjective(item, type)
    : conjugate(item, type);
}

export function getConjugationParts(word, type, answer) {
  const ans = answer || conjugateItem(word, type);
  if (!ans) return { stem: '', change: '', suffix: '' };
  // A lexical replacement does not retain the original word's stem, even
  // when the two words happen to start with the same kana.
  if (getSpecialKeigoBase(word, type)) return { stem: '', change: '', suffix: ans };

  const reading = word.reading;
  const dict = word.dict;
  const group = word.group;
  const isAdj = isAdjective(word);
  const isNominal = isAdj;

  let stem = '';
  if (isNominal) {
    if (group === 'i-adjective') {
      stem = adjectiveStem(word);
    } else {
      stem = reading.replace(/な$/, '');
    }
  } else {
    if (group === 'ichidan') {
      stem = reading.slice(0, -1);
    } else if (group === 'godan') {
      stem = reading.slice(0, -1);
    } else if (group === 'suru') {
      stem = reading.endsWith('する') ? reading.slice(0, -2) : '';
    } else if (group === 'kuru') {
      stem = reading.endsWith('くる') ? reading.slice(0, -2) : '';
    }
  }

  let displayStem = stem;
  if (dict && reading && dict.length === reading.length) {
    displayStem = dict.slice(0, stem.length);
  } else if (dict && reading) {
    const diff = reading.length - stem.length;
    displayStem = dict.slice(0, Math.max(0, dict.length - diff));
  }

  let remainder = '';
  let matchedStem = '';
  if (ans.startsWith(displayStem)) {
    matchedStem = displayStem;
    remainder = ans.slice(displayStem.length);
  } else if (ans.startsWith(stem)) {
    matchedStem = stem;
    remainder = ans.slice(stem.length);
  } else {
    if (group === 'kuru') {
      if (ans.startsWith('来')) {
        matchedStem = '来';
        remainder = ans.slice(1);
      } else if (ans.startsWith('き') || ans.startsWith('こ') || ans.startsWith('く')) {
        matchedStem = ans.slice(0, 1);
        remainder = ans.slice(1);
      } else {
        matchedStem = '';
        remainder = ans;
      }
    } else {
      matchedStem = '';
      remainder = ans;
    }
  }

  let change = '';
  let suffix = remainder;

  if (isNominal) {
    if (group === 'i-adjective') {
      if (remainder.startsWith('か')) {
        change = 'か';
        suffix = remainder.slice(1);
      } else if (remainder.startsWith('く')) {
        change = 'く';
        suffix = remainder.slice(1);
      } else if (remainder.startsWith('い')) {
        change = 'い';
        suffix = remainder.slice(1);
      }
    } else {
      change = '';
      suffix = remainder;
    }
  } else {
    if (group === 'ichidan') {
      change = '';
      suffix = remainder;
    } else if (group === 'godan') {
      change = remainder.slice(0, 1);
      suffix = remainder.slice(1);
    } else if (group === 'suru') {
      const S = remainder;
      if (S.startsWith('させら')) {
        change = 'させら';
        suffix = S.slice(4);
      } else if (S.startsWith('させ')) {
        change = 'させ';
        suffix = S.slice(2);
      } else if (S.startsWith('され')) {
        change = 'され';
        suffix = S.slice(2);
      } else if (S.startsWith('でき')) {
        change = 'でき';
        suffix = S.slice(2);
      } else if (S.startsWith('しよ')) {
        change = 'しよ';
        suffix = S.slice(2);
      } else if (S.startsWith('し')) {
        change = 'し';
        suffix = S.slice(1);
      } else if (S.startsWith('す')) {
        change = 'す';
        suffix = S.slice(1);
      } else {
        change = S.slice(0, 1);
        suffix = S.slice(1);
      }
    } else if (group === 'kuru') {
      const S = remainder;
      if (S.startsWith('させら')) {
        change = 'させら';
        suffix = S.slice(4);
      } else if (S.startsWith('させ')) {
        change = 'させ';
        suffix = S.slice(2);
      } else if (S.startsWith('られ')) {
        change = 'られ';
        suffix = S.slice(2);
      } else if (S.startsWith('よ')) {
        change = 'よ';
        suffix = S.slice(1);
      } else if (S.startsWith('い')) {
        change = 'い';
        suffix = S.slice(1);
      } else if (S.startsWith('れ')) {
        change = 'れ';
        suffix = S.slice(1);
      } else {
        change = '';
        suffix = S;
      }
    }
  }

  return { stem: matchedStem, change, suffix };
}

export function isAdjective(item) {
  return item.group === 'i-adjective' || item.group === 'na-adjective';
}

export function surfaceStemPair(item) {
  if (!item || !item.reading || !item.dict) return { readingStem: '', dictStem: '' };
  if (item.group === 'suru')
    return {
      readingStem: item.reading.endsWith('する') ? item.reading.slice(0, -2) : '',
      dictStem: item.dict.endsWith('する') ? item.dict.slice(0, -2) : item.dict,
    };
  if (item.group === 'kuru')
    return {
      readingStem: item.reading.endsWith('くる') ? item.reading.slice(0, -2) : '',
      dictStem: item.dict.replace(/(来る|くる)$/, ''),
    };
  if (item.group === 'i-adjective') {
    if (usesYoiAdjectiveStem(item))
      return {
        readingStem: adjectiveStem(item),
        dictStem: yoiSurfaceStem(item),
      };
    if (item.dict === '良い')
      return { readingStem: adjectiveStem(item), dictStem: item.dict.slice(0, -1) };
    return {
      readingStem: adjectiveStem(item),
      dictStem: item.dict.endsWith('い') ? item.dict.slice(0, -1) : item.dict,
    };
  }
  if (item.group === 'na-adjective')
    return { readingStem: item.reading.replace(/な$/, ''), dictStem: item.dict.replace(/な$/, '') };
  return { readingStem: item.reading.slice(0, -1), dictStem: item.dict.slice(0, -1) };
}

export function surfaceFormFor(item, typeId) {
  const answer = conjugateItem(item, typeId);
  if (!answer || !item || !item.dict || item.dict === item.reading) return answer || '';
  if (getSpecialKeigoBase(item, typeId)) return answer;
  if (item.group === 'i-adjective' && usesYoiAdjectiveStem(item)) {
    if (answer.startsWith(item.reading)) return item.dict + answer.slice(item.reading.length);
    const readingStem = adjectiveStem(item);
    const dictStem = yoiSurfaceStem(item);
    if (readingStem && dictStem && answer.startsWith(readingStem)) {
      return dictStem + answer.slice(readingStem.length);
    }
    return answer;
  }
  const { readingStem, dictStem } = surfaceStemPair(item);
  if (item.group === 'kuru' && answer.startsWith(readingStem)) {
    const tail = answer.slice(readingStem.length);
    if (['き', 'こ', 'く'].includes(tail[0])) return dictStem + '来' + tail.slice(1);
    return dictStem + tail;
  }
  if (readingStem && answer.startsWith(readingStem))
    return dictStem + answer.slice(readingStem.length);
  return answer;
}

// ============================================================================
// RULE TAXONOMY
// ============================================================================
export const RULES = (() => {
  const rules = [];
  for (const g of ['ichidan', 'godan', 'suru', 'kuru']) {
    for (const t of CONJ_TYPES) {
      const ikuEx = g === 'godan' && (t.id === 'plain-past' || t.id === 'te-form');
      rules.push({
        id: `${g}|${t.id}`,
        group: g,
        type: t.id,
        label: groupDisplayLabel(g),
        verbFilter: (verbs) =>
          verbs.filter((v) => v.group === g && (!ikuEx || !v.reading.endsWith('いく'))),
      });
    }
  }
  for (const t of ['plain-past', 'te-form']) {
    rules.push({
      id: `exception-いく|${t}`,
      group: 'godan',
      type: t,
      label: '行く Exception',
      verbFilter: (verbs) => verbs.filter((v) => v.group === 'godan' && v.reading.endsWith('いく')),
    });
  }
  for (const g of ['i-adjective', 'na-adjective', 'noun']) {
    for (const t of ADJ_TYPES) {
      rules.push({
        id: `${g}|${t.id}`,
        group: g,
        type: t.id,
        label: groupShortLabel(g),
        verbFilter: (words) => words.filter((w) => w.group === g),
      });
    }
  }
  return rules;
})();

export { getTypeInfo };
