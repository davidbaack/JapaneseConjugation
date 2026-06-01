// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../utils/supabase.js', () => ({ supabase: null }));

import App from '../App.jsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

describe('SettingsView controls', () => {
  it('shows the restored prompt form and kana assist settings', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'settings', exact: true }));

    await screen.findByText('Practice session', {}, { timeout: 5000 });
    expect(screen.queryByText('Drill mode')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Transform', exact: true })).toBeNull();
    expect(screen.queryByText('Study direction')).toBeNull();
    expect(screen.queryByText('Timed drill')).toBeNull();
    expect(screen.queryByText('English hints')).toBeNull();
    expect(screen.queryByText(/Hidden mode can still ask Gemini/)).toBeNull();
    const answerMode = within(screen.getByRole('group', { name: 'Answer mode' }));
    expect(answerMode.getByRole('button', { name: 'Type answer', exact: true })).toBeTruthy();
    expect(answerMode.getByRole('button', { name: 'Choices', exact: true })).toBeTruthy();
    expect(answerMode.getByRole('button', { name: 'Self-check', exact: true })).toBeTruthy();
    expect(answerMode.getByRole('button', { name: 'Speak answer', exact: true })).toBeTruthy();
    expect(answerMode.queryByRole('button', { name: 'Free input', exact: true })).toBeNull();
    expect(answerMode.queryByRole('button', { name: 'Guided kana', exact: true })).toBeNull();
    expect(screen.getByText('Prompt form')).toBeTruthy();
    const promptForm = within(screen.getByRole('group', { name: 'Prompt form' }));
    expect(promptForm.getByRole('button', { name: 'Dictionary', exact: true })).toBeTruthy();
    expect(promptForm.getByRole('button', { name: 'Masu', exact: true })).toBeTruthy();
    expect(promptForm.getByRole('button', { name: 'Mixed', exact: true })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Plain Past/i })).toBeNull();
    expect(screen.queryByText(/Trick questions/i)).toBeNull();
    expect(screen.queryByText('Identical forms')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Color segments', exact: true })).toBeNull();
    expect(screen.queryByText('Guide tone')).toBeNull();
    expect(screen.queryByLabelText('Search conjugation forms')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Speak answers', exact: true })).toHaveLength(1);

    expect(screen.getByText('Kana help while typing')).toBeTruthy();
    const kanaHelp = within(screen.getByRole('group', { name: 'Kana help while typing' }));
    expect(kanaHelp.getByRole('button', { name: 'Off', exact: true })).toBeTruthy();
    expect(kanaHelp.getByRole('button', { name: 'Live', exact: true })).toBeTruthy();
    expect(kanaHelp.getByRole('button', { name: 'Guided', exact: true })).toBeTruthy();

    expect(screen.getByText('Word category label')).toBeTruthy();
    const wordCategory = within(screen.getByRole('group', { name: 'Word category label' }));
    expect(wordCategory.getByRole('button', { name: 'Show', exact: true })).toBeTruthy();
    expect(wordCategory.getByRole('button', { name: 'Hide', exact: true })).toBeTruthy();

    expect(screen.getByText('Conjugation types in scope')).toBeTruthy();
    expect(screen.getByText(/Current mix:/)).toBeTruthy();
    expect(screen.getByText(/drop-る, row-shift, irregular/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /ichidan: drop る/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /godan: row-shift/ })).toBeTruthy();
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

    fireEvent.click(promptForm.getByRole('button', { name: 'Masu', exact: true }));

    await waitFor(() => {
      const raw = localStorage.getItem('jp-verb-srs-v2');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw).practicePrefs.promptForm).toBe('polite-present');
    });

    fireEvent.click(kanaHelp.getByRole('button', { name: 'Guided', exact: true }));

    await waitFor(() => {
      const raw = localStorage.getItem('jp-verb-srs-v2');
      const prefs = JSON.parse(raw).practicePrefs;
      expect(prefs.answerMode).toBe('input');
      expect(prefs.kanaAssist).toBe('guided');
      expect(prefs).not.toHaveProperty('kanaMatchDisplay');
    });
  }, 15000);
});
