import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import {
  IconCheck,
  IconX,
  IconVolume,
  IconSpark,
  IconChat,
  IconEye,
  IconEyeOff,
  IconFlame,
  IconMic,
  IconPlus,
} from '../components/Icons.jsx';
import {
  ALL_CARD_TYPES,
  FORM_GROUPS,
  TE_TA_SOUND_CHANGE_FAMILY_ID,
} from '../data/conjugationTypes.js';
import {
  getSpeechRecognitionConstructor,
  playPronunciation,
  speechRecognitionErrorMessage,
} from '../utils/speech.js';
import { useApp } from '../state/AppStateContext.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import { ContextExamplePanel } from '../components/ContextExamplePanel.jsx';
import { ConjugationBreakdown } from '../components/ConjugationBreakdown.jsx';
import { ChatPanel } from '../components/ChatPanel.jsx';
import { toHiragana, toHiraganaProgress, toKanaInputValue } from '../utils/romaji.js';
import {
  conjugateItem,
  enabledTypeIdsFor,
  pickPromptType,
  getTypeInfo,
  getWordMeta,
  isAdjective,
  isRedundantPracticeType,
  surfaceFormFor,
} from '../utils/conjugator.js';
import { filterWordsForStudyScope } from '../utils/vocabularyProgression.js';
import {
  explainItem,
  getOfflineTemplateSentence,
  stepCoachHint,
} from '../utils/conjugatorExplain.js';
import { groupAliasText, groupDisplayLabel } from '../utils/groupDisplay.js';
import {
  selectNext,
  buildFocusCard,
  recordMistake,
  markMistakeResolved,
  gradeCard,
  bumpDaily,
  localDateKey,
  typeIdFromCardId,
} from '../utils/storage.js';
import { READINESS_DIMENSIONS, recordReadinessAttempt } from '../utils/readiness.js';
import {
  formDisplay,
  promptDisplay,
  englishForForm,
  answerPhaseTaskDetails,
  makeChoices,
  makeReverseChoices,
  dictionaryAnswerMatches,
  normalizeAnswerMode,
  resolveKanaAssist,
  kanaMatchDisplayForPrefs,
  typoGuardForAnswer,
  spokenAnswerResult,
} from '../utils/display.js';
import { sentenceDisplay } from '../utils/sentenceDisplay.js';
import {
  bumpSessionMistakePattern,
  labRouteForMistakePattern,
  rankSessionMistakePatterns,
} from '../utils/mistakeDiagnosis.js';
import {
  clearMinimalPairPrefs,
  getMinimalPairSet,
  minimalPairFeedbackForCard,
  minimalPairReturnEnabledTypes,
  minimalPairSetMatchesCard,
  recordMinimalPairResult,
} from '../utils/minimalPairs.js';
import { buildRuleCandidates } from '../utils/ruleCandidates.js';
import { TODAY_DRILL_LIST_ID } from '../utils/todayDrill.js';
import { buildWeaknessFamilyRows, recordWeaknessAttempt } from '../utils/subcategoryWeakness.js';
import {
  excludeWordFromReviewState,
  includeFormFamilyInReviewState,
  includeWordInReviewState,
  reviewTypeIdsForState,
} from '../utils/reviewScope.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import StickyAction from '../components/StickyAction.jsx';
import { kanaCoachCells, explainReversePrompt } from '../utils/kanaCoach.js';
export { kanaCoachCells, explainReversePrompt };

// Keep the active card across a page refresh so reloading Study resumes the
// same word/form rather than drawing a fresh one. Scoped to sessionStorage so
// it survives reloads but resets when the tab is closed.
const STUDY_CURRENT_KEY = 'jp-study-current';
const DICTIONARY_TYPE_ID = 'dictionary';
const DICTIONARY_TYPE_INFO = { label: 'Dictionary Form', sub: '辞書形', hint: 'dictionary form' };
const REVIEW_LIMIT_SOURCES = new Set(['lab', 'recommendation']);
const REVIEW_SESSION_HISTORY_SIZE = 4;
const CORRECT_AUTO_ADVANCE_MS = 850;
const ANSWER_STYLE_OPTIONS = [
  { id: 'input', label: 'Type' },
  { id: 'choice', label: 'Choose' },
  { id: 'self-check', label: 'Self-check' },
  { id: 'speak', label: 'Speak' },
];

function activeReviewLimitFromPrefs(prefs = DEFAULT_PREFS) {
  if (!REVIEW_LIMIT_SOURCES.has(prefs.reviewLimitSource)) return 0;
  const limit = Number(prefs.reviewLimit || 0);
  return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

function isDailyGoalHitToday(daily) {
  return daily?.date === localDateKey() && !!daily.goalHit;
}

function transformationRouteText(sourceInfo, targetInfo) {
  return `${sourceInfo.label} -> ${targetInfo.label}`;
}

function transformationHintFromBase(baseHint, { reverseDrill, sourceInfo, targetInfo }) {
  const sourceLabel = sourceInfo?.label || 'source form';
  const targetLabel = targetInfo?.label || 'target form';
  const prefix = reverseDrill
    ? `Work backward from the ${sourceLabel}. Recover the dictionary form before thinking about any new ending.`
    : `Change ${sourceLabel} into ${targetLabel}: keep the same word, then rebuild the requested form.`;
  return {
    ...baseHint,
    text: `${prefix} ${baseHint.text}`,
  };
}

function transformationReviewExplanation({
  item,
  type,
  reverseDrill,
  sourceInfo,
  targetInfo,
  sourceForm,
  expected,
}) {
  const base = reverseDrill ? explainReversePrompt(item, type) : explainItem(item, type);
  const route = transformationRouteText(sourceInfo, targetInfo);
  const derivation =
    sourceForm && expected && sourceForm !== expected
      ? `${sourceForm} -> ${expected}`
      : base.derivation;
  if (reverseDrill) {
    return {
      ...base,
      intro: `${item.dict} (${item.reading}) was a ${route} transformation.`,
      rule: `Recognize the prompt as ${sourceInfo.label}, then recover the dictionary form. ${
        base.rule || ''
      }`.trim(),
      derivation,
    };
  }
  return {
    ...base,
    intro: `${item.dict} (${item.reading}) was a ${route} transformation.`,
    rule:
      sourceInfo.label === DICTIONARY_TYPE_INFO.label
        ? base.rule
        : `Recognize the prompt as ${sourceInfo.label}, keep the same word, then build ${
            targetInfo.label
          }. ${base.rule || ''}`.trim(),
    derivation,
    note: base.note
      ? `${base.note} The starting form is only the prompt; the answer is the target form.`
      : 'The starting form is only the prompt; the answer is the target form.',
  };
}

function sameStudyWord(a, b) {
  return !!a && !!b && a.dict === b.dict && a.group === b.group;
}

function cardMatchesPractice(card, words, enabledTypes, prefs = DEFAULT_PREFS) {
  if (!card?.verb || !card?.type) return false;
  if (!words.some((word) => sameStudyWord(word, card.verb))) return false;
  const minimalPairSet = getMinimalPairSet(prefs.minimalPairSetId);
  const activeTypes = minimalPairSet ? minimalPairSet.typeIds : enabledTypeIdsFor(enabledTypes);
  if (card.type === DICTIONARY_TYPE_ID) {
    return (prefs.reviewStyle || DEFAULT_PREFS.reviewStyle) === 'reading' || !!card.sourceType;
  }
  if (!activeTypes.includes(card.type)) return false;
  if (minimalPairSet && !minimalPairSetMatchesCard(minimalPairSet, card.verb, card.type)) {
    return false;
  }
  return !isRedundantPracticeType(card.verb, card.type, activeTypes, prefs);
}

function ReviewDisclosure({ tone = 'stone', summary, children, alwaysOpen = false }) {
  const toneClass =
    tone === 'rose'
      ? 'border-rose-200 dark:border-rose-900/60 bg-white/70 dark:bg-stone-950/50'
      : tone === 'emerald'
        ? 'border-emerald-200 dark:border-emerald-900/60 bg-white/70 dark:bg-stone-950/50'
        : 'border-stone-200 dark:border-stone-800 bg-white/70 dark:bg-stone-950/50';

  if (alwaysOpen) {
    return (
      <section className={`rounded-xl border ${toneClass} px-3 py-2`}>
        <div className="text-sm font-semibold text-stone-800 dark:text-stone-100">{summary}</div>
        <div className="mt-3 space-y-2.5">{children}</div>
      </section>
    );
  }

  return (
    <details className={`rounded-xl border ${toneClass} px-3 py-2`}>
      <summary className="cursor-pointer list-none text-sm font-semibold text-stone-800 dark:text-stone-100">
        <span className="inline-flex items-center gap-2">
          <span>{summary}</span>
          <span className="text-xs font-medium text-stone-500 dark:text-stone-400">More</span>
        </span>
      </summary>
      <div className="mt-3 space-y-2.5">{children}</div>
    </details>
  );
}

function ReviewChatSection({ tone = 'stone', chatOpen, onOpen, children }) {
  const toneClass =
    tone === 'rose'
      ? 'border-rose-200 dark:border-rose-900/60 bg-white/70 dark:bg-stone-950/50'
      : tone === 'emerald'
        ? 'border-emerald-200 dark:border-emerald-900/60 bg-white/70 dark:bg-stone-950/50'
        : 'border-stone-200 dark:border-stone-800 bg-white/70 dark:bg-stone-950/50';
  const buttonClass =
    tone === 'rose'
      ? 'border-rose-200 text-rose-700 hover:bg-rose-100/50 dark:border-rose-900 dark:text-rose-450 dark:hover:bg-rose-950/50'
      : tone === 'emerald'
        ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-100/50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/50'
        : 'border-stone-200 text-stone-700 hover:bg-stone-100/50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900/60';

  return (
    <section className={`rounded-xl border ${toneClass} px-3 py-2`}>
      <div className="text-sm font-semibold text-stone-800 dark:text-stone-100">
        3. Follow-up chat with AI
      </div>
      {!chatOpen ? (
        <button
          onClick={onOpen}
          aria-expanded={chatOpen}
          className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border py-2 text-sm transition ${buttonClass}`}
        >
          <IconChat className="h-4 w-4" /> Chat about this
        </button>
      ) : (
        <div className="mt-3">{children}</div>
      )}
    </section>
  );
}

function loadPersistedCurrent(state, words, enabledTypes, prefs) {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(STUDY_CURRENT_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved?.dict || !saved?.type) {
      clearPersistedCurrent();
      return null;
    }
    const snapshotWord =
      saved.word?.dict === saved.dict && saved.word?.group === saved.group ? saved.word : null;
    const resolvedWord = words.find(
      (w) =>
        w.dict === saved.dict &&
        w.group === saved.group &&
        (!saved.reading || w.reading === saved.reading) &&
        (snapshotWord || !saved.meaning || w.meaning === saved.meaning),
    );
    if (!snapshotWord && !resolvedWord) {
      clearPersistedCurrent();
      return null;
    }
    const word = snapshotWord || resolvedWord;
    const card = buildFocusCard(state, word, saved.type);
    if (!card || !cardMatchesPractice(card, words, enabledTypes, prefs)) {
      clearPersistedCurrent();
      return null;
    }
    return saved.sourceType ? { ...card, sourceType: saved.sourceType } : card;
  } catch {
    clearPersistedCurrent();
    return null;
  }
}

function snapshotStudyWord(word) {
  return {
    dict: word.dict,
    reading: word.reading,
    meaning: word.meaning,
    group: word.group,
    ...(word.jlpt ? { jlpt: word.jlpt } : {}),
    ...(word.lesson ? { lesson: word.lesson } : {}),
    ...(word.lessons ? { lessons: word.lessons } : {}),
    ...(word.minnaLesson ? { minnaLesson: word.minnaLesson } : {}),
    ...(word.minnaLessons ? { minnaLessons: word.minnaLessons } : {}),
  };
}

function persistCurrent(card) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (!card?.verb?.dict) return;
    sessionStorage.setItem(
      STUDY_CURRENT_KEY,
      JSON.stringify({
        dict: card.verb.dict,
        reading: card.verb.reading,
        meaning: card.verb.meaning,
        group: card.verb.group,
        type: card.type,
        sourceType: card.sourceType || null,
        word: snapshotStudyWord(card.verb),
      }),
    );
  } catch {}
}

function speechAlternativesFromEvent(event) {
  const transcripts = [];
  let isFinal = false;
  const results = event?.results;
  if (!results) return { transcripts, isFinal };
  for (let i = event.resultIndex || 0; i < results.length; i += 1) {
    const result = results[i];
    if (!result) continue;
    isFinal = isFinal || !!result.isFinal;
    for (let j = 0; j < result.length; j += 1) {
      const transcript = result[j]?.transcript?.trim();
      if (transcript) transcripts.push(transcript);
    }
  }
  return { transcripts, isFinal };
}

function bestSpeechAlternative(transcripts, targets) {
  let best = '';
  let bestScore = -1;
  for (const transcript of transcripts) {
    const result = spokenAnswerResult(targets, transcript);
    if (result.ok) return transcript;
    const score = result.score ?? 0;
    if (score > bestScore) {
      best = transcript;
      bestScore = score;
    }
  }
  return best || transcripts[0] || '';
}

function clearPersistedCurrent() {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(STUDY_CURRENT_KEY);
  } catch {}
}

function hasPersistedCurrent() {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    return !!sessionStorage.getItem(STUDY_CURRENT_KEY);
  } catch {
    return false;
  }
}

function StudyFocusBar({
  allWords,
  sessionFilterWord,
  onWordChange,
  sessionFilterFormGroupId,
  onFormGroupChange,
}) {
  const [wordQuery, setWordQuery] = useState('');
  const [mode, setMode] = useState(null); // null | 'word' | 'form'
  const inputRef = useRef(null);

  useEffect(() => {
    if (mode === 'word') inputRef.current?.focus();
  }, [mode]);

  const searchResults = useMemo(() => {
    if (!wordQuery.trim()) return [];
    const q = wordQuery.trim().toLowerCase();
    return allWords
      .filter(
        (w) =>
          w.dict?.includes(wordQuery) ||
          w.reading?.includes(wordQuery) ||
          w.meaning?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [wordQuery, allWords]);

  const hasFilter = !!sessionFilterWord || !!sessionFilterFormGroupId;
  const activeFormGroup = sessionFilterFormGroupId
    ? FORM_GROUPS.find((g) => g.id === sessionFilterFormGroupId)
    : null;

  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Focus practice
        </span>
        {sessionFilterWord && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300">
            <span lang="ja">{sessionFilterWord.dict}</span>
            <span className="text-indigo-300 dark:text-indigo-600">·</span>
            <span>{sessionFilterWord.meaning}</span>
            <button
              onClick={() => {
                onWordChange(null);
                setWordQuery('');
              }}
              className="ml-0.5 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200"
              aria-label="Remove word filter"
            >
              <IconX className="w-3 h-3" />
            </button>
          </span>
        )}
        {activeFormGroup && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-xs text-violet-700 dark:text-violet-300">
            {activeFormGroup.label}
            <button
              onClick={() => onFormGroupChange(null)}
              className="ml-0.5 text-violet-400 hover:text-violet-600 dark:hover:text-violet-200"
              aria-label="Remove form filter"
            >
              <IconX className="w-3 h-3" />
            </button>
          </span>
        )}
        {!sessionFilterWord && (
          <button
            onClick={() => setMode(mode === 'word' ? null : 'word')}
            className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition ${
              mode === 'word'
                ? 'border-indigo-300 bg-indigo-50 text-indigo-600 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300'
                : 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-indigo-300 hover:text-indigo-600 dark:hover:border-indigo-700 dark:hover:text-indigo-300'
            }`}
          >
            <IconPlus className="h-3 w-3" />
            Word
          </button>
        )}
        {!sessionFilterFormGroupId && (
          <button
            onClick={() => setMode(mode === 'form' ? null : 'form')}
            className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition ${
              mode === 'form'
                ? 'border-violet-300 bg-violet-50 text-violet-600 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300'
                : 'border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-violet-300 hover:text-violet-600 dark:hover:border-violet-700 dark:hover:text-violet-300'
            }`}
          >
            <IconPlus className="h-3 w-3" />
            Form
          </button>
        )}
        {hasFilter && (
          <button
            onClick={() => {
              onWordChange(null);
              onFormGroupChange(null);
              setMode(null);
              setWordQuery('');
            }}
            className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition ml-auto"
          >
            Clear all
          </button>
        )}
        {!hasFilter && mode !== null && (
          <button
            onClick={() => setMode(null)}
            className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition ml-auto"
          >
            Cancel
          </button>
        )}
      </div>

      {mode === 'word' && (
        <div>
          <input
            ref={inputRef}
            type="text"
            value={wordQuery}
            onChange={(e) => setWordQuery(e.target.value)}
            placeholder="Search by word, reading, or meaning…"
            className="w-full rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-sm text-stone-800 dark:text-stone-200 placeholder-stone-400 outline-none focus:border-indigo-300 dark:focus:border-indigo-600"
          />
          {searchResults.length > 0 && (
            <div className="mt-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 divide-y divide-stone-100 dark:divide-stone-800 max-h-48 overflow-y-auto">
              {searchResults.map((word) => (
                <button
                  key={`${word.dict}-${word.group}`}
                  onClick={() => {
                    onWordChange(word);
                    setWordQuery('');
                    setMode(null);
                  }}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-stone-50 dark:hover:bg-stone-800 transition"
                >
                  <span lang="ja" className="font-medium text-stone-900 dark:text-stone-100">
                    {word.dict}
                  </span>
                  <span className="text-stone-400 text-xs" lang="ja">
                    {word.reading}
                  </span>
                  <span className="text-stone-500 text-xs ml-auto truncate max-w-[120px]">
                    {word.meaning}
                  </span>
                </button>
              ))}
            </div>
          )}
          {wordQuery.trim() && !searchResults.length && (
            <div className="mt-1 text-xs text-stone-400 px-1">No matches</div>
          )}
        </div>
      )}

      {mode === 'form' && (
        <div className="flex flex-wrap gap-1.5">
          {FORM_GROUPS.map((group) => (
            <button
              key={group.id}
              onClick={() => {
                onFormGroupChange(group.id);
                setMode(null);
              }}
              className="px-2.5 py-1 rounded-full border text-xs transition border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:hover:border-violet-700 dark:hover:bg-violet-950/20 dark:hover:text-violet-300"
            >
              {group.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const WEAKNESS_ROW_TONE = {
  strong: 'bg-emerald-500',
  developing: 'bg-amber-500',
  weak: 'bg-rose-500',
};

function PracticeScopeSidebar({
  state,
  weaknessFamilies = [],
  onToggleFamily,
  onToggleType,
  className = '',
}) {
  const enabled = new Set(state.enabledTypes || []);
  const weaknessByFamily = new Map(weaknessFamilies.map((family) => [family.id, family]));
  const activeCount = (state.enabledTypes || []).length;

  return (
    <aside
      className={`space-y-3 lg:sticky lg:top-4 lg:self-start ${className}`}
      aria-label="Practice map"
    >
      <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              Practice map
            </div>
            <h2 className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-50">
              Practice map scope
            </h2>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Saved form scope for future workouts.
            </p>
          </div>
          <span className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-semibold tabular-nums text-stone-600 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300">
            {activeCount} saved forms
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {FORM_GROUPS.map((family) => {
            const enabledInFamily = family.typeIds.filter((typeId) => enabled.has(typeId));
            const allEnabled = enabledInFamily.length === family.typeIds.length;
            const weaknessRows = weaknessByFamily.get(family.id)?.rows || [];
            return (
              <details
                key={family.id}
                className="rounded-xl border border-stone-200 bg-stone-50/80 dark:border-stone-800 dark:bg-stone-950/70"
              >
                <summary className="cursor-pointer list-none px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                        {family.label}
                      </div>
                      <div className="mt-0.5 text-xs text-stone-500">
                        {enabledInFamily.length}/{family.typeIds.length} saved
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        onToggleFamily(family);
                      }}
                      className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                        allEnabled
                          ? 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:text-stone-950 dark:hover:bg-indigo-400'
                      }`}
                      aria-label={`${allEnabled ? 'Disable' : 'Enable'} all ${family.label} forms`}
                    >
                      {allEnabled ? 'Disable all' : 'Enable all'}
                    </button>
                  </div>
                </summary>
                <div className="border-t border-stone-200 px-3 py-3 dark:border-stone-800">
                  {weaknessRows.length > 0 && (
                    <div className="mb-3 space-y-1.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                        Recent weak spots
                      </div>
                      {weaknessRows.slice(0, 4).map((row) => (
                        <div
                          key={row.key}
                          className="rounded-lg border border-stone-200 bg-white px-2.5 py-2 dark:border-stone-800 dark:bg-stone-900"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate font-medium text-stone-700 dark:text-stone-200">
                              {row.typeLabel} - {row.subcategoryLabel}
                            </span>
                            <span className="tabular-nums text-stone-500">
                              {row.correct}/{row.attempted}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                            <span
                              className={`block h-full ${WEAKNESS_ROW_TONE[row.status] || 'bg-stone-300'}`}
                              style={{ width: `${Math.max(8, row.accuracy)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid gap-1.5">
                    {family.typeIds.map((typeId) => {
                      const type = ALL_CARD_TYPES.find((item) => item.id === typeId);
                      if (!type) return null;
                      const checked = enabled.has(typeId);
                      return (
                        <button
                          key={typeId}
                          type="button"
                          aria-pressed={checked}
                          onClick={() => onToggleType(typeId)}
                          className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                            checked
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-100'
                              : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800'
                          }`}
                        >
                          <span
                            className={`mt-0.5 h-3.5 w-3.5 rounded border ${
                              checked
                                ? 'border-indigo-600 bg-indigo-600 dark:border-indigo-400 dark:bg-indigo-400'
                                : 'border-stone-300 bg-white dark:border-stone-600 dark:bg-stone-950'
                            }`}
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold">{type.label}</span>
                            {type.sub && (
                              <span className="block truncate text-[11px] opacity-70">
                                {type.sub}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

function reviewForecastRows(forecast) {
  return [
    ['1h', forecast?.in1h || 0],
    ['4h', forecast?.in4h || 0],
    ['Today', forecast?.today || 0],
    ['Tomorrow', forecast?.tomorrow || 0],
    ['Week', forecast?.week || 0],
  ];
}

function formFamilyStrengthRows(state = {}) {
  return FORM_GROUPS.map((family) => {
    const typeIds = new Set(family.typeIds || []);
    let correct = 0;
    let incorrect = 0;
    for (const [cardId, card] of Object.entries(state.cards || {})) {
      if (!typeIds.has(typeIdFromCardId(cardId))) continue;
      correct += card?.correct || 0;
      incorrect += card?.incorrect || 0;
    }
    const mistakeCount = (state.mistakes || []).filter(
      (mistake) => !mistake.resolved && typeIds.has(mistake.type),
    ).length;
    const attempted = correct + incorrect;
    const accuracy = attempted ? Math.round((correct / attempted) * 100) : 0;
    const status =
      attempted >= 3 && accuracy >= 85
        ? 'strong'
        : attempted > 0 && (accuracy < 60 || mistakeCount > 0)
          ? 'weak'
          : attempted > 0
            ? 'developing'
            : 'new';
    return {
      ...family,
      attempted,
      correct,
      incorrect,
      accuracy,
      mistakeCount,
      status,
      sortScore:
        status === 'weak'
          ? -1000 - mistakeCount * 50 + accuracy
          : status === 'new'
            ? 500
            : status === 'developing'
              ? 100 + accuracy
              : 1000 + accuracy,
    };
  }).sort((a, b) => a.sortScore - b.sortScore || a.label.localeCompare(b.label));
}

// Onbin (te/ta sound-change) practice lives in this family; when the learner's
// misses cluster as godan sound-change errors its drill routes to Ending Lab.
const TE_TA_FAMILY_ID = TE_TA_SOUND_CHANGE_FAMILY_ID;

const READINESS_TONE = {
  strong: 'bg-emerald-500',
  developing: 'bg-amber-500',
  weak: 'bg-rose-500',
  untested: 'bg-stone-300 dark:bg-stone-700',
};
// Exported for unit tests of the Practice-to-Tools routing nudge ladder; the app
// renders it through StudyView's default export.
export function ReviewsDashboard({
  daily,
  practicePrefs,
  srsQueue,
  state,
  todayPlan,
  todayDrillActive,
  onStart,
  onStartRecommendation,
  onRetestMisses,
  retestCount = 0,
  mistakeRoute = null,
  readinessFamilies = [],
  weakestSkill = null,
  onDrillReadiness,
  onbinWeakness = false,
  onDrillEndingLab,
  groupConfusion = false,
  onDrillClassify,
  onDrillRush,
}) {
  const dailyGoal = practicePrefs.dailyGoal || DEFAULT_PREFS.dailyGoal;
  const dueTotal = srsQueue?.dueRuleIds?.length || 0;
  const dueDone = srsQueue?.completedDueRuleIds?.length || 0;
  const dashboardDue = todayPlan?.sourceCounts?.due || dueTotal;
  const workoutTypeCount = Array.isArray(todayPlan?.typeIds) ? todayPlan.typeIds.length : 0;
  const progressPct = dueTotal
    ? Math.min(100, Math.round((dueDone / dueTotal) * 100))
    : Math.min(100, Math.round(((daily.count || 0) / dailyGoal) * 100));
  const progressNow = dueTotal ? dueDone : Math.min(daily.count || 0, dailyGoal);
  const progressMax = dueTotal || dailyGoal;
  const recommendations = state.reviewScope?.recommendations || [];
  const mistakeHistoryCount = (state.mistakes || []).length;
  const strengthRows = formFamilyStrengthRows(state);
  const highlightedRows = strengthRows.filter((row) => row.attempted > 0).slice(0, 4);
  const rowsToShow = highlightedRows.length ? highlightedRows : strengthRows.slice(0, 4);
  const readinessById = new Map(readinessFamilies.map((row) => [row.id, row]));
  const weakestToEndingLab =
    !!weakestSkill &&
    weakestSkill.familyId === TE_TA_FAMILY_ID &&
    onbinWeakness &&
    !!onDrillEndingLab;
  const weakestToRush = !!weakestSkill && weakestSkill.dimension === 'speed' && !!onDrillRush;
  // One prioritized "do this next" nudge that routes a detected weakness to the
  // matching Tools drill: group confusion (foundational) > onbin sound
  // changes > slow recall > generic scoped practice of the weakest skill.
  const primaryNudge =
    groupConfusion && onDrillClassify
      ? {
          onClick: onDrillClassify,
          lead: 'You keep mixing up ',
          emphasis: 'verb groups',
          tail: ' — drill them in Groups',
          action: 'Groups',
        }
      : weakestSkill && weakestToEndingLab
        ? {
            onClick: onDrillEndingLab,
            lead: 'You keep missing ',
            emphasis: 'sound changes',
            tail: ' — drill them in Ending Lab',
            action: 'Ending Lab',
          }
        : weakestSkill && weakestToRush
          ? {
              onClick: onDrillRush,
              lead: 'Your ',
              emphasis: 'recall is slow',
              tail: ' — build speed in Rush',
              action: 'Rush',
            }
          : weakestSkill && onDrillReadiness
            ? {
                onClick: () =>
                  onDrillReadiness({
                    familyId: weakestSkill.familyId,
                    dimension: weakestSkill.dimension,
                  }),
                lead: 'Sharpen ',
                emphasis: weakestSkill.label,
                tail: ` — ${weakestSkill.dimensionLabel.toLowerCase()} is ${weakestSkill.status}`,
                action: 'Drill',
              }
            : null;
  const weakCount = strengthRows.filter((row) => row.status === 'weak').length;
  const streak = daily.goalStreak || 0;
  // Progressive disclosure: the forecast, form-family strength, and stat tiles
  // are returning-user signals. A brand-new learner with no history sees only a
  // clean hero and a single Start action — not a wall of zeros.
  const hasHistory =
    strengthRows.some((row) => row.attempted > 0) ||
    (daily.count || 0) > 0 ||
    streak > 0 ||
    dueTotal > 0 ||
    recommendations.length > 0 ||
    mistakeHistoryCount > 0;

  return (
    <section className="space-y-4" aria-label="Practice dashboard">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              Practice
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
              {hasHistory ? 'Start a focused workout.' : 'Begin with practical forms.'}
            </h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
              {hasHistory
                ? 'Ready cards come first, then the workout fills with recent misses and varied words in the same weak patterns.'
                : 'Start with a 12-card workout drawn from your Practice map. The map will learn what to repeat as you answer.'}
            </p>
            {hasHistory && (
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  ['Ready now', dashboardDue],
                  ['Today', `${daily.count || 0}/${dailyGoal}`],
                  ['Recent misses', weakCount],
                  ...(streak > 0 ? [['Streak', `${streak} day${streak === 1 ? '' : 's'}`]] : []),
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-800 dark:bg-stone-950"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                      {label}
                    </div>
                    <div className="mt-0.5 text-lg font-semibold tabular-nums text-stone-950 dark:text-stone-50">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                  Session cards
                </div>
                <div className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                  {dueTotal
                    ? `${dueDone}/${dueTotal} ready cards practiced`
                    : '12-card workout ready'}
                </div>
                {!!workoutTypeCount && (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-white/70 px-2.5 py-1.5 text-xs dark:border-indigo-900/60 dark:bg-stone-950/30">
                    <span className="font-medium text-stone-600 dark:text-stone-300">
                      Form types selected
                    </span>
                    <span className="font-semibold tabular-nums text-indigo-800 dark:text-indigo-200">
                      {workoutTypeCount}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-xl font-semibold tabular-nums text-indigo-800 dark:text-indigo-200">
                {progressPct}%
              </div>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progressMax}
              aria-valuenow={progressNow}
              className="mt-3 h-2 overflow-hidden rounded-full bg-white dark:bg-stone-800"
            >
              <span className="block h-full bg-indigo-600" style={{ width: `${progressPct}%` }} />
            </div>
            <button
              type="button"
              onClick={onStart}
              disabled={!todayPlan.available && !todayDrillActive}
              className="mt-4 w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-indigo-500 dark:text-stone-950 dark:hover:bg-indigo-400"
            >
              {todayDrillActive ? 'Continue workout' : 'Start workout'}
            </button>
            {retestCount > 0 && (
              <button
                type="button"
                onClick={onRetestMisses}
                className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                {mistakeRoute
                  ? `${mistakeRoute.triggerLabel} -> ${mistakeRoute.toolLabel}`
                  : `Practice ${retestCount} miss${retestCount === 1 ? '' : 'es'}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {recommendations.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Recommended practice
              </div>
              <div className="text-sm text-stone-600 dark:text-stone-300">
                Learn and Tools can send focused work back into Practice.
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            {recommendations.map((rec) => (
              <button
                key={rec.id}
                type="button"
                onClick={() => onStartRecommendation(rec)}
                className="rounded-xl border border-emerald-200 bg-white px-3 py-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-stone-950 dark:hover:bg-emerald-950/30"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      {rec.source === 'lesson' ? 'Learn' : 'Tools'}
                    </div>
                    <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      {rec.label}
                    </div>
                    {rec.detail && (
                      <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                        {rec.detail}
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    Start
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {hasHistory && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">
              Next workout
            </div>
            <div className="grid grid-cols-5 gap-2">
              {reviewForecastRows(todayPlan.upcomingForecast).map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-center dark:border-stone-800 dark:bg-stone-950"
                >
                  <div className="text-base font-semibold tabular-nums text-stone-950 dark:text-stone-50">
                    {value}
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wider text-stone-500">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">
              Form families
            </div>
            {primaryNudge && (
              <button
                type="button"
                onClick={primaryNudge.onClick}
                className="mb-3 flex w-full items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900 transition hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200 dark:hover:bg-amber-950/40"
              >
                <span>
                  {primaryNudge.lead}
                  <span className="font-semibold">{primaryNudge.emphasis}</span>
                  {primaryNudge.tail}
                </span>
                <span className="shrink-0 font-semibold">{primaryNudge.action} →</span>
              </button>
            )}
            <div className="space-y-1">
              {rowsToShow.map((row) => {
                const tone =
                  row.status === 'strong'
                    ? 'bg-emerald-500'
                    : row.status === 'weak'
                      ? 'bg-rose-500'
                      : row.status === 'developing'
                        ? 'bg-amber-500'
                        : 'bg-stone-300';
                const readiness = readinessById.get(row.id);
                const weakest = readiness?.weakest;
                const rowToEndingLab =
                  row.id === TE_TA_FAMILY_ID && onbinWeakness && !!onDrillEndingLab;
                const rowToRush = !rowToEndingLab && weakest?.id === 'speed' && !!onDrillRush;
                const accuracyLabel = row.attempted ? `${row.accuracy}%` : 'new';
                const bar = (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                    <span
                      className={`block h-full ${tone}`}
                      style={{ width: `${row.attempted ? row.accuracy : 8}%` }}
                    />
                  </div>
                );

                // No readiness reps yet — show the plain accuracy row, nothing to expand.
                if (!readiness || readiness.practiced === 0) {
                  return (
                    <div key={row.id} className="px-1 py-1">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-medium text-stone-700 dark:text-stone-200">
                          {row.label}
                        </span>
                        <span className="tabular-nums text-stone-500">{accuracyLabel}</span>
                      </div>
                      {bar}
                    </div>
                  );
                }

                return (
                  <details key={row.id} className="group rounded-md px-1 py-1">
                    <summary className="cursor-pointer list-none rounded-md transition hover:bg-stone-50 dark:hover:bg-stone-950/60">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-stone-700 dark:text-stone-200">
                          <span className="text-[10px] text-stone-400 transition group-open:rotate-90">
                            ▸
                          </span>
                          {row.label}
                        </span>
                        <span className="tabular-nums text-stone-500">{accuracyLabel}</span>
                      </div>
                      {bar}
                    </summary>
                    <div className="mt-2 space-y-1.5 border-t border-stone-100 pl-4 pt-2 dark:border-stone-800">
                      {READINESS_DIMENSIONS.map((dimension) => {
                        const cell = readiness.cells[dimension.id];
                        const tested = cell.status !== 'untested';
                        return (
                          <div
                            key={dimension.id}
                            className="flex items-center justify-between gap-3 text-[11px]"
                          >
                            <span className="flex items-center gap-1.5 text-stone-600 dark:text-stone-300">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${READINESS_TONE[cell.status]}`}
                              />
                              {dimension.label}
                            </span>
                            <span
                              className={
                                tested
                                  ? 'font-medium text-stone-600 dark:text-stone-300'
                                  : 'text-stone-400 dark:text-stone-500'
                              }
                            >
                              {tested
                                ? `${cell.label}${cell.detail ? ` · ${cell.detail}` : ''}`
                                : dimension.id === 'recognition'
                                  ? 'Not tested — try a choice round'
                                  : 'Not yet tested'}
                            </span>
                          </div>
                        );
                      })}
                      {readiness.types.length > 0 && (
                        <div className="truncate text-[11px] text-stone-400 dark:text-stone-500">
                          {readiness.types.map((type) => type.label).join(' · ')}
                        </div>
                      )}
                      {weakest && rowToEndingLab && (
                        <button
                          type="button"
                          onClick={onDrillEndingLab}
                          className="mt-1 w-full rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/60"
                        >
                          Drill sound changes in Ending Lab →
                        </button>
                      )}
                      {weakest && rowToRush && (
                        <button
                          type="button"
                          onClick={onDrillRush}
                          className="mt-1 w-full rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/60"
                        >
                          Drill speed in Rush →
                        </button>
                      )}
                      {weakest && !rowToEndingLab && !rowToRush && onDrillReadiness && (
                        <button
                          type="button"
                          onClick={() =>
                            onDrillReadiness({ familyId: row.id, dimension: weakest.id })
                          }
                          className="mt-1 w-full rounded-md border border-stone-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200 dark:hover:bg-stone-800"
                        >
                          Drill {weakest.label.toLowerCase()} in {row.label}
                        </button>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function MistakeRouteHint({ route }) {
  if (!route) return null;
  return (
    <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs dark:border-indigo-900/60 dark:bg-indigo-950/20">
      <div className="font-semibold text-indigo-800 dark:text-indigo-200">
        {route.triggerLabel} -&gt; {route.toolLabel}
      </div>
      <div className="mt-0.5 text-stone-600 dark:text-stone-350">{route.detail}</div>
    </div>
  );
}

export default function StudyView() {
  const {
    state,
    setState,
    setTab,
    allWords: verbs,
    builtInWords,
    activeGeminiKey: geminiKey,
    practicePrefs,
    setPracticePrefs,
    wordLists,
    studyFocus: focus,
    clearStudyFocus: onFocusConsumed,
    hydrated,
    todayPlan,
    todayDrillActive: contextTodayDrillActive,
    srsQueue,
    startTodayDrill,
    markSrsQueueCompleted,
  } = useApp();
  const [current, setCurrent] = useState(null);
  const [answer, setAnswer] = useState('');
  const [phase, setPhase] = useState('answering');
  const [wasCorrect, setWasCorrect] = useState(false);
  const [wasCorrected, setWasCorrected] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [showPromptText, setShowPromptText] = useState(false);
  const [stepHint, setStepHint] = useState('');
  const [hintMasked, setHintMasked] = useState(false);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [coachChatOpen, setCoachChatOpen] = useState(false);
  const [coachSeedAnswer, setCoachSeedAnswer] = useState('');
  const [coachRevealed, setCoachRevealed] = useState(0);
  const [greenRevealed, setGreenRevealed] = useState(0);
  const [revealedMiss, setRevealedMiss] = useState(false);
  const [reviewChoiceLabel, setReviewChoiceLabel] = useState('');
  const [submittedAnswer, setSubmittedAnswer] = useState('');
  const [lastDiagnosis, setLastDiagnosis] = useState(null);
  const [selfCheckOpen, setSelfCheckOpen] = useState(false);
  const [typoGuard, setTypoGuard] = useState(null);
  const [speechListening, setSpeechListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [reviewBase, setReviewBase] = useState(state.session.reviewed || 0);
  const startedGoalHit = useRef(isDailyGoalHitToday(state.daily || {}));
  const seededInitialDailyGoalRef = useRef(false);
  const autoStartedTodayRef = useRef(false);
  const defaultWorkoutTargetRef = useRef(null);
  const [bonusMode, setBonusMode] = useState(false);
  const [undoReviewScopeAction, setUndoReviewScopeAction] = useState(null);
  const [focusWordLock, setFocusWordLock] = useState(() => focus?.word || null);
  const [sessionFilterWord, setSessionFilterWord] = useState(null);
  const [sessionFilterFormGroupId, setSessionFilterFormGroupId] = useState(
    () => focus?.formGroupId || null,
  );
  const [launchContext, setLaunchContext] = useState(() =>
    focus?.returnTo === 'reference' ? focus : null,
  );
  const [recommendationFocus, setRecommendationFocus] = useState(
    () => focus?.recommendation || null,
  );
  const [todayMinimalPairSetIds, setTodayMinimalPairSetIds] = useState([]);
  const inputRef = useRef(null);
  const nextButtonRef = useRef(null);
  const focusSeededRef = useRef(false);
  const autoAdvanceRef = useRef(null);
  const answerStartedAtRef = useRef(0);
  const hadKanaMistakeRef = useRef(false);
  const speechRecognitionRef = useRef(null);
  const speechSubmittedRef = useRef(false);
  const speechAutoStartKeyRef = useRef('');
  const minimalPairSetIdRef = useRef(practicePrefs.minimalPairSetId || '');
  const recentCardIdsRef = useRef([]);
  // Snapshots the typed answer the moment a kana mistake first occurs, so the
  // review panel can show what was actually entered when it went wrong rather
  // than the live (possibly self-corrected) input.
  const wrongSnapshotRef = useRef(null);
  const typingHintRef = useRef(null);

  const todayDrillActive =
    contextTodayDrillActive ??
    (!practicePrefs.minimalPairSetId &&
      !practicePrefs.reviewLimitSource &&
      (practicePrefs.wordListIds || []).includes(TODAY_DRILL_LIST_ID));
  const enabledTypes = useMemo(() => {
    if (sessionFilterFormGroupId) {
      const group = FORM_GROUPS.find((g) => g.id === sessionFilterFormGroupId);
      if (group?.typeIds?.length) return group.typeIds;
    }
    if (todayDrillActive && todayPlan?.typeIds?.length) {
      return reviewTypeIdsForState(state, todayPlan.typeIds);
    }
    const baseTypes = state.enabledTypes?.length ? state.enabledTypes : ['plain-past'];
    return reviewTypeIdsForState(state, baseTypes);
  }, [state, sessionFilterFormGroupId, todayDrillActive, todayPlan?.typeIds]);
  const practiceWords = useMemo(() => {
    const base = filterWordsForStudyScope(
      verbs,
      { cards: state.cards, reviewScope: state.reviewScope },
      practicePrefs,
      wordLists,
      {
        builtInWords,
      },
    );
    // Apply session word filter if set
    let words = base;
    if (sessionFilterWord) {
      words = base.filter(
        (w) => w.dict === sessionFilterWord.dict && w.group === sessionFilterWord.group,
      );
      // Always include the target word even if it falls outside the current scope
      if (!words.length) words = [sessionFilterWord];
    }
    // Keep a "Practice this verb" target from Check eligible even if it sits
    // outside the current Study filters, so the reset guard below doesn't
    // discard the focus card the moment it's seeded.
    const lockedWord = focus?.word || focusWordLock;
    if (
      lockedWord &&
      !words.some((w) => w.dict === lockedWord.dict && w.group === lockedWord.group)
    ) {
      return [...words, lockedWord];
    }
    return words;
  }, [
    verbs,
    state.cards,
    state.reviewScope,
    practicePrefs,
    wordLists,
    builtInWords,
    focus,
    focusWordLock,
    sessionFilterWord,
  ]);

  const answerMode = normalizeAnswerMode(practicePrefs.answerMode);
  const autoAdvanceCorrect = practicePrefs.autoAdvanceCorrect !== false;
  const speechRecognitionAvailable = !!getSpeechRecognitionConstructor();
  const typedAnswerMode = answerMode === 'input';
  const transformationMode = false;
  const listeningPrompt = !!practicePrefs.listeningPrompt;
  const sentenceMode = !!practicePrefs.sentenceMode;
  const activeMinimalPairSet = getMinimalPairSet(practicePrefs.minimalPairSetId);
  const practiceRuleCandidates = useMemo(
    () =>
      buildRuleCandidates(practiceWords, enabledTypes, practicePrefs, {
        minimalPairSet: activeMinimalPairSet,
      }),
    [practiceWords, enabledTypes, practicePrefs, activeMinimalPairSet],
  );
  const reverseDrill = current?.type === DICTIONARY_TYPE_ID;
  const sourceTypeForReading = current?.sourceType || 'plain-past';
  const sourceForm = current
    ? reverseDrill
      ? conjugateItem(current.verb, sourceTypeForReading)
      : conjugateItem(current.verb, current.type)
    : '';
  const sourceStrategyPrefs = useMemo(() => {
    const strategy = practicePrefs.sourceFormStrategy || DEFAULT_PREFS.sourceFormStrategy;
    if (strategy === 'mixed') return { ...practicePrefs, promptForm: 'random' };
    if (strategy === 'masu') return { ...practicePrefs, promptForm: 'polite-present' };
    if (strategy === 'dictionary') return { ...practicePrefs, promptForm: 'dictionary' };
    const reps = current?.card?.reps || 0;
    return {
      ...practicePrefs,
      promptForm: reps >= 2 ? 'random' : reps >= 1 ? 'dict-masu' : 'dictionary',
    };
  }, [current?.card?.reps, practicePrefs]);
  const configuredPromptType =
    current && !reverseDrill
      ? pickPromptType(current.verb, current.type, sourceStrategyPrefs)
      : null;
  const promptType = current && !reverseDrill ? configuredPromptType : null;
  const promptSourceForm = current
    ? reverseDrill
      ? sourceForm
      : promptType
        ? conjugateItem(current.verb, promptType)
        : current.verb.reading
    : '';
  const promptAudioText = current ? promptSourceForm : '';

  const sessionMistakePatterns = useMemo(
    () => rankSessionMistakePatterns(state.session?.mistakePatterns),
    [state.session?.mistakePatterns],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weaknessFamilies = useMemo(() => buildWeaknessFamilyRows(state), [state.weakness]);
  const daily = state.daily || {};
  const dailyGoalTarget = practicePrefs.dailyGoal || DEFAULT_PREFS.dailyGoal;
  const todayGoalHit = isDailyGoalHitToday(daily);
  const boundedReviewLaunchActive = activeReviewLimitFromPrefs(practicePrefs) > 0;
  const canResumePersistedCurrent = hasPersistedCurrent();
  const specialLaunchActive =
    !!focus?.word ||
    !!focus?.formGroupId ||
    !!focus?.recommendation ||
    !!focusWordLock ||
    !!sessionFilterWord ||
    !!sessionFilterFormGroupId ||
    !!recommendationFocus ||
    !!launchContext ||
    boundedReviewLaunchActive ||
    !!activeMinimalPairSet;
  const retiredReviewLimitSource =
    !!practicePrefs.reviewLimitSource && !REVIEW_LIMIT_SOURCES.has(practicePrefs.reviewLimitSource);
  const canAutoStartDefaultWorkout =
    !todayDrillActive &&
    !specialLaunchActive &&
    !canResumePersistedCurrent &&
    !todayGoalHit &&
    !retiredReviewLimitSource &&
    !!todayPlan?.available;
  const reviewSelectionOptions = useMemo(
    () => ({
      bonusMode,
      wordLists,
      beginnerLadder: todayDrillActive && !specialLaunchActive,
    }),
    [bonusMode, wordLists, todayDrillActive, specialLaunchActive],
  );
  const todayMinimalPairSet = useMemo(() => {
    if (activeMinimalPairSet || !current) return null;
    return (
      todayMinimalPairSetIds
        .map((setId) => getMinimalPairSet(setId))
        .find((set) => minimalPairSetMatchesCard(set, current.verb, current.type)) || null
    );
  }, [activeMinimalPairSet, current, todayMinimalPairSetIds]);
  const minimalPairSetForCurrent = activeMinimalPairSet || todayMinimalPairSet;
  // Cued cloze: when Sentence mode is on, wrap a normal forward production card
  // in an example sentence with a blank. Only the Japanese frame + grammar cue
  // are shown (never the "Fill in: word (reading)" prefix, which would leak the
  // reading regardless of script settings). Null for reverse/listening/minimal
  // -pair cards, which keep their normal prompt.
  const clozePrompt = useMemo(() => {
    if (!current || !sentenceMode) return null;
    if (reverseDrill || listeningPrompt || minimalPairSetForCurrent) return null;
    try {
      const built = getOfflineTemplateSentence(current.verb, current.type);
      return built?.sentence ? { sentence: built.sentence, cue: built.cue } : null;
    } catch {
      return null;
    }
  }, [current, sentenceMode, reverseDrill, listeningPrompt, minimalPairSetForCurrent]);
  const clozePromptView = useMemo(
    () => (clozePrompt ? sentenceDisplay(clozePrompt.sentence, practicePrefs) : null),
    [clozePrompt, practicePrefs],
  );

  useLayoutEffect(() => {
    if (!hydrated) return;
    // When arriving from Check's "Practice this verb", seed that exact word/form
    // once. If no rule covers it, fall through to normal selection.
    if (focus?.word && !focusSeededRef.current) {
      focusSeededRef.current = true;
      setFocusWordLock(focus.word);
      setRecommendationFocus(null);
      // Lock the workout to this word so every follow-up card stays on it until
      // the learner exits the focus banner (rather than mixing back into the
      // general queue after the first seeded card).
      setSessionFilterWord(focus.word);
      if (focus.returnTo === 'reference') setLaunchContext(focus);
      const card = buildFocusCard(state, focus.word, focus.type);
      onFocusConsumed?.();
      if (card) {
        setAnswer('');
        setPhase('answering');
        setCurrent(card);
        return;
      }
    }
    if (focus?.formGroupId && !focusSeededRef.current) {
      focusSeededRef.current = true;
      setSessionFilterFormGroupId(focus.formGroupId);
      setFocusWordLock(null);
      setRecommendationFocus(null);
      onFocusConsumed?.();
    }
    if (focus?.recommendation && !focusSeededRef.current) {
      focusSeededRef.current = true;
      setRecommendationFocus(focus.recommendation);
      setFocusWordLock(null);
      setSessionFilterWord(null);
      setSessionFilterFormGroupId(null);
      setLaunchContext(null);
      onFocusConsumed?.();
      resetActiveAttempt();
    }
    if (!autoStartedTodayRef.current && canAutoStartDefaultWorkout) {
      launchTodayDrill();
    }
    if (current !== null) return;
    const persisted =
      focus?.word || focus?.formGroupId || focus?.recommendation
        ? null
        : loadPersistedCurrent(state, practiceWords, enabledTypes, practicePrefs);
    if (persisted) {
      setCurrent(persisted);
      return;
    }
    const nextCard = selectNext(
      state,
      practiceWords,
      enabledTypes,
      null,
      practicePrefs,
      practiceRuleCandidates,
      reviewSelectionOptions,
    );
    if (nextCard) {
      setCurrent((existing) => existing || nextCard);
    }
    // state intentionally omitted — this triggers on card change, not every state mutation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hydrated,
    current,
    practiceWords,
    enabledTypes,
    practicePrefs,
    practiceRuleCandidates,
    reviewSelectionOptions,
    focus,
    specialLaunchActive,
    canAutoStartDefaultWorkout,
  ]);

  useEffect(() => {
    if (!hydrated || seededInitialDailyGoalRef.current) return;
    seededInitialDailyGoalRef.current = true;
    if (todayGoalHit) startedGoalHit.current = true;
  }, [hydrated, todayGoalHit]);

  // Persist the active card so a refresh resumes it instead of drawing fresh.
  useEffect(() => {
    if (current) persistCurrent(current);
  }, [current]);

  useEffect(() => {
    if (current && !cardMatchesPractice(current, practiceWords, enabledTypes, practicePrefs)) {
      clearPersistedCurrent();
      setCurrent(null);
      setAnswer('');
      setPhase('answering');
    }
  }, [practiceWords, enabledTypes, practicePrefs, current]);

  useEffect(() => {
    if (!current || !activeMinimalPairSet) return;
    if (minimalPairSetMatchesCard(activeMinimalPairSet, current.verb, current.type)) return;
    setCurrent(null);
    setAnswer('');
    setPhase('answering');
    setChatOpen(false);
    setStepHint('');
    setTypoGuard(null);
    setWasCorrect(false);
    setLastDiagnosis(null);
  }, [current, activeMinimalPairSet]);

  useEffect(() => {
    const nextSetId = practicePrefs.minimalPairSetId || '';
    if (minimalPairSetIdRef.current === nextSetId) return;
    minimalPairSetIdRef.current = nextSetId;
    setCurrent(null);
    setAnswer('');
    setPhase('answering');
    setChatOpen(false);
    setStepHint('');
    setTypoGuard(null);
    setWasCorrect(false);
    setLastDiagnosis(null);
  }, [practicePrefs.minimalPairSetId]);

  useEffect(() => {
    if (phase === 'answering' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [current, phase]);

  useEffect(() => {
    if (phase === 'answering') answerStartedAtRef.current = Date.now();
  }, [current?.id, phase]);

  useEffect(() => {
    setShowPromptText(!listeningPrompt);
  }, [current?.id, listeningPrompt]);

  useEffect(() => {
    if (stepHint && typingHintRef.current) {
      typingHintRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [stepHint]);

  useEffect(() => {
    if (phase !== 'reviewing') return;
    const button = nextButtonRef.current;
    if (!button || typeof window === 'undefined') return;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    button.focus({ preventScroll: true });
    if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
      window.scrollTo(scrollX, scrollY);
    }
  }, [current?.id, phase]);

  // Handle TTS speech synthesis inside StudyView
  useEffect(() => {
    // Only import window object if running in browser
    if (typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    if (!synth) return;

    if (current && phase === 'answering' && listeningPrompt && promptAudioText) {
      speakJapaneseLocal(promptAudioText, 0.85);
    }
    // current?.id used intentionally instead of current to avoid re-triggering on unrelated state changes
    // speakJapaneseLocal is defined inline and omitted to avoid infinite re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, phase, listeningPrompt, promptAudioText, practicePrefs.voiceURI]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (current && phase === 'reviewing' && practicePrefs.autoSpeak) {
      speakJapaneseLocal(expected, 0.9);
    }
    // speakJapaneseLocal is defined inline and omitted to avoid infinite re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, phase, practicePrefs.autoSpeak, practicePrefs.voiceURI]);

  useEffect(() => {
    setCoachRevealed(0);
    setGreenRevealed(0);
  }, [current?.id, answerMode]);

  useEffect(() => {
    if (!current) return;
    submitIfCompleteTypedAnswer(answer);
  }, [answer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember how many leading kana have turned green so they stay green through
  // a backspace and reappear as green immediately when re-typed.
  useEffect(() => {
    if (!current) return;
    if (phase !== 'answering') return;
    if (reverseDrill) return;
    if (!typedAnswerMode) return;
    const cells = kanaCoachCells(sourceForm, answer, 0, true, 0);
    let committed = 0;
    for (const c of cells) {
      if (c.state === 'correct') committed += 1;
      else break;
    }
    setGreenRevealed((prev) => (committed > prev ? committed : prev));
  }, [answer, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === 'answering') {
      setRevealedMiss(false);
      setReviewChoiceLabel('');
    }
  }, [current?.id, phase]);

  useEffect(() => {
    setSelfCheckOpen(false);
  }, [current?.id, phase, answerMode]);

  useEffect(() => {
    speechSubmittedRef.current = false;
    speechAutoStartKeyRef.current = '';
    setSpeechError('');
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort?.();
      } catch {}
      speechRecognitionRef.current = null;
    }
    setSpeechListening(false);
  }, [current?.id, phase, answerMode]);

  useEffect(() => {
    if (!current || phase !== 'answering') return;
    if (answerMode !== 'speak') return;
    if (!speechRecognitionAvailable) return;
    if (speechListening || speechRecognitionRef.current) return;
    const autoStartKey = `${current.id}:speak`;
    if (speechAutoStartKeyRef.current === autoStartKey) return;
    speechAutoStartKeyRef.current = autoStartKey;
    startSpeechAnswer({ auto: true });
    // startSpeechAnswer closes over the current spoken-answer targets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, phase, answerMode, speechRecognitionAvailable, speechListening]);

  useEffect(() => {
    setTypoGuard(null);
  }, [current?.id, phase]);

  useEffect(() => {
    setReviewBase(state.session.reviewed || 0);
    // state.session.reviewed intentionally omitted — only reset baseline when limit setting changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practicePrefs.reviewLimit, practicePrefs.reviewLimitSource]);

  useEffect(() => {
    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.abort?.();
        } catch {}
        speechRecognitionRef.current = null;
      }
    };
  }, []);

  function speakJapaneseLocal(text, rateVal = 0.85) {
    // Prefer a recorded clip with TTS fallback (improvement #18).
    playPronunciation(text, rateVal, practicePrefs.voiceURI);
  }

  if (!hydrated) {
    return (
      <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-8 text-center text-sm text-stone-500 dark:text-stone-400">
        Loading Practice...
      </div>
    );
  }

  if (!current) {
    const hasSessionFilter = !!(sessionFilterWord || sessionFilterFormGroupId);
    return (
      <div className="space-y-4">
        {hasSessionFilter && (
          <StudyFocusBar
            allWords={verbs}
            sessionFilterWord={sessionFilterWord}
            onWordChange={chooseFocusWord}
            sessionFilterFormGroupId={sessionFilterFormGroupId}
            onFormGroupChange={chooseFocusFormGroup}
          />
        )}
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-12 text-center">
          {hasSessionFilter ? (
            <>
              <p className="text-stone-600 dark:text-stone-300 mb-2">No cards for this focus</p>
              <p className="text-xs text-stone-400 dark:text-stone-500 mb-4">
                Try a different word or form type.
              </p>
              <button
                onClick={() => {
                  setSessionFilterWord(null);
                  setSessionFilterFormGroupId(null);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition"
              >
                Clear focus
              </button>
            </>
          ) : (
            <>
              <p className="text-stone-600 dark:text-stone-300 mb-2">No cards available</p>
              <p className="text-xs text-stone-400 dark:text-stone-500 mb-4">
                No words or forms are active in the Practice map right now. Turn on forms in the
                map, or restore words from Tools.
              </p>
              <button
                onClick={() => setTab('tools')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition"
              >
                Open Tools
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const expected = reverseDrill ? current.verb.reading : sourceForm;
  const practicedType = reverseDrill ? sourceTypeForReading : current.type;
  const promptView = reverseDrill
    ? formDisplay(sourceForm, practicePrefs, current.verb, practicedType)
    : promptDisplay(current.verb, promptType, practicePrefs);
  const expectedView = reverseDrill
    ? promptDisplay(current.verb, null, practicePrefs)
    : formDisplay(expected, practicePrefs, current.verb, current.type);
  const promptEnglish = reverseDrill
    ? englishForForm(current.verb, practicedType)
    : englishForForm(current.verb, promptType);
  const targetEnglish = reverseDrill
    ? englishForForm(current.verb, null)
    : englishForForm(current.verb, current.type);
  const spokenAnswerTargets = reverseDrill
    ? [current.verb.reading, current.verb.dict]
    : [expected, surfaceFormFor(current.verb, current.type)];
  const speechMatch =
    answerMode === 'speak' && answer.trim()
      ? spokenAnswerResult(spokenAnswerTargets, answer)
      : null;
  const englishHintsHidden =
    (practicePrefs.englishHints || DEFAULT_PREFS.englishHints) === 'hidden';
  const resolvedKanaAssist = resolveKanaAssist(practicePrefs);
  const kanaMatchDisplay =
    typedAnswerMode && !reverseDrill ? kanaMatchDisplayForPrefs(practicePrefs) : 'none';
  const liveKanaHelpEnabled = kanaMatchDisplay !== 'none';
  const readinessKanaAssist = liveKanaHelpEnabled ? resolvedKanaAssist : 'off';
  const typeInfo = reverseDrill ? DICTIONARY_TYPE_INFO : getTypeInfo(current.type);
  const sourceTypeId = reverseDrill ? sourceTypeForReading : promptType || DICTIONARY_TYPE_ID;
  const targetTypeId = current.type;
  const sourceTypeInfo =
    sourceTypeId === DICTIONARY_TYPE_ID ? DICTIONARY_TYPE_INFO : getTypeInfo(sourceTypeId);
  const targetTypeInfo =
    targetTypeId === DICTIONARY_TYPE_ID ? DICTIONARY_TYPE_INFO : getTypeInfo(targetTypeId);
  const transformationRoute = transformationRouteText(sourceTypeInfo, targetTypeInfo);
  const reviewExplanation =
    phase === 'reviewing'
      ? transformationReviewExplanation({
          item: current.verb,
          type: reverseDrill ? sourceTypeForReading : current.type,
          reverseDrill,
          sourceInfo: sourceTypeInfo,
          targetInfo: targetTypeInfo,
          sourceForm: promptSourceForm,
          expected,
        })
      : null;
  const explanation = !wasCorrect ? reviewExplanation : null;
  const diagnostic =
    phase === 'reviewing' && !wasCorrect && !revealedMiss ? lastDiagnosis?.feedback || '' : '';
  const choices = reverseDrill
    ? makeReverseChoices(current, practiceWords)
    : makeChoices(current, practiceWords);
  const wordType = isAdjective(current.verb) ? 'Adjective' : 'Verb';
  const noChangePrompt = !reverseDrill && promptType === current.type;
  const taskLabel = reverseDrill ? `Recover dictionary form` : typeInfo.label;
  const transformationActionLabel = reverseDrill ? 'Answer with' : 'Conjugate to';
  const taskHint = reverseDrill
    ? 'answer with dictionary form'
    : noChangePrompt
      ? 'same form; answer may not change'
      : targetTypeInfo.hint || typeInfo.hint;
  const taskSub = transformationMode ? targetTypeInfo.sub : reverseDrill ? '辞書形' : typeInfo.sub;
  const answerTaskDetails = answerPhaseTaskDetails({
    reverseDrill,
    noChangePrompt,
    taskHint,
    taskSub,
  });
  const transformationSupportText = answerTaskDetails.supportText;
  const taskOverride = reverseDrill
    ? transformationMode
      ? `Reading: recover the dictionary form from ${typeInfo.label} (${sourceForm})`
      : `Un-conjugate: identify the dictionary form from ${typeInfo.label} (${sourceForm})`
    : noChangePrompt
      ? `Trick no-change drill: the prompt is already ${typeInfo.label}, so the correct answer is the same form.`
      : '';
  const minimalPairFeedback = minimalPairSetForCurrent
    ? minimalPairFeedbackForCard(minimalPairSetForCurrent, current.verb, current.type)
    : null;
  const reviewLimit = activeReviewLimitFromPrefs(practicePrefs);
  const reviewLimitSource = practicePrefs.reviewLimitSource || '';
  const reviewsDone = Math.max(0, (state.session.reviewed || 0) - reviewBase);
  const sessionSkipped = state.session?.skipped || 0;
  const reviewSetComplete = reviewLimit > 0 && reviewsDone >= reviewLimit && !recommendationFocus;
  // Ready-card completion flags
  const queuedDueRuleIds = srsQueue?.dueRuleIds || [];
  const completedDueCount = srsQueue?.completedDueRuleIds?.length || 0;
  const initialDue = queuedDueRuleIds.length;
  const dueQueueDone = initialDue > 0 && completedDueCount >= initialDue && !bonusMode;
  const dailyGoalJustHit =
    todayGoalHit && !startedGoalHit.current && seededInitialDailyGoalRef.current && !bonusMode;
  // A targeted "Practice this" launch (a word, a reference drill, or a form
  // family) locks the workout to that item. While a focus is active we never
  // surface the "Map updated" completion summary — entries route straight into
  // the focused cards and keep serving them until the learner exits the banner.
  const focusSession = !!(
    focusWordLock ||
    sessionFilterWord ||
    sessionFilterFormGroupId ||
    recommendationFocus
  );
  const reviewComplete = (dueQueueDone || dailyGoalJustHit) && !focusSession;
  const plannedDefaultProgressMax = Math.max(1, Number(todayPlan?.reviewLimit || dailyGoalTarget));
  if (reviewLimit > 0 || initialDue > 0 || bonusMode || !todayDrillActive) {
    defaultWorkoutTargetRef.current = null;
  } else if (!defaultWorkoutTargetRef.current) {
    defaultWorkoutTargetRef.current = plannedDefaultProgressMax;
  }
  const defaultProgressMax = defaultWorkoutTargetRef.current || plannedDefaultProgressMax;
  const workoutProgress =
    reviewLimit > 0
      ? {
          now: Math.min(reviewsDone, reviewLimit),
          max: reviewLimit,
          label: reviewLimitSource === 'recommendation' ? 'Recommended progress' : 'Drill progress',
        }
      : initialDue > 0 && !bonusMode && !focusSession
        ? {
            now: Math.min(completedDueCount, initialDue),
            max: initialDue,
            label: 'Ready-card progress',
          }
        : {
            now: Math.min(reviewsDone, defaultProgressMax),
            max: defaultProgressMax,
            label: bonusMode ? 'Bonus cards' : 'Session cards',
          };
  const workoutProgressPct = workoutProgress.max
    ? Math.min(100, Math.round((workoutProgress.now / workoutProgress.max) * 100))
    : 0;
  const hidePromptText = listeningPrompt && phase === 'answering' && !showPromptText;
  const hideEnglishMeaning = englishHintsHidden && phase === 'answering';
  // Guided kana is now an in-box "reveal next" action, not a separate mode.
  const guidedKana = false;
  const liveKana = typedAnswerMode && !reverseDrill && liveKanaHelpEnabled;
  const coachPreview = toHiragana(answer);
  const coachProgress = toHiraganaProgress(answer);
  const preview = coachPreview;
  const holdKanaFeedback = phase === 'answering' && !hadKanaMistakeRef.current;
  const coachCells = guidedKana
    ? kanaCoachCells(expected, answer, coachRevealed, holdKanaFeedback, greenRevealed)
    : [];
  const visibleCoachCells = coachCells.filter((cell) => cell.state !== 'empty' || cell.shown);
  const coachWrongIndex = coachCells.findIndex((c) => c.state === 'wrong');
  const coachTypedCount = Array.from(coachProgress).length;
  const expectedKanaCount = Array.from(expected).length;
  const coachStatus =
    coachWrongIndex >= 0
      ? `Kana ${coachWrongIndex + 1} should be ${coachCells[coachWrongIndex].expected}.`
      : coachPreview === expected
        ? 'Complete match. Press Enter.'
        : coachTypedCount > expectedKanaCount
          ? 'Extra kana after the answer.'
          : '';
  const liveCells = liveKana
    ? kanaCoachCells(expected, answer, coachRevealed, holdKanaFeedback, greenRevealed)
    : [];
  const liveWrongIndex = liveCells.findIndex((c) => c.state === 'wrong' || c.state === 'extra');
  const liveStatus =
    liveWrongIndex >= 0
      ? liveCells[liveWrongIndex].state === 'extra'
        ? 'Extra kana after the answer.'
        : `Expected ${liveCells[liveWrongIndex].expected} at kana ${liveWrongIndex + 1}.`
      : preview === expected
        ? 'Complete match. Press Enter.'
        : '';
  const liveAnswerTone =
    liveKana && phase === 'answering'
      ? liveWrongIndex >= 0
        ? 'wrong'
        : preview === expected
          ? 'correct'
          : ''
      : '';
  const answerInputBorderClass =
    liveAnswerTone === 'wrong'
      ? 'border-rose-400 dark:border-rose-700 focus:border-rose-500 dark:focus:border-rose-600'
      : liveAnswerTone === 'correct'
        ? 'border-emerald-400 dark:border-emerald-700 focus:border-emerald-500 dark:focus:border-emerald-600'
        : 'border-stone-200 dark:border-stone-805 focus:border-indigo-500';
  const answerInputClassName = `flex-1 min-w-0 px-4 py-3 text-xl text-center border-2 ${answerInputBorderClass} rounded-xl bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-150 caret-stone-850 dark:caret-stone-150 focus:outline-none transition`;
  const answerFeedbackClassName =
    liveAnswerTone === 'wrong'
      ? 'text-rose-700 dark:text-rose-400'
      : liveAnswerTone === 'correct'
        ? 'text-emerald-700 dark:text-emerald-400'
        : 'text-stone-500 dark:text-stone-400';
  const reviewAnswerSource = phase === 'reviewing' && submittedAnswer ? submittedAnswer : answer;
  const reviewKanaCells =
    typedAnswerMode && !reverseDrill
      ? kanaCoachCells(expected, reviewAnswerSource, coachRevealed)
      : [];

  function nextMinimalPairProgress(correct) {
    return recordMinimalPairResult(
      state.minimalPairs,
      minimalPairSetForCurrent?.id,
      current?.verb,
      current?.type,
      correct,
    );
  }

  function mistakeRecordOptions() {
    return {
      ...(minimalPairSetForCurrent?.id ? { minimalPairSetId: minimalPairSetForCurrent.id } : {}),
    };
  }

  function resolveMistakesForCurrentCard(mistakes = []) {
    const matches = (mistakes || []).filter(
      (mistake) =>
        !mistake.resolved &&
        mistake.dict === current?.verb?.dict &&
        mistake.group === current?.verb?.group &&
        mistake.type === current?.type,
    );
    if (!matches.length) return mistakes;
    return matches.reduce((next, mistake) => markMistakeResolved(next, mistake.key), mistakes);
  }

  function stopSpeechRecognition() {
    const recognition = speechRecognitionRef.current;
    if (!recognition) {
      setSpeechListening(false);
      return;
    }
    try {
      recognition.stop?.();
    } catch {
      try {
        recognition.abort?.();
      } catch {}
    }
    speechRecognitionRef.current = null;
    setSpeechListening(false);
  }

  function startSpeechAnswer(options = {}) {
    const auto = options.auto === true;
    if (!current || phase !== 'answering') return;
    if (speechListening || speechRecognitionRef.current) {
      if (auto) return;
      stopSpeechRecognition();
      return;
    }
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setSpeechError('Speech input is not available in this browser.');
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      speechRecognitionRef.current = recognition;
      speechSubmittedRef.current = false;
      recognition.lang = 'ja-JP';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 5;
      recognition.onstart = () => {
        setSpeechError('');
        setSpeechListening(true);
      };
      recognition.onerror = (event) => {
        setSpeechError(speechRecognitionErrorMessage(event?.error));
        setSpeechListening(false);
      };
      recognition.onend = () => {
        if (speechRecognitionRef.current === recognition) speechRecognitionRef.current = null;
        setSpeechListening(false);
      };
      recognition.onresult = (event) => {
        const { transcripts, isFinal } = speechAlternativesFromEvent(event);
        const transcript = bestSpeechAlternative(transcripts, spokenAnswerTargets);
        if (!transcript) return;
        setAnswer(transcript);
        setSpeechError('');
        if (isFinal && !speechSubmittedRef.current) {
          speechSubmittedRef.current = true;
          submit(transcript, { spoken: true });
        }
      };
      recognition.start();
    } catch {
      speechRecognitionRef.current = null;
      setSpeechListening(false);
      setSpeechError('Speech input could not start in this browser.');
    }
  }

  function rememberSessionCard(cardId) {
    if (!cardId) return;
    recentCardIdsRef.current = [
      cardId,
      ...recentCardIdsRef.current.filter((id) => id !== cardId),
    ].slice(0, REVIEW_SESSION_HISTORY_SIZE);
  }

  function selectNextReviewCard(nextState, lastCardId, optionOverrides = {}) {
    rememberSessionCard(lastCardId);
    return selectNext(
      nextState,
      practiceWords,
      enabledTypes,
      lastCardId,
      practicePrefs,
      practiceRuleCandidates,
      {
        ...reviewSelectionOptions,
        ...optionOverrides,
        recentCardIds: recentCardIdsRef.current,
      },
    );
  }

  function resetActiveAttempt() {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    stopSpeechRecognition();
    recentCardIdsRef.current = [];
    setAnswer('');
    setPhase('answering');
    setChatOpen(false);
    setCoachRevealed(0);
    setGreenRevealed(0);
    setRevealedMiss(false);
    setReviewChoiceLabel('');
    setSelfCheckOpen(false);
    setTypoGuard(null);
    setStepHint('');
    setHintMasked(false);
    setHintRevealed(false);
    setCoachChatOpen(false);
    hadKanaMistakeRef.current = false;
    wrongSnapshotRef.current = null;
    setWasCorrected(false);
    setWasCorrect(false);
    setCurrent(null);
  }

  function launchTodayDrill() {
    if (!todayPlan.available) return;
    autoStartedTodayRef.current = true;
    clearPersistedCurrent();
    const launched = startTodayDrill?.(todayPlan);
    if (launched === false) return;
    defaultWorkoutTargetRef.current = Math.max(
      1,
      Number(todayPlan?.reviewLimit || dailyGoalTarget),
    );
    setBonusMode(false);
    setTodayMinimalPairSetIds(todayPlan.minimalPairSetIds);
    setFocusWordLock(null);
    setRecommendationFocus(null);
    setLaunchContext(null);
    setReviewBase(state.session?.reviewed || 0);
    resetActiveAttempt();
    setTab('practice');
  }

  function chooseFocusWord(word) {
    if (word) {
      setState((prev) => includeWordInReviewState(prev, word));
    }
    setRecommendationFocus(null);
    setSessionFilterWord(word);
    setCurrent(null);
  }

  function chooseFocusFormGroup(groupId) {
    const group = FORM_GROUPS.find((item) => item.id === groupId);
    setState((prev) => {
      const restored = groupId ? includeFormFamilyInReviewState(prev, groupId) : prev;
      if (!group?.typeIds?.length) return restored;
      return {
        ...restored,
        enabledTypes: [...new Set([...(restored.enabledTypes || []), ...group.typeIds])],
      };
    });
    setRecommendationFocus(null);
    setSessionFilterFormGroupId(groupId);
    setCurrent(null);
  }

  function togglePracticeType(typeId) {
    if (!typeId) return;
    setState((prev) => {
      const currentTypes = new Set(prev.enabledTypes || []);
      if (currentTypes.has(typeId)) {
        if (currentTypes.size <= 1) return prev;
        currentTypes.delete(typeId);
      } else {
        currentTypes.add(typeId);
      }
      return { ...prev, enabledTypes: [...currentTypes] };
    });
    setCurrent(null);
  }

  function togglePracticeFamily(family) {
    if (!family?.typeIds?.length) return;
    setState((prev) => {
      const currentTypes = new Set(prev.enabledTypes || []);
      const allEnabled = family.typeIds.every((typeId) => currentTypes.has(typeId));
      if (allEnabled) {
        for (const typeId of family.typeIds) currentTypes.delete(typeId);
        if (!currentTypes.size) return prev;
      } else {
        for (const typeId of family.typeIds) currentTypes.add(typeId);
      }
      return { ...prev, enabledTypes: [...currentTypes] };
    });
    setCurrent(null);
  }

  // Deterministic, offline step coach — no API key required. Irregular forms
  // are masked on the first click; a second click reveals the spelled-out steps.
  function showStepHint() {
    if (!current) return;
    const reveal = hintRevealed || (!!stepHint && hintMasked);
    const baseHint = stepCoachHint(current.verb, current.type, answer, reveal);
    const nextHint = transformationMode
      ? transformationHintFromBase(baseHint, {
          reverseDrill,
          sourceInfo: sourceTypeInfo,
          targetInfo: targetTypeInfo,
        })
      : baseHint;
    setStepHint(nextHint.text);
    setHintMasked(nextHint.masked);
    if (reveal) setHintRevealed(true);
  }

  function revealNextKana() {
    if (!current || reverseDrill || phase !== 'answering') return;
    const expectedChars = Array.from(expected);
    if (!expectedChars.length) return;
    const typedCount = Array.from(toHiraganaProgress(answer)).length;
    const nextCount = Math.min(expectedChars.length, Math.max(coachRevealed, typedCount) + 1);
    setCoachRevealed(nextCount);
    setGreenRevealed((prev) => Math.max(prev, nextCount));
    setAnswer(expectedChars.slice(0, nextCount).join(''));
    focusAnswerInput();
  }

  // Opens a continuous AI chat for deeper help, seeded with the current
  // attempt. Snapshot the typed answer so the chat doesn't re-init on keypress.
  function openCoachChat() {
    if (!current || !geminiKey) return;
    setCoachSeedAnswer(answer);
    setCoachChatOpen(true);
  }

  function submit(choiceValue, options = {}) {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    if (options.spoken) stopSpeechRecognition();
    if (phase === 'reviewing') {
      setChatOpen(false);
      setAnswer('');
      setCoachRevealed(0);
      setRevealedMiss(false);
      setReviewChoiceLabel('');
      setSelfCheckOpen(false);
      setTypoGuard(null);
      setStepHint('');
      setHintMasked(false);
      setHintRevealed(false);
      setCoachChatOpen(false);
      setLastDiagnosis(null);
      hadKanaMistakeRef.current = false;
      wrongSnapshotRef.current = null;
      setWasCorrected(false);
      setPhase('answering');
      if (!reviewSetComplete && !reviewComplete) {
        setCurrent(selectNextReviewCard(state, current.id));
      }
      return;
    }
    const raw = choiceValue !== undefined ? choiceValue : answer;
    if (!raw.trim()) return;
    const spoken = !!options.spoken;
    const fromTypedInput = !!options.fromTypedInput || (choiceValue === undefined && !spoken);
    const normalized = !spoken && fromTypedInput ? toHiragana(raw) : raw;
    const finalOk = reverseDrill
      ? spoken
        ? spokenAnswerResult(spokenAnswerTargets, raw).ok
        : dictionaryAnswerMatches(raw, current.verb)
      : spoken
        ? spokenAnswerResult(spokenAnswerTargets, raw).ok
        : normalized === expected;
    const ok = finalOk && (spoken || !hadKanaMistakeRef.current);
    const nearMiss =
      choiceValue === undefined && !spoken && !ok
        ? typoGuardForAnswer(raw, normalized, expected, current.verb, reverseDrill)
        : null;
    if (nearMiss && typoGuard?.key !== nearMiss.key) {
      setTypoGuard(nearMiss);
      return;
    }
    if (choiceValue !== undefined) setAnswer(raw);
    const dict = current.verb.dict,
      rid = current.id;
    const responseMs = Math.max(0, Date.now() - answerStartedAtRef.current);
    const prevVS = state.verbStats?.[dict]?.[rid] || { seen: 0, incorrect: 0 };
    const newVerbStats = {
      ...state.verbStats,
      [dict]: {
        ...(state.verbStats?.[dict] || {}),
        [rid]: { seen: prevVS.seen + 1, incorrect: prevVS.incorrect + (ok ? 0 : 1) },
      },
    };
    const nextMistakes = ok
      ? resolveMistakesForCurrentCard(state.mistakes)
      : recordMistake(
          state.mistakes,
          current.verb,
          current.type,
          reverseDrill ? sourceTypeForReading : promptType,
          spoken || reverseDrill ? raw.trim() : normalized,
          expected,
          mistakeRecordOptions(),
        );
    const newDaily = bumpDaily(state.daily, ok, dailyGoalTarget);
    const mistakeDiagnosis = ok ? null : nextMistakes[0]?.diagnosis || null;
    const nextState = {
      ...state,
      cards: { ...state.cards, [rid]: gradeCard(state.cards[rid], ok) },
      retryQueue: ok
        ? (state.retryQueue || []).filter((id) => id !== rid)
        : [...new Set([...(state.retryQueue || []), rid])].slice(-20),
      verbStats: newVerbStats,
      mistakes: nextMistakes,
      readiness: recordReadinessAttempt(state.readiness, rid, {
        correct: ok,
        responseMs,
        answerMode,
        kanaAssist: readinessKanaAssist,
        reverseDrill,
      }),
      weakness: recordWeaknessAttempt(state.weakness, {
        word: current.verb,
        typeId: current.type,
        correct: ok,
        responseMs,
      }),
      minimalPairs: nextMinimalPairProgress(ok),
      session: {
        ...bumpSessionMistakePattern(
          {
            ...(state.session || {}),
            reviewed: (state.session?.reviewed || 0) + 1,
            correct: (state.session?.correct || 0) + (ok ? 1 : 0),
          },
          mistakeDiagnosis,
        ),
      },
      daily: newDaily,
    };
    if (ok && queuedDueRuleIds.includes(rid)) markSrsQueueCompleted?.(rid);
    setState(nextState);
    setChatOpen(false);
    setLastDiagnosis(mistakeDiagnosis);
    setReviewChoiceLabel('');
    setRevealedMiss(false);
    setSelfCheckOpen(false);
    // When the final string matched but the card was still marked wrong (a kana
    // mistake was made and then corrected mid-typing), show the snapshot from
    // when it went wrong instead of the corrected text.
    setSubmittedAnswer(
      finalOk && !ok && wrongSnapshotRef.current != null ? wrongSnapshotRef.current : raw,
    );
    setWasCorrected(finalOk && !ok);
    setWasCorrect(ok);
    setPhase('reviewing');
    const willClearDue =
      initialDue > 0 && ok && queuedDueRuleIds.includes(rid) && completedDueCount + 1 >= initialDue;
    const willHitDailyGoal =
      !startedGoalHit.current && !bonusMode && newDaily.goalHit && !daily.goalHit;
    const reviewWillComplete =
      (reviewLimit > 0 && reviewsDone + 1 >= reviewLimit) || willClearDue || willHitDailyGoal;
    if (ok && autoAdvanceCorrect && !reviewWillComplete) {
      autoAdvanceRef.current = setTimeout(() => {
        autoAdvanceRef.current = null;
        setChatOpen(false);
        setAnswer('');
        setCoachRevealed(0);
        setRevealedMiss(false);
        setReviewChoiceLabel('');
        setSelfCheckOpen(false);
        setTypoGuard(null);
        setStepHint('');
        setHintMasked(false);
        setHintRevealed(false);
        setCoachChatOpen(false);
        setLastDiagnosis(null);
        hadKanaMistakeRef.current = false;
        wrongSnapshotRef.current = null;
        setWasCorrected(false);
        setPhase('answering');
        setCurrent(selectNextReviewCard(nextState, current.id));
      }, CORRECT_AUTO_ADVANCE_MS);
    }
  }

  function skipCurrent() {
    if (!current) return;
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    stopSpeechRecognition();
    const nextState = {
      ...state,
      session: { ...(state.session || {}), skipped: (state.session?.skipped || 0) + 1 },
    };
    setState(nextState);
    setChatOpen(false);
    setAnswer('');
    setCoachRevealed(0);
    setRevealedMiss(false);
    setReviewChoiceLabel('');
    setSelfCheckOpen(false);
    setTypoGuard(null);
    setStepHint('');
    setHintMasked(false);
    setHintRevealed(false);
    setCoachChatOpen(false);
    setLastDiagnosis(null);
    hadKanaMistakeRef.current = false;
    wrongSnapshotRef.current = null;
    setWasCorrected(false);
    setPhase('answering');
    setWasCorrect(false);
    setCurrent(selectNextReviewCard(nextState, current.id));
  }

  function removeCurrentWordFromReviews() {
    if (!current) return;
    const removedWord = current.verb;
    setState((prev) => excludeWordFromReviewState(prev, removedWord));
    setUndoReviewScopeAction({
      kind: 'word',
      label: removedWord.dict,
      restore: () => setState((prev) => includeWordInReviewState(prev, removedWord)),
    });
    resetActiveAttempt();
  }

  function restoreLastReviewScopeAction() {
    undoReviewScopeAction?.restore?.();
    setUndoReviewScopeAction(null);
    setCurrent(null);
  }

  function gradeSelfCheck(ok, label) {
    if (!current || phase !== 'answering') return;
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    const dict = current.verb.dict,
      rid = current.id;
    const responseMs = Math.max(0, Date.now() - answerStartedAtRef.current);
    const prevVS = state.verbStats?.[dict]?.[rid] || { seen: 0, incorrect: 0 };
    const newVerbStats = {
      ...state.verbStats,
      [dict]: {
        ...(state.verbStats?.[dict] || {}),
        [rid]: { seen: prevVS.seen + 1, incorrect: prevVS.incorrect + (ok ? 0 : 1) },
      },
    };
    const nextMistakes = ok
      ? resolveMistakesForCurrentCard(state.mistakes)
      : recordMistake(
          state.mistakes,
          current.verb,
          current.type,
          reverseDrill ? sourceTypeForReading : promptType,
          `self-check: ${label}`,
          expected,
          mistakeRecordOptions(),
        );
    const newDaily = bumpDaily(state.daily, ok, dailyGoalTarget);
    const mistakeDiagnosis = ok ? null : nextMistakes[0]?.diagnosis || null;
    const nextState = {
      ...state,
      cards: { ...state.cards, [rid]: gradeCard(state.cards[rid], ok) },
      retryQueue: ok
        ? (state.retryQueue || []).filter((id) => id !== rid)
        : [...new Set([...(state.retryQueue || []), rid])].slice(-20),
      verbStats: newVerbStats,
      mistakes: nextMistakes,
      readiness: recordReadinessAttempt(state.readiness, rid, {
        correct: ok,
        responseMs,
        answerMode,
        kanaAssist: readinessKanaAssist,
        reverseDrill,
      }),
      weakness: recordWeaknessAttempt(state.weakness, {
        word: current.verb,
        typeId: current.type,
        correct: ok,
        responseMs,
      }),
      minimalPairs: nextMinimalPairProgress(ok),
      session: {
        ...bumpSessionMistakePattern(
          {
            ...(state.session || {}),
            reviewed: (state.session?.reviewed || 0) + 1,
            correct: (state.session?.correct || 0) + (ok ? 1 : 0),
          },
          mistakeDiagnosis,
        ),
      },
      daily: newDaily,
    };
    if (ok && queuedDueRuleIds.includes(rid)) markSrsQueueCompleted?.(rid);
    setState(nextState);
    setAnswer('');
    setTypoGuard(null);
    setReviewChoiceLabel(label);
    setRevealedMiss(!ok);
    setSelfCheckOpen(false);
    setChatOpen(false);
    setLastDiagnosis(mistakeDiagnosis);
    setWasCorrect(ok);
    setPhase('reviewing');
    const willClearDue =
      initialDue > 0 && ok && queuedDueRuleIds.includes(rid) && completedDueCount + 1 >= initialDue;
    const willHitDailyGoal =
      !startedGoalHit.current && !bonusMode && newDaily.goalHit && !daily.goalHit;
    const reviewWillComplete =
      (reviewLimit > 0 && reviewsDone + 1 >= reviewLimit) || willClearDue || willHitDailyGoal;
    if (ok && autoAdvanceCorrect && !reviewWillComplete) {
      autoAdvanceRef.current = setTimeout(() => {
        autoAdvanceRef.current = null;
        setChatOpen(false);
        setAnswer('');
        setCoachRevealed(0);
        setRevealedMiss(false);
        setReviewChoiceLabel('');
        setSelfCheckOpen(false);
        setTypoGuard(null);
        setStepHint('');
        setHintMasked(false);
        setHintRevealed(false);
        setCoachChatOpen(false);
        setLastDiagnosis(null);
        hadKanaMistakeRef.current = false;
        wrongSnapshotRef.current = null;
        setWasCorrected(false);
        setPhase('answering');
        setCurrent(selectNextReviewCard(nextState, current.id));
      }, CORRECT_AUTO_ADVANCE_MS);
    }
  }

  function revealAnswer() {
    if (!current || phase !== 'answering') return;
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    stopSpeechRecognition();
    const dict = current.verb.dict,
      rid = current.id;
    const responseMs = Math.max(0, Date.now() - answerStartedAtRef.current);
    const prevVS = state.verbStats?.[dict]?.[rid] || { seen: 0, incorrect: 0 };
    const newVerbStats = {
      ...state.verbStats,
      [dict]: {
        ...(state.verbStats?.[dict] || {}),
        [rid]: { seen: prevVS.seen + 1, incorrect: prevVS.incorrect + 1 },
      },
    };
    const nextMistakes = recordMistake(
      state.mistakes,
      current.verb,
      current.type,
      reverseDrill ? sourceTypeForReading : promptType,
      '(revealed)',
      expected,
      mistakeRecordOptions(),
    );
    const mistakeDiagnosis = nextMistakes[0]?.diagnosis || null;
    const nextState = {
      ...state,
      cards: { ...state.cards, [rid]: gradeCard(state.cards[rid], false) },
      retryQueue: [...new Set([...(state.retryQueue || []), rid])].slice(-20),
      verbStats: newVerbStats,
      mistakes: nextMistakes,
      readiness: recordReadinessAttempt(state.readiness, rid, {
        correct: false,
        responseMs,
        answerMode,
        kanaAssist: readinessKanaAssist,
        reverseDrill,
      }),
      weakness: recordWeaknessAttempt(state.weakness, {
        word: current.verb,
        typeId: current.type,
        correct: false,
        responseMs,
      }),
      minimalPairs: nextMinimalPairProgress(false),
      session: {
        ...bumpSessionMistakePattern(
          {
            ...(state.session || {}),
            reviewed: (state.session?.reviewed || 0) + 1,
            correct: state.session?.correct || 0,
          },
          mistakeDiagnosis,
        ),
      },
      daily: bumpDaily(state.daily, false, dailyGoalTarget),
    };
    setState(nextState);
    setAnswer('');
    setTypoGuard(null);
    setChatOpen(false);
    setLastDiagnosis(mistakeDiagnosis);
    setReviewChoiceLabel("I don't know");
    setSelfCheckOpen(false);
    setRevealedMiss(true);
    setWasCorrect(false);
    setPhase('reviewing');
  }

  function focusAnswerInput() {
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function setAnswerStyle(nextMode) {
    if (nextMode === answerMode) return;
    setPracticePrefs((prev) => ({ ...prev, answerMode: nextMode }));
  }

  function toggleKanaHelp() {
    setPracticePrefs((prev) => ({
      ...prev,
      kanaAssist: resolveKanaAssist(prev) === 'off' ? 'live' : 'off',
    }));
    hadKanaMistakeRef.current = false;
    wrongSnapshotRef.current = null;
    setTypoGuard(null);
  }

  function submitIfCompleteTypedAnswer(nextAnswer) {
    if (!current) return false;
    if (phase !== 'answering') return false;
    if (reverseDrill) return false;
    if (!typedAnswerMode) return false;
    if (expected && toHiragana(nextAnswer) === expected) {
      submit(nextAnswer, { fromTypedInput: true });
      return true;
    }
    return false;
  }

  function rememberKanaMistake(nextAnswer, enabled) {
    if (!enabled) return;
    const cells = kanaCoachCells(expected, nextAnswer, coachRevealed, true);
    if (cells.some((c) => c.state === 'wrong' || c.state === 'extra')) {
      if (!hadKanaMistakeRef.current) wrongSnapshotRef.current = nextAnswer;
      hadKanaMistakeRef.current = true;
    }
  }

  function updateTypedAnswer(nextAnswer, options = {}) {
    setTypoGuard(null);
    rememberKanaMistake(nextAnswer, options.trackKanaMistake !== false);
    setAnswer(nextAnswer);
    return submitIfCompleteTypedAnswer(nextAnswer);
  }

  function updateAnswerFromInput(event, options = {}) {
    const nextAnswer = event.nativeEvent?.isComposing
      ? event.target.value
      : toKanaInputValue(event.target.value);
    updateTypedAnswer(nextAnswer, options);
  }

  function commitAnswerComposition(event, options = {}) {
    updateTypedAnswer(toKanaInputValue(event.currentTarget.value), options);
  }

  // Workout completion screen — shown once when the ready queue is cleared
  // or the session limit is reached. Bonus mode lets the user keep practicing.
  if (reviewComplete && phase === 'answering') {
    const sessionCorrect = state.session.correct || 0;
    const sessionReviewed = state.session.reviewed || 0;
    const sessionWrong = sessionReviewed - sessionCorrect;
    const sessionAccuracy = sessionReviewed
      ? Math.round((sessionCorrect / sessionReviewed) * 100)
      : 0;
    const fLabel = todayPlan.forecastLabel;
    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-8 text-center">
        <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium mb-2">
          Map updated
        </div>
        <div className="text-4xl font-semibold text-stone-900 dark:text-stone-100 mb-1">
          {dueQueueDone ? `${completedDueCount}/${initialDue}` : sessionReviewed}
        </div>
        <div className="text-sm text-stone-400 mb-3">
          {dueQueueDone ? 'ready cards practiced' : 'cards practiced'}
        </div>
        <div className="flex justify-center gap-2 mb-2">
          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            {sessionCorrect} correct
          </span>
          <span className="text-stone-300 dark:text-stone-600">·</span>
          <span className="text-sm font-medium text-rose-600 dark:text-rose-400">
            {sessionWrong} missed
          </span>
          {sessionSkipped > 0 && (
            <>
              <span className="text-stone-300 dark:text-stone-600">·</span>
              <span className="text-sm text-stone-500">{sessionSkipped} skipped</span>
            </>
          )}
        </div>
        <div className="text-sm text-stone-500 mb-1">{sessionAccuracy}% accuracy</div>
        {fLabel && (
          <div className="mt-3 mb-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 px-4 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1">
              Coming up
            </div>
            <div className="text-xs text-stone-600 dark:text-stone-300">{fLabel}</div>
          </div>
        )}
        {!fLabel && <div className="mb-3" />}
        {(daily.bestAnswerStreak || 0) >= 5 && (
          <div className="text-xs text-stone-400 mb-1">
            Best streak: {daily.bestAnswerStreak} in a row
          </div>
        )}
        {!!daily.goalStreak && (
          <div className="text-amber-600 dark:text-amber-400 text-sm mt-1 mb-3">
            🔥 {daily.goalStreak}-day streak
          </div>
        )}
        {!daily.goalStreak && <div className="mb-3" />}
        {sessionMistakePatterns.length > 0 ? (
          <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/10 px-4 py-3 text-left">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-400 font-semibold flex items-center gap-1.5">
                  <IconFlame className="w-3.5 h-3.5" />
                  Top mistake pattern
                </div>
                <div className="mt-1 text-sm font-medium text-stone-900 dark:text-stone-100">
                  {sessionMistakePatterns[0].label}
                </div>
                <div className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                  {sessionMistakePatterns[0].feedback}
                </div>
                <MistakeRouteHint route={labRouteForMistakePattern(sessionMistakePatterns[0])} />
              </div>
              <div className="text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                {sessionMistakePatterns[0].count}x
              </div>
            </div>
            {sessionMistakePatterns.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sessionMistakePatterns.slice(1, 4).map((pattern) => (
                  <span
                    key={pattern.patternId}
                    className="px-2 py-1 rounded-full border border-rose-200/70 dark:border-rose-900/60 bg-white/70 dark:bg-stone-900/50 text-[11px] text-stone-600 dark:text-stone-300"
                  >
                    {pattern.label} ({pattern.count}x)
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          sessionWrong === 0 &&
          sessionReviewed > 0 && (
            <div className="text-xs text-emerald-600 dark:text-emerald-400 mb-4">
              Perfect session — no missed answers!
            </div>
          )
        )}
        <button
          onClick={() => {
            setBonusMode(true);
            setCurrent(selectNextReviewCard(state, current?.id, { bonusMode: true, wordLists }));
            setPhase('answering');
          }}
          className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-medium"
        >
          Start next workout
        </button>
      </div>
    );
  }

  if (reviewSetComplete && phase === 'answering') {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-8 text-center">
        <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium mb-2">
          {reviewLimitSource === 'recommendation'
            ? 'Recommended practice complete'
            : 'Drill complete'}
        </div>
        <div className="text-4xl font-semibold text-stone-900 dark:text-stone-100 mb-2">
          {state.session.correct}/{state.session.reviewed}
        </div>
        <div className="text-sm text-stone-500 mb-1">
          Session accuracy:{' '}
          {state.session.reviewed
            ? Math.round((state.session.correct / state.session.reviewed) * 100)
            : 0}
          %
        </div>
        {reviewLimit > 0 && (
          <div className="text-xs text-stone-400 mb-5">
            {Math.min(reviewsDone, reviewLimit)}/{reviewLimit} cards in this drill
          </div>
        )}
        {sessionMistakePatterns.length > 0 ? (
          <div className="mb-5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/10 px-4 py-3 text-left">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-400 font-semibold flex items-center gap-1.5">
                  <IconFlame className="w-3.5 h-3.5" />
                  Top mistake pattern
                </div>
                <div className="mt-1 text-sm font-medium text-stone-900 dark:text-stone-100">
                  {sessionMistakePatterns[0].label}
                </div>
                <div className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                  {sessionMistakePatterns[0].feedback}
                </div>
                <MistakeRouteHint route={labRouteForMistakePattern(sessionMistakePatterns[0])} />
              </div>
              <div className="text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                {sessionMistakePatterns[0].count}x
              </div>
            </div>
            {sessionMistakePatterns.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sessionMistakePatterns.slice(1, 4).map((pattern) => (
                  <span
                    key={pattern.patternId}
                    className="px-2 py-1 rounded-full border border-rose-200/70 dark:border-rose-900/60 bg-white/70 dark:bg-stone-900/50 text-[11px] text-stone-600 dark:text-stone-300"
                  >
                    {pattern.label} ({pattern.count}x)
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-5" />
        )}
        <button
          onClick={() => {
            setReviewBase(state.session.reviewed || 0);
            defaultWorkoutTargetRef.current = Math.max(
              1,
              Number(todayPlan?.reviewLimit || dailyGoalTarget),
            );
            setCurrent(selectNextReviewCard(state, current.id));
            setAnswer('');
            setPhase('answering');
          }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-medium"
        >
          Start next workout
        </button>
      </div>
    );
  }

  // Shared hint disclosure for both answer modes: the deterministic step-coach
  // text, an optional "Discuss further" AI chat trigger, and the chat itself.
  // Each mode supplies its own "Hint" button (styled to fit its layout) that
  // calls showStepHint().
  const hintDisclosure =
    !reverseDrill && (stepHint || (geminiKey && (stepHint || coachChatOpen))) ? (
      <div className="mt-2 flex flex-col items-center gap-1">
        {stepHint && (
          <div
            ref={typingHintRef}
            style={{ whiteSpace: 'pre-wrap' }}
            className="w-full rounded-lg border border-indigo-100 dark:border-indigo-800/40 bg-indigo-50 dark:bg-indigo-950/20 px-3 py-2 text-xs text-stone-700 dark:text-stone-300 text-left max-h-40 overflow-y-auto"
          >
            {stepHint}
          </div>
        )}
        {geminiKey && stepHint && !coachChatOpen && (
          <button
            onClick={openCoachChat}
            aria-expanded={coachChatOpen}
            className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 inline-flex items-center gap-1 transition"
          >
            <IconChat className="w-3 h-3" />
            Discuss further
          </button>
        )}
        {coachChatOpen && geminiKey && (
          <div className="w-full text-left">
            <ChatPanel
              mode="coach"
              verb={current.verb}
              type={practicedType}
              userAnswer={coachSeedAnswer}
              geminiKey={geminiKey}
              practicePrefs={practicePrefs}
              taskOverride={taskOverride}
            />
          </div>
        )}
      </div>
    ) : null;
  const referenceLaunch = launchContext;

  function returnToReference() {
    setLaunchContext(null);
    setFocusWordLock(null);
    setRecommendationFocus(null);
    onFocusConsumed?.();
    setTab('tools');
  }

  function clearBoundedReviewPrefs(prefs = {}) {
    const next = { ...prefs, reviewLimitSource: '', reviewLimit: 0 };
    if (Array.isArray(next.wordListIds)) {
      next.wordListIds = next.wordListIds.filter(
        (id) => id !== 'repair-drill' && !String(id || '').startsWith('list-review-rec-'),
      );
    }
    return next;
  }

  // Universal escape hatch back to Stats. Exits whatever focused session is
  // active (minimal-pair contrast, bounded practice, or a focus-word lock).
  function returnToOverview() {
    if (activeMinimalPairSet) {
      const restoreTypes = minimalPairReturnEnabledTypes(practicePrefs) || [];
      setPracticePrefs((prev) => {
        const cleared = clearMinimalPairPrefs(prev);
        return clearBoundedReviewPrefs(cleared);
      });
      if (restoreTypes.length) setState((prev) => ({ ...prev, enabledTypes: restoreTypes }));
    } else if (practicePrefs.reviewLimitSource || practicePrefs.reviewLimit > 0) {
      setPracticePrefs((prev) => clearBoundedReviewPrefs(prev));
    }
    setLaunchContext(null);
    setFocusWordLock(null);
    setRecommendationFocus(null);
    setSessionFilterWord(null);
    setSessionFilterFormGroupId(null);
    onFocusConsumed?.();
    resetActiveAttempt();
    setCurrent(null);
    setTab('stats');
  }

  // Title banner for a focused "Practice this" launch. Generalizes the older
  // reference-drill banner so every targeted entry (a Check/Library word, a
  // reference drill, or a form family) leads the active workout with a clear
  // title of what is being studied plus a single exit affordance.
  const focusBannerGroup = sessionFilterFormGroupId
    ? FORM_GROUPS.find((g) => g.id === sessionFilterFormGroupId)
    : null;
  const focusBannerWord = sessionFilterWord || focusWordLock;
  const recommendationCountParts = recommendationFocus
    ? [
        recommendationFocus.suggestedCount
          ? `${recommendationFocus.suggestedCount}-card target`
          : '',
        recommendationFocus.wordCount ? `${recommendationFocus.wordCount} words` : '',
        recommendationFocus.typeCount ? `${recommendationFocus.typeCount} form types` : '',
      ].filter(Boolean)
    : [];
  const recommendationSubtitle = recommendationFocus
    ? [recommendationFocus.detail, recommendationCountParts.join(' - '), 'Locked Practice set']
        .filter(Boolean)
        .join(' - ')
    : '';
  const focusBanner = recommendationFocus
    ? {
        kicker: recommendationFocus.source === 'lesson' ? 'Learn focus' : 'Tools focus',
        title: recommendationFocus.label || 'Recommended practice',
        reading: '',
        subtitle: recommendationSubtitle,
        exitLabel: 'Exit focus',
        onExit: returnToOverview,
      }
    : focusBannerGroup
      ? {
          kicker: 'Form family workout',
          title: focusBannerGroup.label,
          reading: '',
          subtitle: focusBannerGroup.typeIds?.length
            ? `${focusBannerGroup.typeIds.length} forms in this family`
            : 'Focused form practice',
          exitLabel: 'Exit focus',
          onExit: returnToOverview,
        }
      : focusBannerWord
        ? {
            kicker: referenceLaunch ? 'Reference drill' : 'Focused practice',
            title: focusBannerWord.dict,
            lang: 'ja',
            reading: focusBannerWord.reading || '',
            subtitle: [focusBannerWord.meaning, referenceLaunch?.referenceLabel || typeInfo.label]
              .filter(Boolean)
              .join(' · '),
            exitLabel: referenceLaunch ? 'Back to reference' : 'Exit focus',
            onExit: referenceLaunch ? returnToReference : returnToOverview,
          }
        : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <PracticeScopeSidebar
        className="order-2 lg:order-1"
        state={state}
        weaknessFamilies={weaknessFamilies}
        onToggleFamily={togglePracticeFamily}
        onToggleType={togglePracticeType}
      />
      <div className="order-1 min-w-0 space-y-4 lg:order-2">
        {focusBanner && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 px-5 py-4 dark:border-indigo-800 dark:bg-indigo-950/20">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                  {focusBanner.kicker}
                </div>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h2
                    lang={focusBanner.lang || undefined}
                    className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50"
                  >
                    {focusBanner.title}
                  </h2>
                  {focusBanner.reading && focusBanner.reading !== focusBanner.title && (
                    <span lang="ja" className="text-sm text-indigo-600 dark:text-indigo-300">
                      {focusBanner.reading}
                    </span>
                  )}
                </div>
                {focusBanner.subtitle && (
                  <div className="mt-0.5 text-sm text-stone-600 dark:text-stone-300">
                    {focusBanner.subtitle}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={focusBanner.onExit}
                className="shrink-0 rounded-lg border border-indigo-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-white dark:border-indigo-800 dark:bg-stone-950/40 dark:text-indigo-300 dark:hover:bg-stone-900"
              >
                {focusBanner.exitLabel}
              </button>
            </div>
          </div>
        )}
        {undoReviewScopeAction && (
          <div
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Removed word: <strong>{undoReviewScopeAction.label}</strong>
              </span>
              <button
                type="button"
                onClick={restoreLastReviewScopeAction}
                className="self-start rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-stone-950 dark:text-amber-200 dark:hover:bg-amber-950/40 sm:self-auto"
              >
                Undo
              </button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-3">
          <div className="flex items-center gap-2.5">
            {!focusBanner && (
              <button
                type="button"
                onClick={returnToOverview}
                aria-label="Back to Stats"
                className="shrink-0 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-500 transition hover:bg-stone-50 hover:text-stone-700 dark:border-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              >
                &lt;- Stats
              </button>
            )}
            <div className="text-left">
              <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-300 font-semibold">
                Practice
              </div>
              <div className="text-sm text-stone-600 dark:text-stone-300">
                {todayDrillActive && todayPlan?.typeIds?.length
                  ? `${todayPlan.typeIds.length} form types this session`
                  : reverseDrill
                    ? 'Reading practice'
                    : 'Form practice'}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div
              role="group"
              aria-label="Answer style"
              className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-stone-200 bg-white p-1 dark:border-stone-800 dark:bg-stone-900"
            >
              <span className="px-1.5 text-xs font-medium text-stone-400">Answer</span>
              {ANSWER_STYLE_OPTIONS.map((option) => {
                const active = answerMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setAnswerStyle(option.id)}
                    aria-pressed={active}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                      active
                        ? 'bg-stone-800 text-white dark:bg-indigo-600'
                        : 'text-stone-500 hover:bg-stone-50 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {typedAnswerMode && !reverseDrill && (
              <button
                type="button"
                onClick={toggleKanaHelp}
                aria-pressed={liveKanaHelpEnabled}
                title={liveKanaHelpEnabled ? 'Turn kana help off' : 'Turn kana help on'}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  liveKanaHelpEnabled
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                    : 'border-stone-200 text-stone-500 hover:bg-stone-50 dark:border-stone-800 dark:text-stone-400 dark:hover:bg-stone-800'
                }`}
              >
                {liveKanaHelpEnabled ? (
                  <IconEye className="h-3.5 w-3.5" />
                ) : (
                  <IconEyeOff className="h-3.5 w-3.5" />
                )}
                Kana help {liveKanaHelpEnabled ? 'on' : 'off'}
              </button>
            )}
            <div className="text-xs text-stone-400 text-right">Workout</div>
            <button
              type="button"
              onClick={() =>
                setPracticePrefs((prev) => ({ ...prev, sentenceMode: !prev.sentenceMode }))
              }
              aria-pressed={sentenceMode}
              title="Show each prompt inside an example sentence (stays on until you turn it off)"
              className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                sentenceMode
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'border-stone-200 text-stone-500 hover:bg-stone-50 dark:border-stone-800 dark:text-stone-400 dark:hover:bg-stone-800'
              }`}
            >
              Sentence{sentenceMode ? ' on' : ''}
            </button>
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-500 transition hover:bg-stone-50 dark:border-stone-800 dark:text-stone-400 dark:hover:bg-stone-800">
                Adjust scope
              </summary>
              <div className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-stone-200 bg-white p-2 text-left shadow-lg dark:border-stone-800 dark:bg-stone-900">
                <p className="px-1 pb-1.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                  Removes this word from automatic Practice. Restore words from Tools. To move on
                  without changing scope, use Skip.
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    removeCurrentWordFromReviews();
                    e.currentTarget.closest('details')?.removeAttribute('open');
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-stone-700 transition hover:bg-rose-50 hover:text-rose-700 dark:text-stone-200 dark:hover:bg-rose-950/20 dark:hover:text-rose-300"
                >
                  Remove this word from Practice
                </button>
              </div>
            </details>
          </div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              {workoutProgress.label}
            </div>
            <div className="text-xs font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">
              {workoutProgress.now}/{workoutProgress.max} cards
            </div>
          </div>
          <div
            role="progressbar"
            aria-label={workoutProgress.label}
            aria-valuemin={0}
            aria-valuemax={workoutProgress.max}
            aria-valuenow={workoutProgress.now}
            className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800"
          >
            <span
              className="block h-full rounded-full bg-indigo-600 dark:bg-indigo-400"
              style={{ width: `${workoutProgressPct}%` }}
            />
          </div>
          {!!sessionSkipped && (
            <div className="mt-1 text-right text-[11px] text-stone-400">
              {sessionSkipped} skipped
            </div>
          )}
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800">
          <div className="px-4 py-4 sm:px-6 sm:py-8 text-center relative">
            <div className="absolute top-4 left-4 sm:top-8 sm:left-6 text-[9px] text-stone-400">
              JLPT {getWordMeta(current.verb).jlpt}
            </div>
            {reviewLimit > 0 ||
            !!sessionSkipped ||
            initialDue > 0 ||
            (!daily.goalHit && !bonusMode) ? (
              <div className="flex justify-end mb-3">
                <div className="text-xs text-stone-400 text-right shrink-0">
                  {reviewLimit > 0 && (
                    <div className="text-indigo-600 dark:text-indigo-400 font-medium">
                      {Math.min(reviewsDone, reviewLimit)}/{reviewLimit}{' '}
                      {reviewLimitSource === 'recommendation' ? 'recommended' : 'drill'}
                    </div>
                  )}
                  {initialDue > 0 && !bonusMode && (
                    <div className="text-indigo-600 dark:text-indigo-400 font-medium">
                      {completedDueCount}/{initialDue} ready
                    </div>
                  )}
                  {bonusMode && (
                    <div className="text-emerald-600 dark:text-emerald-400 font-medium">bonus</div>
                  )}
                  {!!sessionSkipped && (
                    <div className="text-stone-500">{sessionSkipped} skipped</div>
                  )}
                  <div className="text-[9px]">
                    {[
                      getWordMeta(current.verb).lesson &&
                        `Genki L${getWordMeta(current.verb).lesson}`,
                      getWordMeta(current.verb).minnaLesson &&
                        `Minna L${getWordMeta(current.verb).minnaLesson}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
              </div>
            ) : (
              <div className="absolute top-4 right-4 sm:top-8 sm:right-6 text-right text-[9px] text-stone-400">
                {[
                  getWordMeta(current.verb).lesson && `Genki L${getWordMeta(current.verb).lesson}`,
                  getWordMeta(current.verb).minnaLesson &&
                    `Minna L${getWordMeta(current.verb).minnaLesson}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
            {clozePrompt && (
              <div className="mx-auto mb-4 max-w-md rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-left dark:border-indigo-900/50 dark:bg-indigo-950/20">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                  Sentence
                </div>
                <ScriptDisplay
                  view={clozePromptView}
                  className="mt-1 text-lg leading-relaxed text-stone-900 dark:text-stone-100"
                  subClassName="mt-1 text-[11px] leading-snug text-stone-500 dark:text-stone-400"
                  colorHighlight={false}
                />
                {clozePrompt.cue && (
                  <div className="mt-1.5 text-[11px] leading-snug text-indigo-700/80 dark:text-indigo-300/80">
                    {clozePrompt.cue}
                  </div>
                )}
              </div>
            )}
            {hidePromptText ? (
              <div className="max-w-md mx-auto rounded-2xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-5">
                <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-semibold mb-3">
                  Listening prompt
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => speakJapaneseLocal(promptAudioText, 0.85)}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm flex items-center gap-1.5"
                  >
                    <IconVolume className="w-4 h-4" />
                    Replay
                  </button>
                  <button
                    onClick={() => setShowPromptText(true)}
                    className="px-3 py-2 border border-indigo-250 bg-white/70 hover:bg-white text-indigo-700 rounded-lg text-sm dark:bg-stone-800 dark:border-stone-700 dark:text-stone-300"
                  >
                    Show text
                  </button>
                </div>
              </div>
            ) : (
              <ScriptDisplay
                view={promptView}
                className="text-4xl sm:text-5xl font-medium mb-2 text-stone-900 dark:text-stone-100"
                subClassName="text-base text-stone-500"
              />
            )}
            {noChangePrompt && !hidePromptText && (
              <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
                Trick: no change needed
              </div>
            )}
            {reverseDrill && !hidePromptText && (
              <div className="text-xs text-stone-400">Answer with the dictionary form.</div>
            )}

            {!hideEnglishMeaning && (
              <div className="text-sm text-stone-500 mt-2 italic">{promptEnglish}</div>
            )}

            {phase === 'reviewing' && practicePrefs.showWordCategory && (
              <div className="text-xs text-stone-400 mt-1">
                {groupDisplayLabel(current.verb.group)} · {wordType}
                {groupAliasText(current.verb.group)
                  ? ` · ${groupAliasText(current.verb.group)}`
                  : ''}
              </div>
            )}
            <div className="mt-4 flex flex-col gap-1">
              {phase === 'answering' ? (
                <>
                  <div className="flex justify-center mb-4">
                    {transformationMode ? (
                      <div className="max-w-full px-2 text-center">
                        <div className="text-[10px] font-semibold uppercase text-indigo-500 dark:text-indigo-300">
                          {transformationActionLabel}
                        </div>
                        <div className="mt-1 inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl bg-indigo-600 px-5 py-3 text-white shadow-lg shadow-indigo-950/20 dark:bg-indigo-500/95">
                          <span className="text-xl sm:text-2xl font-bold leading-tight">
                            {targetTypeInfo.label}
                          </span>
                          {answerTaskDetails.sub && (
                            <span
                              className="rounded-lg bg-white/15 px-2 py-1 text-base sm:text-lg font-semibold leading-tight"
                              lang="ja"
                            >
                              {answerTaskDetails.sub}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                          <span>From {sourceTypeInfo.label}</span>
                          <span aria-hidden="true" className="text-indigo-400">
                            -&gt;
                          </span>
                          <span>{transformationSupportText}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/60 shadow-sm">
                        <span className="text-sm font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                          {taskLabel}
                        </span>
                        {answerTaskDetails.sub && (
                          <span
                            className="text-sm text-indigo-500 dark:text-indigo-400 font-medium"
                            lang="ja"
                          >
                            {answerTaskDetails.sub}
                          </span>
                        )}
                        {answerTaskDetails.supportText ? (
                          <span className="text-xs text-indigo-400 dark:text-indigo-500">
                            · {answerTaskDetails.supportText}
                          </span>
                        ) : null}
                        {current.ruleLabel && practicePrefs.showWordCategory && (
                          <span className="text-xs text-indigo-400 dark:text-indigo-500">
                            · {current.ruleLabel}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="sr-only">
                      {transformationMode ? transformationRoute : taskLabel}
                    </div>
                  </div>
                  {minimalPairSetForCurrent && (
                    <div className="mb-3 flex items-center justify-between gap-2 rounded-full border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5 text-xs text-emerald-800 dark:text-emerald-250">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold uppercase tracking-wider">
                          {activeMinimalPairSet ? 'Minimal pair' : 'Today contrast'}
                        </span>
                        <span>{minimalPairSetForCurrent.label}</span>
                        {reviewsDone > 0 && (
                          <span className="tabular-nums opacity-70">
                            {reviewsDone} this session
                          </span>
                        )}
                      </div>
                      {activeMinimalPairSet && (
                        <button
                          onClick={() => {
                            if (setPracticePrefs)
                              setPracticePrefs(clearMinimalPairPrefs(practicePrefs));
                            if (setState) {
                              const enabledTypes = minimalPairReturnEnabledTypes(practicePrefs);
                              setState((prev) => ({ ...prev, enabledTypes: enabledTypes || [] }));
                            }
                          }}
                          className="ml-1 font-bold leading-none hover:text-emerald-950 dark:hover:text-emerald-100 transition"
                          aria-label="End minimal pair drill"
                          title="End drill"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}
                  {typoGuard && (
                    <div className="mb-3 rounded-xl border border-amber-250 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                      <div className="font-medium">Almost - possible typo.</div>
                      <div className="text-xs mt-0.5">{typoGuard.detail}</div>
                    </div>
                  )}

                  {answerMode === 'self-check' ? (
                    <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-4">
                      <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-semibold mb-2">
                        Self-check deck
                      </div>
                      {!selfCheckOpen ? (
                        <>
                          <p className="text-sm text-stone-600 dark:text-stone-400 mb-3">
                            Say or write the answer on your own, then reveal it and grade honestly.
                          </p>
                          <div className="grid sm:grid-cols-2 gap-2">
                            <button
                              onClick={() => setSelfCheckOpen(true)}
                              className="py-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-medium transition"
                            >
                              Reveal answer
                            </button>
                            <button
                              onClick={skipCurrent}
                              className="py-2.5 border border-stone-250 bg-white hover:bg-stone-50 text-stone-600 rounded-xl font-medium dark:bg-stone-900 dark:border-stone-800 dark:text-stone-300 transition"
                            >
                              Skip without penalty
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="rounded-xl bg-white dark:bg-stone-900 border border-stone-205 dark:border-stone-800 px-3 py-3">
                            <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1">
                              Answer
                            </div>
                            <ScriptDisplay
                              view={expectedView}
                              word={current.verb}
                              type={practicedType}
                              colorHighlight={practicePrefs.colorCodeConjugations !== false}
                              className="text-2xl font-semibold text-stone-900 dark:text-stone-100"
                              subClassName="text-xs text-stone-500 mt-1"
                            />
                            <div className="text-xs text-stone-500 mt-2">{targetEnglish}</div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-3">
                            <button
                              onClick={() => gradeSelfCheck(true, 'Remembered')}
                              className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition"
                            >
                              Remembered
                            </button>
                            <button
                              onClick={() => gradeSelfCheck(false, 'Missed')}
                              className="py-2.5 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-xl text-sm font-medium transition"
                            >
                              Missed
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : answerMode === 'speak' ? (
                    <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-4">
                      <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-semibold mb-2">
                        Speak answer
                      </div>
                      <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <input
                              ref={inputRef}
                              id="spoken-answer"
                              type="text"
                              value={answer}
                              onChange={(e) => {
                                setSpeechError('');
                                setAnswer(e.target.value);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (answer.trim()) submit(answer, { spoken: true });
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  skipCurrent();
                                }
                              }}
                              placeholder="Heard Japanese answer..."
                              aria-label="Heard spoken answer"
                              className="w-full min-w-0 px-4 py-3 text-xl text-center border-2 border-stone-200 dark:border-stone-805 rounded-xl bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-150 focus:border-indigo-500 focus:outline-none transition"
                              lang="ja"
                              autoComplete="off"
                              autoCapitalize="none"
                              autoCorrect="off"
                              enterKeyHint="done"
                              spellCheck="false"
                            />
                          </div>
                          <div className="mt-2 min-h-5 text-xs">
                            {speechListening ? (
                              <span role="status" className="text-indigo-600 dark:text-indigo-400">
                                Listening for Japanese...
                              </span>
                            ) : speechMatch ? (
                              <span
                                className={
                                  speechMatch.ok
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-stone-500 dark:text-stone-400'
                                }
                              >
                                {speechMatch.ok
                                  ? 'Exact match heard.'
                                  : speechMatch.score !== null
                                    ? `Closest match ${speechMatch.score}%.`
                                    : ''}
                              </span>
                            ) : speechRecognitionAvailable ? (
                              <span className="text-stone-500 dark:text-stone-400">
                                Microphone ready.
                              </span>
                            ) : (
                              <span className="text-amber-700 dark:text-amber-400">
                                Speech input is not available in this browser.
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => startSpeechAnswer()}
                          disabled={!speechRecognitionAvailable}
                          className={`min-h-12 px-4 py-3 rounded-xl font-medium transition inline-flex items-center justify-center gap-2 ${
                            speechListening
                              ? 'bg-rose-600 hover:bg-rose-700 text-white'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:hover:bg-indigo-600'
                          }`}
                        >
                          <IconMic className="w-4 h-4" />
                          {speechListening ? 'Stop listening' : 'Speak answer'}
                        </button>
                      </div>
                      {speechError && (
                        <div
                          role="alert"
                          className="mt-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
                        >
                          {speechError}
                        </div>
                      )}
                      <StickyAction className="mt-3">
                        <button
                          onClick={() => submit(answer, { spoken: true })}
                          disabled={!answer.trim()}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-lg transition disabled:opacity-40"
                        >
                          Check spoken answer
                        </button>
                      </StickyAction>
                      <div className="grid sm:grid-cols-2 gap-2 mt-3">
                        <button
                          onClick={revealAnswer}
                          className="py-2.5 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-medium transition"
                        >
                          Reveal
                        </button>
                        <button
                          onClick={skipCurrent}
                          className="py-2.5 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-xl font-medium transition"
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  ) : answerMode === 'choice' ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {reverseDrill
                          ? choices.map((w) => {
                              const cv = promptDisplay(w, null, practicePrefs);
                              return (
                                <button
                                  key={w.dict + ':' + w.reading}
                                  onClick={() => submit(w.dict)}
                                  className="min-h-14 px-3 py-3 border-2 border-stone-200 dark:border-stone-800 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-xl text-xl text-stone-800 dark:text-stone-200 transition"
                                >
                                  <ScriptDisplay
                                    view={cv}
                                    className="text-xl"
                                    subClassName="text-xs text-stone-400 mt-1"
                                  />
                                  {!hideEnglishMeaning && (
                                    <div className="mt-1 text-xs text-stone-500">{w.meaning}</div>
                                  )}
                                </button>
                              );
                            })
                          : choices.map((c) => {
                              const cv = formDisplay(c, practicePrefs);
                              return (
                                <button
                                  key={c}
                                  onClick={() => submit(c)}
                                  className="min-h-14 px-3 py-3 border-2 border-stone-200 dark:border-stone-800 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-xl text-xl text-stone-800 dark:text-stone-200 transition"
                                >
                                  <ScriptDisplay
                                    view={cv}
                                    className="text-xl"
                                    subClassName="text-xs text-stone-400 mt-1"
                                  />
                                </button>
                              );
                            })}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2 mt-3">
                        <button
                          onClick={revealAnswer}
                          className="py-2.5 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-medium transition"
                        >
                          I don't know
                        </button>
                        <button
                          onClick={skipCurrent}
                          className="py-2.5 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-xl font-medium transition"
                        >
                          Skip without penalty
                        </button>
                      </div>
                    </>
                  ) : guidedKana ? (
                    <>
                      <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-3 mb-3">
                        <div className="flex flex-wrap justify-center gap-1.5" lang="ja">
                          {visibleCoachCells.map((cell, i) => {
                            const cls =
                              kanaMatchDisplay === 'none'
                                ? cell.state === 'empty'
                                  ? 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-300'
                                  : 'bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                                : cell.state === 'correct'
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300'
                                  : cell.state === 'wrong' || cell.state === 'extra'
                                    ? 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300'
                                    : cell.state === 'pending'
                                      ? 'bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                                      : cell.state === 'hint'
                                        ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:border-amber-805 dark:text-amber-300'
                                        : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-300';
                            return (
                              <div
                                key={i}
                                className={`w-10 h-11 sm:w-11 sm:h-12 rounded-xl border flex items-center justify-center text-xl font-medium tabular-nums transition ${cls}`}
                              >
                                {cell.shown || '·'}
                              </div>
                            );
                          })}
                        </div>
                        {kanaMatchDisplay === 'color-count' && coachStatus && (
                          <div
                            className={`mt-2 text-xs text-center ${
                              coachWrongIndex >= 0
                                ? 'text-rose-700'
                                : coachPreview === expected
                                  ? 'text-emerald-700'
                                  : 'text-stone-500'
                            }`}
                          >
                            {coachStatus}
                          </div>
                        )}
                        {!reverseDrill && (
                          <div className="mt-2 flex flex-col items-center gap-1">
                            <button
                              onClick={showStepHint}
                              className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 inline-flex items-center gap-1 transition"
                            >
                              <IconSpark className="w-3 h-3" />
                              Hint
                            </button>
                            {hintDisclosure}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          ref={inputRef}
                          type="text"
                          value={answer}
                          onChange={(e) =>
                            updateAnswerFromInput(e, {
                              trackKanaMistake: kanaMatchDisplay !== 'none',
                            })
                          }
                          onCompositionEnd={(e) =>
                            commitAnswerComposition(e, {
                              trackKanaMistake: kanaMatchDisplay !== 'none',
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (answer.trim()) submit();
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              skipCurrent();
                            }
                          }}
                          placeholder={
                            reverseDrill ? 'Type dictionary form...' : 'Type romaji or kana...'
                          }
                          aria-label={
                            reverseDrill
                              ? 'Type the dictionary form'
                              : 'Type your answer in romaji or kana'
                          }
                          className={answerInputClassName}
                          lang="ja"
                          autoComplete="off"
                          autoCapitalize="none"
                          autoCorrect="off"
                          enterKeyHint="done"
                          spellCheck="false"
                        />
                        {!reverseDrill && (
                          <button
                            type="button"
                            onClick={revealNextKana}
                            disabled={coachRevealed >= expectedKanaCount || phase !== 'answering'}
                            aria-label="Reveal next kana"
                            title="Reveal next kana"
                            className="shrink-0 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-indigo-200 bg-white text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-40 dark:border-indigo-900 dark:bg-stone-900 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                          >
                            <IconSpark className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {liveKana && liveStatus && (
                        <div
                          role="status"
                          aria-live="polite"
                          className={`mt-2 min-h-5 text-center text-xs ${answerFeedbackClassName}`}
                        >
                          {liveStatus}
                        </div>
                      )}
                      <StickyAction className="mt-3">
                        <button
                          onClick={() => submit()}
                          disabled={!answer.trim()}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-lg transition disabled:opacity-40"
                        >
                          Check (Enter)
                        </button>
                      </StickyAction>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <button
                          onClick={() =>
                            setCoachRevealed(
                              Math.min(
                                expectedKanaCount,
                                Math.max(coachRevealed, coachTypedCount) + 1,
                              ),
                            )
                          }
                          disabled={coachRevealed >= expectedKanaCount || phase !== 'answering'}
                          className="py-2.5 border border-stone-205 dark:border-stone-800 hover:bg-white dark:hover:bg-stone-800 text-stone-605 dark:text-stone-300 disabled:opacity-40 rounded-xl text-sm"
                        >
                          Hint
                        </button>
                        <button
                          onClick={revealAnswer}
                          className="py-2.5 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-xl text-sm text-amber-800"
                        >
                          Reveal
                        </button>
                        <button
                          onClick={skipCurrent}
                          className="py-2.5 border border-stone-205 dark:border-stone-800 hover:bg-white dark:hover:bg-stone-800 text-stone-605 dark:text-stone-300 rounded-xl text-sm"
                        >
                          Skip
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <input
                          ref={inputRef}
                          type="text"
                          value={answer}
                          onChange={(e) =>
                            updateAnswerFromInput(e, {
                              trackKanaMistake: liveKanaHelpEnabled,
                            })
                          }
                          onCompositionEnd={(e) =>
                            commitAnswerComposition(e, {
                              trackKanaMistake: liveKanaHelpEnabled,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (answer.trim()) submit();
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              skipCurrent();
                            }
                          }}
                          placeholder={
                            reverseDrill ? 'Type dictionary form...' : 'Type romaji or kana...'
                          }
                          aria-label={
                            reverseDrill
                              ? 'Type the dictionary form'
                              : 'Type your answer in romaji or kana'
                          }
                          className={answerInputClassName}
                          lang="ja"
                          autoComplete="off"
                          autoCapitalize="none"
                          autoCorrect="off"
                          enterKeyHint="done"
                          spellCheck="false"
                        />
                        {!reverseDrill && (
                          <button
                            type="button"
                            onClick={revealNextKana}
                            disabled={coachRevealed >= expectedKanaCount || phase !== 'answering'}
                            aria-label="Reveal next kana"
                            title="Reveal next kana"
                            className="shrink-0 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-indigo-200 bg-white text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-40 dark:border-indigo-900 dark:bg-stone-900 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                          >
                            <IconSpark className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {liveKana && liveStatus && (
                        <div
                          role="status"
                          aria-live="polite"
                          className={`mt-2 min-h-5 text-center text-xs ${answerFeedbackClassName}`}
                        >
                          {liveStatus}
                        </div>
                      )}
                      <StickyAction className="mt-3">
                        <button
                          onClick={() => submit()}
                          disabled={!answer.trim()}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-lg transition disabled:opacity-40"
                        >
                          Check (Enter)
                        </button>
                      </StickyAction>
                      <div
                        className={`mt-2 grid gap-2 ${!reverseDrill ? 'grid-cols-3' : 'grid-cols-2'}`}
                      >
                        {!reverseDrill && (
                          <button
                            onClick={showStepHint}
                            className="py-2.5 border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-xl font-medium transition"
                          >
                            Hint
                          </button>
                        )}
                        <button
                          onClick={revealAnswer}
                          className="py-2.5 border border-amber-205 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-medium transition"
                        >
                          Reveal
                        </button>
                        <button
                          onClick={skipCurrent}
                          className="py-2.5 border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 hover:bg-stone-105 text-stone-600 dark:text-stone-300 rounded-xl font-medium transition"
                        >
                          Skip
                        </button>
                      </div>
                      {hintDisclosure}
                    </>
                  )}
                </>
              ) : (
                <div
                  className={`rounded-xl p-4 ${
                    wasCorrect
                      ? 'bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-200 dark:border-emerald-900/50'
                      : wasCorrected
                        ? 'bg-amber-50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/50'
                        : 'bg-rose-50 dark:bg-rose-950/10 border border-rose-200 dark:border-rose-900/50'
                  }`}
                >
                  {/* Scoped to the short verdict so screen readers announce the
                    result without re-reading the breakdown/chat below. */}
                  <span role="status" aria-live="polite" className="sr-only">
                    {wasCorrect ? 'Correct!' : wasCorrected ? 'Self-corrected.' : 'Not quite.'}
                  </span>
                  <div className="flex items-start gap-3 text-left">
                    <div
                      className={`mt-0.5 flex-shrink-0 ${wasCorrect ? 'text-emerald-600' : wasCorrected ? 'text-amber-600' : 'text-rose-600'}`}
                    >
                      {wasCorrect ? (
                        <IconCheck className="w-5 h-5" />
                      ) : (
                        <IconX className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3
                        className={`text-sm font-semibold ${wasCorrect ? 'text-emerald-800 dark:text-emerald-300' : wasCorrected ? 'text-amber-800 dark:text-amber-300' : 'text-rose-800 dark:text-rose-300'}`}
                      >
                        {wasCorrect
                          ? 'Correct!'
                          : wasCorrected
                            ? 'Self-corrected.'
                            : 'Review this form.'}
                      </h3>
                      {wasCorrected && (
                        <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                          You fixed it mid-type, but the mistake still counts.
                        </div>
                      )}
                      {wasCorrect ? (
                        /* Correct answer case */
                        <>
                          {reviewKanaCells.length > 0 && (
                            <div className="mt-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/50 p-2">
                              <div className="flex flex-wrap justify-center gap-1" lang="ja">
                                {reviewKanaCells.map((cell, i) => {
                                  const cls =
                                    cell.state === 'correct'
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-805 dark:text-emerald-300'
                                      : cell.state === 'wrong' || cell.state === 'extra'
                                        ? 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/30 dark:border-rose-805 dark:text-rose-300'
                                        : cell.state === 'hint'
                                          ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:border-amber-300 dark:text-amber-300'
                                          : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-300';
                                  return (
                                    <div
                                      key={i}
                                      className={`w-8 h-9 sm:w-9 sm:h-10 rounded-lg border flex items-center justify-center text-base font-medium tabular-nums ${cls}`}
                                    >
                                      {cell.shown || '·'}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        /* Incorrect answer case */
                        <>
                          {reviewKanaCells.length > 0 ? (
                            <>
                              {/* Correct Answer nice and clearly at the top */}
                              <div className="mt-3">
                                <div className="text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-455 font-semibold mb-1">
                                  Correct Answer
                                </div>
                                <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/10 p-2">
                                  <div className="flex flex-wrap justify-center gap-1.5" lang="ja">
                                    {Array.from(expected).map((char, i) => (
                                      <div
                                        key={i}
                                        className="w-9 h-10 sm:w-10 sm:h-11 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-850 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300 flex items-center justify-center text-lg font-semibold tabular-nums shadow-sm"
                                      >
                                        {char}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <ScriptDisplay
                                  view={expectedView}
                                  word={current.verb}
                                  type={practicedType}
                                  colorHighlight={practicePrefs.colorCodeConjugations !== false}
                                  className="text-xl mt-2 text-emerald-900 dark:text-emerald-100"
                                  subClassName="text-xs text-stone-500 mt-1"
                                />
                                <div className="text-xs mt-1 text-emerald-700 dark:text-emerald-400">
                                  {targetEnglish}
                                </div>
                              </div>

                              {/* Guessed answer below it */}
                              <div className="mt-3">
                                <div
                                  className={`text-[11px] uppercase tracking-wider ${wasCorrected ? 'text-amber-700/80 dark:text-amber-400/80' : 'text-rose-700/80 dark:text-rose-400/80'} mb-1`}
                                >
                                  {reviewChoiceLabel
                                    ? 'You chose'
                                    : revealedMiss
                                      ? "You chose: I don't know"
                                      : 'Your guess'}
                                  {!revealedMiss && !reviewChoiceLabel && (
                                    <span lang="ja" className="ml-1 font-medium">
                                      (
                                      {reverseDrill
                                        ? submittedAnswer.trim() || 'empty'
                                        : toHiragana(submittedAnswer) || 'empty'}
                                      )
                                    </span>
                                  )}
                                </div>
                                <div className="rounded-xl border border-stone-200/60 dark:border-stone-800/60 bg-stone-50/40 dark:bg-stone-900/20 p-2">
                                  <div className="flex flex-wrap justify-center gap-1" lang="ja">
                                    {reviewKanaCells.map((cell, i) => {
                                      const cls =
                                        cell.state === 'correct'
                                          ? 'bg-emerald-50/50 border-emerald-350/40 text-emerald-800/80 dark:bg-emerald-950/20 dark:border-emerald-800/30 dark:text-emerald-300/80'
                                          : cell.state === 'wrong' || cell.state === 'extra'
                                            ? 'bg-rose-50/50 border-rose-350/40 text-rose-800/80 dark:bg-rose-950/20 dark:border-rose-800/30 dark:text-rose-300/80'
                                            : cell.state === 'hint'
                                              ? 'bg-amber-50/50 border-amber-350/40 text-amber-800/80 dark:bg-amber-950/20 dark:border-amber-300/30 dark:text-amber-300/80'
                                              : 'bg-white/50 dark:bg-stone-900/50 border-stone-200/40 dark:border-stone-800/40 text-stone-300/85';
                                      return (
                                        <div
                                          key={i}
                                          className={`w-7 h-8 sm:w-8 sm:h-9 rounded-lg border flex items-center justify-center text-sm font-medium tabular-nums ${cls}`}
                                        >
                                          {cell.shown || '·'}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-rose-700 mt-1">
                              {reviewChoiceLabel
                                ? `You chose: ${reviewChoiceLabel}`
                                : revealedMiss
                                  ? "You chose: I don't know"
                                  : 'You wrote:'}{' '}
                              {!revealedMiss && !reviewChoiceLabel && (
                                <span lang="ja" className="font-semibold">
                                  {reverseDrill
                                    ? submittedAnswer.trim() || '(empty)'
                                    : toHiragana(submittedAnswer) || '(empty)'}
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      {wasCorrect && (
                        <>
                          <ScriptDisplay
                            view={expectedView}
                            word={current.verb}
                            type={practicedType}
                            colorHighlight={practicePrefs.colorCodeConjugations !== false}
                            className="text-xl mt-2 text-emerald-900 dark:text-emerald-100"
                            subClassName="text-xs text-stone-500 mt-1"
                          />
                          <div className="text-xs mt-1 text-emerald-700 dark:text-emerald-400">
                            {targetEnglish}
                          </div>
                        </>
                      )}
                      {wasCorrect && autoAdvanceCorrect && (
                        <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-100/80 px-3 py-2 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                          <span className="relative flex h-5 w-5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                            <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                              <IconCheck className="h-3 w-3" />
                            </span>
                          </span>
                          Next card coming up...
                        </div>
                      )}
                    </div>
                  </div>

                  {wasCorrect && reviewExplanation && (
                    <div className="mt-4 space-y-2.5 border-t border-emerald-200 pt-4 text-left dark:border-emerald-900/50">
                      <ReviewDisclosure tone="emerald" summary="Answer breakdown" alwaysOpen>
                        <ConjugationBreakdown
                          word={current.verb}
                          type={practicedType}
                          practicePrefs={practicePrefs}
                        />
                      </ReviewDisclosure>
                      {geminiKey && (
                        <ReviewChatSection
                          tone="emerald"
                          chatOpen={chatOpen}
                          onOpen={() => setChatOpen(true)}
                        >
                          {chatOpen && (
                            <ChatPanel
                              verb={current.verb}
                              type={practicedType}
                              userAnswer={expected}
                              expected={expected}
                              explanation={reviewExplanation}
                              geminiKey={geminiKey}
                              practicePrefs={practicePrefs}
                              taskOverride={taskOverride}
                              wasCorrect
                              reviewTone="emerald"
                            />
                          )}
                        </ReviewChatSection>
                      )}
                    </div>
                  )}

                  {!wasCorrect && explanation && (
                    <div className="mt-4 pt-4 border-t border-rose-200 dark:border-rose-900/50 space-y-2.5 text-left">
                      <div className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-400 font-medium">
                        Why it's{' '}
                        <span lang="ja" className="normal-case tracking-normal">
                          {expected}
                        </span>
                      </div>
                      {minimalPairFeedback && (
                        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2">
                          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                            Contrast check: {minimalPairFeedback.label}
                          </div>
                          {minimalPairFeedback.masuDiagnostic && (
                            <div className="mt-1 border-l-2 border-emerald-300 dark:border-emerald-700 pl-3 text-sm text-stone-700 dark:text-stone-300">
                              <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                Masu check
                              </div>
                              <div className="mt-0.5">
                                <span
                                  lang="ja"
                                  className="font-semibold text-stone-900 dark:text-stone-100"
                                >
                                  {minimalPairFeedback.masuDiagnostic.dict}
                                  {' -> '}
                                  {minimalPairFeedback.masuDiagnostic.politeSurface}
                                </span>
                                <span className="ml-2">
                                  {minimalPairFeedback.masuDiagnostic.contrast}
                                </span>
                              </div>
                            </div>
                          )}
                          {!minimalPairFeedback.masuDiagnostic && (
                            <div className="mt-1 text-sm text-stone-700 dark:text-stone-300">
                              {minimalPairFeedback.intro}
                            </div>
                          )}
                        </div>
                      )}
                      {diagnostic && (
                        <div className="text-sm text-rose-800 dark:text-rose-300 bg-white/70 dark:bg-stone-900/70 rounded-lg px-3 py-2">
                          <span className="font-medium text-rose-900 dark:text-rose-200">
                            Diagnosis:{' '}
                          </span>
                          {lastDiagnosis?.label ? `${lastDiagnosis.label}. ` : ''}
                          {diagnostic}
                        </div>
                      )}
                      {!minimalPairFeedback && (
                        <div className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                          {explanation.intro}
                        </div>
                      )}
                      {explanation.rule && (
                        <div className="rounded-lg bg-white/70 dark:bg-stone-900/70 px-3 py-2 text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                          <span className="font-semibold text-stone-900 dark:text-stone-100">
                            Rule:{' '}
                          </span>
                          {explanation.rule}
                        </div>
                      )}
                      {explanation.derivation && explanation.derivation !== expected && (
                        <div
                          className="text-base text-center bg-white/70 dark:bg-stone-900/70 rounded-lg px-3 py-2 text-stone-900 dark:text-stone-100"
                          lang="ja"
                        >
                          {explanation.derivation}
                        </div>
                      )}
                      {minimalPairFeedback && (
                        <ReviewDisclosure tone="emerald" summary="Full contrast details">
                          <div className="text-sm text-stone-700 dark:text-stone-300">
                            {minimalPairFeedback.intro}
                          </div>
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {minimalPairFeedback.contrasts.map((contrast) => (
                              <div
                                key={contrast.id}
                                className={`rounded-lg border px-2.5 py-2 text-xs ${
                                  contrast.id === minimalPairFeedback.active.id
                                    ? 'border-emerald-300 bg-white/80 text-emerald-900 dark:border-emerald-800 dark:bg-stone-950/50 dark:text-emerald-200'
                                    : 'border-stone-200 bg-white/60 text-stone-600 dark:border-stone-800 dark:bg-stone-950/40 dark:text-stone-300'
                                }`}
                              >
                                <div className="font-semibold">{contrast.label}</div>
                                <div className="mt-0.5">{contrast.cue}</div>
                              </div>
                            ))}
                          </div>
                        </ReviewDisclosure>
                      )}
                      <ReviewDisclosure tone="rose" summary="Answer breakdown" alwaysOpen>
                        <ConjugationBreakdown
                          word={current.verb}
                          type={practicedType}
                          userAnswer={revealedMiss ? '' : submittedAnswer}
                          practicePrefs={practicePrefs}
                        />
                      </ReviewDisclosure>
                      {geminiKey && (
                        <ReviewChatSection
                          tone="rose"
                          chatOpen={chatOpen}
                          onOpen={() => setChatOpen(true)}
                        >
                          {chatOpen && (
                            <ChatPanel
                              verb={current.verb}
                              type={practicedType}
                              userAnswer={revealedMiss ? '(revealed)' : submittedAnswer}
                              expected={expected}
                              explanation={explanation}
                              geminiKey={geminiKey}
                              practicePrefs={practicePrefs}
                              taskOverride={taskOverride}
                              wasCorrected={wasCorrected}
                            />
                          )}
                        </ReviewChatSection>
                      )}
                    </div>
                  )}

                  <ContextExamplePanel
                    item={current.verb}
                    type={practicedType}
                    geminiKey={geminiKey}
                    practicePrefs={practicePrefs}
                  />

                  {wasCorrect ? (
                    <StickyAction className="mt-3">
                      <button
                        ref={nextButtonRef}
                        onClick={() => submit()}
                        className="w-full rounded-xl bg-stone-800 py-2.5 font-medium text-white shadow-lg transition hover:bg-stone-900 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-150"
                      >
                        Next (Enter)
                      </button>
                    </StickyAction>
                  ) : (
                    <div className="mt-4">
                      <button
                        ref={nextButtonRef}
                        onClick={() => submit()}
                        className="w-full rounded-xl bg-stone-800 py-2.5 font-medium text-white shadow-sm transition hover:bg-stone-900 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-150"
                      >
                        Next (Enter)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="text-center text-xs text-stone-400">
          Tip: type romaji like <span className="font-mono text-stone-500">tabeta</span>, use kana{' '}
          <span lang="ja" className="text-stone-550 dark:text-stone-450">
            たべた
          </span>
          , or press Esc to skip without penalty.
        </div>
      </div>
    </div>
  );
}
