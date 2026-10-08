// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HorizontalChoiceRail from '../components/HorizontalChoiceRail.jsx';

function defineMetric(element, name, value, writable = false) {
  Object.defineProperty(element, name, { configurable: true, value, writable });
}

describe('HorizontalChoiceRail', () => {
  it('preserves child control semantics and reports hidden choices with edge cues', () => {
    render(
      <HorizontalChoiceRail
        ariaLabel="Practice categories"
        testId="category-rail"
        className="flex overflow-x-auto"
      >
        <button type="button" aria-pressed="true">
          Core forms
        </button>
        <button type="button" aria-pressed="false">
          Adjectives
        </button>
      </HorizontalChoiceRail>,
    );

    const rail = screen.getByRole('group', { name: 'Practice categories' });
    defineMetric(rail, 'clientWidth', 100);
    defineMetric(rail, 'scrollWidth', 240);
    defineMetric(rail, 'scrollLeft', 0, true);
    fireEvent.scroll(rail);

    expect(screen.getByRole('button', { name: 'Core forms' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.queryByTestId('category-rail-cue-left')).toBeNull();
    expect(screen.getByTestId('category-rail-cue-right')).toBeTruthy();

    rail.scrollLeft = 140;
    fireEvent.scroll(rail);
    expect(screen.getByTestId('category-rail-cue-left')).toBeTruthy();
    expect(screen.queryByTestId('category-rail-cue-right')).toBeNull();
  });
});
