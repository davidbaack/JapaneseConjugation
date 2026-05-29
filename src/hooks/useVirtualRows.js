// @ts-check
import { useState, useCallback } from 'react';

// Fixed-height row windowing for long lists (improvement #12). A large custom
// dictionary can render hundreds of rows; this renders only the slice in (and
// near) the viewport, with spacer heights above/below so the scrollbar still
// reflects the full list. The math lives in `computeWindow` so it can be unit
// tested without a DOM.

export function computeWindow({ scrollTop, viewportHeight, rowHeight, count, overscan = 6 }) {
  if (count <= 0 || rowHeight <= 0) {
    return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  }
  const first = Math.floor(scrollTop / rowHeight);
  const visible = Math.ceil(viewportHeight / rowHeight);
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, first + visible + overscan);
  return {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: Math.max(0, (count - end) * rowHeight),
  };
}

// React wrapper: tracks the scroll container's scrollTop and returns the slice
// to render plus an `onScroll` handler. When `enabled` is false it renders the
// full list (no windowing) — useful below a size threshold.
export function useVirtualRows({ count, rowHeight, viewportHeight, overscan = 6, enabled = true }) {
  const [scrollTop, setScrollTop] = useState(0);
  const onScroll = useCallback((e) => setScrollTop(e.currentTarget.scrollTop), []);
  if (!enabled) {
    return { start: 0, end: count, padTop: 0, padBottom: 0, onScroll };
  }
  return { ...computeWindow({ scrollTop, viewportHeight, rowHeight, count, overscan }), onScroll };
}
