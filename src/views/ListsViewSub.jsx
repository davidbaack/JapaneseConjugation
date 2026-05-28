import React, { useState, useEffect, useMemo } from 'react';
import { IconPlus, IconSpark } from '../components/Icons.jsx';
import { searchWords } from './ReferenceViewSub.jsx';
import {
  isAdjective,
  wordKey,
  normalizeJlptLevel,
  getWordMeta,
  compatibleTypes,
  conjugateItem,
  surfaceFormFor,
  explainItem,
  GROUP_NAMES
} from '../utils/conjugator.js';
import { toHiragana, isAllKana } from '../utils/romaji.js';
import { callGemini, aiSystemFromPrefs, normalizeGroup, parseScannerAIWords } from '../utils/gemini.js';
import { VOCAB_PACKS, AI_LIST_TARGETS } from '../data/vocabPacks.js';

// Helper functions for CSV/TSV export and imports
export function parseWordRows(text) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const cols = line.split(/\t|,/).map(c => c.trim()).filter(Boolean);
    if (cols.length < 4) return null;
    const groupText = cols[3].toLowerCase();
    const group = normalizeGroup(cols[3]) || (groupText.includes('i-adjective') || groupText.includes('i-adj') || cols[3].includes('い') ? 'i-adjective' : groupText.includes('na-adjective') || groupText.includes('na-adj') || cols[3].includes('な') ? 'na-adjective' : null);
    if (!group) return null;
    const reading = toHiragana(cols[1]);
    if (!isAllKana(reading)) return null;
    const jlpt = normalizeJlptLevel(cols[5] || cols[4]);
    const lesson = Number(cols[6] || '') || null;
    return { dict: cols[0], reading, meaning: cols[2], group, ...(jlpt ? { jlpt } : {}), ...(lesson ? { lesson } : {}) };
  }).filter(Boolean);
}

export function addUniqueWord(list, word) {
  return list.some(w => w.dict === word.dict && w.group === word.group) ? list : [...list, word];
}

export function sanitizeExportName(name = 'katachiya') {
  return String(name || 'katachiya').normalize('NFKC').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'katachiya';
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function tsvCell(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\t/g, ' ').trim();
}

function ankiTag(value) {
  return sanitizeExportName(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'katachiya';
}

export function wordsForList(list, words) {
  if (!list) return [];
  const byKey = new Map(words.map(w => [wordKey(w), w]));
  return (list.wordKeys || []).map(k => byKey.get(k)).filter(Boolean);
}

export function buildVocabularyCsv(list, words) {
  const rows = [['dictionary', 'reading', 'meaning', 'group', 'kind', 'jlpt', 'genki_lesson', 'list']];
  for (const word of wordsForList(list, words)) {
    const meta = getWordMeta(word);
    rows.push([word.dict, word.reading, word.meaning, word.group, isAdjective(word) ? 'adjective' : 'verb', meta.jlpt || '', meta.lesson || '', list.name || 'Study list']);
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

export function buildConjugationAnkiTsv(list, words) {
  const name = list?.name || 'Study list';
  const rows = [
    '#separator:Tab',
    '#html:false',
    `#deck:Katachiya::${tsvCell(name)}`,
    `#tags:katachiya ${ankiTag(name)}`,
    ['Prompt', 'Answer', 'Base', 'Reading', 'Meaning', 'Group', 'Form', 'Rule', 'Tags'].join('\t')
  ];
  for (const word of wordsForList(list, words)) {
    for (const type of compatibleTypes(word)) {
      const answer = surfaceFormFor(word, type.id) || conjugateItem(word, type.id);
      if (!answer) continue;
      const explanation = explainItem(word, type.id);
      const prompt = `Conjugate ${word.dict} (${word.reading}) to ${type.label}.`;
      const tags = `katachiya ${ankiTag(name)} ${ankiTag(word.group)} ${ankiTag(type.id)}`;
      rows.push([prompt, answer, word.dict, word.reading, word.meaning, GROUP_NAMES[word.group] || word.group, type.label, explanation.rule || '', tags].map(tsvCell).join('\t'));
    }
  }
  return rows.join('\n') + '\n';
}

export function downloadTextFile(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  geminiKey
}) {
  const [name, setName] = useState('');
  const [activeId, setActiveId] = useState(wordLists[0]?.id || '');
  const [query, setQuery] = useState('');
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');
  const [aiTarget, setAiTarget] = useState('N5');
  const [aiTopic, setAiTopic] = useState('daily life');
  const [aiCount, setAiCount] = useState(10);
  const [aiRows, setAiRows] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const active = wordLists.find(l => l.id === activeId) || wordLists[0] || null;

  useEffect(() => {
    if (!activeId && wordLists[0]) setActiveId(wordLists[0].id);
    if (activeId && !wordLists.some(l => l.id === activeId)) setActiveId(wordLists[0]?.id || '');
  }, [wordLists, activeId]);

  const activeKeys = new Set(active?.wordKeys || []);
  const matches = useMemo(() => searchWords(query, words).slice(0, 120), [query, words]);
  const activeWords = useMemo(() => wordsForList(active, words), [active, words]);
  const selectedIds = practicePrefs.wordListIds || [];

  function createList() {
    const n = name.trim() || `List ${wordLists.length + 1}`;
    const l = { id: 'list-' + Date.now().toString(36), name: n, wordKeys: [] };
    setWordLists([...wordLists, l]);
    setActiveId(l.id);
    setName('');
  }

  function deleteList(id) {
    setWordLists(wordLists.filter(l => l.id !== id));
    setPracticePrefs({ ...practicePrefs, wordListIds: selectedIds.filter(x => x !== id) });
  }

  function toggleActiveFilter(id) {
    const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id];
    setPracticePrefs({ ...practicePrefs, wordListIds: next });
  }

  function toggleWord(word) {
    if (!active) return;
    const key = wordKey(word);
    const next = activeKeys.has(key) ? active.wordKeys.filter(k => k !== key) : [...(active.wordKeys || []), key];
    setWordLists(wordLists.map(l => l.id === active.id ? { ...l, wordKeys: next } : l));
  }

  function importRows() {
    if (!active) return;
    const rows = parseWordRows(importText);
    if (!rows.length) {
      setMsg('No valid rows found. Use dict,reading,meaning,group.');
      return;
    }
    let verbs = customVerbs, adjs = customAdjectives, keys = new Set(active.wordKeys || []);
    for (const r of rows) {
      if (isAdjective(r)) adjs = addUniqueWord(adjs, r);
      else verbs = addUniqueWord(verbs, r);
      keys.add(wordKey(r));
    }
    setCustomVerbs(verbs);
    setCustomAdjectives(adjs);
    setWordLists(wordLists.map(l => l.id === active.id ? { ...l, wordKeys: [...keys] } : l));
    setImportText('');
    setMsg(`Imported ${rows.length} row${rows.length === 1 ? '' : 's'} into ${active.name}.`);
  }

  function importPack(pack) {
    let list = wordLists.find(l => l.id === 'pack-' + pack.id);
    const id = list?.id || 'pack-' + pack.id;
    let verbs = customVerbs, adjs = customAdjectives, keys = new Set(list?.wordKeys || []);
    const packWords = pack.words.map(w => ({ ...w, jlpt: normalizeJlptLevel(w.jlpt) || normalizeJlptLevel(pack.level) || getWordMeta(w).jlpt }));
    for (const w of packWords) {
      if (isAdjective(w)) adjs = addUniqueWord(adjs, w);
      else verbs = addUniqueWord(verbs, w);
      keys.add(wordKey(w));
    }
    if (list) {
      setWordLists(wordLists.map(l => l.id === id ? { ...l, name: pack.name, wordKeys: [...keys] } : l));
    } else {
      setWordLists([...wordLists, { id, name: pack.name, wordKeys: [...keys] }]);
    }
    setCustomVerbs(verbs);
    setCustomAdjectives(adjs);
    setActiveId(id);
    if (!selectedIds.includes(id)) {
      setPracticePrefs({ ...practicePrefs, wordListIds: [...selectedIds, id] });
    }
    setMsg(`Imported ${packWords.length} words from ${pack.name}.`);
  }

  async function generateAIList() {
    if (!geminiKey) return;
    const count = Math.max(5, Math.min(24, Number(aiCount) || 10));
    const activeSeen = new Set(active?.wordKeys || []);
    const avoid = words.filter(w => activeSeen.has(wordKey(w))).slice(0, 80).map(w => `${w.dict} (${w.reading}, ${GROUP_NAMES[w.group] || w.group})`).join(', ');
    setAiLoading(true);
    setAiErr('');
    setAiRows([]);
    setMsg('');
    try {
      const prompt = `Build a targeted Japanese conjugation drill list.\n\nTarget level/course: ${aiTarget}\nTopic or situation: ${aiTopic || 'general daily life'}\nDesired size: ${count} words\nAvoid words already in the active list when possible: ${avoid || 'none'}\n\nReturn ONLY JSON with this exact shape:\n{"words":[{"dict":"Japanese dictionary form or adjective stem","reading":"hiragana only","meaning":"short English meaning","group":"ichidan|godan|suru|kuru|i-adjective|na-adjective","jlpt":"N5|N4|N3|N2|N1","reason":"why this is useful for conjugation practice"}]}\n\nUse real, common learner-appropriate words. Mix verbs and adjectives when useful. Prefer words that exercise different conjugation patterns. JLPT labels are community estimates, so be practical instead of pretending official certainty.`;
      const reply = await callGemini([{ role: 'user', parts: [{ text: prompt }] }], geminiKey, 1800, 0.25, aiSystemFromPrefs(practicePrefs, 'You create accurate Japanese study lists for conjugation practice. Return valid JSON only. Do not invent readings or impossible groups.'));
      const rows = parseScannerAIWords(reply).slice(0, count);
      if (!rows.length) throw new Error('AI did not return valid verb/adjective rows.');
      setAiRows(rows);
    } catch (e) {
      setAiErr(e.message || 'AI list generation failed.');
    }
    setAiLoading(false);
  }

  function addAIRowsToList() {
    if (!aiRows.length) return;
    const id = active?.id || `ai-list-${Date.now().toString(36)}`;
    const listName = active?.name || `AI ${aiTarget} ${aiTopic || 'practice'}`.trim();
    const seed = active || { id, name: listName, wordKeys: [] };
    let nextLists = active ? wordLists : [...wordLists, seed];
    let verbs = customVerbs, adjs = customAdjectives, keys = new Set(seed.wordKeys || []);
    const existingWordKeys = new Set(words.map(wordKey));
    for (const row of aiRows) {
      const key = wordKey(row);
      if (!existingWordKeys.has(key)) {
        if (isAdjective(row)) adjs = addUniqueWord(adjs, row);
        else verbs = addUniqueWord(verbs, row);
      }
      keys.add(key);
    }
    nextLists = nextLists.map(l => l.id === id ? { ...l, name: listName, wordKeys: [...keys] } : l);
    setCustomVerbs(verbs);
    setCustomAdjectives(adjs);
    setWordLists(nextLists);
    setActiveId(id);
    if (!selectedIds.includes(id)) {
      setPracticePrefs({ ...practicePrefs, wordListIds: [...selectedIds, id] });
    }
    setMsg(`Added ${aiRows.length} AI word${aiRows.length === 1 ? '' : 's'} to ${listName} and enabled it for drills.`);
    setAiRows([]);
  }

  function exportVocabulary() {
    if (!active || !activeWords.length) {
      setMsg('Choose a list with words before exporting.');
      return;
    }
    downloadTextFile(`katachiya-${sanitizeExportName(active.name)}-vocab.csv`, buildVocabularyCsv(active, words), 'text/csv;charset=utf-8');
    setMsg(`Exported ${activeWords.length} vocab row${activeWords.length === 1 ? '' : 's'} from ${active.name}.`);
  }

  function exportAnki() {
    if (!active || !activeWords.length) {
      setMsg('Choose a list with words before exporting.');
      return;
    }
    const cardCount = activeWords.reduce((sum, w) => sum + compatibleTypes(w).filter(t => !!conjugateItem(w, t.id)).length, 0);
    downloadTextFile(`katachiya-${sanitizeExportName(active.name)}-anki.txt`, buildConjugationAnkiTsv(active, words), 'text/plain;charset=utf-8');
    setMsg(`Exported ${cardCount} Anki drill row${cardCount === 1 ? '' : 's'} from ${active.name}.`);
  }

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-4">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden">
        <div className="p-4 border-b border-stone-100 dark:border-stone-800">
          <h3 className="font-medium mb-3 text-stone-805 dark:text-stone-200">Study lists</h3>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createList(); }}
              placeholder="New list name"
              className="min-w-0 flex-1 px-3 py-2 text-sm border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
            />
            <button onClick={createList} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">
              <IconPlus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="divide-y divide-stone-50 dark:divide-stone-850">
          {wordLists.length === 0 ? (
            <div className="p-6 text-sm text-stone-500">Create a list to scope drills or collect textbook vocabulary.</div>
          ) : (
            wordLists.map(l => (
              <div key={l.id} className={`p-3 ${active?.id === l.id ? 'bg-indigo-50 dark:bg-indigo-950/20' : 'bg-white dark:bg-stone-900'}`}>
                <button onClick={() => setActiveId(l.id)} className="w-full text-left">
                  <div className="font-medium text-stone-805 dark:text-stone-200">{l.name}</div>
                  <div className="text-xs text-stone-500">{(l.wordKeys || []).length} words</div>
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
          <p className="text-xs text-stone-500 mb-3">Seed drills with curated JLPT-style packs, then edit them as normal lists.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {VOCAB_PACKS.map(pack => (
              <div key={pack.id} className="border border-stone-200 dark:border-stone-800 rounded-xl p-3 bg-white dark:bg-stone-950">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm text-stone-800 dark:text-stone-200">{pack.name}</div>
                    <div className="text-xs text-stone-500 mt-0.5">{pack.desc}</div>
                    <div className="text-[11px] text-stone-400 mt-1">{pack.level ? `JLPT ${pack.level} · ` : ''}{pack.words.length} words</div>
                  </div>
                  <button onClick={() => importPack(pack)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs">Import</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="font-medium flex items-center gap-2 text-stone-800 dark:text-stone-200">
                <IconSpark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                AI list builder
              </h3>
              <p className="text-xs text-stone-500">Generate a focused drill pack by level, textbook lane, or real-life situation.</p>
            </div>
            <button
              onClick={generateAIList}
              disabled={!geminiKey || aiLoading}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-medium text-sm"
            >
              {aiLoading ? 'Building...' : 'Build pack'}
            </button>
          </div>
          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <div>
              <label className="text-xs text-stone-500 block mb-1">Target</label>
              <div className="flex flex-wrap gap-1.5">
                {AI_LIST_TARGETS.map(target => (
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
                onChange={e => setAiCount(e.target.value)}
                className="w-24 px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs text-stone-500 block mb-1">Topic</label>
            <input
              value={aiTopic}
              onChange={e => setAiTopic(e.target.value)}
              placeholder="daily life, travel, restaurant, Genki lesson 7..."
              className="w-full px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>
          {!geminiKey && <div className="mt-2 text-xs text-stone-400">Add a Gemini key in Settings to generate custom drill packs.</div>}
          {aiErr && <div className="mt-2 text-sm text-rose-600">{aiErr}</div>}
          {!!aiRows.length && (
            <div className="mt-3 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-stone-50 dark:bg-stone-950 border-b border-stone-200 dark:border-stone-800">
                <div className="text-xs uppercase tracking-wider text-stone-500">{aiRows.length} generated words</div>
                <button onClick={addAIRowsToList} className="px-3 py-1.5 bg-stone-800 dark:bg-stone-700 hover:bg-stone-900 text-white rounded-lg text-xs font-medium">Add to {active?.name || 'new list'}</button>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800 bg-white dark:bg-stone-950">
                {aiRows.map(row => (
                  <div key={wordKey(row)} className="px-3 py-2 grid sm:grid-cols-[1fr_auto] gap-1.5 text-sm">
                    <div>
                      <span className="font-medium text-stone-800 dark:text-stone-200" lang="ja">{row.dict}</span>
                      {row.dict !== row.reading && <span className="ml-2 text-stone-500" lang="ja">{row.reading}</span>}
                      <div className="text-xs text-stone-500">{row.meaning}</div>
                    </div>
                    <div className="text-xs text-stone-400 sm:text-right">{GROUP_NAMES[row.group] || row.group}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="font-medium text-stone-800 dark:text-stone-200">{active ? active.name : 'No list selected'}</h3>
              <p className="text-xs text-stone-500">Add starter/custom words, then enable lists as drill scopes.</p>
            </div>
            {selectedIds.length > 0 && <button onClick={() => setPracticePrefs({ ...practicePrefs, wordListIds: [] })} className="text-xs text-stone-400 hover:text-stone-700">Clear list filter</button>}
          </div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search words or conjugated forms"
            className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
            autoCorrect="off"
            spellCheck="false"
          />
          <div className="mt-3 max-h-72 overflow-y-auto grid sm:grid-cols-2 gap-2">
            {matches.map(w => (
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
                  <span className="font-medium" lang="ja">{w.dict}</span>
                  <span className="text-[11px] text-stone-400">{isAdjective(w) ? 'adj' : 'verb'}</span>
                </div>
                <div className="text-xs text-stone-500" lang="ja">{w.reading}</div>
                <div className="text-xs text-stone-400 truncate">{w.meaning}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="font-medium text-stone-800 dark:text-stone-200">Export active list</h3>
              <p className="text-xs text-stone-500">{active ? `${activeWords.length} resolved word${activeWords.length === 1 ? '' : 's'}` : 'No list selected'}</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <button onClick={exportAnki} disabled={!activeWords.length} className="px-3 py-2 bg-stone-800 dark:bg-stone-700 hover:bg-stone-900 disabled:opacity-40 text-white rounded-xl font-medium text-sm">Anki TSV</button>
            <button onClick={exportVocabulary} disabled={!activeWords.length} className="px-3 py-2 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-950 disabled:opacity-40 rounded-xl font-medium text-sm">Vocab CSV</button>
          </div>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <h3 className="font-medium mb-1 text-stone-800 dark:text-stone-200">Bulk import into list</h3>
          <p className="text-xs text-stone-500 mb-3">Paste CSV/TSV rows: dictionary, reading, meaning, group. Groups: ichidan, godan, suru, kuru, i-adjective, na-adjective.</p>
          <textarea
            value={importText}
            onChange={e => { setImportText(e.target.value); setMsg(''); }}
            placeholder={"始める,はじめる,to begin,ichidan\n有名,ゆうめい,famous,na-adjective"}
            className="w-full h-28 px-3 py-2 text-sm font-mono border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
            autoCorrect="off"
            spellCheck="false"
          />
          {msg && <div className="mt-2 text-sm text-stone-605 dark:text-stone-350">{msg}</div>}
          <button onClick={importRows} disabled={!active || !importText.trim()} className="w-full mt-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-medium">Import rows</button>
        </div>
      </div>
    </div>
  );
}
