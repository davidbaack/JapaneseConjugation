// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

function RecommendationProbe() {
  const app = useApp();
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          app.startReviewRecommendation({
            id: 'lab-test-review',
            source: 'lab',
            label: 'Lab test review',
            typeIds: ['te-form'],
            suggestedCount: 6,
          })
        }
      >
        start recommendation
      </button>
      <output data-testid="enabled-types">{JSON.stringify(app.state.enabledTypes)}</output>
      <output data-testid="study-focus">{JSON.stringify(app.studyFocus)}</output>
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

describe('startReviewRecommendation', () => {
  it('keeps the pre-focus enabled forms so Exit Focus can restore them', async () => {
    render(
      <AppStateProvider>
        <RecommendationProbe />
      </AppStateProvider>,
    );

    const beforeTypes = JSON.parse(screen.getByTestId('enabled-types').textContent);

    fireEvent.click(screen.getByRole('button', { name: 'start recommendation' }));

    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId('enabled-types').textContent)).toEqual(['te-form']),
    );
    const focus = JSON.parse(screen.getByTestId('study-focus').textContent);
    expect(focus.recommendation.returnEnabledTypes).toEqual(beforeTypes);
  });
});
