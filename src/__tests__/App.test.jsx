// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

// No Supabase configured in tests → auth/sync effects no-op (offline-first path).
vi.mock('../utils/supabase.js', () => ({ supabase: null }));

import App from '../App.jsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

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
      'Endings',
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

  it('starts Transform mode from the Study screen with a source-to-target route', async () => {
    render(<App />);
    const transformButton = await screen.findByRole(
      'button',
      { name: 'Transform' },
      { timeout: 5000 },
    );

    fireEvent.click(transformButton);

    expect(screen.getAllByRole('button', { name: /Conjugate/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Un-conjugate' })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText(/Transform/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/Conjugate to/i)).toBeTruthy();
    expect(screen.getByText(/Prompt form:/i)).toBeTruthy();
    expect(screen.getByText(/From /i)).toBeTruthy();
    expect(screen.getAllByText(/->/).length).toBeGreaterThan(0);
  }, 15000);

  it('does not show answer-form endings or target English before answering', async () => {
    sessionStorage.setItem(
      'jp-study-current',
      JSON.stringify({
        dict: '\u8a71\u3059',
        group: 'godan',
        type: 'desiderative-past-negative',
      }),
    );

    render(<App />);

    await screen.findByPlaceholderText(/Type romaji or kana/i, {}, { timeout: 5000 });
    expect(screen.getAllByText(/Tai Past Negative/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/did not want to ~/i)).toBeTruthy();
    expect(screen.getByText(/to speak/i)).toBeTruthy();
    expect(screen.queryByText('\u305f\u304f\u306a\u304b\u3063\u305f')).toBeNull();
    expect(screen.queryByText(/did not want to speak/i)).toBeNull();
  }, 15000);

  it('mounts every tab without hitting the error boundary', async () => {
    render(<App />);
    // Each nav button's accessible name is its catalog label.
    const labels = [
      'study',
      'Conjugation Check',
      'Which Group?',
      'Endings',
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
