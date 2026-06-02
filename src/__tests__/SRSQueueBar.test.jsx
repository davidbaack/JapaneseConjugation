// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mockedApp = vi.hoisted(() => ({ value: null }));

vi.mock('../state/AppStateContext.jsx', () => ({
  AppStateProvider: ({ children }) => children,
  useApp: () => mockedApp.value,
}));

import { PracticalCorePathPanel, SRSQueueBar } from '../App.jsx';

function appState(overrides = {}) {
  return {
    state: { session: { reviewed: 4, correct: 3 } },
    tab: 'library',
    setTab: vi.fn(),
    practicePrefs: { dailyGoal: 30 },
    session: { user: { id: 'learner' } },
    supabase: { _configured: true },
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
    practicalCorePathActive: false,
    srsQueue: { dueRuleIds: [], completedDueRuleIds: [], startedAt: null },
    startTodayDrill: vi.fn(),
    practicalCorePath: {
      available: true,
      activeStageId: 'foundations',
      activeStage: {
        id: 'foundations',
        label: 'Foundations',
        focus: 'Past, negative, polite, and te-form',
      },
      completeStages: 0,
      totalProgressPct: 0,
      stages: [
        {
          id: 'foundations',
          label: 'Foundations',
          stats: { complete: false, progressPct: 0 },
        },
        {
          id: 'everyday',
          label: 'Everyday production',
          stats: { complete: false, progressPct: 0 },
        },
        {
          id: 'fluency',
          label: 'Mixed fluency',
          stats: { complete: false, progressPct: 0 },
        },
      ],
      plan: { available: true, typeIds: ['plain-past'], wordKeys: ['godan:\u8d70\u308b'] },
    },
    startPracticalCorePath: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mockedApp.value = null;
  vi.clearAllMocks();
});

describe('SRSQueueBar', () => {
  it('starts a local review while signed out', () => {
    const app = appState({
      session: null,
    });
    mockedApp.value = app;

    render(<SRSQueueBar />);

    expect(screen.getByText('SRS Queue')).toBeTruthy();
    expect(screen.getByText('local')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start review' }));

    expect(app.startTodayDrill).toHaveBeenCalledWith(app.todayPlan);
  });

  it('keeps sign-in scoped to cloud sync', () => {
    const app = appState({
      session: null,
      supabase: null,
    });
    mockedApp.value = app;

    render(<SRSQueueBar />);

    expect(screen.queryByRole('button', { name: 'Sign in to sync' })).toBeNull();
  });

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

  it('starts the Practical Core Path from Study', () => {
    const app = appState({ tab: 'study' });
    mockedApp.value = app;

    render(<PracticalCorePathPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Core Path' }));

    expect(app.startPracticalCorePath).toHaveBeenCalledWith(app.practicalCorePath);
  });

  it('returns to Study when the Practical Core Path is already active', () => {
    const app = appState({ tab: 'study', practicalCorePathActive: true });
    mockedApp.value = app;

    render(<PracticalCorePathPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue path' }));

    expect(app.setTab).toHaveBeenCalledWith('study');
    expect(app.startPracticalCorePath).not.toHaveBeenCalled();
  });

  it('hides the Practical Core Path panel outside Study', () => {
    const app = appState({ tab: 'library' });
    mockedApp.value = app;

    render(<PracticalCorePathPanel />);

    expect(screen.queryByText('Practical Core Path')).toBeNull();
  });
});
