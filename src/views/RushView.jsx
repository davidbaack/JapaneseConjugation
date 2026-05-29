import React, { useState, useEffect, useRef, useMemo } from 'react';
import { IconSpark } from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import StickyAction from '../components/StickyAction.jsx';
import { toHiragana } from '../utils/romaji.js';
import {
  filterWordsForPrefs,
  practiceTypesForItem,
  pickPromptType,
  conjugateItem,
  getTypeInfo,
  RULES,
} from '../utils/conjugator.js';
import { GROUP_NAMES } from '../utils/conjugatorExplain.js';
import { defaultState, gradeCard, recordMistake, bumpDaily } from '../utils/storage.js';
import { promptDisplay, shuffled } from '../utils/display.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

export default function RushView({
  state,
  setState,
  verbs,
  practicePrefs = DEFAULT_PREFS,
  wordLists = [],
}) {
  const gameWords = useMemo(
    () => filterWordsForPrefs(verbs, practicePrefs, wordLists),
    [verbs, practicePrefs, wordLists],
  );
  const eligible = useMemo(
    () =>
      gameWords.filter((w) => practiceTypesForItem(w, state.enabledTypes, practicePrefs).length),
    [gameWords, state.enabledTypes, practicePrefs],
  );
  const game = state.game || defaultState().game;
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [round, setRound] = useState(null);
  const [answer, setAnswer] = useState('');
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [cleared, setCleared] = useState(0);
  const [wave, setWave] = useState(1);
  const [deadline, setDeadline] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [recent, setRecent] = useState([]);
  const advanceRef = useRef(null);
  const resolvingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (advanceRef.current) clearTimeout(advanceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!active || paused || !round) return;
    const id = setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      setTimeLeft(left);
      if (left <= 0) resolveRound(false, 'timeout');
    }, 100);
    return () => clearInterval(id);
    // resolveRound is defined inline without useCallback — adding it would reset the timer on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, round, deadline]);

  function buildRound() {
    if (!eligible.length) return null;
    const item = shuffled(eligible)[0];
    const types = practiceTypesForItem(item, state.enabledTypes, practicePrefs);
    if (!types.length) return null;
    const type = shuffled(types)[0];
    const promptType = pickPromptType(item, type.id, practicePrefs);
    const prompt = promptDisplay(item, promptType, practicePrefs);
    return {
      item,
      type,
      promptType,
      prompt,
      expected: conjugateItem(item, type.id),
      key: `${item.dict}-${type.id}-${Date.now()}-${Math.random()}`,
    };
  }

  function launchRound(nextCleared = cleared) {
    const next = buildRound();
    if (!next) {
      setActive(false);
      setRound(null);
      setFeedback({
        kind: 'bad',
        title: 'No cards available',
        detail: 'Current filters have no enabled conjugation cards.',
      });
      return;
    }
    const nextWave = 1 + Math.floor(nextCleared / 5);
    const limit = Math.max(3600, 8500 - Math.min(nextWave - 1, 9) * 520);
    resolvingRef.current = false;
    setWave(nextWave);
    setRound({ ...next, limit });
    setAnswer('');
    setFeedback(null);
    setDeadline(Date.now() + limit);
    setTimeLeft(limit);
  }

  function startGame() {
    if (!eligible.length) {
      setFeedback({
        kind: 'bad',
        title: 'No cards available',
        detail: 'Current filters have no enabled conjugation cards.',
      });
      return;
    }
    if (advanceRef.current) clearTimeout(advanceRef.current);
    setScore(0);
    setCombo(0);
    setCleared(0);
    setRecent([]);
    setPaused(false);
    setActive(true);
    setState((s) => {
      const prev = s.game || defaultState().game;
      return { ...s, game: { ...prev, played: (prev.played || 0) + 1 } };
    });
    launchRound(0);
  }

  function endGame() {
    if (advanceRef.current) clearTimeout(advanceRef.current);
    setActive(false);
    setPaused(false);
    setRound(null);
    setFeedback(null);
    setAnswer('');
  }

  function matchingRule(item, typeId) {
    return RULES.find((r) => r.type === typeId && r.verbFilter([item]).length);
  }

  function recordRushAttempt(current, ok, raw, nextScore, nextCombo) {
    setState((s) => {
      const rule = matchingRule(current.item, current.type.id);
      const rid = rule?.id || `${current.item.group}-${current.type.id}`;
      const dict = current.item.dict;
      const prevVS = s.verbStats?.[dict]?.[rid] || { seen: 0, incorrect: 0 };
      const prevGame = s.game || defaultState().game;
      return {
        ...s,
        cards: { ...s.cards, [rid]: gradeCard(s.cards[rid], ok) },
        verbStats: {
          ...(s.verbStats || {}),
          [dict]: {
            ...(s.verbStats?.[dict] || {}),
            [rid]: { seen: prevVS.seen + 1, incorrect: prevVS.incorrect + (ok ? 0 : 1) },
          },
        },
        mistakes: ok
          ? s.mistakes
          : recordMistake(
              s.mistakes,
              current.item,
              current.type.id,
              current.promptType,
              toHiragana(raw),
              current.expected,
            ),
        session: {
          ...s.session,
          reviewed: s.session.reviewed + 1,
          correct: s.session.correct + (ok ? 1 : 0),
        },
        daily: ok ? bumpDaily(s.daily, true, practicePrefs.dailyGoal || 10) : s.daily,
        game: {
          ...prevGame,
          bestScore: Math.max(prevGame.bestScore || 0, nextScore),
          bestCombo: Math.max(prevGame.bestCombo || 0, nextCombo),
        },
      };
    });
  }

  function resolveRound(ok, reason = 'answer') {
    if (resolvingRef.current) return;
    if (!round) return;
    resolvingRef.current = true;
    const current = round;
    const raw = answer.trim();
    setRound(null);
    if (ok) {
      const left = Math.max(0, deadline - Date.now());
      const nextCombo = combo + 1;
      const gained = 100 + Math.round((left / current.limit) * 90) + nextCombo * 12 + wave * 5;
      const nextScore = score + gained;
      const nextCleared = cleared + 1;
      setScore(nextScore);
      setCombo(nextCombo);
      setCleared(nextCleared);
      setFeedback({
        kind: 'ok',
        title: `+${gained}`,
        detail: `${current.expected} · combo ${nextCombo}`,
      });
      setRecent((r) =>
        [
          {
            ok: true,
            prompt: current.prompt.main,
            type: current.type.label,
            expected: current.expected,
            answer: toHiragana(raw),
          },
          ...r,
        ].slice(0, 5),
      );
      recordRushAttempt(current, true, raw, nextScore, nextCombo);
      advanceRef.current = setTimeout(() => active && launchRound(nextCleared), 520);
    } else {
      setCombo(0);
      setFeedback({
        kind: 'bad',
        title: reason === 'timeout' ? 'Time' : 'Miss',
        detail: `${current.expected} · ${current.type.label}`,
      });
      setRecent((r) =>
        [
          {
            ok: false,
            prompt: current.prompt.main,
            type: current.type.label,
            expected: current.expected,
            answer: raw ? toHiragana(raw) : '--',
          },
          ...r,
        ].slice(0, 5),
      );
      recordRushAttempt(current, false, raw, score, 0);
      advanceRef.current = setTimeout(() => active && launchRound(cleared), 900);
    }
  }

  function submit() {
    if (!round) return;
    const ok = toHiragana(answer) === round.expected;
    resolveRound(ok, ok ? 'answer' : 'wrong');
  }

  const pct = round ? Math.max(0, Math.min(100, Math.round((timeLeft / round.limit) * 100))) : 0;
  const fall = round ? Math.round((1 - timeLeft / round.limit) * 126) : 0;
  const promptLabel = round
    ? round.promptType
      ? getTypeInfo(round.promptType).label
      : 'Dictionary form'
    : '';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
          <div className="text-2xl font-semibold tabular-nums text-stone-950 dark:text-stone-50">
            {score}
          </div>
          <div className="text-xs text-stone-500">Score</div>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
          <div className="text-2xl font-semibold tabular-nums text-stone-950 dark:text-stone-50">
            {combo}
          </div>
          <div className="text-xs text-stone-500">Combo</div>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
          <div className="text-2xl font-semibold tabular-nums text-stone-950 dark:text-stone-50">
            {wave}
          </div>
          <div className="text-xs text-stone-500">Wave</div>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
          <div className="text-2xl font-semibold tabular-nums text-stone-950 dark:text-stone-50">
            {game.bestScore || 0}
          </div>
          <div className="text-xs text-stone-500">Best</div>
        </div>
      </div>
      <div className="grid lg:grid-cols-[1fr_260px] gap-4">
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-medium flex items-center gap-2 text-stone-950 dark:text-stone-50">
                <IconSpark className="w-4 h-4 text-amber-500" />
                Kotoba Rush
              </h3>
              <p className="text-xs text-stone-500">
                {eligible.length} filtered cards · best combo {game.bestCombo || 0}
              </p>
            </div>
            <div className="flex gap-2">
              {!active ? (
                <button
                  onClick={startGame}
                  className="px-3 py-2 bg-stone-800 hover:bg-stone-900 dark:bg-stone-200 dark:hover:bg-stone-150 text-white dark:text-stone-900 rounded-lg text-sm font-medium transition"
                >
                  Start
                </button>
              ) : (
                <button
                  onClick={() => setPaused(!paused)}
                  className="px-3 py-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-sm transition"
                >
                  {paused ? 'Resume' : 'Pause'}
                </button>
              )}
              {active && (
                <button
                  onClick={endGame}
                  className="px-3 py-2 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-750 dark:text-stone-300 rounded-lg text-sm transition"
                >
                  End
                </button>
              )}
            </div>
          </div>
          <div className="h-2 bg-stone-100 dark:bg-stone-950 rounded-full overflow-hidden mb-4">
            <div
              className={`h-full transition-all duration-100 ${pct > 35 ? 'bg-emerald-500' : pct > 15 ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: pct + '%' }}
            />
          </div>
          <div className="relative h-80 overflow-hidden rounded-2xl bg-stone-900 border border-stone-800 text-white">
            <div className="absolute inset-x-5 bottom-10 h-px bg-rose-450/70" />
            {round && (
              <div
                className="absolute left-5 right-5 transition-transform duration-100"
                style={{ transform: `translateY(${fall}px)` }}
              >
                <div className="rounded-2xl bg-white dark:bg-stone-905 text-stone-900 dark:text-stone-100 shadow-xl p-5 border border-stone-200 dark:border-stone-800">
                  <div className="flex items-center justify-between gap-3 text-xs text-stone-500 mb-3">
                    <span>
                      {promptLabel} → {round.type.label}
                    </span>
                    <span>Wave {wave}</span>
                  </div>
                  <ScriptDisplay
                    view={round.prompt}
                    className="text-3xl sm:text-4xl font-semibold leading-relaxed"
                    subClassName="mt-1 text-sm text-stone-500"
                  />
                  <div className="mt-2 text-sm text-stone-500">{round.item.meaning}</div>
                  {practicePrefs.showWordCategory && (
                    <div className="mt-1 text-xs text-stone-400">
                      {GROUP_NAMES[round.item.group]}
                    </div>
                  )}
                </div>
              </div>
            )}
            {!round && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                {feedback ? (
                  <div
                    className={`rounded-2xl px-5 py-4 border ${
                      feedback.kind === 'ok'
                        ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-350 border-emerald-200 dark:border-emerald-900/50'
                        : 'bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-350 border-rose-200 dark:border-rose-900/50'
                    }`}
                  >
                    <span role="status" aria-live="polite" className="sr-only">
                      {feedback.title}. {feedback.detail}
                    </span>
                    <div className="text-2xl font-semibold">{feedback.title}</div>
                    <div className="text-sm mt-1">{feedback.detail}</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-3xl font-semibold">Kotoba Rush</div>
                    <div className="text-sm text-stone-300 mt-2">
                      Score {game.bestScore || 0} to beat.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <StickyAction pad="-mx-5 px-5" className="mt-4">
            <div className="grid sm:grid-cols-[1fr_auto] gap-2">
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                  }
                }}
                disabled={!round || paused}
                placeholder="Type answer"
                aria-label={
                  round ? `Answer: ${round.type.label} of ${round.item.dict}` : 'Type answer'
                }
                lang="ja"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                className="px-4 py-3 text-xl border-2 border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 rounded-xl focus:border-indigo-500 focus:outline-none disabled:bg-stone-50 dark:disabled:bg-stone-900 transition"
              />
              <button
                onClick={submit}
                disabled={!round || paused}
                className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-medium shadow-lg transition"
              >
                Submit
              </button>
            </div>
          </StickyAction>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <h3 className="font-medium mb-3 text-stone-950 dark:text-stone-50">Rush log</h3>
          {!recent.length ? (
            <div className="text-sm text-stone-500 py-8 text-center">No attempts yet.</div>
          ) : (
            <div className="space-y-2">
              {recent.map((r, i) => (
                <div
                  key={i}
                  className={`rounded-xl border px-3 py-2 ${
                    r.ok
                      ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 text-stone-850 dark:text-stone-200'
                      : 'border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 text-stone-850 dark:text-stone-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-stone-550 dark:text-stone-400">{r.type}</span>
                    <span
                      className={`text-xs font-semibold ${r.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}
                    >
                      {r.ok ? 'OK' : 'MISS'}
                    </span>
                  </div>
                  <div className="mt-1 text-sm" lang="ja">
                    {r.prompt} → {r.expected}
                  </div>
                  <div className="text-xs text-stone-500 mt-1">
                    You: <span lang="ja">{r.answer}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
