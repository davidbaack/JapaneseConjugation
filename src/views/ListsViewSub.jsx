import React, { useState, useEffect, useMemo, useRef } from 'react';
import { IconPlus, IconSpark } from '../components/Icons.jsx';
import { searchWords } from './ReferenceViewSub.jsx';
import { isAdjective, wordKey, normalizeJlptLevel, getWordMeta } from '../utils/conjugator.js';
import { GROUP_NAMES } from '../utils/conjugatorExplain.js';
import { callGemini, aiSystemFromPrefs, parseScannerAIWords } from '../utils/gemini.js';
import { VOCAB_PACKS, AI_LIST_TARGETS } from '../data/vocabPacks.js';

export function addUniqueWord(list, word) {
  return list.some((w) => w.dict === word.dict && w.group === word.group) ? list : [...list, word];
}

const LEVEL_ORDER = ['N5', 'N4', 'N3', 'N2', 'N1'];

export function wordsForList(list, words) {
  if (!list) return [];
  const byKey = new Map(words.map((w) => [wordKey(w), w]));
  return (list.wordKeys || []).map((k) => byKey.get(k)).filter(Boolean);
}

export default function ListsViewSub({
  words,
  customVerbs,
  setCustomVerbs,
  customAdjectives,
  setCustomAdjectives,
  wordLists,
  setWordLists,
  practicePrefs,
  setPracticePrefs,
  geminiKey,
}) {
  const [name, setName] = useState('');
  const [activeId, setActiveId] = useState(wordLists[0]?.id || '');
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState('');
  const [aiTarget, setAiTarget] = useState('N5');
  const [aiTopic, setAiTopic] = useState('daily life');
  const [aiCount, setAiCount] = useState(10);
  const [aiRows, setAiRows] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const aiAbortRef = useRef(null);
  const active = wordLists.find((l) => l.id === activeId) || wordLists[0] || null;

  useEffect(() => {
    return () => {
      aiAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!activeId && wordLists[0]) setActiveId(wordLists[0].id);
    if (activeId && !wordLists.some((l) => l.id === activeId)) setActiveId(wordLists[0]?.id || '');
  }, [wordLists, activeId]);

  const activeKeys = new Set(active?.wordKeys || []);
  const matches = useMemo(() => searchWords(query, words).slice(0, 120), [query, words]);
  const resolvedListCounts = useMemo(
    () => new Map(wordLists.map((list) => [list.id, wordsForList(list, words).length])),
    [wordLists, words],
  );
  const selectedIds = practicePrefs.wordListIds || [];

  const packGroups = useMemo(() => {
    const map = new Map();
    for (const pack of VOCAB_PACKS) {
      const lvl = pack.level || 'Other';
      if (!map.has(lvl)) map.set(lvl, []);
      map.get(lvl).push(pack);
    }
    return [...map.entries()].sort(
      (a, b) => (LEVEL_ORDER.indexOf(a[0]) + 1 || 99) - (LEVEL_ORDER.indexOf(b[0]) + 1 || 99),
    );
  }, []);

  function createList() {
    const n = name.trim() || `List ${wordLists.length + 1}`;
    const l = { id: 'list-' + Date.now().toString(36), name: n, wordKeys: [] };
    setWordLists([...wordLists, l]);
    setActiveId(l.id);
    setName('');
  }

  function deleteList(id) {
    setWordLists(wordLists.filter((l) => l.id !== id));
    setPracticePrefs({ ...practicePrefs, wordListIds: selectedIds.filter((x) => x !== id) });
  }

  function toggleActiveFilter(id) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    setPracticePrefs({ ...practicePrefs, wordListIds: next });
  }

  function toggleWord(word) {
    if (!active) return;
    const key = wordKey(word);
    const next = activeKeys.has(key)
      ? active.wordKeys.filter((k) => k !== key)
      : [...(active.wordKeys || []), key];
    setWordLists(wordLists.map((l) => (l.id === active.id ? { ...l, wordKeys: next } : l)));
  }

  function importPacks(packs) {
    if (!packs.length) return [];
    let verbs = customVerbs,
      adjs = customAdjectives;
    let nextLists = [...wordLists];
    const existingWordKeys = new Set(words.map(wordKey));
    const enableIds = [];
    for (const pack of packs) {
      const id = 'pack-' + pack.id;
      const existing = nextLists.find((l) => l.id === id);
      const keys = new Set(existing?.wordKeys || []);
      const packWords = pack.words.map((w) => ({
        ...w,
        jlpt: normalizeJlptLevel(w.jlpt) || normalizeJlptLevel(pack.level) || getWordMeta(w).jlpt,
      }));
      for (const w of packWords) {
        if (!existingWordKeys.has(wordKey(w))) {
          if (isAdjective(w)) adjs = addUniqueWord(adjs, w);
          else verbs = addUniqueWord(verbs, w);
        }
        keys.add(wordKey(w));
      }
      if (existing) {
        nextLists = nextLists.map((l) =>
          l.id === id ? { ...l, name: pack.name, wordKeys: [...keys] } : l,
        );
      } else {
        nextLists = [...nextLists, { id, name: pack.name, wordKeys: [...keys] }];
      }
      enableIds.push(id);
    }
    setCustomVerbs(verbs);
    setCustomAdjectives(adjs);
    setWordLists(nextLists);
    const merged = [...new Set([...selectedIds, ...enableIds])];
    setPracticePrefs({ ...practicePrefs, wordListIds: merged });
    return enableIds;
  }

  function importPack(pack) {
    const [id] = importPacks([pack]);
    if (id) setActiveId(id);
    setMsg(`Imported ${pack.words.length} words from ${pack.name}.`);
  }

  function enableGroup(level, packs) {
    importPacks(packs);
    setMsg(`Enabled ${packs.length} ${level} pack${packs.length === 1 ? '' : 's'} for drills.`);
  }

  function disableGroup(level, packs) {
    const ids = new Set(packs.map((p) => 'pack-' + p.id));
    setPracticePrefs({ ...practicePrefs, wordListIds: selectedIds.filter((x) => !ids.has(x)) });
    setMsg(`Disabled ${packs.length} ${level} pack${packs.length === 1 ? '' : 's'}. Lists kept.`);
  }

  async function generateAIList() {
    if (!geminiKey) return;
    if (aiLoading) {
      aiAbortRef.current?.abort();
      aiAbortRef.current = null;
      setAiLoading(false);
      return;
    }
    const controller = new AbortController();
    aiAbortRef.current = controller;
    const count = Math.max(5, Math.min(24, Number(aiCount) || 10));
    const activeSeen = new Set(active?.wordKeys || []);
    const avoid = words
      .filter((w) => activeSeen.has(wordKey(w)))
      .slice(0, 80)
      .map((w) => `${w.dict} (${w.reading}, ${GROUP_NAMES[w.group] || w.group})`)
      .join(', ');
    setAiLoading(true);
    setAiErr('');
    setAiRows([]);
    setMsg('');
    try {
      const prompt = `Build a targeted Japanese conjugation drill list.\n\nTarget level/course: ${aiTarget}\nTopic or situation: ${aiTopic || 'general daily life'}\nDesired size: ${count} words\nAvoid words already in the active list when possible: ${avoid || 'none'}\n\nReturn ONLY JSON with this exact shape:\n{"words":[{"dict":"Japanese dictionary form or adjective stem","reading":"hiragana only","meaning":"short English meaning","group":"ichidan|godan|suru|kuru|i-adjective|na-adjective","jlpt":"N5|N4|N3|N2|N1","reason":"why this is useful for conjugation practice"}]}\n\nUse real, common learner-appropriate words. Mix verbs and adjectives. Prefer words that exercise different conjugation patterns. JLPT labels are community estimates, so be practical instead of pretending official certainty.`;
      const reply = await callGemini(
        [{ role: 'user', parts: [{ text: prompt }] }],
        geminiKey,
        1800,
        0.25,
        aiSystemFromPrefs(
          practicePrefs,
          'You create accurate Japanese study lists for conjugation practice. Return valid JSON only. Do not invent readings or impossible groups.',
        ),
      );
      const rows = parseScannerAIWords(reply).slice(0, count);
      if (!rows.length) throw new Error('AI did not return valid verb/adjective rows.');
      if (!controller.signal.aborted) setAiRows(rows);
    } catch (e) {
      if (!controller.signal.aborted) setAiErr(e.message || 'AI list generation failed.');
    }
    if (!controller.signal.aborted) setAiLoading(false);
    aiAbortRef.current = null;
  }

  function addAIRowsToList() {
    if (!aiRows.length) return;
    const id = active?.id || `ai-list-${Date.now().toString(36)}`;
    const listName = active?.name || `AI ${aiTarget} ${aiTopic || 'practice'}`.trim();
    const seed = active || { id, name: listName, wordKeys: [] };
    let nextLists = active ? wordLists : [...wordLists, seed];
    let verbs = customVerbs,
      adjs = customAdjectives,
      keys = new Set(seed.wordKeys || []);
    const existingWordKeys = new Set(words.map(wordKey));
    for (const row of aiRows) {
      const key = wordKey(row);
      if (!existingWordKeys.has(key)) {
        if (isAdjective(row)) adjs = addUniqueWord(adjs, row);
        else verbs = addUniqueWord(verbs, row);
      }
      keys.add(key);
    }
    nextLists = nextLists.map((l) =>
      l.id === id ? { ...l, name: listName, wordKeys: [...keys] } : l,
    );
    setCustomVerbs(verbs);
    setCustomAdjectives(adjs);
    setWordLists(nextLists);
    setActiveId(id);
    if (!selectedIds.includes(id)) {
      setPracticePrefs({ ...practicePrefs, wordListIds: [...selectedIds, id] });
    }
    setMsg(
      `Added ${aiRows.length} AI word${aiRows.length === 1 ? '' : 's'} to ${listName} and enabled it for drills.`,
    );
    setAiRows([]);
  }

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-4">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden">
        <div className="p-4 border-b border-stone-100 dark:border-stone-800">
          <h3 className="font-medium mb-3 text-stone-805 dark:text-stone-200">Study lists</h3>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createList();
              }}
              placeholder="New list name"
              aria-label="New list name"
              className="min-w-0 flex-1 px-3 py-2 text-sm border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
            />
            <button
              onClick={createList}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
            >
              <IconPlus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="divide-y divide-stone-50 dark:divide-stone-850">
          {wordLists.length === 0 ? (
            <div className="p-6 text-sm text-stone-500">
              Create a list to scope drills or collect textbook vocabulary.
            </div>
          ) : (
            wordLists.map((l) => (
              <div
                key={l.id}
                className={`p-3 ${active?.id === l.id ? 'bg-indigo-50 dark:bg-indigo-950/20' : 'bg-white dark:bg-stone-900'}`}
              >
                <button onClick={() => setActiveId(l.id)} className="w-full text-left">
                  <div className="font-medium text-stone-805 dark:text-stone-200">{l.name}</div>
                  <div className="text-xs text-stone-500">
                    {resolvedListCounts.get(l.id) || 0} words
                  </div>
                </button>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => toggleActiveFilter(l.id)}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs border ${
                      selectedIds.includes(l.id)
                        ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                        : 'border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-850'
                    }`}
                  >
                    {selectedIds.includes(l.id) ? 'In drill' : 'Use in drill'}
                  </button>
                  <button
                    onClick={() => deleteList(l.id)}
                    className="px-2 py-1.5 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="space-y-4">
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <h3 className="font-medium mb-1 text-stone-800 dark:text-stone-200">Built-in packs</h3>
          <p className="text-xs text-stone-500 mb-3">
            Seed drills with curated JLPT-style packs, then edit them as normal lists. Enable or
            disable a whole level at once.
          </p>
          <div className="space-y-4">
            {packGroups.map(([level, packs]) => {
              const activeCount = packs.filter((p) => selectedIds.includes('pack-' + p.id)).length;
              const allActive = activeCount === packs.length;
              return (
                <div key={level}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-stone-700 dark:text-stone-300">
                        JLPT {level}
                      </span>
                      <span className="text-[11px] text-stone-400">
                        {activeCount}/{packs.length} in drills
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        allActive ? disableGroup(level, packs) : enableGroup(level, packs)
                      }
                      className={`px-2.5 py-1 rounded-lg text-xs border ${
                        allActive
                          ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                          : 'border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-850'
                      }`}
                    >
                      {allActive ? 'Disable all' : 'Enable all'}
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {packs.map((pack) => {
                      const inDrill = selectedIds.includes('pack-' + pack.id);
                      return (
                        <div
                          key={pack.id}
                          className="border border-stone-200 dark:border-stone-800 rounded-xl p-3 bg-white dark:bg-stone-950"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-medium text-sm text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                                {pack.name}
                                {inDrill && (
                                  <span
                                    className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"
                                    aria-label="In drill"
                                    title="In drill"
                                  />
                                )}
                              </div>
                              <div className="text-xs text-stone-500 mt-0.5">{pack.desc}</div>
                              <div className="text-[11px] text-stone-400 mt-1">
                                {pack.words.length} words{inDrill ? ' · in drill' : ''}
                              </div>
                            </div>
                            <button
                              onClick={() => importPack(pack)}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs"
                            >
                              Import
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="font-medium flex items-center gap-2 text-stone-800 dark:text-stone-200">
                <IconSpark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                AI list builder
              </h3>
              <p className="text-xs text-stone-500">
                Generate a focused drill pack by level, textbook lane, or real-life situation.
              </p>
            </div>
            <button
              onClick={generateAIList}
              disabled={!geminiKey}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-medium text-sm"
            >
              {aiLoading ? 'Cancel' : 'Build pack'}
            </button>
          </div>
          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <div>
              <label className="text-xs text-stone-500 block mb-1">Target</label>
              <div className="flex flex-wrap gap-1.5">
                {AI_LIST_TARGETS.map((target) => (
                  <button
                    key={target}
                    onClick={() => setAiTarget(target)}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs transition ${
                      aiTarget === target
                        ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                        : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                    }`}
                  >
                    {target}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">Words</label>
              <input
                type="number"
                min="5"
                max="24"
                value={aiCount}
                onChange={(e) => setAiCount(e.target.value)}
                className="w-24 px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs text-stone-500 block mb-1">Topic</label>
            <input
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              placeholder="daily life, travel, restaurant, Genki lesson 7..."
              className="w-full px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>
          {!geminiKey && (
            <div className="mt-2 text-xs text-stone-400">
              Gemini is not configured for custom drill packs.
            </div>
          )}
          {aiErr && <div className="mt-2 text-sm text-rose-600">{aiErr}</div>}
          {!!aiRows.length && (
            <div className="mt-3 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-stone-50 dark:bg-stone-950 border-b border-stone-200 dark:border-stone-800">
                <div className="text-xs uppercase tracking-wider text-stone-500">
                  {aiRows.length} generated words
                </div>
                <button
                  onClick={addAIRowsToList}
                  className="px-3 py-1.5 bg-stone-800 dark:bg-stone-700 hover:bg-stone-900 text-white rounded-lg text-xs font-medium"
                >
                  Add to {active?.name || 'new list'}
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800 bg-white dark:bg-stone-950">
                {aiRows.map((row) => (
                  <div
                    key={wordKey(row)}
                    className="px-3 py-2 grid sm:grid-cols-[1fr_auto] gap-1.5 text-sm"
                  >
                    <div>
                      <span className="font-medium text-stone-800 dark:text-stone-200" lang="ja">
                        {row.dict}
                      </span>
                      {row.dict !== row.reading && (
                        <span className="ml-2 text-stone-500" lang="ja">
                          {row.reading}
                        </span>
                      )}
                      <div className="text-xs text-stone-500">{row.meaning}</div>
                    </div>
                    <div className="text-xs text-stone-400 sm:text-right">
                      {GROUP_NAMES[row.group] || row.group}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="font-medium text-stone-800 dark:text-stone-200">
                {active ? active.name : 'No list selected'}
              </h3>
              <p className="text-xs text-stone-500">
                Add starter/custom words, then enable lists as drill scopes.
              </p>
            </div>
            {selectedIds.length > 0 && (
              <button
                onClick={() => setPracticePrefs({ ...practicePrefs, wordListIds: [] })}
                className="text-xs text-stone-400 hover:text-stone-700"
              >
                Clear list filter
              </button>
            )}
          </div>
          <div role="status" aria-live="polite">
            {msg && <div className="mt-2 text-sm text-stone-605 dark:text-stone-350">{msg}</div>}
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search words or conjugated forms"
            className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
            autoCorrect="off"
            spellCheck="false"
          />
          <div className="mt-3 max-h-72 overflow-y-auto grid sm:grid-cols-2 gap-2">
            {matches.map((w) => (
              <button
                key={wordKey(w)}
                disabled={!active}
                onClick={() => toggleWord(w)}
                className={`text-left px-3 py-2 rounded-xl border transition ${
                  activeKeys.has(wordKey(w))
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 text-stone-800 dark:text-stone-200'
                    : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 hover:border-indigo-300 dark:hover:border-indigo-900 text-stone-800 dark:text-stone-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium" lang="ja">
                    {w.dict}
                  </span>
                  <span className="text-[11px] text-stone-400">
                    {isAdjective(w) ? 'adj' : 'verb'}
                  </span>
                </div>
                <div className="text-xs text-stone-500" lang="ja">
                  {w.reading}
                </div>
                <div className="text-xs text-stone-400 truncate">{w.meaning}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
