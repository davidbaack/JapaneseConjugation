// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mockedApp = vi.hoisted(() => ({ value: null }));

vi.mock('../state/AppStateContext.jsx', () => ({
  AppStateProvider: ({ children }) => children,
  useApp: () => mockedApp.value,
}));

import { SRSQueueBar } from '../App.jsx';

function appState(overrides = {}) {
  return {
    state: { session: { reviewed: 4, correct: 3 } },
    tab: 'library',
    setTab: vi.fn(),
    practicePrefs: { dailyGoal: 30 },
    session: { user: { id: 'learner' } },
    syncStatus: { kind: 'ok' },
    daily: { count: 4, goalStreak: 0 },
    dailyPct: 13,
    showAuth: vi.fn(),
    todayPlan: {
      available: true,
      forecastLabel: '2 tomorrow',
      sourceCounts: { due: 2 },
      summary: '2 due',
    },
    todayGoalHit: false,
    todayDrillActive: false,
    srsQueue: { dueRuleIds: [], completedDueRuleIds: [], startedAt: null },
    startTodayDrill: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mockedApp.value = null;
  vi.clearAllMocks();
});

describe('SRSQueueBar', () => {
  it('starts a ready review from the queue bar', () => {
    const app = appState();
    mockedApp.value = app;

    render(<SRSQueueBar />);

    fireEvent.click(screen.getByRole('button', { name: 'Start review' }));

    expect(app.startTodayDrill).toHaveBeenCalledWith(app.todayPlan);
    expect(app.setTab).not.toHaveBeenCalled();
  });

  it('jumps back to Study when an active queue is still ready', () => {
    const app = appState({
      todayDrillActive: true,
      todayPlan: {
        available: true,
        forecastLabel: '2 tomorrow',
        sourceCounts: { due: 0 },
        summary: 'Today drill',
      },
      srsQueue: {
        dueRuleIds: ['plain-past', 'te-form'],
        completedDueRuleIds: ['plain-past'],
        startedAt: Date.now(),
      },
    });
    mockedApp.value = app;

    render(<SRSQueueBar />);

    fireEvent.click(screen.getByRole('button', { name: 'Go study' }));

    expect(app.setTab).toHaveBeenCalledWith('study');
    expect(app.startTodayDrill).not.toHaveBeenCalled();
  });
});
