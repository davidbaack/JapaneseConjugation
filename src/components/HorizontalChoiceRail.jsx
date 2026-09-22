import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { horizontalEdges } from '../utils/horizontalScroll.js';

/**
 * A generic single-row choice group with boundary-aware horizontal scroll cues.
 * Unlike HorizontalTabList, this preserves the semantics supplied by its child
 * controls instead of presenting them as mutually exclusive tabs.
 */
export default function HorizontalChoiceRail({
  ariaLabel,
  children,
  className = '',
  fadeClassName = 'from-white dark:from-stone-900',
  testId = 'horizontal-choice-rail',
  wrapperClassName = '',
}) {
  const railRef = useRef(null);
  const [edges, setEdges] = useState({ canScrollLeft: false, canScrollRight: false });

  const updateEdges = useCallback(() => {
    const next = horizontalEdges(railRef.current);
    setEdges((current) =>
      current.canScrollLeft === next.canScrollLeft && current.canScrollRight === next.canScrollRight
        ? current
        : next,
    );
  }, []);

  useLayoutEffect(() => {
    updateEdges();
  }, [children, updateEdges]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;

    const onScroll = () => updateEdges();
    rail.addEventListener('scroll', onScroll, { passive: true });

    const resizeObserver =
      typeof window.ResizeObserver === 'function' ? new window.ResizeObserver(updateEdges) : null;
    resizeObserver?.observe(rail);
    window.addEventListener('resize', updateEdges);

    return () => {
      rail.removeEventListener('scroll', onScroll);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateEdges);
    };
  }, [updateEdges]);

  return (
    <div className={`relative min-w-0 ${wrapperClassName}`}>
      <div
        ref={railRef}
        role="group"
        aria-label={ariaLabel}
        data-testid={testId}
        className={className}
      >
        {children}
      </div>
      {edges.canScrollLeft && (
        <span
          aria-hidden="true"
          data-testid={`${testId}-cue-left`}
          className={`pointer-events-none absolute inset-y-px left-px z-10 w-8 bg-gradient-to-r ${fadeClassName} to-transparent`}
        />
      )}
      {edges.canScrollRight && (
        <span
          aria-hidden="true"
          data-testid={`${testId}-cue-right`}
          className={`pointer-events-none absolute inset-y-px right-px z-10 w-8 bg-gradient-to-l ${fadeClassName} to-transparent`}
        />
      )}
    </div>
  );
}
