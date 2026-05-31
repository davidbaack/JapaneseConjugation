// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

// No Supabase configured in tests → auth/sync effects no-op (offline-first path).
vi.mock('../utils/supabase.js', () => ({ supabase: null }));

import App from '../App.jsx';

afterEach(cleanup);

describe('App shell', () => {
  it('renders the header, subtitle, and full nav', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Katachiya/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Japanese Conjugation SRS/ })).toBeTruthy();
    // Nav labels (accessible name is the catalog string; CSS only capitalizes).
    for (const label of [
      'study',
      'Conjugation Check',
      'Which Group?',
      'て Forms',
      'games',
      'insights',
      'library',
      'settings',
    ]) {
      expect(screen.getByRole('tab', { name: label, exact: true })).toBeTruthy();
    }
  });

  it('lazy-loads the default Study view without crashing', async () => {
    render(<App />);
    // The Suspense skeleton resolves to the Study view; its answer input appears.
    await waitFor(() => expect(screen.getByPlaceholderText(/Type romaji or kana/i)).toBeTruthy(), {
      timeout: 5000,
    });
  });

  it('starts Transformation Mode from the Study screen', async () => {
    render(<App />);
    const transformButton = await screen.findByRole('button', { name: /Transformation Mode/i });

    fireEvent.click(transformButton);

    expect(screen.getByRole('button', { name: /Production/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Recognition/i })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getAllByText(/Transformation Mode/i).length).toBeGreaterThan(0),
    );
  });

  it('mounts every tab without hitting the error boundary', async () => {
    render(<App />);
    // Each nav button's accessible name is its catalog label.
    const labels = [
      'study',
      'Conjugation Check',
      'Which Group?',
      'て Forms',
      'games',
      'insights',
      'library',
      'settings',
    ];
    for (const label of labels) {
      fireEvent.click(screen.getByRole('tab', { name: label, exact: true }));
      // Each view lazy-loads; wait until its chunk resolves (nav stays mounted).
      await waitFor(() => expect(screen.queryByText('Something went wrong')).toBeNull());
      expect(screen.getByRole('tab', { name: label, exact: true })).toBeTruthy();
    }
  });
});
