import React from 'react';

function accentDescription(accent, morae) {
  if (accent === 0) return 'no in-word downstep';
  if (accent === 1) return 'drop after the first mora';
  if (accent === morae.length) return `drop after mora ${accent}`;
  return `drop after mora ${accent}`;
}

function ariaLabelFor(accent) {
  const toneText = accent.morae
    .map((mora, index) => `${mora} ${accent.tones[index] === 'H' ? 'high' : 'low'}`)
    .join(', ');
  return `Pitch accent for ${accent.reading}: ${accentDescription(
    accent.accent,
    accent.morae,
  )}; ${toneText}.`;
}

export default function PitchAccentDisplay({
  accent,
  label = 'Pitch',
  className = '',
  tone = 'indigo',
}) {
  if (!accent?.morae?.length || !accent?.tones?.length) return null;
  const highLine = tone === 'emerald' ? 'bg-emerald-500' : 'bg-indigo-500';
  const highDot = tone === 'emerald' ? 'bg-emerald-600' : 'bg-indigo-600';
  const highText = tone === 'emerald' ? 'text-emerald-700' : 'text-indigo-700';

  return (
    <div
      role="img"
      aria-label={ariaLabelFor(accent)}
      className={`inline-flex max-w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white/80 px-2.5 py-2 text-stone-700 shadow-sm dark:border-stone-800 dark:bg-stone-950/50 dark:text-stone-200 ${className}`}
    >
      {label && (
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          {label}
        </span>
      )}
      <span aria-hidden="true" className="flex min-w-0 flex-wrap items-end justify-center gap-1">
        {accent.morae.map((mora, index) => {
          const isHigh = accent.tones[index] === 'H';
          return (
            <span
              key={`${mora}:${index}`}
              className="relative flex h-12 w-7 shrink-0 flex-col items-center justify-end rounded-lg bg-stone-50 px-1 pb-1 pt-1 dark:bg-stone-900"
            >
              <span
                className={`absolute left-1 right-1 h-0.5 rounded-full ${
                  isHigh ? `top-2 ${highLine}` : 'bottom-5 bg-stone-400 dark:bg-stone-500'
                }`}
              />
              <span
                className={`absolute h-1.5 w-1.5 rounded-full ${
                  isHigh ? `top-[5px] ${highDot}` : 'bottom-[17px] bg-stone-500'
                }`}
              />
              {index < accent.tones.length - 1 &&
                accent.tones[index] !== accent.tones[index + 1] && (
                  <span className="absolute right-[-0.25rem] top-2 h-6 w-0.5 rounded-full bg-amber-500" />
                )}
              <span className="relative z-10 text-base font-semibold leading-none" lang="ja">
                {mora}
              </span>
              <span
                className={`mt-1 text-[9px] font-bold leading-none ${
                  isHigh ? highText : 'text-stone-500 dark:text-stone-400'
                }`}
              >
                {accent.tones[index]}
              </span>
            </span>
          );
        })}
      </span>
    </div>
  );
}
