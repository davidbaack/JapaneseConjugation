// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../utils/supabase.js', () => ({ supabase: null }));

import { AppStateProvider, useApp } from '../state/AppStateContext.jsx';

// Exercises the cross-view nav used to route a detected weakness from the
// Practice dashboard into the matching Drills exercise (e.g. Ending Lab).
function LabProbe() {
  const app = useApp();
  return (
    <div>
      <button type="button" onClick={() => app.openLabTool('endings')}>
        open endings
      </button>
      <button type="button" onClick={app.clearLabFocus}>
        clear focus
      </button>
      <output data-testid="tab">{app.tab}</output>
      <output data-testid="lab-focus">{JSON.stringify(app.labFocus)}</output>
    </div>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

describe('openLabTool', () => {
  it('focuses a Drills exercise and switches to the Drills tab', () => {
    render(
      <AppStateProvider>
        <LabProbe />
      </AppStateProvider>,
    );

    expect(screen.getByTestId('tab').textContent).toBe('practice');
    expect(screen.getByTestId('lab-focus').textContent).toBe('null');

    fireEvent.click(screen.getByRole('button', { name: 'open endings' }));

    expect(screen.getByTestId('tab').textContent).toBe('drills');
    expect(JSON.parse(screen.getByTestId('lab-focus').textContent)).toEqual({ tool: 'endings' });

    // The consumer clears the request so a later manual visit lands on default.
    fireEvent.click(screen.getByRole('button', { name: 'clear focus' }));
    expect(screen.getByTestId('lab-focus').textContent).toBe('null');
  });
});
