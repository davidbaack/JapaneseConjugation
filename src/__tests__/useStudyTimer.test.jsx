// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStudyTimer } from '../hooks/useStudyTimer.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useStudyTimer', () => {
  it('has no deadline when duration is 0', () => {
    const { result } = renderHook(() => useStudyTimer(0));
    expect(result.current.endAt).toBeNull();
    expect(result.current.timeLeft).toBeNull();
  });

  it('arms a countdown for a positive duration', () => {
    const { result } = renderHook(() => useStudyTimer(60));
    expect(result.current.endAt).toBe(60_000);
    expect(result.current.timeLeft).toBe(60);
  });

  it('ticks down as time passes', () => {
    const { result } = renderHook(() => useStudyTimer(60));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.timeLeft).toBe(50);
  });

  it('never goes below zero', () => {
    const { result } = renderHook(() => useStudyTimer(5));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.timeLeft).toBe(0);
  });

  it('re-arms when the duration prop changes', () => {
    const { result, rerender } = renderHook(({ d }) => useStudyTimer(d), {
      initialProps: { d: 30 },
    });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.timeLeft).toBe(25);
    rerender({ d: 120 });
    expect(result.current.timeLeft).toBe(120);
  });

  it('restart() resets the countdown to the full duration', () => {
    const { result } = renderHook(() => useStudyTimer(60));
    act(() => {
      vi.advanceTimersByTime(40_000);
    });
    expect(result.current.timeLeft).toBe(20);
    act(() => {
      result.current.restart();
    });
    expect(result.current.timeLeft).toBe(60);
  });
});
