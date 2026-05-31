import React, { useState, useMemo, useRef } from 'react';
import { IconSpark, IconFlame } from '../components/Icons.jsx';
import { ALL_CARD_TYPES, TYPE_LABEL } from '../data/conjugationTypes.js';
import { RULES } from '../utils/conjugator.js';
import { defaultState } from '../utils/storage.js';
import {
  aggregateDiagnosedMistakes,
  buildRepairDrillPlan,
  repairPrefsForPlan,
  upsertRepairWordList,
} from '../utils/mistakeDiagnosis.js';
import { callGemini, aiSystemFromPrefs, AI_COACH_SYSTEM } from '../utils/gemini.js';
import { useApp } from '../state/AppStateContext.jsx';

function srsStatsFor(state, verbs) {
  const now = Date.now();
  let totalReviews = 0,
    totalCorrect = 0,
    due = 0,
    learning = 0,
    mastered = 0,
    fresh = 0,
    total = 0;
  const leeches = [];
  const enabled = state.enabledTypes || [];

  for (const rule of RULES) {
    if (!enabled.includes(rule.type)) continue;
    if (!rule.verbFilter(verbs).length) continue;
    total++;
    const c = state.cards[rule.id];
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
      leeches.push({ id: rule.id, rule, card: c });
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

function formAccuracyRows(state, verbs) {
  const enabled =
    state.enabledTypes && state.enabledTypes.length
      ? state.enabledTypes
      : ALL_CARD_TYPES.map((t) => t.id);
  const cards = state.cards || {};
  const now = Date.now();
  return ALL_CARD_TYPES.filter((t) => enabled.includes(t.id))
    .map((t) => {
      const rules = RULES.filter((r) => r.type === t.id && r.verbFilter(verbs).length > 0);
      let correct = 0,
        incorrect = 0,
        due = 0,
        fresh = 0;
      for (const rule of rules) {
        const card = cards[rule.id];
        if (!card) {
          fresh++;
          continue;
        }
        correct += card.correct || 0;
        incorrect += card.incorrect || 0;
        if (card.nextReview <= now) due++;
      }
      const attempted = correct + incorrect;
      return {
        type: t,
        rules: rules.length,
        correct,
        incorrect,
        attempted,
        accuracy: pct(correct, attempted),
        due,
        fresh,
      };
    })
    .filter((row) => row.rules > 0)
    .sort((a, b) => {
      const aUntried = a.attempted ? 0 : 1;
      const bUntried = b.attempted ? 0 : 1;
      if (aUntried !== bUntried) return aUntried - bUntried;
      if (a.attempted && b.attempted && a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      if (a.incorrect !== b.incorrect) return b.incorrect - a.incorrect;
      return a.type.label.localeCompare(b.type.label);
    });
}

function skillRadarScores(state, verbs) {
  const srs = srsStatsFor(state, verbs);
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
      detail: `${srs.mastered}/${srs.total || 0} rules mastered`,
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
  const stats = useMemo(() => srsStatsFor(state, verbs), [state, verbs]);
  const radar = useMemo(() => skillRadarScores(state, verbs), [state, verbs]);
  const formRowsData = useMemo(() => formAccuracyRows(state, verbs), [state, verbs]);
  const mistakePatterns = useMemo(
    () => aggregateDiagnosedMistakes(state.mistakes),
    [state.mistakes],
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

    let nextPrefs = { ...practicePrefs, practiceFocus: 'weak' };

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

  function launchRepairDrill(pattern) {
    const plan = buildRepairDrillPlan(pattern, verbs);
    if (setWordLists && plan.wordKeys.length) {
      setWordLists(upsertRepairWordList(wordLists, plan));
    }
    if (setState && plan.typeIds.length) {
      setState((prev) => ({ ...prev, enabledTypes: plan.typeIds }));
    }
    if (setPracticePrefs) {
      setPracticePrefs(repairPrefsForPlan(practicePrefs, plan));
    }
    if (setTab) {
      setTab('study');
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
      const leechText =
        stats.leeches
          .map((l) => `${l.rule.label} ${TYPE_LABEL[l.rule.type]}: ${l.card.incorrect} misses`)
          .join('\n') || 'No leeches yet';
      const prompt = `Create a focused Japanese conjugation study plan from these app stats.\n\nSkill radar:\n${radarText}\n\nForm accuracy:\n${formText}\n\nWeak cards:\n${leechText}\n\nGive a 7-day plan with one tiny daily drill, what to do in this app, and one success metric per day. Be concise and practical.`;
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

  return (
    <div className="space-y-4 text-left">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Due now" value={stats.due} />
        <Stat label="Learning" value={stats.learning} />
        <Stat label="Mastered" value={stats.mastered} />
        <Stat label="New" value={stats.fresh} />
      </div>
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
              Add a Gemini key in Settings for a personalized 7-day plan.
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
            {stats.totalCorrect} correct / {stats.totalReviews} reviews / {stats.total} rules
          </div>
        </div>
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
                      {row.fresh} new rule{row.fresh === 1 ? '' : 's'}
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
                    {l.rule.label}
                  </span>
                  <span className="text-xs text-stone-400 ml-2">{TYPE_LABEL[l.rule.type]}</span>
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
