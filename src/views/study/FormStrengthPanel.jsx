import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

function changeLabel(delta) {
  const amount = Math.abs(delta);
  return `${delta > 0 ? '+' : '−'}${amount < 0.1 ? '<0.1' : Number(amount.toFixed(1))}`;
}

export default function FormStrengthPanel({ rows, currentTypeId, feedback = null }) {
  const descriptionId = useId();
  const railRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const updateEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const left = rail.scrollLeft > 1;
    const right = rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 1;
    setEdges((previous) =>
      previous.left === left && previous.right === right ? previous : { left, right },
    );
  }, []);
  const keepCurrentVisible = useCallback(() => {
    const rail = railRef.current;
    const active = rail?.querySelector('[aria-current="true"]');
    if (!active) return;
    if (window.matchMedia?.('(min-width: 1280px)').matches) {
      const bottom = active.offsetTop + active.offsetHeight;
      if (active.offsetTop < rail.scrollTop) rail.scrollTop = active.offsetTop;
      else if (bottom > rail.scrollTop + rail.clientHeight)
        rail.scrollTop = bottom - rail.clientHeight;
    } else {
      const right = active.offsetLeft + active.offsetWidth;
      if (active.offsetLeft < rail.scrollLeft) rail.scrollLeft = active.offsetLeft;
      else if (right > rail.scrollLeft + rail.clientWidth)
        rail.scrollLeft = right - rail.clientWidth;
    }
    updateEdges();
  }, [updateEdges]);

  // Card changes reveal the active meter. Grading leaves the learner's scroll
  // position alone, so an updating score never makes the list jump.
  useLayoutEffect(() => {
    keepCurrentVisible();
  }, [currentTypeId, rows.length, keepCurrentVisible]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;
    const observer =
      typeof window.ResizeObserver === 'function'
        ? new window.ResizeObserver(keepCurrentVisible)
        : null;
    observer?.observe(rail);
    window.addEventListener('resize', keepCurrentVisible);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', keepCurrentVisible);
    };
  }, [keepCurrentVisible]);

  if (!rows.length) return null;
  const changed = feedback && rows.find((row) => row.typeId === feedback.typeId);
  const delta = feedback ? feedback.afterScore - feedback.beforeScore : 0;
  const announcement = changed
    ? `${changed.label} strength ${delta > 0 ? 'increased' : delta < 0 ? 'decreased' : 'is'} to ${Math.round(feedback.afterScore)} out of 100.`
    : '';

  return (
    <aside
      aria-label="Form strength"
      className="min-w-0 rounded-2xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900 xl:sticky xl:top-4 xl:col-start-2 xl:row-start-1"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold text-stone-800 dark:text-stone-100">Form strength</h2>
        <span className="text-[10px] tabular-nums text-stone-500 dark:text-stone-400">
          {rows.length} active · /100
        </span>
      </div>
      <p id={descriptionId} className="mt-1 text-[10px] text-stone-600 dark:text-stone-400">
        Recent answers shape strength. Lower forms get more practice.
      </p>
      <div className="relative mt-2 min-w-0">
        <div
          ref={railRef}
          role="group"
          aria-label="Active form strength"
          aria-describedby={descriptionId}
          tabIndex={0}
          onScroll={updateEdges}
          data-testid="form-strength-rail"
          className="relative flex gap-2 overflow-x-auto rounded-xl pb-1 outline-offset-2 focus-visible:outline-2 focus-visible:outline-indigo-500 [scrollbar-width:thin] xl:max-h-[65vh] xl:flex-col xl:overflow-x-hidden xl:overflow-y-auto xl:pb-0"
        >
          {rows.map((row) => {
            const active = row.typeId === currentTypeId;
            const changedHere = feedback?.typeId === row.typeId;
            const labelId = `${descriptionId}-${row.typeId}`;
            return (
              <div
                key={row.typeId}
                aria-current={active ? 'true' : undefined}
                data-form-type={row.typeId}
                className={`w-40 shrink-0 rounded-xl border p-2 xl:w-full ${
                  active
                    ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/40'
                    : 'border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-950/45'
                }`}
              >
                <div className="flex min-h-8 items-start justify-between gap-1">
                  <span
                    id={labelId}
                    className="text-[11px] font-semibold leading-4 text-stone-800 dark:text-stone-100"
                  >
                    {row.label}
                  </span>
                  {active ? (
                    <span className="shrink-0 text-[9px] font-semibold text-indigo-700 dark:text-indigo-300">
                      Now
                    </span>
                  ) : null}
                </div>
                <div
                  role="meter"
                  aria-labelledby={labelId}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Number(row.score.toFixed(1))}
                  aria-valuetext={`${Math.round(row.score)} out of 100${row.attempted < 3 ? `, ${row.statusLabel}` : ''}`}
                  className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700"
                >
                  <div
                    className={`h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 ${
                      !row.attempted
                        ? 'bg-stone-400 dark:bg-stone-500'
                        : 'bg-indigo-500 dark:bg-indigo-400'
                    }`}
                    style={{ width: `${row.score}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-1 text-[10px] tabular-nums">
                  <span className="text-stone-600 dark:text-stone-400">
                    {row.attempted < 3 ? row.statusLabel : `${row.attempted} attempts`}
                  </span>
                  <span className="whitespace-nowrap font-semibold text-stone-700 dark:text-stone-200">
                    {changedHere && delta !== 0 ? (
                      <span
                        aria-hidden="true"
                        className={`mr-1 ${delta > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}
                      >
                        {changeLabel(delta)}
                      </span>
                    ) : null}
                    {Math.round(row.score)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {edges.left ? (
          <span
            aria-hidden="true"
            data-testid="form-strength-cue-left"
            className="pointer-events-none absolute inset-y-0 left-0 w-5 rounded-l-xl bg-gradient-to-r from-white to-transparent dark:from-stone-900 xl:hidden"
          />
        ) : null}
        {edges.right ? (
          <span
            aria-hidden="true"
            data-testid="form-strength-cue-right"
            className="pointer-events-none absolute inset-y-0 right-0 w-5 rounded-r-xl bg-gradient-to-l from-white to-transparent dark:from-stone-900 xl:hidden"
          />
        ) : null}
      </div>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </aside>
  );
}
