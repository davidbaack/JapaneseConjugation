import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  IconList,
  IconStar,
  IconCheck,
  IconVolume,
  IconSpark,
  IconRefresh,
} from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import { ConjugationBreakdown } from '../components/ConjugationBreakdown.jsx';
import { kanaToRomaji } from '../utils/romaji.js';
import { playPronunciation } from '../utils/speech.js';
import { isAdjective } from '../utils/conjugator.js';
import { GROUP_NAMES } from '../utils/conjugatorExplain.js';
import { normalizeReferenceState } from '../utils/storage.js';
import { formDisplay, promptDisplay } from '../utils/display.js';
import { callGemini, aiSystemFromPrefs, AI_COACH_SYSTEM } from '../utils/gemini.js';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { groupAliasText, groupDisplayLabel } from '../utils/groupDisplay.js';
import { ruMasuDiagnostic } from '../utils/ruVerbDiagnostics.js';

// Pure helpers now live in utils/referenceHelpers.js; re-export them so existing
// importers (CheckView, ListsViewSub, tests) keep working, and import the ones
// this component uses directly.
export * from '../utils/referenceHelpers.js';
import {
  FAVORITES_LIST_NAME,
  wordKeyLocal,
  searchWords,
  surfaceFormForLocal,
  formLookupCandidates,
  adHocReferenceCandidates,
  formRows,
  referenceRows,
  findFavoritesList,
  favoriteListHasWord,
  toggleFavoriteInLists,
  focusWordInLists,
  focusPracticePrefsForWord,
  referenceWithSearch,
  referenceWithHistory,
  referenceWithSelected,
  referenceRuleTarget,
  compareReferenceRuleTarget,
  referencePracticePrefsForTarget,
  referenceWithWeakRule,
  referenceHasWeakRule,
  weakReferencePracticeTarget,
} from '../utils/referenceHelpers.js';

export default function ReferenceViewSub({
  state,
  setState,
  verbs,
  adjectives,
  wordLists = [],
  setWordLists,
  geminiKey,
  practicePrefs = DEFAULT_PREFS,
  setPracticePrefs,
  setTab,
  practiceWord,
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [scratchIndex, setScratchIndex] = useState(0);
  const [copyTableOk, setCopyTableOk] = useState(false);
  const [lookupAiText, setLookupAiText] = useState('');
  const [lookupAiLoading, setLookupAiLoading] = useState(false);
  const [lookupAiErr, setLookupAiErr] = useState('');
  const [favoriteMsg, setFavoriteMsg] = useState('');
  const lookupAbortRef = useRef(null);
  const lookupAutoSelectKeyRef = useRef('');

  const words = useMemo(() => [...verbs, ...adjectives], [verbs, adjectives]);
  const reference = normalizeReferenceState(state.reference);
  const historyWords = reference.history.map(
    (h) => words.find((w) => wordKeyLocal(w) === wordKeyLocal(h)) || h,
  );
  const referenceSelectedWord = reference.selected
    ? words.find((w) => wordKeyLocal(w) === wordKeyLocal(reference.selected)) || null
    : null;
  const matches = useMemo(() => searchWords(query, words), [query, words]);
  const lookupMatches = useMemo(() => formLookupCandidates(query, words), [query, words]);
  const scratchCandidates = useMemo(() => adHocReferenceCandidates(query), [query]);
  const scratchCandidate =
    scratchCandidates[Math.min(scratchIndex, Math.max(0, scratchCandidates.length - 1))] || null;
  const scratchMatchesKnown = !!(
    scratchCandidate &&
    words.some(
      (w) =>
        w.group === scratchCandidate.group &&
        (w.dict === scratchCandidate.dict || w.reading === scratchCandidate.reading),
    )
  );
  const showScratch = !!(
    query.trim() &&
    scratchCandidate &&
    !scratchMatchesKnown &&
    !lookupMatches.length
  );
  const scratchRows = showScratch ? formRows(scratchCandidate) : [];
  const scratchMasuDiagnostic = showScratch ? ruMasuDiagnostic(scratchCandidate) : null;
  useEffect(() => {
    if (!selected || !words.some((w) => w.dict === selected.dict)) {
      setSelected(referenceSelectedWord || matches[0] || words[0] || null);
    }
  }, [matches, words, selected, referenceSelectedWord]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || !lookupMatches.length) {
      lookupAutoSelectKeyRef.current = '';
      return;
    }
    const topWord = lookupMatches[0]?.word || null;
    if (!topWord) return;
    const autoSelectKey = `${trimmedQuery}:${wordKeyLocal(topWord)}`;
    if (lookupAutoSelectKeyRef.current === autoSelectKey) return;
    lookupAutoSelectKeyRef.current = autoSelectKey;
    setSelected((current) =>
      current && wordKeyLocal(current) === wordKeyLocal(topWord) ? current : topWord,
    );
  }, [lookupMatches, query]);

  useEffect(() => {
    setLookupAiText('');
    setLookupAiErr('');
  }, [query]);

  useEffect(() => {
    setScratchIndex(0);
  }, [query]);

  const queryActive = !!query.trim();
  const selectedKey = selected ? wordKeyLocal(selected) : '';
  const selectedMatchesQuery =
    !queryActive ||
    matches.some((word) => wordKeyLocal(word) === selectedKey) ||
    lookupMatches.some((match) => wordKeyLocal(match.word) === selectedKey);
  const detailWord = selectedMatchesQuery ? selected : null;
  const rows = detailWord ? referenceRows(detailWord, state) : [];
  const selectedView = detailWord ? promptDisplay(detailWord, null, practicePrefs) : null;
  const selectedMasuDiagnostic = detailWord ? ruMasuDiagnostic(detailWord) : null;
  const masteredRows = rows.filter((r) => r.progress.status === 'mastered').length;
  const dueRows = rows.filter((r) => r.progress.status === 'due').length;
  const favoritesList = findFavoritesList(wordLists);
  const selectedFavorited = favoriteListHasWord(wordLists, detailWord);
  const favoriteCount = (favoritesList?.wordKeys || []).length;
  const weakRuleCount = reference.weakRules.length;

  useEffect(() => {
    setCopyTableOk(false);
  }, [selected?.dict, selected?.group]);

  useEffect(() => {
    setExpandedRow(null);
  }, [selected?.dict, selected?.group]);

  useEffect(() => {
    setFavoriteMsg('');
  }, [selected?.dict, selected?.group]);

  function updateReference(fn) {
    setState((prev) => ({ ...prev, reference: fn(prev.reference) }));
  }

  function rememberSearch(q = query) {
    updateReference((ref) => referenceWithSearch(ref, q));
  }

  function chooseReferenceWord(word, q = query) {
    setSelected(word);
    if (String(q || '').trim()) rememberSearch(q);
    updateReference((ref) => referenceWithSelected(referenceWithHistory(ref, word), word));
  }

  function clearReferenceMemory() {
    updateReference(() => normalizeReferenceState());
  }

  function isSelectedWord(word) {
    return !!(selected && word && selected.dict === word.dict && selected.group === word.group);
  }

  function toggleFavorite() {
    if (!selected || !setWordLists) return;
    const result = toggleFavoriteInLists(wordLists, selected);
    setWordLists(result.wordLists);
    setFavoriteMsg(
      result.favorited
        ? `Added to ${FAVORITES_LIST_NAME}.`
        : `Removed from ${FAVORITES_LIST_NAME}.`,
    );
  }

  function useFavoritesForDrill() {
    if (!setPracticePrefs) return;
    let list = findFavoritesList(wordLists);
    let nextLists = wordLists;
    if (!list && selected && setWordLists) {
      const result = toggleFavoriteInLists(wordLists, selected);
      nextLists = result.wordLists;
      list = findFavoritesList(nextLists);
      setWordLists(nextLists);
    }
    if (!list) return;
    const selectedIds = practicePrefs.wordListIds || [];
    setPracticePrefs({
      ...practicePrefs,
      wordListIds: selectedIds.includes(list.id) ? selectedIds : [...selectedIds, list.id],
    });
    setFavoriteMsg(`${list.name || FAVORITES_LIST_NAME} will be used in drills.`);
  }

  function drillSelectedWord() {
    if (!selected || !setWordLists || !setPracticePrefs) return;
    const result = focusWordInLists(wordLists, selected);
    setWordLists(result.wordLists);
    setPracticePrefs(focusPracticePrefsForWord(practicePrefs, selected));
    setFavoriteMsg(`Drilling only ${selected.dict}.`);
    if (practiceWord) {
      practiceWord(selected, null, {
        source: 'reference',
        launchMode: 'word',
        returnTo: 'reference',
        referenceLabel: 'Word focus',
      });
    } else if (setTab) {
      setTab('practice');
    }
  }

  function drillSelectedWordSweep() {
    if (!detailWord || !practiceWord) return;
    setFavoriteMsg(`Drilling enabled forms for ${detailWord.dict}.`);
    practiceWord(detailWord, null, {
      source: 'reference',
      launchMode: 'word-sweep',
      returnTo: 'reference',
      referenceLabel: 'Enabled forms',
    });
  }

  function applyReferencePracticeTarget(target, sourceWord = selected) {
    if (!target || !setPracticePrefs) return;
    const typeIds = target.typeIds?.length ? target.typeIds : [target.typeId].filter(Boolean);
    setPracticePrefs(referencePracticePrefsForTarget(practicePrefs, target));
    setState((prev) => {
      const remembered = sourceWord
        ? referenceWithSelected(referenceWithHistory(prev.reference, sourceWord), sourceWord)
        : normalizeReferenceState(prev.reference);
      return {
        ...prev,
        enabledTypes: typeIds.length ? typeIds : prev.enabledTypes,
        reference: remembered,
      };
    });
  }

  function drillReferenceRow(row) {
    if (!selected || !row) return;
    const target = referenceRuleTarget(selected, row.type);
    applyReferencePracticeTarget(target);
    setFavoriteMsg(`Drilling ${target?.label || row.type.label}.`);
    if (practiceWord) {
      practiceWord(selected, row.type.id, {
        source: 'reference',
        launchMode: 'drill',
        returnTo: 'reference',
        referenceLabel: target?.label || row.type.label,
      });
    } else if (setTab) {
      setTab('practice');
    }
  }

  function compareReferenceRow(row) {
    if (!selected || !row) return;
    const target = compareReferenceRuleTarget(selected, row.type);
    applyReferencePracticeTarget(target);
    setFavoriteMsg(`Comparing ${target?.typeIds?.length || 1} nearby forms.`);
    if (practiceWord) {
      practiceWord(selected, row.type.id, {
        source: 'reference',
        launchMode: 'compare',
        returnTo: 'reference',
        referenceLabel: target?.label || row.type.label,
      });
    } else if (setTab) {
      setTab('practice');
    }
  }

  function addReferenceWeakRule(row) {
    if (!selected || !row) return;
    const target = referenceRuleTarget(selected, row.type);
    setState((prev) => ({
      ...prev,
      reference: referenceWithWeakRule(
        referenceWithSelected(referenceWithHistory(prev.reference, selected), selected),
        target,
      ),
    }));
    setFavoriteMsg(`${target?.label || row.type.label} added to weak forms.`);
  }

  function drillWeakReferenceRules() {
    const target = weakReferencePracticeTarget(reference);
    if (!target) return;
    applyReferencePracticeTarget(target);
    setFavoriteMsg(`Drilling ${target.label}.`);
    const seedType = selected
      ? target.typeIds.find((id) =>
          isAdjective(selected) ? id.startsWith('adj-') : !id.startsWith('adj-'),
        )
      : null;
    if (practiceWord && selected && target.groups.includes(selected.group) && seedType) {
      practiceWord(selected, seedType, {
        source: 'reference',
        launchMode: 'weak',
        returnTo: 'reference',
        referenceLabel: target.label,
      });
    } else if (setTab) {
      setTab('practice');
    }
  }

  function renderReferenceRowActions(row, mobile = false) {
    const target = selected ? referenceRuleTarget(selected, row.type) : null;
    const added = referenceHasWeakRule(reference, target);
    const buttonBase = mobile
      ? 'flex-1 min-w-[7rem] px-3 py-2 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition'
      : 'h-8 w-8 rounded-lg border inline-flex items-center justify-center transition';
    const quiet =
      'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800';
    return (
      <div className={`flex ${mobile ? 'flex-wrap' : 'flex-nowrap'} gap-1.5`}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            drillReferenceRow(row);
          }}
          className={`${buttonBase} bg-stone-850 hover:bg-stone-900 dark:bg-stone-200 dark:hover:bg-stone-150 text-white dark:text-stone-900 border-stone-850 dark:border-stone-200`}
          title={`Drill ${row.type.label}`}
          aria-label={`Drill ${row.type.label}`}
        >
          <IconRefresh className="w-3.5 h-3.5" />
          <span className={mobile ? '' : 'sr-only'}>Drill</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            compareReferenceRow(row);
          }}
          className={`${buttonBase} ${quiet}`}
          title={`Compare ${row.type.label}`}
          aria-label={`Compare ${row.type.label}`}
        >
          <IconList className="w-3.5 h-3.5" />
          <span className={mobile ? '' : 'sr-only'}>Compare</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            addReferenceWeakRule(row);
          }}
          className={`${buttonBase} ${
            added
              ? 'bg-amber-50 border-amber-250 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-300'
              : quiet
          }`}
          title={`Add ${row.type.label} to weak forms`}
          aria-label={`Add ${row.type.label} to weak forms`}
        >
          <IconStar className="w-3.5 h-3.5" />
          <span className={mobile ? '' : 'sr-only'}>{added ? 'Added' : 'Weak'}</span>
        </button>
      </div>
    );
  }

  async function copyTable() {
    if (!selected || !rows.length) return;
    const header = ['Word', 'Reading', 'Meaning', 'Group', 'Form', 'Answer', 'Romaji', 'Rule'].join(
      '\t',
    );
    const body = rows.map((r) =>
      [
        selected.dict,
        selected.reading,
        selected.meaning,
        GROUP_NAMES[selected.group] || selected.group,
        r.type.label,
        r.answer,
        kanaToRomaji(r.answer),
        r.explanation.rule,
      ].join('\t'),
    );
    const text = [header, ...body].join('\n');
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        copied = document.execCommand('copy');
        document.body.removeChild(area);
      }
      if (copied) {
        setCopyTableOk(true);
        setTimeout(() => setCopyTableOk(false), 1800);
      }
    } catch {}
  }

  async function explainLookup() {
    if (!query.trim() || !geminiKey || !lookupMatches.length) return;
    if (lookupAiLoading) {
      lookupAbortRef.current?.abort();
      lookupAbortRef.current = null;
      setLookupAiLoading(false);
      return;
    }
    const controller = new AbortController();
    lookupAbortRef.current = controller;
    setLookupAiLoading(true);
    setLookupAiErr('');
    setLookupAiText('');
    try {
      const candidates = lookupMatches
        .slice(0, 6)
        .map(
          (m, i) =>
            `${i + 1}. ${m.surface} / ${m.answer} = ${m.word.dict} (${m.word.reading}), ${m.type.label}, ${GROUP_NAMES[m.word.group]}, ${m.word.meaning}, ${m.matchKind}`,
        )
        .join('\n');
      const prompt = `A Japanese learner searched this conjugated form or sentence fragment: "${query}".\n\nLocal reverse-conjugation candidates:\n${candidates}\n\nRank the likely intended candidate, explain the conjugation rule briefly, mention any ambiguity, and give one tiny practice prompt.`;
      const reply = await callGemini(
        [{ role: 'user', parts: [{ text: prompt }] }],
        geminiKey,
        900,
        0.25,
        aiSystemFromPrefs(practicePrefs, AI_COACH_SYSTEM),
      );
      if (!controller.signal.aborted) setLookupAiText(reply);
    } catch (e) {
      if (!controller.signal.aborted) setLookupAiErr(e.message || 'AI lookup failed.');
    }
    if (!controller.signal.aborted) setLookupAiLoading(false);
    lookupAbortRef.current = null;
  }

  function speakJapaneseLocal(text) {
    // Prefer a recorded clip with TTS fallback (improvement #18).
    playPronunciation(text, 0.9, practicePrefs.voiceURI);
  }

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-4 text-left">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 overflow-hidden flex flex-col">
        <div className="p-3 border-b border-stone-105 dark:border-stone-800">
          <div className="relative">
            <IconList className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) rememberSearch(query);
              }}
              placeholder="Search word or form"
              aria-label="Search for a word or conjugation form"
              className="w-full pl-9 pr-3 py-2 text-sm border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 rounded-lg focus:border-indigo-500 focus:outline-none transition"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>
          {!query.trim() && (reference.recentSearches.length || historyWords.length) ? (
            <div className="mt-3 border-t border-stone-100 dark:border-stone-800 pt-3 space-y-3">
              {reference.recentSearches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wider text-stone-500">
                    <span>Recent searches</span>
                    <button
                      onClick={clearReferenceMemory}
                      className="normal-case tracking-normal text-stone-400 hover:text-stone-700"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 font-sans">
                    {reference.recentSearches.map((s) => (
                      <button
                        key={s}
                        onClick={() => setQuery(s)}
                        className="px-2 py-1 rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-xs text-stone-600 dark:text-stone-300 truncate max-w-full"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {historyWords.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-stone-500 mb-2">
                    Lookup history
                  </div>
                  <div className="space-y-1.5">
                    {historyWords.slice(0, 6).map((w) => {
                      const wv = promptDisplay(w, null, practicePrefs);
                      return (
                        <button
                          key={w.dict + ':' + w.reading}
                          onClick={() => chooseReferenceWord(w, '')}
                          className={`w-full text-left px-2 py-2 rounded-lg border transition ${
                            isSelectedWord(w)
                              ? 'border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20'
                              : 'border-stone-100 dark:border-stone-850 hover:border-stone-200 dark:hover:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <ScriptDisplay
                                view={wv}
                                className="text-sm font-medium truncate text-stone-900 dark:text-stone-100"
                                subClassName="text-[11px] text-stone-450 truncate"
                              />
                              <div className="text-xs text-stone-500 truncate">{w.meaning}</div>
                            </div>
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 flex-shrink-0">
                              x{w.count || 1}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {query.trim() && (
            <div className="mt-3 border-t border-stone-105 dark:border-stone-800 pt-3">
              <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wider text-stone-500">
                <span>Reverse lookup</span>
                <span>
                  {lookupMatches.length
                    ? `${lookupMatches.length} hit${lookupMatches.length === 1 ? '' : 's'}`
                    : 'no exact hit'}
                </span>
              </div>
              {lookupMatches.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {lookupMatches.slice(0, 5).map((m) => {
                    const av =
                      m.matchKind === 'variant'
                        ? {
                            main: m.surface || m.answer,
                            sub: m.surface && m.surface !== m.answer ? m.answer : '',
                            lang: 'ja',
                          }
                        : formDisplay(m.answer, practicePrefs, m.word, m.type.id);
                    const bv = promptDisplay(m.word, null, practicePrefs);
                    return (
                      <button
                        key={`${wordKeyLocal(m.word)}-${m.type.id}-${m.matchKind}`}
                        onClick={() => chooseReferenceWord(m.word)}
                        className={`w-full text-left px-2 py-2 rounded-lg border transition ${
                          isSelectedWord(m.word)
                            ? 'border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20'
                            : 'border-stone-100 dark:border-stone-850 hover:border-stone-200 dark:hover:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <ScriptDisplay
                              view={av}
                              className="text-sm font-medium text-stone-900 dark:text-stone-50"
                              subClassName="text-[11px] text-stone-450"
                            />
                            <div className="text-[11px] text-stone-500 mt-0.5">{m.type.label}</div>
                          </div>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${m.matchKind === 'exact' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                          >
                            {m.matchKind}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-stone-500 truncate">
                          <span
                            className="font-semibold text-stone-850 dark:text-stone-205"
                            lang={bv.lang}
                          >
                            {bv.main}
                          </span>
                          {bv.sub && <span className="text-stone-400"> ({bv.sub})</span>} ·{' '}
                          {m.word.meaning}
                        </div>
                        <div className="mt-1 text-[11px] text-stone-400 leading-tight">
                          {m.variantNote || m.explanation.rule}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 text-xs text-stone-400">
                  No local form match yet. Try a dictionary form or romaji.
                </div>
              )}
              <button
                onClick={explainLookup}
                disabled={!geminiKey || !lookupMatches.length}
                className="mt-2 w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm inline-flex items-center justify-center gap-1.5 transition"
              >
                <IconSpark className="w-4 h-4" />
                {lookupAiLoading ? 'Cancel' : 'AI disambiguate'}
              </button>
              {!geminiKey && (
                <div className="mt-1 text-[11px] text-stone-400 text-center">
                  Gemini is not configured for contextual ranking.
                </div>
              )}
              {lookupAiErr && <div className="mt-2 text-xs text-rose-600">{lookupAiErr}</div>}
              {lookupAiText && (
                <div className="mt-2 text-xs leading-relaxed whitespace-pre-wrap text-stone-700 dark:text-stone-300 max-h-72 overflow-y-auto">
                  {lookupAiText}
                </div>
              )}
              {showScratch && (
                <div className="mt-3 rounded-xl border border-indigo-150 bg-indigo-50/60 dark:bg-indigo-950/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-wider text-indigo-750 font-medium">
                      Scratch conjugator
                    </div>
                    <span className="text-xs rounded-full bg-white dark:bg-stone-800 px-2 py-0.5 text-indigo-700 dark:text-indigo-300">
                      {groupDisplayLabel(scratchCandidate.group)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                    Local table for{' '}
                    <span className="font-semibold text-stone-800 dark:text-stone-200" lang="ja">
                      {scratchCandidate.dict}
                    </span>
                    . {scratchCandidate.sourceNote}
                  </div>
                  {scratchMasuDiagnostic && (
                    <div className="mt-2 border-l-2 border-indigo-300 dark:border-indigo-700 pl-3 text-xs text-stone-600 dark:text-stone-350">
                      <span className="font-semibold text-indigo-750 dark:text-indigo-300">
                        Masu check:{' '}
                      </span>
                      <span lang="ja" className="font-semibold text-stone-800 dark:text-stone-100">
                        {scratchMasuDiagnostic.dict}
                        {' -> '}
                        {scratchMasuDiagnostic.politeSurface}
                      </span>
                      <span className="ml-1">{scratchMasuDiagnostic.contrast}</span>
                    </div>
                  )}
                  {scratchCandidates.length > 1 && (
                    <div className="mt-2 flex gap-1.5">
                      {scratchCandidates.map((c, i) => (
                        <button
                          key={c.group}
                          onClick={() => setScratchIndex(i)}
                          className={`px-2 py-1 rounded-lg border text-[11px] transition ${
                            scratchCandidate.group === c.group
                              ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:text-white dark:border-indigo-600'
                              : 'bg-white border-indigo-100 text-stone-600 dark:bg-stone-900 dark:border-stone-800 dark:text-stone-400'
                          }`}
                        >
                          {groupDisplayLabel(c.group)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto max-h-[560px] divide-y divide-stone-50 dark:divide-stone-850">
          {matches.map((w) => {
            const wv = promptDisplay(w, null, practicePrefs);
            return (
              <button
                key={`${w.group}:${w.dict}`}
                onClick={() => chooseReferenceWord(w)}
                className={`w-full text-left px-4 py-3 transition ${
                  isSelectedWord(w)
                    ? 'bg-indigo-50 dark:bg-indigo-950/20'
                    : 'hover:bg-stone-50 dark:hover:bg-stone-800/40'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium text-stone-850 dark:text-stone-150">
                    <ScriptDisplay view={wv} className="" subClassName="text-xs text-stone-500" />
                  </div>
                  <span className="text-[11px] text-stone-400 inline-flex items-center gap-1 font-semibold">
                    {favoriteListHasWord(wordLists, w) && (
                      <IconStar className="w-3 h-3 text-amber-500" />
                    )}
                    {isAdjective(w) ? 'adj' : 'verb'}
                  </span>
                </div>
                <div className="text-xs text-stone-450 truncate">{w.meaning}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-4">
        {showScratch && (
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-indigo-200 dark:border-indigo-900 overflow-hidden">
            <div className="p-4 border-b border-indigo-100 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/20">
              <div className="flex items-start justify-between gap-3 text-left">
                <div>
                  <div className="text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-400 font-semibold">
                    Scratch conjugator
                  </div>
                  <div
                    className="mt-1 text-3xl font-medium text-stone-900 dark:text-stone-50"
                    lang="ja"
                  >
                    {scratchCandidate.dict}
                  </div>
                  <div className="text-sm text-stone-500 mt-1">
                    {groupDisplayLabel(scratchCandidate.group)} · {scratchCandidate.sourceNote}
                  </div>
                </div>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 dark:bg-stone-950 text-stone-500 dark:text-stone-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Form</th>
                    <th className="px-4 py-2 text-left font-medium">Answer</th>
                    <th className="px-4 py-2 text-left font-medium hidden md:table-cell">Rule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-850">
                  {scratchRows.map((r) => {
                    const answer = surfaceFormForLocal(scratchCandidate, r.type.id) || r.answer;
                    const rv = formDisplay(answer, practicePrefs, scratchCandidate, r.type.id);
                    return (
                      <tr
                        key={r.type.id}
                        className="border-t border-stone-100 dark:border-stone-850"
                      >
                        <td className="px-4 py-2 text-left">
                          <div className="font-semibold text-stone-800 dark:text-stone-200">
                            {r.type.label}
                          </div>
                          <div className="text-xs text-stone-400">{r.type.hint}</div>
                        </td>
                        <td className="px-4 py-2 text-left">
                          <ScriptDisplay
                            view={rv}
                            word={scratchCandidate}
                            type={r.type.id}
                            colorHighlight={practicePrefs.colorCodeConjugations !== false}
                            className="text-lg text-stone-900 dark:text-stone-100"
                            subClassName="text-xs text-stone-450"
                          />
                        </td>
                        <td className="px-4 py-2 text-xs text-stone-500 hidden md:table-cell text-left">
                          {r.explanation.rule}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {detailWord && (
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5 text-left">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-stone-105 dark:border-stone-800 pb-4">
              <div className="min-w-0">
                <ScriptDisplay
                  view={selectedView}
                  className="text-4xl font-semibold text-stone-950 dark:text-stone-50"
                  subClassName="text-stone-500 mt-1"
                />
                <div className="text-sm text-stone-605 italic mt-2">{detailWord.meaning}</div>
                <div className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  {groupDisplayLabel(detailWord.group)}
                </div>
                {groupAliasText(detailWord.group) && (
                  <div className="text-[11px] text-stone-400 mt-0.5">
                    {groupAliasText(detailWord.group)}
                  </div>
                )}
                {selectedMasuDiagnostic && (
                  <div className="mt-3 border-l-2 border-indigo-300 dark:border-indigo-700 pl-3 text-xs leading-relaxed text-stone-600 dark:text-stone-350">
                    <div className="font-semibold uppercase tracking-wide text-indigo-650 dark:text-indigo-300">
                      Masu check
                    </div>
                    <div className="mt-0.5">
                      <span lang="ja" className="font-semibold text-stone-900 dark:text-stone-100">
                        {selectedMasuDiagnostic.dict}
                        {' -> '}
                        {selectedMasuDiagnostic.politeSurface}
                      </span>
                      <span className="ml-2">{selectedMasuDiagnostic.clue}</span>
                    </div>
                    <div className="mt-0.5 text-stone-500 dark:text-stone-400">
                      {selectedMasuDiagnostic.contrast}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <button
                  onClick={drillSelectedWord}
                  disabled={!detailWord || !setWordLists || !setPracticePrefs}
                  className="px-3 py-2 bg-stone-850 hover:bg-stone-900 dark:bg-stone-200 dark:hover:bg-stone-150 disabled:opacity-40 text-white dark:text-stone-900 rounded-lg text-sm inline-flex items-center gap-1.5 transition"
                >
                  <IconRefresh className="w-4 h-4" />
                  Drill word
                </button>
                <button
                  onClick={drillSelectedWordSweep}
                  disabled={!detailWord || !practiceWord}
                  className="px-3 py-2 border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 disabled:opacity-40 dark:border-indigo-900/60 dark:bg-indigo-950/25 dark:text-indigo-300 dark:hover:bg-indigo-950/40 rounded-lg text-sm inline-flex items-center gap-1.5 transition"
                >
                  <IconList className="w-4 h-4" />
                  Drill enabled forms
                </button>
                <button
                  onClick={toggleFavorite}
                  className={`px-3 py-2 border rounded-lg text-sm inline-flex items-center gap-1.5 transition ${
                    selectedFavorited
                      ? 'bg-amber-50 border-amber-250 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900'
                      : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 text-stone-600 dark:text-stone-300'
                  }`}
                >
                  <IconStar className="w-4 h-4" />
                  {selectedFavorited ? 'Favorited' : 'Favorite'}
                </button>
                <button
                  onClick={useFavoritesForDrill}
                  disabled={!favoriteCount && !detailWord}
                  className="px-3 py-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 disabled:opacity-40 rounded-lg text-stone-600 dark:text-stone-300 text-sm inline-flex items-center gap-1.5 transition"
                >
                  <IconList className="w-4 h-4" />
                  Drill favorites
                </button>
                <button
                  onClick={drillWeakReferenceRules}
                  disabled={!weakRuleCount || !setPracticePrefs}
                  className="px-3 py-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 disabled:opacity-40 rounded-lg text-stone-600 dark:text-stone-300 text-sm inline-flex items-center gap-1.5 transition"
                >
                  <IconStar className="w-4 h-4" />
                  Drill weak forms
                </button>
                <button
                  onClick={copyTable}
                  className="px-3 py-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-stone-600 dark:text-stone-300 text-sm inline-flex items-center gap-1.5 transition"
                >
                  <IconList className="w-4 h-4" />
                  {copyTableOk ? 'Copied' : 'Copy table'}
                </button>
                <button
                  onClick={() => speakJapaneseLocal(detailWord.reading)}
                  className="p-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-stone-500"
                  title="Speak"
                >
                  <IconVolume className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-550">
              <span
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${selectedFavorited ? 'bg-amber-50 text-amber-700' : 'bg-stone-50 text-stone-500'}`}
              >
                <IconStar className="w-3.5 h-3.5" />
                {favoriteCount} favorite{favoriteCount === 1 ? '' : 's'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 bg-emerald-50 text-emerald-700">
                <IconCheck className="w-3.5 h-3.5" />
                {masteredRows}/{rows.length} forms mastered
              </span>
              {!!weakRuleCount && (
                <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 bg-amber-50 text-amber-750">
                  <IconStar className="w-3.5 h-3.5" />
                  {weakRuleCount} weak form{weakRuleCount === 1 ? '' : 's'}
                </span>
              )}
              {!!dueRows && (
                <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 bg-amber-50 text-amber-750">
                  {dueRows} due
                </span>
              )}
              {favoriteMsg && (
                <span className="text-emerald-650 dark:text-emerald-450">{favoriteMsg}</span>
              )}
            </div>
          </div>
        )}

        {detailWord && (
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 dark:bg-stone-950 text-stone-500 dark:text-stone-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Form</th>
                  <th className="px-4 py-2 text-left font-medium">Answer</th>
                  <th className="px-4 py-2 text-left font-medium">Progress</th>
                  <th className="px-4 py-2 text-left font-medium hidden md:table-cell">Rule</th>
                  <th className="px-4 py-2 text-left font-medium hidden sm:table-cell">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-850">
                {rows.map((r) => {
                  const rv = formDisplay(r.answer, practicePrefs, detailWord, r.type.id);
                  const expanded = expandedRow === r.type.id;
                  return (
                    <React.Fragment key={r.type.id}>
                      <tr
                        onClick={() => setExpandedRow(expanded ? null : r.type.id)}
                        className={`border-t border-stone-100 dark:border-stone-850 cursor-pointer transition ${expanded ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : 'hover:bg-stone-50 dark:hover:bg-stone-800/40'}`}
                      >
                        <td className="px-4 py-2 text-left">
                          <div className="font-semibold text-stone-850 dark:text-stone-200">
                            {r.type.label}
                          </div>
                          <div className="text-xs text-stone-400">{r.type.hint}</div>
                        </td>
                        <td className="px-4 py-2 text-left">
                          <div className="flex items-center gap-2">
                            <ScriptDisplay
                              view={rv}
                              word={detailWord}
                              type={r.type.id}
                              colorHighlight={practicePrefs.colorCodeConjugations !== false}
                              className="text-lg text-stone-900 dark:text-stone-100"
                              subClassName="text-xs text-stone-450"
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                speakJapaneseLocal(r.answer);
                              }}
                              className="p-1.5 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg text-stone-500 flex-shrink-0"
                              title={`Speak ${r.type.label}`}
                            >
                              <IconVolume className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-left">
                          <div
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold ${r.progress.tone}`}
                          >
                            {r.progress.status === 'mastered' ? (
                              <IconCheck className="w-3.5 h-3.5" />
                            ) : (
                              <span
                                className={`w-2 h-2 rounded-full ${r.progress.levelInfo.dot}`}
                              />
                            )}
                            <span>{r.progress.label}</span>
                          </div>
                          <div className="mt-1 text-[11px] text-stone-400 hidden sm:block">
                            {r.progress.detail}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-xs text-stone-550 hidden md:table-cell text-left">
                          {r.explanation.rule}
                        </td>
                        <td className="px-4 py-2 hidden sm:table-cell">
                          {renderReferenceRowActions(r)}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-stone-50/50 dark:bg-stone-950/20">
                          <td
                            colSpan="5"
                            className="px-5 py-4 border-t border-stone-100 dark:border-stone-800 space-y-2.5"
                          >
                            <div className="sm:hidden">{renderReferenceRowActions(r, true)}</div>
                            <ConjugationBreakdown
                              word={detailWord}
                              type={r.type.id}
                              geminiKey={geminiKey}
                              practicePrefs={practicePrefs}
                              onOpenLearn={
                                setTab
                                  ? () => {
                                      window.location.hash = 'formation-keys';
                                      setTab('learn');
                                    }
                                  : undefined
                              }
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
