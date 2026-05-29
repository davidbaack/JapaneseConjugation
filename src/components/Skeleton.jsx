import React from 'react';

// Lightweight content placeholders shown while a lazy view loads (improvement
// #11), replacing the bare "Loading…" text with shapes that hint at the layout
// to come. Respects reduced-motion via Tailwind's motion-safe variant.

export function Skeleton({ className = '' }) {
  return (
    <div
      className={`motion-safe:animate-pulse rounded-md bg-stone-200/80 dark:bg-stone-800/80 ${className}`}
    />
  );
}

// A generic view-loading skeleton: a title bar, a prominent card, and a few
// rows — close enough to most views (Study/Check/Lists) to avoid layout jank.
export default function ViewSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true" data-testid="view-skeleton">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-6 w-20" />
      </div>
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
