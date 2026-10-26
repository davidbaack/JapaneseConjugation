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
  revealSelectionKey = undefined,
}) {
  const railRef = useRef(null);
  const previousSelectedRef = useRef(new Set());
  const revealedChoiceRef = useRef(null);
  const revealSelectedChoices = revealSelectionKey !== undefined;
  const [edges, setEdges] = useState({ canScrollLeft: false, canScrollRight: false });

  const updateEdges = useCallback(() => {
    const next = horizontalEdges(railRef.current);
    setEdges((current) =>
      current.canScrollLeft === next.canScrollLeft && current.canScrollRight === next.canScrollRight
        ? current
        : next,
    );
  }, []);

  const keepSelectedChoiceVisible = useCallback(() => {
    const rail = railRef.current;
    if (!rail || !revealSelectedChoices) return;
    const selected = [...rail.querySelectorAll('[aria-pressed="true"]')];
    const choice = selected.includes(revealedChoiceRef.current)
      ? revealedChoiceRef.current
      : selected[0];
    if (!choice) return;

    // Match HorizontalTabList's horizontal-only visibility adjustment. Avoid
    // scrollIntoView: a scope change must not move the page or steal focus.
    const gutter = 4;
    const visibleLeft = rail.scrollLeft + gutter;
    const visibleRight = rail.scrollLeft + rail.clientWidth - gutter;
    const choiceLeft = choice.offsetLeft;
    const choiceRight = choiceLeft + choice.offsetWidth;
    if (choiceLeft < visibleLeft) {
      rail.scrollLeft = Math.max(0, choiceLeft - gutter);
    } else if (choiceRight > visibleRight) {
      rail.scrollLeft = Math.min(
        Math.max(0, rail.scrollWidth - rail.clientWidth),
        choiceRight - rail.clientWidth + gutter,
      );
    }
    updateEdges();
  }, [revealSelectedChoices, updateEdges]);

  useLayoutEffect(() => {
    if (revealSelectionKey === undefined) return;
    const selected = [...(railRef.current?.querySelectorAll('[aria-pressed="true"]') || [])];
    revealedChoiceRef.current =
      selected.find((choice) => !previousSelectedRef.current.has(choice)) || selected[0];
    previousSelectedRef.current = new Set(selected);
    keepSelectedChoiceVisible();
  }, [revealSelectionKey, keepSelectedChoiceVisible]);

  useLayoutEffect(() => {
    updateEdges();
  }, [children, updateEdges]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;

    const onScroll = () => updateEdges();
    rail.addEventListener('scroll', onScroll, { passive: true });

    const onResize = () => {
      keepSelectedChoiceVisible();
      updateEdges();
    };
    const resizeObserver =
      typeof window.ResizeObserver === 'function' ? new window.ResizeObserver(onResize) : null;
    resizeObserver?.observe(rail);
    window.addEventListener('resize', onResize);

    return () => {
      rail.removeEventListener('scroll', onScroll);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [keepSelectedChoiceVisible, updateEdges]);

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
