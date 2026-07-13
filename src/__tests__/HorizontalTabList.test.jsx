// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HorizontalTabList, { horizontalEdges } from '../components/HorizontalTabList.jsx';

function defineMetric(element, name, value, writable = false) {
  Object.defineProperty(element, name, { configurable: true, value, writable });
}

function Tabs({ active }) {
  return (
    <HorizontalTabList activeId={active} ariaLabel="Test tabs" className="flex overflow-x-auto">
      {['first', 'middle', 'last'].map((id) => (
        <button key={id} role="tab" aria-selected={active === id}>
          {id}
        </button>
      ))}
    </HorizontalTabList>
  );
}

describe('HorizontalTabList', () => {
  it('reports boundary-aware scroll cues', () => {
    expect(horizontalEdges({ scrollLeft: 0, scrollWidth: 300, clientWidth: 100 })).toEqual({
      canScrollLeft: false,
      canScrollRight: true,
    });
    expect(horizontalEdges({ scrollLeft: 50, scrollWidth: 300, clientWidth: 100 })).toEqual({
      canScrollLeft: true,
      canScrollRight: true,
    });
    expect(horizontalEdges({ scrollLeft: 200, scrollWidth: 300, clientWidth: 100 })).toEqual({
      canScrollLeft: true,
      canScrollRight: false,
    });
  });

  it('shows only the cues for content hidden beyond the current boundaries', () => {
    render(<Tabs active="first" />);
    const list = screen.getByRole('tablist', { name: 'Test tabs' });
    defineMetric(list, 'clientWidth', 100);
    defineMetric(list, 'scrollWidth', 300);
    defineMetric(list, 'scrollLeft', 0, true);

    fireEvent.scroll(list);
    expect(screen.queryByTestId('horizontal-tab-cue-left')).toBeNull();
    expect(screen.getByTestId('horizontal-tab-cue-right').className).toContain(
      'pointer-events-none',
    );

    list.scrollLeft = 50;
    fireEvent.scroll(list);
    expect(screen.getByTestId('horizontal-tab-cue-left')).toBeTruthy();
    expect(screen.getByTestId('horizontal-tab-cue-right')).toBeTruthy();

    list.scrollLeft = 200;
    fireEvent.scroll(list);
    expect(screen.getByTestId('horizontal-tab-cue-left')).toBeTruthy();
    expect(screen.queryByTestId('horizontal-tab-cue-right')).toBeNull();
  });

  it('moves only the tablist scroll position to keep the active tab fully visible', () => {
    const { rerender } = render(<Tabs active="first" />);
    const list = screen.getByRole('tablist', { name: 'Test tabs' });
    const tabs = screen.getAllByRole('tab');
    defineMetric(list, 'clientWidth', 100);
    defineMetric(list, 'scrollWidth', 300);
    defineMetric(list, 'scrollLeft', 0, true);
    defineMetric(tabs[0], 'offsetLeft', 0);
    defineMetric(tabs[0], 'offsetWidth', 60);
    defineMetric(tabs[1], 'offsetLeft', 110);
    defineMetric(tabs[1], 'offsetWidth', 60);
    defineMetric(tabs[2], 'offsetLeft', 220);
    defineMetric(tabs[2], 'offsetWidth', 60);

    rerender(<Tabs active="last" />);

    expect(list.scrollLeft).toBe(184);
  });
});
