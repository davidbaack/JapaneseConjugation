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
  await screen.findByRole('heading', { name: 'What do you want to practice?' });
}

describe('App shell', () => {
  it('opens directly into selection-first Practice', async () => {
    await renderApp();

    expect(screen.getByRole('tab', { name: 'Practice' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Mixed practice on' })).toBeTruthy();
    expect(screen.queryByText('Practice run')).toBeNull();
    expect(screen.queryByText('Today drill')).toBeNull();
  });

  it('chooses a topic immediately and restores it after Mixed practice', async () => {
    await renderApp();

    fireEvent.click(screen.getAllByRole('button', { name: 'Volitional' })[0]);
    expect(
      await screen.findByRole('button', { name: 'Remove Volitional from practice' }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Mixed practice off' }));
    expect(await screen.findByText('Mixed practice is on. Your custom mix is saved.')).toBeTruthy();
    expect(screen.getByText(/Your custom mix is saved: Volitional/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Mixed practice on' }));
    expect(await screen.findByText('Your custom practice mix is restored.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Volitional from practice' })).toBeTruthy();
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
