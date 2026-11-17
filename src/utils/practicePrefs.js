import { DEFAULT_PREFS } from '../data/defaults.js';

const RETIRED_REPAIR_DRILL_LIST_ID = 'repair-drill';

export function resolveDisplayScripts(prefs = DEFAULT_PREFS) {
  const ds = prefs.displayScripts;
  if (ds && (ds.kanji || ds.kana || ds.romaji)) {
    return { kanji: !!ds.kanji, kana: !!ds.kana, romaji: !!ds.romaji };
  }
  if (prefs.scriptMode === 'hiragana') return { kanji: false, kana: true, romaji: false };
  if (prefs.scriptMode === 'romaji') return { kanji: false, kana: false, romaji: true };
  if (prefs.scriptMode === 'all') return { kanji: true, kana: true, romaji: true };
  return { kanji: true, kana: true, romaji: false };
}

export function scriptModeFromDisplay(ds) {
  if (ds.kanji && ds.kana && ds.romaji) return 'all';
  if (!ds.kanji && ds.kana && !ds.romaji) return 'hiragana';
  if (!ds.kanji && !ds.kana && ds.romaji) return 'romaji';
  return 'kanji';
}

export function normalizeAnswerMode(value) {
  return ['input', 'choice', 'self-check', 'speak'].includes(value)
    ? value
    : DEFAULT_PREFS.answerMode;
}

export function resolveKanaAssist(prefs = DEFAULT_PREFS) {
  if (['off', 'live', 'guided'].includes(prefs?.kanaAssist)) return prefs.kanaAssist;
  if (prefs?.answerMode === 'guided') return 'guided';
  if (prefs?.kanaMatchDisplay === 'none') return 'off';
  if (['color', 'color-count'].includes(prefs?.kanaMatchDisplay)) return 'live';
  return DEFAULT_PREFS.kanaAssist;
}

export function autoAdvanceAnswerFormKey(prefs = DEFAULT_PREFS) {
  const answerMode = normalizeAnswerMode(prefs?.answerMode);
  if (answerMode !== 'input') return answerMode;
  return `input-${resolveKanaAssist(prefs)}`;
}

function defaultAutoAdvanceForAnswerForm(key) {
  return key === 'input-guided';
}

export function resolveAutoAdvanceCorrect(prefs = DEFAULT_PREFS) {
  const key = autoAdvanceAnswerFormKey(prefs);
  const byForm =
    prefs?.autoAdvanceCorrectByAnswerForm &&
    typeof prefs.autoAdvanceCorrectByAnswerForm === 'object'
      ? prefs.autoAdvanceCorrectByAnswerForm
      : {};
  if (Object.prototype.hasOwnProperty.call(byForm, key)) return byForm[key] !== false;
  return defaultAutoAdvanceForAnswerForm(key);
}

export function kanaMatchDisplayForPrefs(prefs = DEFAULT_PREFS) {
  return resolveKanaAssist(prefs) === 'off' ? 'none' : 'color-count';
}

export function mergePracticePrefs(prefs) {
  const source = { ...(prefs || {}) };
  const answerMode = normalizeAnswerMode(source.answerMode);
  const kanaAssist = resolveKanaAssist(source);
  const reviewStyle = ['auto', 'forms', 'reading'].includes(source.reviewStyle)
    ? source.reviewStyle
    : DEFAULT_PREFS.reviewStyle;
  const sourceFormStrategy = ['auto', 'dictionary', 'masu', 'mixed'].includes(
    source.sourceFormStrategy,
  )
    ? source.sourceFormStrategy
    : source.promptForm === 'random' || source.promptForm === 'mixed'
      ? 'mixed'
      : source.promptForm === 'polite-present' || source.promptForm === 'masu'
        ? 'masu'
        : DEFAULT_PREFS.sourceFormStrategy;
  delete source.kanaMatchDisplay;
  delete source.durationSec;
  delete source.skipDuplicateForms;
  delete source.trickQuestions;
  delete source.colorCodeConjugations;
  delete source.aiGuideTone;
  delete source.drillMode;
  delete source.drillDirection;
  const reviewLimitSource = ['lab', 'recommendation'].includes(source.reviewLimitSource)
    ? source.reviewLimitSource
    : '';
  const rawReviewLimit = Number(source.reviewLimit || 0);
  const reviewLimit =
    reviewLimitSource && Number.isFinite(rawReviewLimit) && rawReviewLimit > 0 ? rawReviewLimit : 0;
  const wordListIds = Array.isArray(source.wordListIds)
    ? source.wordListIds.filter((id) => id && id !== RETIRED_REPAIR_DRILL_LIST_ID)
    : DEFAULT_PREFS.wordListIds;
  const minimalPairReturn =
    source.minimalPairReturn && typeof source.minimalPairReturn === 'object'
      ? (() => {
          const saved = { ...source.minimalPairReturn };
          if (saved.reviewLimitSource === 'repair') {
            saved.reviewLimitSource = '';
            saved.reviewLimit = 0;
          }
          if (Array.isArray(saved.wordListIds)) {
            saved.wordListIds = saved.wordListIds.filter(
              (id) => id && id !== RETIRED_REPAIR_DRILL_LIST_ID,
            );
          }
          return saved;
        })()
      : DEFAULT_PREFS.minimalPairReturn;
  const displayScripts = source.displayScripts
    ? { ...DEFAULT_PREFS.displayScripts, ...source.displayScripts }
    : resolveDisplayScripts(source);
  const autoAdvanceCorrectUserSet = !!source.autoAdvanceCorrectUserSet;
  const activeAutoAdvanceKey = autoAdvanceAnswerFormKey({ ...source, answerMode, kanaAssist });
  const autoAdvanceCorrectByAnswerForm =
    source.autoAdvanceCorrectByAnswerForm &&
    typeof source.autoAdvanceCorrectByAnswerForm === 'object' &&
    !Array.isArray(source.autoAdvanceCorrectByAnswerForm)
      ? Object.fromEntries(
          Object.entries(source.autoAdvanceCorrectByAnswerForm)
            .filter(([key]) =>
              ['input-guided', 'input-live', 'input-off', 'choice', 'self-check', 'speak'].includes(
                key,
              ),
            )
            .map(([key, value]) => [key, value !== false]),
        )
      : {};
  if (
    autoAdvanceCorrectUserSet &&
    !Object.prototype.hasOwnProperty.call(autoAdvanceCorrectByAnswerForm, activeAutoAdvanceKey)
  ) {
    autoAdvanceCorrectByAnswerForm[activeAutoAdvanceKey] = source.autoAdvanceCorrect !== false;
  }
  const autoAdvanceCorrect = resolveAutoAdvanceCorrect({
    ...source,
    answerMode,
    kanaAssist,
    autoAdvanceCorrectByAnswerForm,
  });
  let wordGroups = Array.isArray(source.wordGroups)
    ? [...source.wordGroups]
    : DEFAULT_PREFS.wordGroups;
  const oldAllGroups = ['ichidan', 'godan', 'suru', 'kuru', 'i-adjective', 'na-adjective'];
  if (
    Array.isArray(source.wordGroups) &&
    oldAllGroups.every((id) => source.wordGroups.includes(id)) &&
    !wordGroups.includes('irregular-adjective')
  ) {
    wordGroups = [...wordGroups, 'irregular-adjective'];
  }
  for (const key of Object.keys(source)) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_PREFS, key)) delete source[key];
  }
  return {
    ...DEFAULT_PREFS,
    ...source,
    answerMode,
    kanaAssist,
    displayScripts,
    autoAdvanceCorrect,
    autoAdvanceCorrectUserSet,
    autoAdvanceCorrectByAnswerForm,
    reviewStyle,
    sourceFormStrategy,
    promptForm:
      sourceFormStrategy === 'mixed'
        ? 'random'
        : sourceFormStrategy === 'masu'
          ? 'polite-present'
          : 'dictionary',
    wordGroups,
    wordListIds,
    minimalPairReturn,
    reviewLimit,
    reviewLimitSource,
  };
}
