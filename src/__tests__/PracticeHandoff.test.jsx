// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/supabase.js', () => ({
  getSupabaseClientState: () => ({
    configured: false,
    status: 'unconfigured',
    error: null,
    client: null,
  }),
  subscribeSupabaseClient: () => () => {},
  shouldRestoreSupabaseSession: () => false,
}));

import { AppStateProvider, useApp } from '../state/AppStateContext.jsx';
import { DEFAULT_PREFS, STORAGE_KEY } from '../data/defaults.js';
import { defaultState } from '../utils/storage.js';
import {
  effectiveTypeIdsForPracticeSelection,
  practiceSelectionForTypeIds,
  updateStatePracticeSelection,
} from '../utils/practiceSelection.js';
import {
  excludeFormFamilyFromReviewState,
  excludeWordFromReviewState,
  formFamilyForType,
} from '../utils/reviewScope.js';

const WORD = { dict: '読む', reading: 'よむ', meaning: 'to read', group: 'godan' };

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

async function renderController({ typeIds = ['causative'], prefs = {} } = {}) {
  const selection = practiceSelectionForTypeIds(typeIds);
  const state = updateStatePracticeSelection(defaultState(), selection);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      state,
      customVerbs: [],
      customAdjectives: [],
      wordLists: [],
      practicePrefs: { ...DEFAULT_PREFS, ...prefs },
    }),
  );
  let app;
  function Probe() {
    app = useApp();
    return null;
  }
  render(
    <AppStateProvider>
      <Probe />
    </AppStateProvider>,
  );
  await waitFor(() => expect(app.hydrated).toBe(true));
  return () => app;
}

describe('Cross-view word Practice launches', () => {
  it.each(['input', 'choice'])(
    'persists a requested form and clears conflicting exercise modes while preserving %s answers',
    async (answerMode) => {
      const current = await renderController({
        prefs: {
          answerMode,
          reviewStyle: 'reading',
          sourceFormStrategy: 'mixed',
          promptForm: 'polite-present',
          minimalPairSetId: 'ichidan-godan-ru',
          minimalPairReturn: { enabledTypes: ['causative'] },
          reviewLimit: 8,
          reviewLimitSource: 'lab',
          practicePath: 'old-path',
          wordListIds: ['old-list'],
        },
      });
      act(() => {
        current().setState((prev) => ({
          ...excludeWordFromReviewState(
            excludeFormFamilyFromReviewState(prev, formFamilyForType('plain-negative').id),
            WORD,
          ),
          practiceSelection: {
            ...prev.practiceSelection,
            filters: { time: 'all', polarity: 'positive', style: 'plain' },
          },
        }));
      });
      sessionStorage.setItem('jp-study-current', JSON.stringify({ type: 'causative' }));
      const progressBefore = current().state.practiceStats;

      act(() => current().practiceWord(WORD, 'plain-negative'));

      expect(current().state.enabledTypes).toEqual(['plain-negative']);
      expect(effectiveTypeIdsForPracticeSelection(current().state.practiceSelection)).toEqual([
        'plain-negative',
      ]);
      expect(current().state.practiceSelection.filters).toEqual({
        time: 'all',
        polarity: 'all',
        style: 'all',
      });
      expect(current().state.reviewScope.excludedWordKeys).toEqual([]);
      expect(current().state.reviewScope.excludedFormFamilyIds).toEqual([]);
      expect(current().practicePrefs).toMatchObject({
        answerMode,
        reviewStyle: 'forms',
        sourceFormStrategy: 'dictionary',
        promptForm: 'dictionary',
        minimalPairSetId: '',
        minimalPairReturn: null,
        reviewLimit: 0,
        reviewLimitSource: '',
        practicePath: '',
        wordListIds: [],
      });
      expect(current().studyFocus).toMatchObject({ word: WORD, type: 'plain-negative' });
      expect(current().tab).toBe('practice');
      expect(sessionStorage.getItem('jp-study-current')).toBeNull();
      expect(current().state.practiceStats).toEqual(progressBefore);
    },
  );

  it.each(['compare', 'weak', 'inventory'])(
    'preserves the prepared Practice selection for a %s seed card',
    async (launchMode) => {
      const current = await renderController({ typeIds: ['plain-negative', 'plain-past'] });
      const selectionBefore = current().state.practiceSelection;
      act(() => current().practiceWord(WORD, 'plain-negative', { launchMode }));
      expect(current().state.practiceSelection).toEqual(selectionBefore);
      expect(current().state.enabledTypes).toEqual(['plain-negative', 'plain-past']);
      expect(current().studyFocus).toMatchObject({
        word: WORD,
        type: 'plain-negative',
        launchMode,
      });
    },
  );

  it.each(['word', 'word-sweep'])(
    'keeps the learner selection and answer settings for a %s launch',
    async (launchMode) => {
      const current = await renderController({
        typeIds: ['plain-negative', 'te-form'],
        prefs: { answerMode: 'choice' },
      });
      const selectionBefore = current().state.practiceSelection;
      const prefsBefore = current().practicePrefs;
      act(() => current().practiceWord(WORD, null, { launchMode }));
      expect(current().state.practiceSelection).toEqual(selectionBefore);
      expect(current().practicePrefs).toEqual(prefsBefore);
      expect(current().studyFocus).toMatchObject({ word: WORD, type: null, launchMode });
    },
  );
});
