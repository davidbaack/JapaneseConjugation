import React from 'react';
import { A_ROW, E_ROW, I_ROW, O_ROW } from '../utils/conjugator.js';
import { normalizeRowLabel } from '../utils/formationKeys.js';

export const GODAN_ROW_CHART_ENDINGS = ['う', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る'];

const U_ROW = Object.fromEntries(GODAN_ROW_CHART_ENDINGS.map((ending) => [ending, ending]));

const ROW_COLUMNS = [
  {
    id: 'a-row',
    kana: 'あ',
    label: 'a-row',
    use: 'negative, passive, causative',
    map: A_ROW,
    tone: 'border-red-700/80 bg-red-50 text-red-950 dark:border-red-500/80 dark:bg-red-950/25 dark:text-red-100',
    header:
      'border-red-700/80 bg-red-100 text-red-950 dark:border-red-500/80 dark:bg-red-950/45 dark:text-red-100',
  },
  {
    id: 'i-row',
    kana: 'い',
    label: 'i-row',
    use: 'polite, stem-built forms',
    map: I_ROW,
    tone: 'border-emerald-700/80 bg-emerald-50 text-emerald-950 dark:border-emerald-500/80 dark:bg-emerald-950/25 dark:text-emerald-100',
    header:
      'border-emerald-700/80 bg-emerald-100 text-emerald-950 dark:border-emerald-500/80 dark:bg-emerald-950/45 dark:text-emerald-100',
  },
  {
    id: 'u-row',
    kana: 'う',
    label: 'u-row',
    use: 'dictionary ending',
    map: U_ROW,
    tone: 'border-stone-700/80 bg-stone-100 text-stone-950 dark:border-stone-400/80 dark:bg-stone-800 dark:text-stone-50',
    header:
      'border-stone-700/80 bg-stone-200 text-stone-950 dark:border-stone-400/80 dark:bg-stone-800 dark:text-stone-50',
  },
  {
    id: 'e-row',
    kana: 'え',
    label: 'e-row',
    use: 'potential, imperative, ba',
    map: E_ROW,
    tone: 'border-sky-700/80 bg-sky-50 text-sky-950 dark:border-sky-500/80 dark:bg-sky-950/25 dark:text-sky-100',
    header:
      'border-sky-700/80 bg-sky-100 text-sky-950 dark:border-sky-500/80 dark:bg-sky-950/45 dark:text-sky-100',
  },
  {
    id: 'o-row',
    kana: 'お',
    label: 'o-row',
    use: 'volitional',
    map: O_ROW,
    tone: 'border-violet-700/80 bg-violet-50 text-violet-950 dark:border-violet-500/80 dark:bg-violet-950/25 dark:text-violet-100',
    header:
      'border-violet-700/80 bg-violet-100 text-violet-950 dark:border-violet-500/80 dark:bg-violet-950/45 dark:text-violet-100',
  },
];

function cellPositionClass(index) {
  if (index === 0) return 'rounded-t-xl border-t-2';
  if (index === GODAN_ROW_CHART_ENDINGS.length - 1) return 'rounded-b-xl border-b-2';
  return 'border-t border-b-0';
}

export function GodanRowChart({ highlightEnding = '', highlightRow = '' }) {
  const activeEnding = GODAN_ROW_CHART_ENDINGS.includes(highlightEnding) ? highlightEnding : '';
  const activeRow = normalizeRowLabel(highlightRow);
  const activeColumn = ROW_COLUMNS.find((column) => column.id === activeRow);
  const activeKana =
    activeEnding && activeColumn ? activeColumn.map[activeEnding] || activeEnding : '';

  return (
    <section
      className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800"
      aria-labelledby="godan-row-chart-heading"
    >
      <div className="bg-stone-50 px-4 py-3 dark:bg-stone-950">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4
              id="godan-row-chart-heading"
              className="text-sm font-semibold text-stone-850 dark:text-stone-100"
            >
              Godan row shifts
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-stone-550 dark:text-stone-400">
              Keep the stem, move the final kana into the needed vowel row, then attach the ending.
            </p>
          </div>
          {activeKana && (
            <div
              className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-750 dark:border-indigo-900 dark:bg-stone-900 dark:text-indigo-200"
              aria-live="polite"
            >
              Highlighted shift:{' '}
              <span lang="ja">
                {activeEnding} -&gt; {activeKana}
              </span>{' '}
              ({activeRow})
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto px-3 pb-4 pt-3">
        <table
          className="w-full min-w-[38rem] table-fixed border-separate border-spacing-x-2 border-spacing-y-0 text-center"
          aria-label="Godan row map"
        >
          <thead>
            <tr>
              {ROW_COLUMNS.map((column) => {
                const columnActive = column.id === activeRow;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    className={`rounded-xl border-2 px-2 py-2 ${column.header} ${
                      columnActive
                        ? 'ring-2 ring-indigo-400 ring-offset-2 dark:ring-offset-stone-900'
                        : ''
                    }`}
                  >
                    <span className="block text-2xl font-semibold leading-none" lang="ja">
                      {column.kana}
                    </span>
                    <span className="mt-1 block text-xs font-semibold">{column.label}</span>
                    <span className="mt-0.5 block text-[11px] font-normal leading-snug">
                      {column.use}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {GODAN_ROW_CHART_ENDINGS.map((ending, index) => (
              <tr key={ending}>
                {ROW_COLUMNS.map((column) => {
                  const kana = column.map[ending] || '';
                  const highlighted = ending === activeEnding && column.id === activeRow;
                  const Tag = column.id === 'u-row' ? 'th' : 'td';
                  return (
                    <Tag
                      key={`${ending}-${column.id}`}
                      scope={column.id === 'u-row' ? 'row' : undefined}
                      aria-current={highlighted ? 'true' : undefined}
                      data-testid={`godan-row-${ending}-${column.id}`}
                      className={`h-14 border-x-2 px-2 align-middle ${cellPositionClass(index)} ${
                        column.tone
                      } ${
                        highlighted
                          ? 'relative z-10 shadow-[0_0_0_3px_rgba(99,102,241,0.45)] ring-2 ring-indigo-500'
                          : ''
                      }`}
                    >
                      <span className="text-3xl font-medium leading-none" lang="ja">
                        {kana}
                      </span>
                      {ending === 'う' && column.id === 'a-row' && (
                        <span className="mt-0.5 block text-[10px] font-semibold">not あ</span>
                      )}
                    </Tag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-stone-100 bg-white px-4 py-3 text-xs leading-relaxed text-stone-550 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
        Special case:{' '}
        <span className="font-semibold text-stone-850 dark:text-stone-100" lang="ja">
          う
        </span>{' '}
        uses{' '}
        <span className="font-semibold text-stone-850 dark:text-stone-100" lang="ja">
          わ
        </span>{' '}
        before negative endings, as in{' '}
        <span className="font-semibold text-stone-850 dark:text-stone-100" lang="ja">
          買う -&gt; 買わない
        </span>
        .
      </div>
    </section>
  );
}
