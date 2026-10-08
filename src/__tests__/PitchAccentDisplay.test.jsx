// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import PitchAccentDisplay from '../components/PitchAccentDisplay.jsx';
import { accentForForm } from '../utils/pitchAccent.js';

const TABERU = {
  dict: '\u98df\u3079\u308b',
  reading: '\u305f\u3079\u308b',
  meaning: 'to eat',
  group: 'ichidan',
  pitchAccent: { accents: [2], source: 'kanjium' },
};

describe('PitchAccentDisplay', () => {
  it('renders an accessible high-low pitch cue', () => {
    render(
      <PitchAccentDisplay
        accent={accentForForm(TABERU, 'plain-negative', '\u305f\u3079\u306a\u3044')}
      />,
    );

    expect(
      screen.getByRole('img', {
        name: /Pitch accent for \u305f\u3079\u306a\u3044: drop after mora 2/,
      }),
    ).toBeTruthy();
    expect(screen.getAllByText('H').length).toBeGreaterThan(0);
    expect(screen.getAllByText('L').length).toBeGreaterThan(0);
  });

  it('renders nothing without accent data', () => {
    const { container } = render(<PitchAccentDisplay accent={null} />);

    expect(container.textContent).toBe('');
  });
});
