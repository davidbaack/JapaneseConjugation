// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';

vi.mock('../utils/supabase.js', () => ({ supabase: null }));

import { AppStateProvider, useApp } from '../state/AppStateContext.jsx';

function PracticalCoreProbe() {
  const app = useApp();
  const [startResult, setStartResult] = useState('');

  return (
    <div>
      <button
        type="button"
        onClick={() => setStartResult(String(app.startPracticalCorePath(app.practicalCorePath)))}
      >
        Start Core Path
      </button>
      <output data-testid="core-available">{String(app.practicalCorePath.available)}</output>
      <output data-testid="core-start-result">{startResult}</output>
      <output data-testid="core-baseline">
        {JSON.stringify(app.srsQueue.practicalCoreBaseline || null)}
      </output>
    </div>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('AppStateProvider Practical Core Path state', () => {
  it('stores a Practical Core baseline when the path starts', async () => {
    render(
      <AppStateProvider>
        <PracticalCoreProbe />
      </AppStateProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('core-available').textContent).toBe('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start Core Path' }));

    expect(screen.getByTestId('core-start-result').textContent).toBe('true');

    await waitFor(() => {
      const baseline = JSON.parse(screen.getByTestId('core-baseline').textContent);
      expect(baseline).toMatchObject({
        activeStageId: 'foundations',
        stages: [
          { id: 'foundations', correct: 0, progressPct: 0 },
          { id: 'everyday', correct: 0, progressPct: 0 },
          { id: 'fluency', correct: 0, progressPct: 0 },
        ],
      });
    });
  });
});
