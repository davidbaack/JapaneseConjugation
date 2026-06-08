// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../utils/supabase.js', () => ({ supabase: null }));

import App from '../App.jsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

function expectPressed(button, pressed) {
  expect(button.getAttribute('aria-pressed')).toBe(String(pressed));
}

describe('SettingsView controls', () => {
  it('keeps Settings focused on durable preferences instead of workout scope', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Settings', exact: true }));

    await screen.findByText('Display & audio', {}, { timeout: 5000 });

    for (const oldControl of [
      'Practice session',
      'Answer mode',
      'Review style',
      'Source forms',
      'New cards/day',
      'Daily goal',
      'Conjugation types in scope',
      'Conjugation type packs',
    ]) {
      expect(screen.queryByText(oldControl)).toBeNull();
    }

    const displayScripts = within(screen.getByRole('group', { name: 'Display scripts' }));
    expectPressed(displayScripts.getByRole('button', { name: 'Kanji', exact: true }), true);
    expectPressed(displayScripts.getByRole('button', { name: 'Romaji', exact: true }), false);

    const englishHints = within(screen.getByRole('group', { name: 'English meaning' }));
    expectPressed(englishHints.getByRole('button', { name: 'Hide', exact: true }), true);

    expect(screen.getByText('Word category label')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Speak answers', exact: true })).toHaveLength(1);

    expect(screen.getByText('Reset & cleanup')).toBeTruthy();
    expect(screen.getByText('Reset practice progress')).toBeTruthy();
    expect(
      screen.getByText('Settings, category scope, Tools word exclusions, custom words, and lists'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Restore settings', exact: true }));
    expect(screen.getByRole('button', { name: 'Yes, restore settings', exact: true })).toBeTruthy();
  }, 15000);
});
