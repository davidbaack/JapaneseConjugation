// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../utils/supabase.js', () => ({ supabase: null }));

import App from '../App.jsx';
import { DEFAULT_PREFS } from '../data/defaults.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

describe('SettingsView controls', () => {
  it('shows review settings without legacy study-mode controls', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Settings', exact: true }));

    await screen.findByText('Practice session', {}, { timeout: 5000 });
    expect(screen.queryByText('Drill mode')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Transform', exact: true })).toBeNull();
    expect(screen.queryByText('Study direction')).toBeNull();
    expect(screen.queryByText('Timed drill')).toBeNull();
    const answerMode = within(screen.getByRole('group', { name: 'Answer mode' }));
    expect(answerMode.getByRole('button', { name: 'Type answer', exact: true })).toBeTruthy();
    expect(answerMode.getByRole('button', { name: 'Choices', exact: true })).toBeTruthy();
    expect(answerMode.getByRole('button', { name: 'Self-check', exact: true })).toBeTruthy();
    expect(answerMode.getByRole('button', { name: 'Speak answer', exact: true })).toBeTruthy();
    expect(answerMode.queryByRole('button', { name: 'Free input', exact: true })).toBeNull();
    expect(answerMode.queryByRole('button', { name: 'Guided kana', exact: true })).toBeNull();
    expect(screen.queryByText('Prompt form')).toBeNull();
    expect(screen.getByText('Review style')).toBeTruthy();
    const reviewStyle = within(screen.getByRole('group', { name: 'Review style' }));
    expect(reviewStyle.getByRole('button', { name: 'Auto', exact: true })).toBeTruthy();
    expect(reviewStyle.getByRole('button', { name: 'Forms only', exact: true })).toBeTruthy();
    expect(reviewStyle.getByRole('button', { name: 'Reading practice', exact: true })).toBeTruthy();
    expect(screen.getByText('Source forms')).toBeTruthy();
    const sourceForms = within(screen.getByRole('group', { name: 'Source forms' }));
    expect(sourceForms.getByRole('button', { name: 'Auto', exact: true })).toBeTruthy();
    expect(sourceForms.getByRole('button', { name: 'Dictionary', exact: true })).toBeTruthy();
    expect(sourceForms.getByRole('button', { name: 'Masu', exact: true })).toBeTruthy();
    expect(sourceForms.getByRole('button', { name: 'Mixed', exact: true })).toBeTruthy();
    expect(screen.getByText('New cards/day')).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Plain Past/i })).toBeNull();
    expect(screen.queryByText(/Trick questions/i)).toBeNull();
    expect(screen.queryByText('Identical forms')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Color segments', exact: true })).toBeNull();
    expect(screen.queryByText('Guide tone')).toBeNull();
    expect(screen.queryByLabelText('Search conjugation forms')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Speak answers', exact: true })).toHaveLength(1);

    expect(screen.queryByText('Kana help while typing')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Kana help while typing' })).toBeNull();

    expect(screen.getByText('Vocabulary scope')).toBeTruthy();
    const nounToggle = screen.getByRole('button', { name: 'Include nouns', exact: true });
    expect(nounToggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('Vocabulary filters')).toBeNull();
    expect(screen.queryByText('JLPT levels')).toBeNull();
    expect(screen.queryByText('Genki lessons')).toBeNull();
    expect(screen.queryByText('Word types')).toBeNull();
    expect(screen.queryByText('Word groups')).toBeNull();
    expect(screen.queryByText(/Refines every drill/)).toBeNull();
    expect(screen.queryByText(/Textbook selection applies/)).toBeNull();

    expect(screen.getByText('Word category label')).toBeTruthy();
    const wordCategory = within(screen.getByRole('group', { name: 'Word category label' }));
    expect(wordCategory.getByRole('button', { name: 'Show', exact: true })).toBeTruthy();
    expect(wordCategory.getByRole('button', { name: 'Hide', exact: true })).toBeTruthy();

    expect(screen.getByText('Conjugation types in scope')).toBeTruthy();
    expect(screen.getByText(/Current mix:/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Custom/ }));
    expect(screen.getByText(/drop-る, row-shift, irregular/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Plain Past/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Te-form/ }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Hides う-verb \/ る-verb/)).toBeNull();

    await waitFor(() => {
      const raw = localStorage.getItem('jp-verb-srs-v2');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw).practicePrefs.showWordCategory).toBe(false);
    });

    fireEvent.click(wordCategory.getByRole('button', { name: 'Show', exact: true }));
    await waitFor(() => {
      const raw = localStorage.getItem('jp-verb-srs-v2');
      expect(JSON.parse(raw).practicePrefs.showWordCategory).toBe(true);
    });

    fireEvent.click(nounToggle);
    await waitFor(() => {
      const raw = localStorage.getItem('jp-verb-srs-v2');
      expect(JSON.parse(raw).practicePrefs.wordGroups).toEqual([
        ...DEFAULT_PREFS.wordGroups,
        'noun',
      ]);
      expect(nounToggle.getAttribute('aria-pressed')).toBe('true');
    });

    fireEvent.click(sourceForms.getByRole('button', { name: 'Masu', exact: true }));

    await waitFor(() => {
      const raw = localStorage.getItem('jp-verb-srs-v2');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw).practicePrefs.sourceFormStrategy).toBe('masu');
      expect(JSON.parse(raw).practicePrefs.promptForm).toBe('polite-present');
    });

    expect(screen.getByText('Reset & cleanup')).toBeTruthy();
    expect(screen.getByText('Reset review progress')).toBeTruthy();
    expect(screen.getByText('Restore default settings')).toBeTruthy();
    expect(screen.getByText('Clear custom learner content')).toBeTruthy();
    expect(screen.getByText('Factory reset account')).toBeTruthy();
    expect(
      screen.getByText('Settings, form scope, Library exclusions, custom words, and lists'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Restore settings', exact: true }));
    expect(screen.getByRole('button', { name: 'Yes, restore settings', exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));

    fireEvent.click(screen.getByRole('button', { name: 'Factory reset', exact: true }));
    expect(screen.queryByRole('button', { name: 'Open export', exact: true })).toBeNull();
    expect(screen.queryByText('Export is available first.')).toBeNull();
    const factoryInput = screen.getByLabelText('Type RESET to confirm factory reset');
    const factoryButton = screen.getByRole('button', { name: 'Factory reset', exact: true });
    expect(factoryButton.disabled).toBe(true);
    fireEvent.change(factoryInput, { target: { value: 'RESET' } });
    expect(factoryButton.disabled).toBe(false);

    expect(screen.queryByRole('button', { name: 'Guided', exact: true })).toBeNull();
  }, 15000);
});
