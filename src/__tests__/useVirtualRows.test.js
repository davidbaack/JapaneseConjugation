import { describe, it, expect } from 'vitest';
import { computeWindow } from '../hooks/useVirtualRows.js';

describe('computeWindow', () => {
  const base = { rowHeight: 50, viewportHeight: 500, count: 1000, overscan: 0 };

  it('renders from the top when not scrolled', () => {
    const w = computeWindow({ ...base, scrollTop: 0 });
    expect(w.start).toBe(0);
    expect(w.end).toBe(10); // 500 / 50 visible rows
    expect(w.padTop).toBe(0);
    expect(w.padBottom).toBe((1000 - 10) * 50);
  });

  it('shifts the window as the user scrolls', () => {
    const w = computeWindow({ ...base, scrollTop: 5000 }); // 100 rows down
    expect(w.start).toBe(100);
    expect(w.end).toBe(110);
    expect(w.padTop).toBe(100 * 50);
    expect(w.padBottom).toBe((1000 - 110) * 50);
  });

  it('applies overscan above and below without going out of bounds', () => {
    const w = computeWindow({ ...base, scrollTop: 5000, overscan: 6 });
    expect(w.start).toBe(94);
    expect(w.end).toBe(116);
  });

  it('clamps the start to zero near the top even with overscan', () => {
    const w = computeWindow({ ...base, scrollTop: 0, overscan: 6 });
    expect(w.start).toBe(0);
    expect(w.padTop).toBe(0);
  });

  it('clamps the end to count at the bottom', () => {
    // Scrolled all the way down: total height 50000 − viewport 500 = 49500.
    const w = computeWindow({ ...base, scrollTop: 49_500, overscan: 6 });
    expect(w.end).toBe(1000);
    expect(w.padBottom).toBe(0);
  });

  it('padTop + rendered + padBottom always equals the full scroll height', () => {
    const w = computeWindow({ ...base, scrollTop: 12_345, overscan: 4 });
    const rendered = (w.end - w.start) * base.rowHeight;
    expect(w.padTop + rendered + w.padBottom).toBe(base.count * base.rowHeight);
  });

  it('handles an empty list', () => {
    expect(computeWindow({ ...base, count: 0, scrollTop: 0 })).toEqual({
      start: 0,
      end: 0,
      padTop: 0,
      padBottom: 0,
    });
  });
});
