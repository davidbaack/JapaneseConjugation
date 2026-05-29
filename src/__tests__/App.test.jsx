// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

// No Supabase configured in tests → auth/sync effects no-op (offline-first path).
vi.mock('../utils/supabase.js', () => ({ supabase: null }));

import App from '../App.jsx';

afterEach(cleanup);

describe('App shell', () => {
  it('renders the header, tagline, and full nav', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Katachiya/ })).toBeTruthy();
    expect(screen.getByText('Spaced repetition, reference tables, and AI coaching')).toBeTruthy();
    for (const tab of ['study', 'check', 'rush', 'settings', 'library', 'stats']) {
      expect(screen.getByRole('button', { name: tab, exact: true })).toBeTruthy();
    }
  });

  it('lazy-loads the default Study view without crashing', async () => {
    render(<App />);
    // The Suspense skeleton resolves to the Study view; its answer input appears.
    await waitFor(() => expect(screen.getByPlaceholderText(/Type romaji or kana/i)).toBeTruthy(), {
      timeout: 5000,
    });
  });

  it('mounts every tab without hitting the error boundary', async () => {
    render(<App />);
    const tabs = [
      'check',
      'rush',
      'classify',
      'endings',
      'mistakes',
      'levels',
      'stats',
      'library',
      'settings',
      'study',
    ];
    for (const tab of tabs) {
      fireEvent.click(screen.getByRole('button', { name: tab, exact: true }));
      // Each view lazy-loads; wait until its chunk resolves (nav stays mounted).
      await waitFor(() => expect(screen.queryByText('Something went wrong')).toBeNull());
      expect(screen.getByRole('button', { name: tab, exact: true })).toBeTruthy();
    }
  });
});
