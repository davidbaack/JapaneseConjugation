import React, { useMemo } from 'react';
import { ALL_CARD_TYPES } from '../data/conjugationTypes.js';
import { SRS_LEVELS, getCardLevel, typeIdFromCardId, wordKeyFromCardId } from '../utils/storage.js';
import { useApp } from '../state/AppStateContext.jsx';

function emptyLevelCounts() {
  return SRS_LEVELS.map(() => 0);
}

export default function SRSLevelView() {
  const { state } = useApp();
  const enabledTypes =
    state.enabledTypes.length > 0 ? state.enabledTypes : ALL_CARD_TYPES.map((t) => t.id);

  const cardRows = useMemo(
    () =>
      Object.entries(state.cards || {})
        .map(([cardId, card]) => ({
          cardId,
          card,
          typeId: typeIdFromCardId(cardId),
          wordKey: wordKeyFromCardId(cardId),
          level: getCardLevel(card),
        }))
        .filter((row) => row.typeId !== 'dictionary' && enabledTypes.includes(row.typeId)),
    [enabledTypes, state.cards],
  );

  const levelCounts = useMemo(() => {
    const counts = emptyLevelCounts();
    for (const row of cardRows) {
      counts[row.level] = (counts[row.level] || 0) + 1;
    }
    return counts;
  }, [cardRows]);

  const byType = useMemo(
    () =>
      ALL_CARD_TYPES.filter((typeObj) => enabledTypes.includes(typeObj.id))
        .map((typeObj) => {
          const rows = cardRows.filter((row) => row.typeId === typeObj.id);
          const levels = emptyLevelCounts();
          let reviews = 0;
          for (const row of rows) {
            levels[row.level] = (levels[row.level] || 0) + 1;
            reviews += (row.card?.correct || 0) + (row.card?.incorrect || 0);
          }
          return {
            typeObj,
            rows,
            levels,
            reviews,
            wordCount: new Set(rows.map((row) => row.wordKey).filter(Boolean)).size,
          };
        })
        .filter((row) => row.rows.length > 0)
        .sort(
          (a, b) => b.rows.length - a.rows.length || a.typeObj.label.localeCompare(b.typeObj.label),
        ),
    [cardRows, enabledTypes],
  );

  const totalCards = cardRows.length;
  const denominator = totalCards || 1;

  return (
    <div className="space-y-4 text-left">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
        <h3 className="font-medium mb-1 text-stone-950 dark:text-stone-50">
          Level breakdown{' '}
          <span className="text-stone-400 font-normal text-sm">
            · {totalCards} practiced card{totalCards === 1 ? '' : 's'}
          </span>
        </h3>
        <p className="text-xs text-stone-500 mb-3">Each card is one word plus one target form.</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {SRS_LEVELS.map((level, i) => (
            <div key={level.id} className={`rounded-xl border p-3 ${level.bg} ${level.border}`}>
              <div className={`text-2xl font-bold ${level.text}`}>{levelCounts[i]}</div>
              <div className={`text-xs font-semibold mt-0.5 ${level.text}`}>{level.name}</div>
              <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 leading-tight hidden sm:block">
                {level.sub}
              </div>
            </div>
          ))}
        </div>
        <div className="h-2.5 bg-stone-100 dark:bg-stone-950 rounded-full overflow-hidden flex">
          {SRS_LEVELS.map((level, i) =>
            levelCounts[i] > 0 ? (
              <div
                key={level.id}
                className={`h-full ${level.dot} transition-all`}
                style={{ width: (levelCounts[i] / denominator) * 100 + '%' }}
              />
            ) : null,
          )}
        </div>
        <div className="flex gap-3 mt-2 flex-wrap">
          {SRS_LEVELS.map((level, i) =>
            levelCounts[i] > 0 ? (
              <div key={level.id} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-sm ${level.dot}`} />
                <span className="text-xs text-stone-550 dark:text-stone-400">{level.name}</span>
              </div>
            ) : null,
          )}
        </div>
        {totalCards === 0 && (
          <p className="text-sm text-stone-500 mt-4">
            No practiced word-form cards yet. Complete a few reviews to fill this in.
          </p>
        )}
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-850 p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-medium text-stone-950 dark:text-stone-50">Form levels</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Stored word-form cards grouped by their target form.
            </p>
          </div>
          <div className="text-xs text-stone-400 tabular-nums flex-shrink-0">
            {byType.length} form{byType.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="space-y-2">
          {byType.map(({ typeObj, rows, levels, reviews, wordCount }) => (
            <div
              key={typeObj.id}
              className="rounded-xl border border-stone-200 dark:border-stone-800 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
                    {typeObj.label}
                  </div>
                  <div className="text-xs text-stone-500">
                    {rows.length} card{rows.length === 1 ? '' : 's'} · {wordCount} word
                    {wordCount === 1 ? '' : 's'} · {reviews} review{reviews === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="text-xs text-stone-400 flex-shrink-0">
                  {typeObj.hint || typeObj.sub}
                </div>
              </div>
              <div className="mt-2 h-2 bg-stone-100 dark:bg-stone-950 rounded-full overflow-hidden flex border border-stone-100 dark:border-stone-800">
                {SRS_LEVELS.map((level, i) =>
                  levels[i] > 0 ? (
                    <div
                      key={level.id}
                      className={`h-full ${level.dot}`}
                      style={{ width: (levels[i] / rows.length) * 100 + '%' }}
                    />
                  ) : null,
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SRS_LEVELS.map((level, i) =>
                  levels[i] > 0 ? (
                    <span
                      key={level.id}
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${level.bg} ${level.text} ${level.border}`}
                    >
                      {level.name}: {levels[i]}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
          ))}
          {byType.length === 0 && (
            <p className="text-sm text-stone-500">
              No practiced cards in the active form scope yet.
            </p>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-855 p-4">
        <div className="text-xs font-semibold text-stone-450 mb-2 uppercase tracking-wider">
          Level guide
        </div>
        <div className="space-y-1.5">
          {SRS_LEVELS.map((level) => (
            <div key={level.id} className="flex items-center gap-2.5">
              <div className={`w-3 h-3 rounded-sm flex-shrink-0 ${level.dot}`} />
              <span className={`text-xs font-semibold w-16 flex-shrink-0 ${level.text}`}>
                {level.name}
              </span>
              <span className="text-xs text-stone-500">{level.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
