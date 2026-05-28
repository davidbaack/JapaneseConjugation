import React, { useState, useEffect, useRef, useMemo } from 'react';
import { IconPlus, IconTrash } from '../components/Icons.jsx';
import { STARTER_VERBS, STARTER_ADJECTIVES } from '../data/starterWords.js';
import { toHiragana, isAllKana } from '../utils/romaji.js';
import { getSuggestedWord, lookupWordWithGemini } from '../utils/gemini.js';

export default function CustomDictionaryViewSub({
  customVerbs,
  setCustomVerbs,
  customAdjectives,
  setCustomAdjectives,
  geminiKey,
  state
}) {
  const [dictTab, setDictTab] = useState('verbs');
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  const [addPhase, setAddPhase] = useState('idle');
  const [suggestion, setSuggestion] = useState(null);
  const [addError, setAddError] = useState('');
  const [mf, setMf] = useState({ dict: '', reading: '', meaning: '', group: 'ichidan' });
  const [mErr, setMErr] = useState('');
  const [sugg, setSugg] = useState(null);
  const [suggLoading, setSuggLoading] = useState(false);
  const [suggErr, setSuggErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const suggGen = useRef(0);

  const isAdj = dictTab === 'adjectives';
  const starterWords = isAdj ? STARTER_ADJECTIVES : STARTER_VERBS;
  const customWords = isAdj ? customAdjectives : customVerbs;
  const setCustomWords = isAdj ? setCustomAdjectives : setCustomVerbs;
  const allWords = useMemo(() => [...starterWords, ...customWords], [customWords, starterWords]);

  async function fetchSugg(wordsList) {
    if (!geminiKey) return;
    const gen = ++suggGen.current;
    const wlist = wordsList || allWords;
    setSuggLoading(true);
    setSuggErr('');
    setSugg(null);
    try {
      const r = await getSuggestedWord(wlist, geminiKey, isAdj);
      if (gen !== suggGen.current) return;
      if (wlist.some(v => v.dict === r.dict)) {
        setSuggErr('Suggestion was already in your list — try again');
        return;
      }
      setSugg(r);
    } catch (e) {
      if (gen === suggGen.current) setSuggErr(e.message);
    } finally {
      if (gen === suggGen.current) setSuggLoading(false);
    }
  }

  useEffect(() => {
    setSugg(null);
    setSuggErr('');
    setSuggLoading(false);
    if (geminiKey) fetchSugg();
  // fetchSugg is defined inline without useCallback — adding it would cause infinite re-runs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geminiKey, dictTab]);

  function resetAdd() {
    setShowAdd(false);
    setQuery('');
    setAddPhase('idle');
    setSuggestion(null);
    setAddError('');
    setMf({ dict: '', reading: '', meaning: '', group: isAdj ? 'i-adjective' : 'ichidan' });
    setMErr('');
  }

  async function lookup() {
    if (!query.trim() || addPhase === 'loading') return;
    setAddPhase('loading');
    setAddError('');
    try {
      const r = await lookupWordWithGemini(query, geminiKey, isAdj);
      setSuggestion(r);
      setAddPhase('confirming');
    } catch (e) {
      setAddPhase('error');
      setAddError(e.message);
    }
  }

  function doAdd(word) {
    if (allWords.some(v => v.dict === word.dict)) {
      setAddError(`${word.dict} is already in your list`);
      setAddPhase('error');
      return;
    }
    const newCustom = [...customWords, word];
    setCustomWords(newCustom);
    resetAdd();
    if (geminiKey) fetchSugg([...starterWords, ...newCustom]);
  }

  function addManual() {
    setMErr('');
    if (!mf.dict.trim() || !mf.reading.trim() || !mf.meaning.trim()) {
      setMErr('All fields required');
      return;
    }
    const reading = toHiragana(mf.reading);
    if (!isAllKana(reading)) {
      setMErr('Reading must be hiragana');
      return;
    }
    if (isAdj) {
      if (mf.group === 'i-adjective' && !reading.endsWith('い')) {
        setMErr('い-adjective must end in い');
        return;
      }
      doAdd({ dict: mf.dict.trim(), reading, meaning: mf.meaning.trim(), group: mf.group });
    } else {
      if (mf.group === 'ichidan' && !reading.endsWith('る')) {
        setMErr('Ichidan must end in る');
        return;
      }
      if (mf.group === 'godan' && !/[うくぐすつぬぶむる]$/.test(reading)) {
        setMErr('Godan must end in う/く/ぐ/す/つ/ぬ/ぶ/む/る');
        return;
      }
      doAdd({ dict: mf.dict.trim(), reading, meaning: mf.meaning.trim(), group: mf.group });
    }
  }

  const groupLabel = isAdj
    ? { 'i-adjective': 'い-adjective', 'na-adjective': 'な-adjective' }
    : { ichidan: 'る-verb', godan: 'う-verb', suru: 'irregular', kuru: 'irregular' };

  const groupLong = isAdj
    ? { 'i-adjective': 'い-adjective (conjugates with かった/くない/くて)', 'na-adjective': 'な-adjective (conjugates with だった/ではない/で)' }
    : { ichidan: 'る-verb (ichidan / Group 2)', godan: 'う-verb (godan / Group 1)', suru: 'irregular する (Group 3)', kuru: 'irregular 来る (Group 3)' };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 p-1 bg-stone-100 dark:bg-stone-950 rounded-xl border border-stone-200 dark:border-stone-850">
        <button
          onClick={() => { setDictTab('verbs'); resetAdd(); }}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
            dictTab === 'verbs'
              ? 'bg-white dark:bg-stone-600 text-stone-800 dark:text-white shadow-sm'
              : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          Verbs
        </button>
        <button
          onClick={() => { setDictTab('adjectives'); resetAdd(); }}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
            dictTab === 'adjectives'
              ? 'bg-white dark:bg-stone-600 text-stone-800 dark:text-white shadow-sm'
              : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          Adjectives
        </button>
      </div>

      <div className="flex justify-between items-center">
        <div className="text-sm text-stone-605 dark:text-stone-400">
          {starterWords.length} starter + {customWords.length} custom = {starterWords.length + customWords.length} {isAdj ? 'adjectives' : 'verbs'}
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition">
          <IconPlus className="w-4 h-4" />
          Add {isAdj ? 'adjective' : 'verb'}
        </button>
      </div>

      {geminiKey && (
        <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium">💡 Suggested next {isAdj ? 'adjective' : 'verb'}</div>
            <button onClick={() => fetchSugg()} disabled={suggLoading} className="text-xs text-indigo-500 hover:text-indigo-700 disabled:opacity-50 transition">
              {suggLoading ? '…' : 'Suggest another ↻'}
            </button>
          </div>
          {suggLoading && !sugg && <div className="text-sm text-indigo-400 italic">Finding a good next {isAdj ? 'adjective' : 'verb'} for you…</div>}
          {suggErr && <div className="text-sm text-rose-600">{suggErr}</div>}
          {sugg && !suggLoading && (
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-2xl font-medium text-stone-850 dark:text-stone-100" lang="ja">{sugg.dict}</span>
                  {sugg.dict !== sugg.reading && <span className="text-sm text-indigo-600 dark:text-indigo-400" lang="ja">{sugg.reading}</span>}
                </div>
                <div className="text-sm text-stone-600 dark:text-stone-400 italic">{sugg.meaning}</div>
                <div className="text-xs text-stone-500 dark:text-stone-450 mt-1 leading-relaxed">{sugg.reason}</div>
              </div>
              <button onClick={() => doAdd(sugg)} className="flex-shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium">Add</button>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <h3 className="font-medium mb-3 text-stone-800 dark:text-stone-200">Add {isAdj ? 'an adjective' : 'a verb'}</h3>
          {geminiKey ? (
            addPhase !== 'confirming' ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); if (addPhase === 'error') { setAddPhase('idle'); setAddError(''); } }}
                    onKeyDown={e => { if (e.key === 'Enter') lookup(); }}
                    placeholder={isAdj ? "美味しい, oishii, delicious, cold..." : "食べる, taberu, to eat, swim…"}
                    disabled={addPhase === 'loading'}
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    className="flex-1 px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-850 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    onClick={lookup}
                    disabled={!query.trim() || addPhase === 'loading'}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium min-w-16"
                  >
                    {addPhase === 'loading' ? '…' : 'Look up'}
                  </button>
                </div>
                {addError && <div className="text-sm text-rose-600">{addError}</div>}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-stone-600 dark:text-stone-400">Is this the right {isAdj ? 'adjective' : 'verb'}?</p>
                <div className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl p-4">
                  <div className="text-3xl font-medium mb-1 text-stone-850 dark:text-stone-105" lang="ja">{suggestion.dict}</div>
                  {suggestion.dict !== suggestion.reading && <div className="text-base text-stone-500 dark:text-stone-400 mb-1" lang="ja">{suggestion.reading}</div>}
                  <div className="text-sm text-stone-500 dark:text-stone-400 italic">{suggestion.meaning}</div>
                  <div className="text-xs text-stone-400 dark:text-stone-500 mt-1">{groupLong[suggestion.group]}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => doAdd(suggestion)} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium">Add {isAdj ? 'adjective' : 'verb'}</button>
                  <button onClick={() => { setAddPhase('idle'); setSuggestion(null); setQuery(''); }} className="px-3 py-2 border border-stone-200 dark:border-stone-800 text-stone-705 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-850 rounded-lg text-sm">Try again</button>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-amber-705 bg-amber-50 dark:bg-amber-955/20 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">Add a Gemini API key in Settings for AI lookup and suggestions.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Dictionary form</label>
                  <input
                    type="text"
                    value={mf.dict}
                    onChange={e => setMf({ ...mf, dict: e.target.value })}
                    placeholder={isAdj ? "美味しい" : "食べる"}
                    lang="ja"
                    className="w-full px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-855 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Reading (kana/romaji)</label>
                  <input
                    type="text"
                    value={mf.reading}
                    onChange={e => setMf({ ...mf, reading: e.target.value })}
                    placeholder={isAdj ? "oishii" : "taberu"}
                    lang="ja"
                    className="w-full px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-855 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1">Meaning</label>
                <input
                  type="text"
                  value={mf.meaning}
                  onChange={e => setMf({ ...mf, meaning: e.target.value })}
                  placeholder={isAdj ? "delicious" : "to eat"}
                  className="w-full px-3 py-2 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-855 dark:text-stone-200 rounded-lg focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-stone-500 block mb-1">Group</label>
                <div className="flex gap-2">
                  {isAdj
                    ? [{ id: 'i-adjective', label: 'い-adj' }, { id: 'na-adjective', label: 'な-adj' }].map(g => (
                        <button
                          key={g.id}
                          onClick={() => setMf({ ...mf, group: g.id })}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm border transition ${
                            mf.group === g.id
                              ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                              : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                          }`}
                        >
                          {g.label}
                        </button>
                      ))
                    : [{ id: 'ichidan', label: 'る-verb' }, { id: 'godan', label: 'う-verb' }, { id: 'suru', label: 'suru' }].map(g => (
                        <button
                          key={g.id}
                          onClick={() => setMf({ ...mf, group: g.id })}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm border transition ${
                            mf.group === g.id
                              ? 'bg-stone-800 text-white border-stone-800 dark:bg-indigo-600 dark:border-indigo-600'
                              : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300'
                          }`}
                        >
                          {g.label}
                        </button>
                      ))
                  }
                </div>
              </div>
              {mErr && <div className="text-sm text-rose-600">{mErr}</div>}
              <button onClick={addManual} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm">Add</button>
            </div>
          )}
          <button onClick={resetAdd} className="mt-3 text-xs text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-400 block">Cancel</button>
        </div>
      )}

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 dark:bg-stone-950 text-stone-500 dark:text-stone-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{isAdj ? 'Adjective' : 'Verb'}</th>
                <th className="px-4 py-2 text-left font-medium">Reading</th>
                <th className="px-4 py-2 text-left font-medium hidden sm:table-cell">Meaning</th>
                <th className="px-4 py-2 text-left font-medium">Group</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {allWords.map((v, i) => {
                const vvs = state?.verbStats?.[v.dict] || {};
                const totalSeen = Object.values(vvs).reduce((s, x) => s + x.seen, 0);
                const totalIncorrect = Object.values(vvs).reduce((s, x) => s + x.incorrect, 0);
                const acc = totalSeen > 0 ? Math.round(((totalSeen - totalIncorrect) / totalSeen) * 100) : null;
                return (
                  <tr key={v.dict} className="border-t border-stone-100 dark:border-stone-800 hover:bg-stone-50/50 dark:hover:bg-stone-850/50">
                    <td className="px-4 py-2 font-medium text-stone-900 dark:text-stone-100" lang="ja">{v.dict}</td>
                    <td className="px-4 py-2 text-stone-605 dark:text-stone-300" lang="ja">{v.reading}</td>
                    <td className="px-4 py-2 text-stone-500 dark:text-stone-400 hidden sm:table-cell">{v.meaning}</td>
                    <td className="px-4 py-2 text-xs">
                      <div className="text-stone-505 dark:text-stone-405">{groupLabel[v.group]}</div>
                      {acc !== null && (
                        <div className={`mt-0.5 ${acc >= 80 ? 'text-emerald-600 dark:text-emerald-400' : acc >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-450'}`}>
                          {totalSeen} seen · {acc}%
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {i >= starterWords.length && (
                        confirmDelete === v.dict ? (
                          <span className="flex items-center gap-1 justify-end">
                            <button onClick={() => { setCustomWords(customWords.filter(c => c.dict !== v.dict)); setConfirmDelete(null); }} className="text-xs px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded transition">Delete</button>
                            <button onClick={() => setConfirmDelete(null)} className="text-xs px-2 py-1 text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 transition">Cancel</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmDelete(v.dict)} className="text-stone-400 hover:text-rose-600 dark:text-stone-500 dark:hover:text-rose-400 transition">
                            <IconTrash className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
