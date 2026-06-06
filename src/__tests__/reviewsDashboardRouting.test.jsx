// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { StatsDashboard } from '../views/StatsView.jsx';
import { DEFAULT_PREFS } from '../data/defaults.js';
import { defaultState } from '../utils/storage.js';
import { buildReadinessFamilyRows, recordReadinessAttempt } from '../utils/readiness.js';

// Word-form readiness keys (kind:group:dict:reading|type), matching the format
// readiness stores under. Used to seed a speed-weak family for the row tests.
const GODAN_PLAIN_PAST_ID = 'verb:godan:書く:かく|plain-past';
const ICHIDAN_TE_FORM_ID = 'verb:ichidan:見る:みる|te-form';

afterEach(() => {
  cleanup();
});

// Minimal props to render the dashboard's Form-families card. A prior daily rep
// forces `hasHistory`, so the prioritized nudge renders; the routing handlers
// are spies so each test can assert exactly which Lab tool was summoned.
function renderDashboard(overrides = {}) {
  const handlers = {
    onStart: vi.fn(),
    onStartRecommendation: vi.fn(),
    onDrillReadiness: vi.fn(),
    onDrillEndingLab: vi.fn(),
    onDrillClassify: vi.fn(),
    onDrillRush: vi.fn(),
  };
  const props = {
    daily: { count: 1, goalStreak: 0 },
    practicePrefs: DEFAULT_PREFS,
    srsQueue: { dueRuleIds: [], completedDueRuleIds: [] },
    state: defaultState(),
    todayPlan: { available: true },
    todayDrillActive: false,
    readinessFamilies: [],
    weakestSkill: null,
    onbinWeakness: false,
    groupConfusion: false,
    ...handlers,
    ...overrides,
  };
  render(<StatsDashboard {...props} />);
  return { ...handlers, ...overrides };
}

const speedWeakest = {
  familyId: 'basic-tenses',
  label: 'Basics & Politeness',
  dimension: 'speed',
  dimensionLabel: 'Speed',
  status: 'weak',
  detail: '20s avg',
};
const productionWeakest = {
  familyId: 'basic-tenses',
  label: 'Basics & Politeness',
  dimension: 'production',
  dimensionLabel: 'Production',
  status: 'weak',
  detail: '2/5',
};
const onbinWeakest = {
  familyId: 'te-ta-sound-changes',
  label: 'Te/Ta Sound Changes',
  dimension: 'production',
  dimensionLabel: 'Production',
  status: 'weak',
  detail: '2/5',
};

describe('StatsDashboard primary nudge priority ladder', () => {
  it('keeps recommendations actionable without a default Start workout gate', () => {
    const recommendation = {
      id: 'lesson-basic-tenses',
      source: 'lesson',
      label: 'Basic tense refresher',
      detail: '4 cards',
    };
    const state = {
      ...defaultState(),
      reviewScope: {
        ...defaultState().reviewScope,
        recommendations: [recommendation],
      },
    };
    const spies = renderDashboard({ state });

    expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Basic tense refresher/i }));

    expect(spies.onStartRecommendation).toHaveBeenCalledWith(recommendation);
  });

  it('routes verb-group confusion to Groups, ahead of onbin and speed', () => {
    // Group confusion is foundational: even with onbin + a speed-weak skill also
    // detected, the single nudge picks Groups first.
    const spies = renderDashboard({
      groupConfusion: true,
      onbinWeakness: true,
      weakestSkill: speedWeakest,
    });

    const nudge = screen.getByRole('button', { name: /mixing up/i });
    expect(nudge.textContent).toMatch(/verb groups/);
    fireEvent.click(nudge);

    expect(spies.onDrillClassify).toHaveBeenCalledTimes(1);
    expect(spies.onDrillEndingLab).not.toHaveBeenCalled();
    expect(spies.onDrillRush).not.toHaveBeenCalled();
    expect(spies.onDrillReadiness).not.toHaveBeenCalled();
  });

  it('routes onbin sound-change misses on the te/ta family to Ending Lab', () => {
    const spies = renderDashboard({
      onbinWeakness: true,
      weakestSkill: onbinWeakest,
    });

    const nudge = screen.getByRole('button', { name: /You keep missing/i });
    expect(nudge.textContent).toMatch(/sound changes/);
    fireEvent.click(nudge);

    expect(spies.onDrillEndingLab).toHaveBeenCalledTimes(1);
    expect(spies.onDrillClassify).not.toHaveBeenCalled();
    expect(spies.onDrillRush).not.toHaveBeenCalled();
    expect(spies.onDrillReadiness).not.toHaveBeenCalled();
  });

  it('routes a weak speed dimension to Rush', () => {
    const spies = renderDashboard({ weakestSkill: speedWeakest });

    const nudge = screen.getByRole('button', { name: /recall is slow/i });
    expect(nudge.textContent).toMatch(/build speed in Rush/);
    fireEvent.click(nudge);

    expect(spies.onDrillRush).toHaveBeenCalledTimes(1);
    expect(spies.onDrillClassify).not.toHaveBeenCalled();
    expect(spies.onDrillEndingLab).not.toHaveBeenCalled();
    expect(spies.onDrillReadiness).not.toHaveBeenCalled();
  });

  it('falls back to a generic scoped readiness drill for other weak skills', () => {
    const spies = renderDashboard({ weakestSkill: productionWeakest });

    const nudge = screen.getByRole('button', { name: /Sharpen/i });
    expect(nudge.textContent).toMatch(/Basics & Politeness/);
    fireEvent.click(nudge);

    expect(spies.onDrillReadiness).toHaveBeenCalledWith({
      familyId: 'basic-tenses',
      dimension: 'production',
    });
    expect(spies.onDrillClassify).not.toHaveBeenCalled();
    expect(spies.onDrillEndingLab).not.toHaveBeenCalled();
    expect(spies.onDrillRush).not.toHaveBeenCalled();
  });
});

describe('StatsDashboard per-family speed routing', () => {
  // Seed a family whose weakest readiness dimension is speed (slow but correct
  // reps keep production strong) plus a card so the strength row renders.
  function speedWeakState(ruleId) {
    const state = defaultState();
    let readiness = state.readiness;
    for (let i = 0; i < 3; i += 1) {
      readiness = recordReadinessAttempt(readiness, ruleId, {
        correct: true,
        responseMs: 20000,
        answerMode: 'input',
        now: 1000 + i,
      });
    }
    return {
      ...state,
      readiness,
      cards: { [ruleId]: { correct: 5, incorrect: 0 } },
    };
  }

  it('offers a Drill speed in Rush button on a speed-weak family row', () => {
    const state = speedWeakState(GODAN_PLAIN_PAST_ID);
    const spies = renderDashboard({
      state,
      readinessFamilies: buildReadinessFamilyRows(state),
      // Generic nudge so this assertion is isolated to the per-row button.
      weakestSkill: productionWeakest,
    });

    const rowButton = screen.getByRole('button', { name: /Drill speed in Rush/i });
    fireEvent.click(rowButton);

    expect(spies.onDrillRush).toHaveBeenCalledTimes(1);
    expect(spies.onDrillReadiness).not.toHaveBeenCalled();
  });

  it('prefers Ending Lab over Rush on the te-form row when onbin is detected', () => {
    const state = speedWeakState(ICHIDAN_TE_FORM_ID);
    renderDashboard({
      state,
      readinessFamilies: buildReadinessFamilyRows(state),
      onbinWeakness: true,
      weakestSkill: onbinWeakest,
    });

    // rowToRush is gated by !rowToEndingLab, so the te-form row routes to Ending
    // Lab even though its weakest dimension is speed.
    expect(screen.getByRole('button', { name: /Drill sound changes in Ending Lab/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Drill speed in Rush/i })).toBeNull();
  });
});
