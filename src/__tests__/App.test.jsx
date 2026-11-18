// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  it('opens directly into Practice with a compact exact-form summary', async () => {
    await renderApp();
    expect(screen.getByRole('tab', { name: 'Practice' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('heading', { name: 'Practicing 8 forms' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose forms' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(screen.queryByRole('searchbox', { name: 'Find a form' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Practice categories' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Time' })).toBeNull();
    expect(screen.queryByText(/Mixed practice/)).toBeNull();
    expect(screen.queryByText('Practice run')).toBeNull();
  });

  it('adds one exact form without selecting its negative or ongoing siblings', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Choose forms' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a form' }), {
      target: { value: 'potential' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Potential · plain', exact: true }));
    expect(await screen.findByText('Potential · plain added to Practice.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Practicing 9 forms' })).toBeTruthy();
    expect(
      screen.getByRole('checkbox', { name: 'Potential · negative · plain', exact: true }).checked,
    ).toBe(false);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a form' }), {
      target: { value: 'progressive' },
    });
    expect(screen.getByRole('checkbox', { name: 'Progressive · plain', exact: true }).checked).toBe(
      false,
    );
  });

  it('browses examples without changing selection and closes the chooser', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Choose forms' }));
    fireEvent.click(screen.getByRole('button', { name: 'Potential', exact: true }));
    expect(screen.getByText('食べる → 食べられる')).toBeTruthy();
    expect(screen.getByText('書く → 書ける')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Practicing 8 forms' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close form chooser' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Choose forms' }));
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
