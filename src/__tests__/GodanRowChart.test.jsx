// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GodanRowChart } from '../components/GodanRowChart.jsx';

afterEach(cleanup);

describe('GodanRowChart', () => {
  it('renders the full godan row map from a-row through o-row', () => {
    render(<GodanRowChart />);

    expect(screen.getByRole('table', { name: 'Godan row map' })).toBeTruthy();
    for (const row of ['a-row', 'i-row', 'u-row', 'e-row', 'o-row']) {
      expect(screen.getByText(row)).toBeTruthy();
    }
    for (const ending of ['う', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る']) {
      expect(screen.getByTestId(`godan-row-${ending}-u-row`)).toBeTruthy();
    }

    expect(screen.getByTestId('godan-row-う-a-row').textContent).toContain('わ');
    expect(screen.getByText('not あ')).toBeTruthy();
  });

  it('highlights the requested ending and target row', () => {
    render(<GodanRowChart highlightEnding="む" highlightRow="a-row" />);

    const highlightedCell = screen.getByTestId('godan-row-む-a-row');
    expect(highlightedCell.getAttribute('aria-current')).toBe('true');
    expect(highlightedCell.textContent).toContain('ま');
    expect(screen.getByText(/Highlighted shift:/).textContent).toContain('む -> ま');
  });
});
