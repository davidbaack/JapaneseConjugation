import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const EDGE_EPSILON = 1;
const ACTIVE_TAB_GUTTER = 4;

function horizontalEdges(element) {
  if (!element) return { canScrollLeft: false, canScrollRight: false };
  const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
  return {
    canScrollLeft: element.scrollLeft > EDGE_EPSILON,
    canScrollRight: element.scrollLeft < maxScrollLeft - EDGE_EPSILON,
  };
}

/**
 * A single-row ARIA tablist with boundary-aware visual scroll cues.
 *
 * The active tab is kept fully visible by changing only the tablist's
 * horizontal scroll position. This intentionally avoids scrollIntoView so a
 * tab change cannot move the surrounding page vertically.
 */
export default function HorizontalTabList({
  activeId,
  ariaLabel,
  as: TabListElement = 'div',
  children,
  className = '',
  fadeClassName = 'from-white dark:from-stone-900',
  wrapperClassName = '',
}) {
  const listRef = useRef(null);
  const [edges, setEdges] = useState({ canScrollLeft: false, canScrollRight: false });

  const updateEdges = useCallback(() => {
    const next = horizontalEdges(listRef.current);
    setEdges((current) =>
      current.canScrollLeft === next.canScrollLeft && current.canScrollRight === next.canScrollRight
        ? current
        : next,
    );
  }, []);

  const keepActiveTabVisible = useCallback(() => {
    const list = listRef.current;
    const activeTab = list?.querySelector('[role="tab"][aria-selected="true"]');
    if (!list || !activeTab) return;

    const visibleLeft = list.scrollLeft + ACTIVE_TAB_GUTTER;
    const visibleRight = list.scrollLeft + list.clientWidth - ACTIVE_TAB_GUTTER;
    const tabLeft = activeTab.offsetLeft;
    const tabRight = tabLeft + activeTab.offsetWidth;
    let nextScrollLeft = list.scrollLeft;

    if (tabLeft < visibleLeft) {
      nextScrollLeft = Math.max(0, tabLeft - ACTIVE_TAB_GUTTER);
    } else if (tabRight > visibleRight) {
      nextScrollLeft = Math.min(
        Math.max(0, list.scrollWidth - list.clientWidth),
        tabRight - list.clientWidth + ACTIVE_TAB_GUTTER,
      );
    }

    if (nextScrollLeft !== list.scrollLeft) list.scrollLeft = nextScrollLeft;
    updateEdges();
  }, [updateEdges]);

  useLayoutEffect(() => {
    keepActiveTabVisible();
  }, [activeId, keepActiveTabVisible]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;

    updateEdges();
    const onScroll = () => updateEdges();
    list.addEventListener('scroll', onScroll, { passive: true });

    const onResize = () => keepActiveTabVisible();
    const resizeObserver =
      typeof window.ResizeObserver === 'function' ? new window.ResizeObserver(onResize) : null;
    resizeObserver?.observe(list);
    window.addEventListener('resize', onResize);

    return () => {
      list.removeEventListener('scroll', onScroll);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [keepActiveTabVisible, updateEdges]);

  return (
    <div className={`relative min-w-0 ${wrapperClassName}`}>
      <TabListElement ref={listRef} role="tablist" aria-label={ariaLabel} className={className}>
        {children}
      </TabListElement>
      {edges.canScrollLeft && (
        <span
          aria-hidden="true"
          data-testid="horizontal-tab-cue-left"
          className={`pointer-events-none absolute inset-y-px left-px z-10 w-8 rounded-l-xl bg-gradient-to-r ${fadeClassName} to-transparent`}
        />
      )}
      {edges.canScrollRight && (
        <span
          aria-hidden="true"
          data-testid="horizontal-tab-cue-right"
          className={`pointer-events-none absolute inset-y-px right-px z-10 w-8 rounded-r-xl bg-gradient-to-l ${fadeClassName} to-transparent`}
        />
      )}
    </div>
  );
}

export { horizontalEdges };
