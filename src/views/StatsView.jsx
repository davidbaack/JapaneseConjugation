import React, { useState, useMemo, useRef } from 'react';
import { IconSpark, IconFlame } from '../components/Icons.jsx';
import { ALL_CARD_TYPES, TYPE_LABEL } from '../data/conjugationTypes.js';
import { RULES, wordKey } from '../utils/conjugator.js';
import { defaultState, typeIdFromCardId, wordKeyFromCardId } from '../utils/storage.js';
import {
  FAST_RESPONSE_MS,
  READINESS_DIMENSIONS,
  buildConjugationSpeedRows,
  buildReadinessMap,
  launchPrefsForReadinessDimension,
} from '../utils/readiness.js';
import {
  aggregateDiagnosedMistakes,
  buildRepairDrillPlan,
  repairPrefsForPlan,
  upsertRepairWordList,
} from '../utils/mistakeDiagnosis.js';
import { callGemini, aiSystemFromPrefs, AI_COACH_SYSTEM } from '../utils/gemini.js';
import {
  MINIMAL_PAIR_SETS,
  clearMinimalPairPrefs,
  getMinimalPairSet,
  minimalPairEligibleWords,
  minimalPairReturnEnabledTypes,
  minimalPairStatsSummary,
  practicePrefsForMinimalPairSet,
  recommendMinimalPairSets,
} from '../utils/minimalPairs.js';
import { useApp } from '../state/AppStateContext.jsx';

function srsForecastFor(state) {
  const now = Date.now();
  const HOUR = 3600000;
  const DAY = 86400000;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const endOfTodayMs = endOfToday.getTime();
  const endOfTomorrow = endOfTodayMs + DAY;

  const future = Object.values(state?.cards || {})
    .filter((c) => c && c.nextReview > now)
    .map((c) => c.nextReview)
    .sort((a, b) => a - b);

  return {
    in1h: future.filter((t) => t <= now + HOUR).length,
    in4h: future.filter((t) => t > now + HOUR && t <= now + 4 * HOUR).length,
    today: future.filter((t) => t > now + 4 * HOUR && t <= endOfTodayMs).length,
    tomorrow: future.filter((t) => t > endOfTodayMs && t <= endOfTomorrow).length,
    week: future.filter((t) => t > endOfTomorrow && t <= now + 7 * DAY).length,
  };
}

function srsStatsFor(state) {
  const now = Date.now();
  let totalReviews = 0,
    totalCorrect = 0,
    due = 0,
    learning = 0,
    mastered = 0,
    fresh = 0,
    total = 0;
  const leeches = [];
  for (const [id, c] of Object.entries(state.cards || {})) {
    const typeId = typeIdFromCardId(id);
    if (typeId === 'dictionary') continue;
    total++;
    if (!c) {
      fresh++;
      continue;
    }
    totalReviews += c.correct + c.incorrect;
    totalCorrect += c.correct;
    if (c.nextReview <= now) due++;
    if (c.interval >= 30) mastered++;
    else learning++;
    if (c.incorrect >= 3 && c.incorrect > c.correct * 0.5) {
      leeches.push({ id, typeId, card: c });
    }
  }
  leeches.sort((a, b) => b.card.incorrect - a.card.incorrect);
  return {
    totalReviews,
    totalCorrect,
    acc: totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0,
    due,
    learning,
    mastered,
    fresh,
    leeches: leeches.slice(0, 10),
    total,
  };
}

function pct(correct, attempted) {
  return attempted ? Math.round((correct / attempted) * 100) : 0;
}

function responseTimeLabel(ms) {
  const value = Number(ms) || 0;
  if (!value) return '0s';
  const seconds = value / 1000;
  return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`;
}

function speedToneFor(avgMs) {
  if (avgMs <= FAST_RESPONSE_MS) {
    return {
      label: 'quick',
      text: 'text-emerald-700 dark:text-emerald-300',
      bar: 'bg-emerald-500',
    };
  }
  if (avgMs <= FAST_RESPONSE_MS * 2) {
    return {
      label: 'steady',
      text: 'text-amber-700 dark:text-amber-300',
      bar: 'bg-amber-500',
    };
  }
  return {
    label: 'slow',
    text: 'text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-500',
  };
}

function formAccuracyRows(state) {
  const enabled =
    state.enabledTypes && state.enabledTypes.length
      ? state.enabledTypes
      : ALL_CARD_TYPES.map((t) => t.id);
  const cards = state.cards || {};
  const now = Date.now();
  return ALL_CARD_TYPES.filter((t) => enabled.includes(t.id))
    .map((t) => {
      let correct = 0,
        incorrect = 0,
        due = 0,
        fresh = 0;
      let cardCount = 0;
      for (const [cardId, card] of Object.entries(cards)) {
        if (typeIdFromCardId(cardId) !== t.id) continue;
        cardCount++;
        correct += card.correct || 0;
        incorrect += card.incorrect || 0;
        if (card.nextReview <= now) due++;
      }
      const attempted = correct + incorrect;
      return {
        type: t,
        cards: cardCount,
        correct,
        incorrect,
        attempted,
        accuracy: pct(correct, attempted),
        due,
        fresh,
      };
    })
    .filter((row) => row.cards > 0)
    .sort((a, b) => {
      const aUntried = a.attempted ? 0 : 1;
      const bUntried = b.attempted ? 0 : 1;
      if (aUntried !== bUntried) return aUntried - bUntried;
      if (a.attempted && b.attempted && a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      if (a.incorrect !== b.incorrect) return b.incorrect - a.incorrect;
      return a.type.label.localeCompare(b.type.label);
    });
}

function wordAccuracyRows(state) {
  const rows = new Map();
  for (const [cardId, card] of Object.entries(state.cards || {})) {
    const word = wordKeyFromCardId(cardId);
    if (!word) continue;
    const row = rows.get(word) || { word, correct: 0, incorrect: 0, due: 0, cards: 0 };
    row.correct += card.correct || 0;
    row.incorrect += card.incorrect || 0;
    row.due += card.nextReview <= Date.now() ? 1 : 0;
    row.cards += 1;
    rows.set(word, row);
  }
  return [...rows.values()]
    .map((row) => ({
      ...row,
      attempted: row.correct + row.incorrect,
      accuracy: pct(row.correct, row.correct + row.incorrect),
    }))
    .sort((a, b) => {
      if (a.attempted && b.attempted && a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      if (a.incorrect !== b.incorrect) return b.incorrect - a.incorrect;
      return a.word.localeCompare(b.word);
    });
}

function weakCardRows(state) {
  const now = Date.now();
  return Object.entries(state.cards || {})
    .map(([cardId, card]) => ({
      cardId,
      word: wordKeyFromCardId(cardId),
      typeId: typeIdFromCardId(cardId),
      correct: card.correct || 0,
      incorrect: card.incorrect || 0,
      due: card.nextReview <= now,
    }))
    .filter((row) => row.correct + row.incorrect > 0)
    .sort((a, b) => b.incorrect - a.incorrect || Number(b.due) - Number(a.due))
    .slice(0, 12);
}

function skillRadarScores(state) {
  const srs = srsStatsFor(state);
  const meaning = state.meaning || defaultState().meaning;
  const classify = state.classify || defaultState().classify;
  const mock = state.mock || defaultState().mock;
  const daily = state.daily || defaultState().daily;
  const retention = srs.total ? Math.round((srs.mastered / srs.total) * 100) : 0;
  const consistency = Math.min(
    100,
    Math.round(
      (daily.goalStreak || 0) * 12 + (daily.currentAnswerStreak || 0) * 3 + (daily.count || 0),
    ),
  );
  const mockReadiness = mock.lastTotal ? pct(mock.lastScore || 0, mock.lastTotal || 0) : 0;
  return [
    {
      id: 'conjugation',
      label: 'Conjugation',
      score: srs.totalReviews ? srs.acc : 0,
      detail: `${srs.totalCorrect}/${srs.totalReviews || 0} reviews`,
    },
    {
      id: 'retention',
      label: 'Retention',
      score: retention,
      detail: `${srs.mastered}/${srs.total || 0} cards mastered`,
    },
    {
      id: 'vocabulary',
      label: 'Meaning',
      score: pct(meaning.correct || 0, meaning.attempted || 0),
      detail: `${meaning.correct || 0}/${meaning.attempted || 0} meaning checks`,
    },
    {
      id: 'classification',
      label: 'Classification',
      score: pct(classify.correct || 0, classify.attempted || 0),
      detail: `${classify.correct || 0}/${classify.attempted || 0} group checks`,
    },
    {
      id: 'mock',
      label: 'Mock readiness',
      score: mockReadiness,
      detail: mock.lastTotal ? `${mock.lastScore || 0}/${mock.lastTotal} last mock` : 'No mock yet',
    },
    {
      id: 'consistency',
      label: 'Consistency',
      score: consistency,
      detail: `${daily.count || 0} today · ${daily.goalStreak || 0} day streak`,
    },
  ];
}

function readinessListId(ruleId) {
  return `list-readiness-${Array.from(ruleId)
    .map((char) => char.charCodeAt(0).toString(36))
    .join('-')}`;
}

export default function StatsView() {
  const {
    state,
    setState,
    allWords: verbs,
    activeGeminiKey: geminiKey,
    practicePrefs,
    setPracticePrefs,
    setTab,
    wordLists,
    setWordLists,
  } = useApp();
  const stats = useMemo(() => srsStatsFor(state), [state]);
  const srsForecast = useMemo(() => srsForecastFor(state), [state]);
  const radar = useMemo(() => skillRadarScores(state), [state]);
  const formRowsData = useMemo(() => formAccuracyRows(state), [state]);
  const wordRowsData = useMemo(() => wordAccuracyRows(state), [state]);
  const weakCardsData = useMemo(() => weakCardRows(state), [state]);
  const readinessRows = useMemo(() => buildReadinessMap(state, verbs), [state, verbs]);
  const speedRows = useMemo(() => buildConjugationSpeedRows(state, verbs), [state, verbs]);
  const fastestSpeedRow = speedRows.length
    ? speedRows.reduce((best, row) => (row.avgMs < best.avgMs ? row : best), speedRows[0])
    : null;
  const slowestSpeedRow = speedRows[0] || null;
  const readinessVisibleRows = readinessRows;
  const readinessCounts = useMemo(() => {
    const counts = { weak: 0, developing: 0, strong: 0, untested: 0 };
    for (const row of readinessRows) {
      for (const cell of Object.values(row.cells)) counts[cell.status]++;
    }
    return counts;
  }, [readinessRows]);
  const mistakePatterns = useMemo(
    () => aggregateDiagnosedMistakes(state.mistakes),
    [state.mistakes],
  );
  const minimalPairRecommendations = useMemo(
    () => recommendMinimalPairSets(state, verbs, 2),
    [state, verbs],
  );
  const recommendedMinimalPairIds = useMemo(
    () => new Set(minimalPairRecommendations.map((result) => result.set.id)),
    [minimalPairRecommendations],
  );
  const [showAllPatterns, setShowAllPatterns] = useState(false);
  const visiblePatterns = showAllPatterns ? mistakePatterns : mistakePatterns.slice(0, 6);
  const weakestForms = formRowsData.filter((row) => row.attempted > 0).slice(0, 8);
  const weakest = radar.slice().sort((a, b) => a.score - b.score)[0];
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const aiAbortRef = useRef(null);

  function drillWeaknesses() {
    const weakRows = formRowsData.filter((row) => row.attempted > 0);
    if (weakRows.length === 0) return;
    const weakestTypeIds = weakRows.slice(0, 8).map((row) => row.type.id);
    const wordIncorrectMap = new Map();
    for (const word of verbs) {
      const key = `${word.group}:${word.dict}`;
      let totalIncorrect = 0;
      const vs = (state.verbStats || {})[word.dict];
      if (vs) {
        for (const ruleData of Object.values(vs)) {
          totalIncorrect += ruleData.incorrect || 0;
        }
      }
      const mistakesCount = (state.mistakes || [])
        .filter((m) => !m.resolved && m.dict === word.dict && m.group === word.group)
        .reduce((sum, m) => sum + (m.count || 1), 0);
      totalIncorrect += mistakesCount * 2;
      if (totalIncorrect > 0) {
        wordIncorrectMap.set(key, totalIncorrect);
      }
    }

    const sortedWeakWordKeys = [...wordIncorrectMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key);

    let nextPrefs = { ...practicePrefs, minimalPairSetId: '', minimalPairReturn: null };

    if (sortedWeakWordKeys.length > 0) {
      const listName = 'Targeted Weaknesses';
      let targetList = (wordLists || []).find((l) => l.name === listName);
      if (!targetList) {
        targetList = {
          id: 'list-weakness-' + Date.now().toString(36),
          name: listName,
          wordKeys: [],
        };
      }
      targetList.wordKeys = sortedWeakWordKeys.slice(0, 20);
      const nextWordLists = (wordLists || []).some((l) => l.id === targetList.id)
        ? wordLists.map((l) => (l.id === targetList.id ? targetList : l))
        : [...(wordLists || []), targetList];
      if (setWordLists) setWordLists(nextWordLists);
      nextPrefs.wordListIds = [targetList.id];
    } else {
      nextPrefs.wordListIds = [];
    }

    if (setState) {
      setState((prev) => ({ ...prev, enabledTypes: weakestTypeIds }));
    }
    if (setPracticePrefs) {
      setPracticePrefs(nextPrefs);
    }
    if (setTab) {
      setTab('study');
    }
  }

  function drillReadinessCell(row, dimensionId) {
    const rule = RULES.find((r) => r.id === row.ruleId);
    if (!rule) return;
    const targetKeys = rule.verbFilter(verbs).map(wordKey);
    if (!targetKeys.length) return;
    const listName = `Readiness: ${row.skill}`;
    const existingList = (wordLists || []).find((l) => l.name === listName);
    const targetList = {
      ...(existingList || {
        id: readinessListId(row.ruleId),
        name: listName,
      }),
      wordKeys: targetKeys.slice(0, 80),
    };
    const nextWordLists = (wordLists || []).some((l) => l.id === targetList.id)
      ? wordLists.map((l) => (l.id === targetList.id ? targetList : l))
      : [...(wordLists || []), targetList];
    if (setWordLists) setWordLists(nextWordLists);
    if (setState) setState((prev) => ({ ...prev, enabledTypes: [row.typeId] }));
    if (setPracticePrefs) {
      setPracticePrefs({
        ...practicePrefs,
        ...launchPrefsForReadinessDimension(dimensionId, practicePrefs),
        wordListIds: [targetList.id],
        minimalPairSetId: '',
        minimalPairReturn: null,
      });
    }
    if (setTab) setTab('study');
  }

  function launchRepairDrill(pattern) {
    const plan = buildRepairDrillPlan(pattern, verbs);
    if (setWordLists && plan.wordKeys.length) {
      setWordLists(upsertRepairWordList(wordLists, plan));
    }
    if (setState && plan.typeIds.length) {
      setState((prev) => ({ ...prev, enabledTypes: plan.typeIds }));
    }
    if (setPracticePrefs) {
      setPracticePrefs({
        ...repairPrefsForPlan(practicePrefs, plan),
        minimalPairSetId: '',
        minimalPairReturn: null,
      });
    }
    if (setTab) {
      setTab('study');
    }
  }

  function launchDrill(setId) {
    const set = getMinimalPairSet(setId);
    if (!set) return;
    if (setState) setState((prev) => ({ ...prev, enabledTypes: set.typeIds }));
    if (setPracticePrefs) {
      setPracticePrefs(
        practicePrefsForMinimalPairSet(set, practicePrefs, { enabledTypes: state.enabledTypes }),
      );
    }
    if (setTab) setTab('study');
  }

  function stopMinimalPairDrill() {
    if (setPracticePrefs) setPracticePrefs(clearMinimalPairPrefs(practicePrefs));
    if (setState) {
      const enabledTypes = minimalPairReturnEnabledTypes(practicePrefs);
      setState((prev) => ({ ...prev, enabledTypes: enabledTypes || [] }));
    }
  }

  async function generatePlan() {
    if (!geminiKey) return;
    if (aiLoading) {
      aiAbortRef.current?.abort();
      aiAbortRef.current = null;
      setAiLoading(false);
      return;
    }
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setAiLoading(true);
    setAiText('');
    setAiErr('');
    try {
      const radarText = radar.map((r) => `${r.label}: ${r.score}% (${r.detail})`).join('\n');
      const formText =
        weakestForms
          .map(
            (row) =>
              `${row.type.label}: ${row.accuracy}% (${row.correct}/${row.attempted}, ${row.incorrect} misses)`,
          )
          .join('\n') || 'No form accuracy data yet';
      const speedText =
        speedRows
          .slice(0, 8)
          .map(
            (row) =>
              `${row.label}: ${responseTimeLabel(row.avgMs)} avg (${row.correct}/${row.attempted} correct)`,
          )
          .join('\n') || 'No completion speed data yet';
      const leechText =
        stats.leeches
          .map((l) => `${TYPE_LABEL[l.typeId] || l.typeId}: ${l.card.incorrect} misses`)
          .join('\n') || 'No leeches yet';
      const prompt = `Create a focused Japanese conjugation study plan from these app stats.\n\nSkill radar:\n${radarText}\n\nForm accuracy:\n${formText}\n\nCompletion speed:\n${speedText}\n\nWeak cards:\n${leechText}\n\nGive a 7-day plan with one tiny daily drill, what to do in this app, and one success metric per day. Be concise and practical.`;
      const reply = await callGemini(
        [{ role: 'user', parts: [{ text: prompt }] }],
        geminiKey,
        2500,
        0.35,
        aiSystemFromPrefs(practicePrefs, AI_COACH_SYSTEM),
      );
      if (!controller.signal.aborted) setAiText(reply.trim());
    } catch (e) {
      if (!controller.signal.aborted) setAiErr(e.message);
    }
    if (!controller.signal.aborted) setAiLoading(false);
    aiAbortRef.current = null;
  }

  const Stat = ({ label, value }) => (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-850 p-4">
      <div className="text-2xl font-semibold text-stone-800 dark:text-stone-100">{value}</div>
      <div className="text-xs text-stone-500 mt-0.5">{label}</div>
    </div>
  );

  function readinessCellClass(status) {
    if (status === 'strong') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/20 dark:text-emerald-200';
    }
    if (status === 'developing') {
      return 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-amber-950/20 dark:text-amber-200 dark:hover:bg-amber-900/30';
    }
    if (status === 'weak') {
      return 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-900/70 dark:bg-rose-950/20 dark:text-rose-200 dark:hover:bg-rose-900/30';
    }
    return 'border-dashed border-stone-300 bg-stone-50 text-stone-500 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-400 dark:hover:bg-stone-900';
  }

  return (
    <div className="space-y-4 text-left">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Due now" value={stats.due} />
        <Stat label="Learning" value={stats.learning} />
        <Stat label="Mastered" value={stats.mastered} />
        <Stat label="New" value={stats.fresh} />
        <Stat label="Weak cards" value={weakCardsData.length} />
      </div>
      {(srsForecast.in1h > 0 ||
        srsForecast.in4h > 0 ||
        srsForecast.today > 0 ||
        srsForecast.tomorrow > 0 ||
        srsForecast.week > 0) && (
        <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 px-4 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-1.5">
            Upcoming reviews
          </div>
          <div className="flex flex-wrap gap-2">
            {srsForecast.in1h > 0 && (
              <span className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                {srsForecast.in1h} in 1h
              </span>
            )}
            {srsForecast.in4h > 0 && (
              <span className="text-xs text-stone-600 dark:text-stone-300">
                {srsForecast.in4h} in 4h
              </span>
            )}
            {srsForecast.today > 0 && (
              <span className="text-xs text-stone-600 dark:text-stone-300">
                {srsForecast.today} later today
              </span>
            )}
            {srsForecast.tomorrow > 0 && (
              <span className="text-xs text-stone-600 dark:text-stone-300">
                {srsForecast.tomorrow} tomorrow
              </span>
            )}
            {srsForecast.week > 0 && (
              <span className="text-xs text-stone-500 dark:text-stone-400">
                {srsForecast.week} this week
              </span>
            )}
          </div>
        </div>
      )}
      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="font-medium flex items-center gap-2 text-stone-950 dark:text-stone-50">
                <IconSpark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Skill radar
              </h3>
              <p className="text-xs text-stone-500">
                Weakest area: {weakest?.label || 'none'}
                {weakest ? ` (${weakest.score}%)` : ''}
              </p>
            </div>
            <button
              onClick={generatePlan}
              disabled={!geminiKey}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm flex items-center gap-1.5 transition"
            >
              <IconSpark className="w-4 h-4" />
              {aiLoading ? 'Cancel' : 'AI plan'}
            </button>
          </div>
          <div className="space-y-3">
            {radar.map((r) => (
              <div key={r.id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-stone-800 dark:text-stone-200">
                      {r.label}
                    </div>
                    <div className="text-xs text-stone-500">{r.detail}</div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-stone-900 dark:text-stone-100">
                    {r.score}%
                  </div>
                </div>
                <div className="mt-1.5 h-2 bg-stone-100 dark:bg-stone-950 rounded-full overflow-hidden border border-stone-100 dark:border-stone-800">
                  <div
                    className={`h-full transition-all duration-300 ${r.score >= 80 ? 'bg-emerald-500' : r.score >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: r.score + '%' }}
                  />
                </div>
              </div>
            ))}
          </div>
          {!geminiKey && (
            <div className="mt-3 text-xs text-stone-400 text-center">
              Gemini is not configured for a personalized 7-day plan.
            </div>
          )}
          <div role="status" aria-live="polite">
            {aiErr && <div className="mt-3 text-sm text-rose-600">{aiErr}</div>}
            {aiText && (
              <div className="mt-4 rounded-xl border border-indigo-100 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/20 px-3 py-2 text-sm text-indigo-950 dark:text-indigo-100 leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
                {aiText}
              </div>
            )}
          </div>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
          <h3 className="font-medium mb-3 text-stone-950 dark:text-stone-50">Lifetime accuracy</h3>
          <div className="text-4xl font-semibold tabular-nums text-stone-900 dark:text-stone-50">
            {stats.acc}%
          </div>
          <div className="h-2 bg-stone-100 dark:bg-stone-950 rounded-full overflow-hidden mt-3 border border-stone-100 dark:border-stone-800">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: stats.acc + '%' }}
            />
          </div>
          <div className="text-xs text-stone-500 mt-2">
            {stats.totalCorrect} correct / {stats.totalReviews} reviews / {stats.total} cards
          </div>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
          <h3 className="font-medium text-stone-950 dark:text-stone-50">Word proficiency</h3>
          <p className="text-xs text-stone-500 mt-0.5 mb-3">
            Lowest practiced words first, rolled up from their active word-form cards.
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {wordRowsData.slice(0, 12).map((row) => (
              <div
                key={row.word}
                className="rounded-xl border border-stone-200 dark:border-stone-800 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
                      {row.word}
                    </div>
                    <div className="text-xs text-stone-500">
                      {row.cards} form{row.cards === 1 ? '' : 's'} / {row.due} due
                    </div>
                  </div>
                  <div className="text-right text-xs tabular-nums text-stone-500">
                    <div className="font-semibold text-stone-800 dark:text-stone-200">
                      {row.attempted ? `${row.accuracy}%` : 'new'}
                    </div>
                    <div>
                      {row.correct}/{row.attempted}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {wordRowsData.length === 0 && (
              <p className="text-sm text-stone-500">No word-form SRS attempts yet.</p>
            )}
          </div>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
          <h3 className="font-medium text-stone-950 dark:text-stone-50">Exact weak cards</h3>
          <p className="text-xs text-stone-500 mt-0.5 mb-3">
            Specific word + form cards with the most misses.
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {weakCardsData.map((row) => (
              <div
                key={row.cardId}
                className="rounded-xl border border-stone-200 dark:border-stone-800 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
                      {row.word}
                    </div>
                    <div className="text-xs text-stone-500 truncate">
                      {TYPE_LABEL[row.typeId] || row.typeId}
                    </div>
                  </div>
                  <div className="text-right text-xs tabular-nums text-stone-500">
                    <div className="font-semibold text-rose-700 dark:text-rose-300">
                      {row.incorrect} miss{row.incorrect === 1 ? '' : 'es'}
                    </div>
                    <div>{row.due ? 'due now' : `${row.correct} correct`}</div>
                  </div>
                </div>
              </div>
            ))}
            {weakCardsData.length === 0 && (
              <p className="text-sm text-stone-500">No weak word-form cards yet.</p>
            )}
          </div>
        </div>
      </div>
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="font-medium flex items-center gap-2 text-stone-950 dark:text-stone-50">
              <IconSpark className="w-4 h-4 text-cyan-600 dark:text-cyan-300" />
              Completion speed
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Average answer time by conjugation type. Slowest practiced forms appear first.
            </p>
          </div>
          <div className="text-xs text-stone-400 tabular-nums flex-shrink-0">
            {speedRows.length}/{formRowsData.length} timed
          </div>
        </div>
        {speedRows.length === 0 ? (
          <p className="text-sm text-stone-500">
            No timed study attempts yet. Complete a few cards to build this view.
          </p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 border-y border-stone-100 dark:border-stone-800 py-3 mb-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-stone-400">Fastest</div>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium text-stone-800 dark:text-stone-200">
                    {fastestSpeedRow?.label}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {responseTimeLabel(fastestSpeedRow?.avgMs)}
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-stone-400">Slowest</div>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium text-stone-800 dark:text-stone-200">
                    {slowestSpeedRow?.label}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                    {responseTimeLabel(slowestSpeedRow?.avgMs)}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {speedRows.slice(0, 12).map((row) => {
                const tone = speedToneFor(row.avgMs);
                const width = slowestSpeedRow?.avgMs
                  ? Math.max(6, Math.round((row.avgMs / slowestSpeedRow.avgMs) * 100))
                  : 0;
                return (
                  <div
                    key={row.typeId}
                    className="border-b border-stone-100 dark:border-stone-800 pb-2 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
                          {row.label}
                        </div>
                        <div className="text-xs text-stone-500 truncate">{row.hint}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-sm font-semibold tabular-nums ${tone.text}`}>
                          {responseTimeLabel(row.avgMs)}
                        </div>
                        <div className="text-[11px] text-stone-500">{tone.label}</div>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 bg-stone-100 dark:bg-stone-950 rounded-full overflow-hidden border border-stone-100 dark:border-stone-800">
                      <div
                        className={`h-full transition-all ${tone.bar}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-400">
                      <span>
                        {row.correct}/{row.attempted} correct
                      </span>
                      <span>
                        {row.correct
                          ? `${responseTimeLabel(row.correctAvgMs)} correct avg`
                          : 'no correct reps'}
                      </span>
                      <span>{row.fastCorrect} quick correct</span>
                      {row.fastestMs && <span>{responseTimeLabel(row.fastestMs)} best</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="font-medium text-stone-950 dark:text-stone-50">
              Conjugation readiness map
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Readiness by skill, practice dimension, and response speed.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] tabular-nums">
            <span className="px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300">
              {readinessCounts.weak} weak
            </span>
            <span className="px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">
              {readinessCounts.developing} developing
            </span>
            <span className="px-2 py-1 rounded-md bg-stone-50 dark:bg-stone-950 text-stone-500 dark:text-stone-400">
              {readinessCounts.untested} untested
            </span>
            <span className="px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300">
              {readinessCounts.strong} strong
            </span>
          </div>
        </div>
        {readinessVisibleRows.length === 0 ? (
          <p className="text-sm text-stone-500">No active conjugation skills available.</p>
        ) : (
          <div className="overflow-x-auto -mx-2 px-2">
            <div className="min-w-[780px]">
              <div className="grid grid-cols-[minmax(190px,1.2fr)_repeat(3,minmax(120px,1fr))] gap-2 px-1 pb-2 text-[11px] font-semibold text-stone-500">
                <div>Skill</div>
                {READINESS_DIMENSIONS.map((dimension) => (
                  <div key={dimension.id}>{dimension.label}</div>
                ))}
              </div>
              <div className="max-h-[32rem] overflow-y-auto pr-1 space-y-2">
                {readinessVisibleRows.map((row) => (
                  <div
                    key={row.ruleId}
                    className="grid grid-cols-[minmax(190px,1.2fr)_repeat(3,minmax(120px,1fr))] gap-2"
                  >
                    <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/60 px-3 py-2 min-w-0">
                      <div className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate">
                        {row.family}
                      </div>
                      <div className="text-xs text-stone-500 truncate">
                        {row.group} / {row.wordCount} word{row.wordCount === 1 ? '' : 's'}
                      </div>
                    </div>
                    {READINESS_DIMENSIONS.map((dimension) => {
                      const cell = row.cells[dimension.id];
                      const actionable = cell.status !== 'strong' && row.wordCount > 0;
                      const className = `h-full w-full rounded-xl border px-2.5 py-2 text-left transition ${readinessCellClass(cell.status)} ${
                        actionable
                          ? 'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 dark:focus:ring-offset-stone-900'
                          : ''
                      }`;
                      const content = (
                        <>
                          <div className="text-xs font-semibold">{cell.label}</div>
                          <div className="text-[11px] opacity-80 tabular-nums">{cell.detail}</div>
                          {actionable && (
                            <div className="mt-1 text-[11px] font-medium">
                              {cell.status === 'untested' ? 'Start' : 'Drill'}
                            </div>
                          )}
                        </>
                      );
                      return actionable ? (
                        <button
                          key={dimension.id}
                          type="button"
                          onClick={() => drillReadinessCell(row, dimension.id)}
                          className={className}
                          aria-label={`Start ${dimension.label} drill for ${row.skill}`}
                          title={dimension.hint}
                        >
                          {content}
                        </button>
                      ) : (
                        <div key={dimension.id} className={className} title={dimension.hint}>
                          {content}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-stone-950 dark:text-stone-50">Form accuracy</h3>
              {formRowsData.filter((row) => row.attempted > 0).length > 0 && (
                <button
                  onClick={drillWeaknesses}
                  className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-350 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                >
                  <IconFlame className="w-3.5 h-3.5" /> Drill Weaknesses
                </button>
              )}
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Lowest practiced forms first. Untried forms stay visible at the bottom.
            </p>
          </div>
          <div className="text-xs text-stone-400 tabular-nums flex-shrink-0">
            {formRowsData.filter((row) => row.attempted > 0).length}/{formRowsData.length} practiced
          </div>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {formRowsData.map((row) => {
            const has = row.attempted > 0;
            const tone = !has
              ? 'bg-stone-300 dark:bg-stone-800'
              : row.accuracy >= 80
                ? 'bg-emerald-500'
                : row.accuracy >= 50
                  ? 'bg-amber-500'
                  : 'bg-rose-500';
            return (
              <div
                key={row.type.id}
                className="rounded-xl border border-stone-200 dark:border-stone-800 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
                      {row.type.label}
                    </div>
                    <div className="text-xs text-stone-500 truncate">{row.type.hint}</div>
                  </div>
                  <div className="text-right text-xs text-stone-500 flex-shrink-0">
                    <div className="font-semibold text-stone-800 dark:text-stone-200 tabular-nums">
                      {has ? `${row.accuracy}%` : 'new'}
                    </div>
                    <div className="tabular-nums">
                      {row.correct}/{row.attempted}
                    </div>
                  </div>
                </div>
                <div className="mt-2 h-1.5 bg-stone-100 dark:bg-stone-950 rounded-full overflow-hidden border border-stone-100 dark:border-stone-800">
                  <div
                    className={`h-full ${tone} transition-all`}
                    style={{ width: (has ? row.accuracy : 0) + '%' }}
                  />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-400">
                  <span>
                    {row.incorrect} miss{row.incorrect === 1 ? '' : 'es'}
                  </span>
                  <span>{row.due} due</span>
                  {row.fresh > 0 && (
                    <span>
                      {row.fresh} new card{row.fresh === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-medium flex items-center gap-2 text-stone-950 dark:text-stone-50">
              <IconFlame className="w-4 h-4 text-rose-500" />
              Diagnosed mistake patterns
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Highest-value patterns from missed cards.
            </p>
          </div>
          <div className="text-xs text-stone-400 tabular-nums flex-shrink-0">
            {mistakePatterns.length} pattern{mistakePatterns.length === 1 ? '' : 's'}
          </div>
        </div>
        {mistakePatterns.length === 0 ? (
          <p className="text-sm text-stone-500">
            No diagnosed patterns yet. Ambiguous misses still stay in mistake history.
          </p>
        ) : (
          <div className="space-y-2">
            {visiblePatterns.map((pattern, index) => (
              <div
                key={pattern.patternId}
                className="rounded-xl border border-stone-200 dark:border-stone-800 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-850 dark:text-stone-150">
                      {pattern.label}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5">{pattern.feedback}</div>
                    {!!pattern.examples.length && (
                      <div className="mt-1 text-[11px] text-stone-400 truncate">
                        Examples: {pattern.examples.map((ex) => ex.dict).join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-350">
                      {pattern.unresolved} open
                    </div>
                    <div className="text-[11px] text-stone-400 tabular-nums">
                      {pattern.count} total
                    </div>
                  </div>
                </div>
                {index === 0 && (
                  <button
                    onClick={() => launchRepairDrill(pattern)}
                    className="mt-3 w-full px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium transition"
                  >
                    Start 10-card repair drill
                  </button>
                )}
              </div>
            ))}
            {mistakePatterns.length > 6 && (
              <button
                onClick={() => setShowAllPatterns((v) => !v)}
                className="w-full text-center text-xs text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 py-1 transition"
              >
                {showAllPatterns
                  ? 'Show fewer'
                  : `Show ${mistakePatterns.length - 6} more pattern${mistakePatterns.length - 6 === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
          <div>
            <h3 className="font-medium flex items-center gap-2 text-stone-950 dark:text-stone-50">
              <IconSpark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Minimal-pair drills
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Contrast forms learners commonly confuse, with progress tracked by contrast set.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {minimalPairRecommendations.length > 0 && (
              <div className="text-[11px] px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/60">
                Recommended:{' '}
                {minimalPairRecommendations.map((result) => result.set.label).join(', ')}
              </div>
            )}
            {practicePrefs.minimalPairSetId && (
              <button
                onClick={stopMinimalPairDrill}
                className="text-xs text-stone-500 hover:text-rose-600 dark:hover:text-rose-400 transition"
              >
                Stop drill
              </button>
            )}
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          {MINIMAL_PAIR_SETS.map((set) => {
            const eligible = minimalPairEligibleWords(verbs, set);
            const setStats = minimalPairStatsSummary(state.minimalPairs, set.id);
            const active = practicePrefs.minimalPairSetId === set.id;
            const recommended = recommendedMinimalPairIds.has(set.id);
            return (
              <button
                key={set.id}
                type="button"
                onClick={() => launchDrill(set.id)}
                disabled={eligible.length === 0}
                aria-pressed={active}
                className={`text-left px-3 py-3 rounded-xl border transition group disabled:opacity-45 disabled:cursor-not-allowed ${
                  active
                    ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30'
                    : recommended
                      ? 'border-indigo-200 dark:border-indigo-900 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20'
                      : 'border-stone-200 dark:border-stone-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-stone-50 dark:hover:bg-stone-850'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-800 dark:text-stone-200 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition">
                      {set.label}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5">{set.description}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-[11px] flex-shrink-0">
                    {recommended && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                        Recommended
                      </span>
                    )}
                    {active && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                        Active
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500">
                  <span>{eligible.length} eligible words</span>
                  <span>
                    {setStats.attempted} attempts
                    {setStats.attempted ? ` / ${setStats.accuracy}%` : ''}
                  </span>
                  <span>{setStats.bestStreak || 0} best streak</span>
                  <span className="font-medium text-indigo-600 dark:text-indigo-400">
                    {active ? 'Restart drill' : 'Start drill'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
        <h3 className="font-medium mb-3 flex items-center gap-2 text-stone-950 dark:text-stone-50">
          <IconFlame className="w-4 h-4 text-rose-500" />
          Leeches
        </h3>
        {stats.leeches.length === 0 ? (
          <p className="text-sm text-stone-500">No leeches yet!</p>
        ) : (
          <ul className="space-y-2">
            {stats.leeches.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between py-1.5 px-2 hover:bg-stone-50 dark:hover:bg-stone-800/40 rounded-lg"
              >
                <div>
                  <span className="font-medium text-stone-700 dark:text-stone-300">
                    {l.id.split('|')[0]}
                  </span>
                  <span className="text-xs text-stone-400 ml-2">{TYPE_LABEL[l.typeId]}</span>
                </div>
                <div className="text-xs text-rose-600 dark:text-rose-450">
                  {l.card.incorrect} miss{l.card.incorrect === 1 ? '' : 'es'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
