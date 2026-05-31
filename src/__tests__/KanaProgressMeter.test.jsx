// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import KanaProgressMeter from '../components/KanaProgressMeter.jsx';

afterEach(cleanup);

const emptyCells = [
  { expected: 'た', shown: '', state: 'empty' },
  { expected: 'べ', shown: '', state: 'empty' },
  { expected: 'た', shown: '', state: 'empty' },
];

describe('KanaProgressMeter', () => {
  it('shows empty count cells in color-count mode', () => {
    render(<KanaProgressMeter cells={emptyCells} mode="color-count" />);

    expect(screen.getByRole('group', { name: 'Kana progress' })).toBeTruthy();
    expect(screen.getAllByText('\u00b7')).toHaveLength(3);
  });

  it('stays hidden in color mode until there is typed progress', () => {
    render(<KanaProgressMeter cells={emptyCells} mode="color" />);

    expect(screen.queryByRole('group', { name: 'Kana progress' })).toBeNull();
  });

  it('announces the supplied status text', () => {
    render(
      <KanaProgressMeter
        cells={[{ expected: 'た', shown: 'た', state: 'correct' }]}
        status="Complete match. Press Enter."
        statusTone="success"
      />,
    );

    expect(screen.getByText('Complete match. Press Enter.')).toBeTruthy();
  });
});
