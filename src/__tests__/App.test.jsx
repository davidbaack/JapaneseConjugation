// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import App from '../App.jsx';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '';
  window.Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderApp() {
  await act(async () => {
    render(<App />);
  });
  await screen.findByRole('textbox', { name: 'Answer' });
}

describe('App shell', () => {
  it('opens directly into task-first Practice with always-visible compact controls', async () => {
    await renderApp();

    expect(screen.getByRole('tab', { name: 'Practice' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Core forms' })).toBeTruthy();
    expect(screen.getByText('8 forms')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Non-past' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Negative' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Polite' })).toBeTruthy();
    expect(screen.queryByText('Change', { exact: true })).toBeNull();
    expect(screen.queryByText(/Mixed practice/)).toBeNull();
    expect(screen.queryByText('Practice run')).toBeNull();
    expect(screen.queryByText('Today drill')).toBeNull();
  });

  it('combines category toggles with cross-category quick filters', async () => {
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Wants & intentions' }));
    expect(await screen.findByText('Wants & intentions added to Practice.')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Past' }));
    expect(await screen.findByText('Time filter set to Past.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Past' }).getAttribute('aria-checked')).toBe('true');
  });

  it('previews category endings and inspects inactive exact forms without changing scope', async () => {
    await renderApp();

    const coreForms = screen.getByRole('button', { name: 'Core forms' });
    expect(coreForms.getAttribute('aria-description')).toContain('8 of 8 forms');
    expect(coreForms.getAttribute('aria-description')).toContain('〜ない not');

    fireEvent.click(screen.getByRole('button', { name: 'See all forms' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand Ability & ongoing forms' }));

    expect(screen.getByText('食べる → 食べられる')).toBeTruthy();
    expect(screen.getByText('書く → 書ける')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Ability & ongoing' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('adds one exact form from an off category', async () => {
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'See all forms' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand Ability & ongoing forms' }));
    const exactForms = document.getElementById('practice-category-forms-ability-ongoing');
    fireEvent.click(within(exactForms).getByRole('button', { name: 'Potential' }));

    expect(await screen.findByText('Potential added to Practice.')).toBeTruthy();
    expect(screen.getByText('9 forms')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Ability & ongoing' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('blocks exact forms excluded by a global filter and names the conflict', async () => {
    await renderApp();

    fireEvent.click(screen.getByRole('radio', { name: 'Past' }));
    fireEvent.click(screen.getByRole('button', { name: 'See all forms' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand Te-form forms' }));
    const exactForms = document.getElementById('practice-category-forms-te-form');
    fireEvent.click(within(exactForms).getByRole('button', { name: 'Te-form' }));

    expect(
      await screen.findByText('Te-form does not match Time: Past. Set Time to All first.'),
    ).toBeTruthy();
    expect(screen.getByText('4 forms')).toBeTruthy();
    expect(
      within(screen.getByRole('group', { name: 'Practice categories' }))
        .getByRole('button', { name: 'Te-form' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('shows lifetime and trend-oriented Stats without review scheduling', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));

    expect(await screen.findByText('See what is getting easier.')).toBeTruthy();
    expect(screen.getByText('Accuracy over the last 14 days')).toBeTruthy();
    expect(screen.getByText('Lifetime strength by topic')).toBeTruthy();
    expect(screen.queryByText('Upcoming reviews')).toBeNull();
  });

  it('teaches Volitional and Wanting as separate lessons', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Learn' }));

    await waitFor(() => expect(screen.getByText('Guided lesson tracks')).toBeTruthy());
    expect(screen.getAllByText('Volitional').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Wanting with 〜たい').length).toBeGreaterThan(0);
  });
});
