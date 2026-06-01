import React, { useMemo } from 'react';
import { ALL_CARD_TYPES } from '../data/conjugationTypes.js';
import { RULES } from '../utils/conjugator.js';
import { SRS_LEVELS, getCardLevel } from '../utils/storage.js';
import { useApp } from '../state/AppStateContext.jsx';

export default function SRSLevelView() {
  const { state, allWords: verbs } = useApp();
  const enabledTypes =
    state.enabledTypes.length > 0 ? state.enabledTypes : ALL_CARD_TYPES.map((t) => t.id);

  const ruleLevel = useMemo(() => {
    const m = {};
    for (const r of RULES) {
      m[r.id] = getCardLevel(state.cards[r.id]);
    }
    return m;
  }, [state.cards]);

  const levelCounts = useMemo(() => {
    const c = [0, 0, 0, 0, 0, 0];
    for (const r of RULES) {
      if (!enabledTypes.includes(r.type)) continue;
      if (!r.verbFilter(verbs).length) continue;
      c[ruleLevel[r.id]]++;
    }
    return c;
  }, [ruleLevel, enabledTypes, verbs]);

  const totalCards = levelCounts.reduce((s, c) => s + c, 0) || 1;

  const byType = useMemo(
    () =>
      ALL_CARD_TYPES.filter((t) => enabledTypes.includes(t.id))
        .map((t) => ({
          typeObj: t,
          rules: RULES.filter((r) => r.type === t.id && r.verbFilter(verbs).length > 0),
        }))
        .filter((row) => row.rules.length > 0),
    [enabledTypes, verbs],
  );

  const COL_KEYS = [
    'ichidan',
    'godan',
    'suru',
    'kuru',
    'exception-いく',
    'i-adjective',
    'na-adjective',
    'noun',
  ];
  const COL_HEADS = ['る', 'う', 'する', '来る', '行く', 'い形', 'な形', '名詞'];

  return (
    <div className="space-y-4 text-left">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
        <h3 className="font-medium mb-3 text-stone-950 dark:text-stone-50">
          Level breakdown{' '}
          <span className="text-stone-400 font-normal text-sm">· {totalCards} rules</span>
        </h3>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {SRS_LEVELS.map((l, i) => (
            <div key={l.id} className={`rounded-xl border p-3 ${l.bg} ${l.border}`}>
              <div className={`text-2xl font-bold ${l.text}`}>{levelCounts[i]}</div>
              <div className={`text-xs font-semibold mt-0.5 ${l.text}`}>{l.name}</div>
              <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 leading-tight hidden sm:block">
                {l.sub}
              </div>
            </div>
          ))}
        </div>
        <div className="h-2.5 bg-stone-100 dark:bg-stone-950 rounded-full overflow-hidden flex">
          {SRS_LEVELS.map((l, i) =>
            levelCounts[i] > 0 ? (
              <div
                key={l.id}
                className={`h-full ${l.dot} transition-all`}
                style={{ width: (levelCounts[i] / totalCards) * 100 + '%' }}
              />
            ) : null,
          )}
        </div>
        <div className="flex gap-3 mt-2 flex-wrap">
          {SRS_LEVELS.map((l, i) =>
            levelCounts[i] > 0 ? (
              <div key={l.id} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-sm ${l.dot}`} />
                <span className="text-xs text-stone-550 dark:text-stone-400">{l.name}</span>
              </div>
            ) : null,
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 overflow-hidden">
        <div className="flex items-center px-4 py-2 border-b border-stone-105 dark:border-stone-800 bg-stone-50 dark:bg-stone-950">
          <div className="flex-1 text-xs text-stone-400 font-medium">Conjugation type</div>
          {COL_HEADS.map((h) => (
            <div
              key={h}
              className="w-14 text-center text-xs text-stone-400 font-medium flex-shrink-0"
              lang="ja"
            >
              {h}
            </div>
          ))}
        </div>
        <div className="divide-y divide-stone-50 dark:divide-stone-850">
          {byType.map(({ typeObj, rules }) => (
            <div key={typeObj.id} className="flex items-center px-4 py-2.5">
              <div className="flex-1 min-w-0 pr-2">
                <div className="text-sm text-stone-700 dark:text-stone-300 truncate">
                  {typeObj.label}
                </div>
                {typeObj.sub && (
                  <div className="text-xs text-stone-400 dark:text-stone-500" lang="ja">
                    {typeObj.sub}
                  </div>
                )}
              </div>
              {COL_KEYS.map((col) => {
                const rid =
                  col === 'exception-いく'
                    ? `exception-いく|${typeObj.id}`
                    : `${col}|${typeObj.id}`;
                const rule = rules.find((r) => r.id === rid);
                if (!rule) {
                  return (
                    <div key={col} className="w-14 flex justify-center flex-shrink-0">
                      <span className="w-10 h-6 rounded-md bg-stone-50 dark:bg-stone-950 border border-stone-100 dark:border-stone-850 inline-block" />
                    </div>
                  );
                }
                const lDef = SRS_LEVELS[ruleLevel[rule.id]];
                return (
                  <div key={col} className="w-14 flex justify-center flex-shrink-0">
                    <span
                      title={`${typeObj.label} · ${rule.label} — ${lDef.name}`}
                      className={`text-xs font-semibold px-1.5 py-0.5 rounded-md border truncate max-w-full text-center ${lDef.bg} ${lDef.text} ${lDef.border}`}
                      lang="ja"
                    >
                      {COL_HEADS[COL_KEYS.indexOf(col)]}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-855 p-4">
        <div className="text-xs font-semibold text-stone-450 mb-2 uppercase tracking-wider">
          Level guide
        </div>
        <div className="space-y-1.5">
          {SRS_LEVELS.map((l) => (
            <div key={l.id} className="flex items-center gap-2.5">
              <div className={`w-3 h-3 rounded-sm flex-shrink-0 ${l.dot}`} />
              <span className={`text-xs font-semibold w-16 flex-shrink-0 ${l.text}`}>{l.name}</span>
              <span className="text-xs text-stone-500">{l.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
