import React from 'react';

const sizeClasses = {
  xs: 'w-7 h-8 sm:w-8 sm:h-9 rounded-lg text-sm',
  sm: 'w-9 h-10 sm:w-10 sm:h-11 rounded-xl text-lg',
  md: 'w-10 h-11 sm:w-11 sm:h-12 rounded-xl text-xl',
};

const statusToneClasses = {
  error: 'text-rose-700 dark:text-rose-300',
  success: 'text-emerald-700 dark:text-emerald-300',
  neutral: 'text-stone-500 dark:text-stone-400',
};

function classForCell(cell, mode) {
  if (mode === 'none') {
    return cell.state === 'empty'
      ? 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-300'
      : 'bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300';
  }

  if (cell.state === 'correct') {
    return 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300';
  }
  if (cell.state === 'wrong' || cell.state === 'extra') {
    return 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300';
  }
  if (cell.state === 'pending') {
    return 'bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300';
  }
  if (cell.state === 'hint') {
    return 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300';
  }
  return 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-300';
}

export default function KanaProgressMeter({
  cells,
  mode = 'color-count',
  status = '',
  statusTone = 'neutral',
  size = 'sm',
  className = '',
  ariaLabel = 'Kana progress',
}) {
  const visibleCells =
    mode === 'color-count' || mode === 'none'
      ? cells
      : cells.filter((cell) => cell.state !== 'empty');

  if (!visibleCells.length) return null;

  return (
    <div
      className={`rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-3 ${className}`}
      role="group"
      aria-label={ariaLabel}
    >
      <div className="flex flex-wrap justify-center gap-1.5" lang="ja" aria-hidden="true">
        {visibleCells.map((cell, i) => (
          <div
            key={`${i}-${cell.expected}-${cell.state}`}
            className={`${sizeClasses[size] || sizeClasses.sm} border flex items-center justify-center font-medium tabular-nums transition ${classForCell(cell, mode)}`}
          >
            {cell.shown || '\u00b7'}
          </div>
        ))}
      </div>
      {status && (
        <div
          className={`mt-2 text-xs text-center ${statusToneClasses[statusTone] || statusToneClasses.neutral}`}
        >
          {status}
        </div>
      )}
    </div>
  );
}
