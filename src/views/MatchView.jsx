import React, { useState, useEffect, useRef, useMemo } from 'react';
import { IconSpark } from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import { filterWordsForPrefs, practiceTypesForItem, RULES } from '../utils/conjugator.js';
import { defaultState, gradeCard, bumpDaily } from '../utils/storage.js';
import { buildMatchPairs, dealTiles } from '../utils/matchGame.js';
import { useApp } from '../state/AppStateContext.jsx';

const PAIR_COUNT = 6;
const MISMATCH_MS = 900;

// Conjugation Match — a tap-based memory/concentration board. Each pair couples a
// word's dictionary form with one of its conjugated forms; flipping the two tiles
// that belong together locks them in. No typing, so it complements Kotoba Rush.
export default function MatchView() {
  const { state, setState, setTab, allWords: verbs, practicePrefs, wordLists } = useApp();
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

  const [tiles, setTiles] = useState([]);
  const [flipped, setFlipped] = useState([]); // tile ids currently face-up, not yet matched
  const [matched, setMatched] = useState(() => new Set());
  const [active, setActive] = useState(false);
  const [finished, setFinished] = useState(false);
  const [locked, setLocked] = useState(false); // brief input lock during a mismatch reveal
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [moves, setMoves] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState(null);
  const flipTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (flipTimer.current) clearTimeout(flipTimer.current);
    };
  }, []);

  // Live elapsed-time ticker while a board is in play.
  useEffect(() => {
    if (!active || finished) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 250);
    return () => clearInterval(id);
  }, [active, finished, startedAt]);

  function deal() {
    const pairs = buildMatchPairs(eligible, state.enabledTypes, practicePrefs, PAIR_COUNT);
    if (pairs.length < 2) {
      setNotice({
        kind: 'bad',
        title: 'Not enough cards',
        detail: 'Current filters have fewer than two enabled conjugation cards.',
      });
      setActive(false);
      return;
    }
    if (flipTimer.current) clearTimeout(flipTimer.current);
    setTiles(dealTiles(pairs));
    setFlipped([]);
    setMatched(new Set());
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setMoves(0);
    setLocked(false);
    setFinished(false);
    setNotice(null);
    setActive(true);
    setStartedAt(Date.now());
    setElapsed(0);
  }

  function matchingRule(item, typeId) {
    return RULES.find((r) => r.type === typeId && r.verbFilter([item]).length);
  }

  // Credit a matched pair to SRS / stats / daily — the same persistence path
  // RushView uses on a correct answer, minus the mistake bookkeeping.
  function recordMatch(pair) {
    setState((s) => {
      const rule = matchingRule(pair.item, pair.type.id);
      const rid = rule?.id || `${pair.item.group}-${pair.type.id}`;
      const dict = pair.item.dict;
      const prevVS = s.verbStats?.[dict]?.[rid] || { seen: 0, incorrect: 0 };
      return {
        ...s,
        cards: { ...s.cards, [rid]: gradeCard(s.cards[rid], true) },
        verbStats: {
          ...(s.verbStats || {}),
          [dict]: {
            ...(s.verbStats?.[dict] || {}),
            [rid]: { seen: prevVS.seen + 1, incorrect: prevVS.incorrect },
          },
        },
        session: {
          ...s.session,
          reviewed: s.session.reviewed + 1,
          correct: s.session.correct + 1,
        },
        daily: bumpDaily(s.daily, true, practicePrefs.dailyGoal || 30),
      };
    });
  }

  function finish(finalScore, bestCombo) {
    setActive(false);
    setFinished(true);
    setState((s) => {
      const prev = s.game || defaultState().game;
      return {
        ...s,
        game: {
          ...prev,
          played: (prev.played || 0) + 1,
          matchBestScore: Math.max(prev.matchBestScore || 0, finalScore),
          matchBestStreak: Math.max(prev.matchBestStreak || 0, bestCombo),
        },
      };
    });
  }

  function flipTile(tile) {
    if (!active || locked || finished) return;
    if (matched.has(tile.pairId)) return;
    if (flipped.includes(tile.id) || flipped.length >= 2) return;

    const nextFlipped = [...flipped, tile.id];
    setFlipped(nextFlipped);
    if (nextFlipped.length < 2) return;

    setMoves((m) => m + 1);
    const [aId, bId] = nextFlipped;
    const a = tiles.find((t) => t.id === aId);
    const b = tiles.find((t) => t.id === bId);

    if (a && b && a.pairId === b.pairId) {
      const nextCombo = combo + 1;
      const gained = 100 + nextCombo * 15;
      const nextScore = score + gained;
      const nextMatched = new Set(matched);
      nextMatched.add(a.pairId);
      setMatched(nextMatched);
      setCombo(nextCombo);
      setMaxCombo((c) => Math.max(c, nextCombo));
      setScore(nextScore);
      setFlipped([]);
      recordMatch(a.pair);
      if (nextMatched.size === tiles.length / 2) {
        const timeSec = Math.floor(elapsed / 1000);
        const bonus = Math.max(0, 500 - moves * 20 - timeSec * 2);
        finish(nextScore + bonus, Math.max(maxCombo, nextCombo));
      }
    } else {
      setCombo(0);
      setLocked(true);
      flipTimer.current = setTimeout(() => {
        setFlipped([]);
        setLocked(false);
      }, MISMATCH_MS);
    }
  }

  const timeLabel = `${String(Math.floor(elapsed / 60000)).padStart(2, '0')}:${String(
    Math.floor((elapsed % 60000) / 1000),
  ).padStart(2, '0')}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Score', value: score },
          { label: 'Combo', value: combo },
          { label: 'Moves', value: moves },
          { label: 'Best', value: game.matchBestScore || 0 },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4"
          >
            <div className="text-2xl font-semibold tabular-nums text-stone-950 dark:text-stone-50">
              {s.value}
            </div>
            <div className="text-xs text-stone-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-medium flex items-center gap-2 text-stone-950 dark:text-stone-50">
              <IconSpark className="w-4 h-4 text-amber-500" />
              Conjugation Match
            </h3>
            <p className="text-xs text-stone-500">
              Pair each word with its conjugated form · {timeLabel} · best streak{' '}
              {game.matchBestStreak || 0}
            </p>
          </div>
          <button
            onClick={deal}
            className="px-3 py-2 bg-stone-800 hover:bg-stone-900 dark:bg-stone-200 dark:hover:bg-stone-150 text-white dark:text-stone-900 rounded-lg text-sm font-medium transition"
          >
            {active || finished ? 'New board' : 'Start'}
          </button>
        </div>

        {!active && !finished && (
          <div className="py-16 text-center">
            {notice ? (
              <div className="inline-block rounded-2xl px-5 py-4 border bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-350 border-rose-200 dark:border-rose-900/50">
                <div className="text-lg font-semibold">{notice.title}</div>
                <div className="text-sm mt-1">{notice.detail}</div>
                {notice.title === 'Not enough cards' && (
                  <button
                    onClick={() => setTab('settings')}
                    className="mt-3 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition"
                  >
                    Go to Settings
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div className="text-3xl font-semibold text-stone-900 dark:text-stone-100">
                  Conjugation Match
                </div>
                <div className="text-sm text-stone-500 mt-2">
                  Flip two tiles to pair a word with its conjugation. {game.matchBestScore || 0} to
                  beat.
                </div>
              </div>
            )}
          </div>
        )}

        {(active || finished) && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
            {tiles.map((tile) => {
              const isMatched = matched.has(tile.pairId);
              const isFlipped = flipped.includes(tile.id);
              const faceUp = isMatched || isFlipped;
              return (
                <button
                  key={tile.id}
                  onClick={() => flipTile(tile)}
                  disabled={!active || isMatched || faceUp || locked}
                  aria-label={faceUp ? undefined : 'Hidden tile'}
                  className={`relative h-24 sm:h-28 rounded-xl border p-2 flex flex-col items-center justify-center text-center transition ${
                    isMatched
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30'
                      : isFlipped
                        ? 'border-indigo-400 dark:border-indigo-600 bg-white dark:bg-stone-950'
                        : 'border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-800 hover:bg-stone-150 dark:hover:bg-stone-750'
                  }`}
                >
                  {faceUp ? (
                    tile.side === 'prompt' ? (
                      <ScriptDisplay
                        view={tile.pair.prompt}
                        colorHighlight={false}
                        className="text-lg sm:text-xl font-semibold text-stone-900 dark:text-stone-100"
                        subClassName="mt-0.5 text-[11px] text-stone-500"
                      />
                    ) : (
                      <>
                        <span className="text-[10px] uppercase tracking-wide text-stone-400 mb-0.5">
                          {tile.pair.type.label}
                        </span>
                        <ScriptDisplay
                          view={tile.pair.answer}
                          word={tile.pair.item}
                          type={tile.pair.type.id}
                          className="text-lg sm:text-xl font-semibold"
                          subClassName="mt-0.5 text-[11px] text-stone-500"
                        />
                      </>
                    )
                  ) : (
                    <IconSpark className="w-5 h-5 text-stone-400 dark:text-stone-600" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {finished && (
          <div className="mt-4 rounded-2xl px-5 py-4 border bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-350 border-emerald-200 dark:border-emerald-900/50 text-center">
            <span role="status" aria-live="polite" className="text-lg font-semibold">
              Board cleared — {score} points in {moves} moves
            </span>
            <div className="text-sm mt-1">Best streak this board: {maxCombo}</div>
          </div>
        )}
      </div>
    </div>
  );
}
