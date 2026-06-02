// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DevHistoryPanel from '../components/DevHistoryPanel.jsx';

const SHA = 'abcdef1234567890abcdef1234567890abcdef12';

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  };
}

function historyPayload() {
  return {
    dirty: true,
    generatedAt: '2026-06-01T20:00:00.000Z',
    headSha: SHA,
    revisions: [
      {
        sha: SHA,
        shortSha: 'abcdef1',
        committedAt: '2026-06-01T19:30:00-07:00',
        relativeTime: '30 minutes ago',
        refs: 'HEAD -> main',
        subject: 'Restore preserved learner controls',
        current: true,
        dirty: true,
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DevHistoryPanel', () => {
  it('does not fetch local history until the panel is opened', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(historyPayload())));
    vi.stubGlobal('fetch', fetchMock);

    render(<DevHistoryPanel />);

    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(await screen.findByRole('dialog', { name: 'Local revision history' })).toBeTruthy();
    expect(await screen.findByText('Restore preserved learner controls')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/__dev-history/api/revisions?limit=30');
  });

  it('restores a revision in a sandboxed preview iframe', async () => {
    const fetchMock = vi.fn((url, options) => {
      if (String(url).includes('/revisions')) {
        return Promise.resolve(jsonResponse(historyPayload()));
      }
      if (String(url).includes('/previews') && options?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            sha: SHA,
            shortSha: 'abcdef1',
            status: 'ready',
            previewUrl: `/__dev-history/preview/${SHA}/`,
          }),
        );
      }
      return Promise.resolve(jsonResponse({ error: 'not found' }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<DevHistoryPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.click(await screen.findByRole('button', { name: /Preview commit abcdef1/ }));

    expect(await screen.findByRole('dialog', { name: 'Revision preview' })).toBeTruthy();
    const frame = screen.getByTitle('Revision preview abcdef1');
    expect(frame.getAttribute('src')).toBe(`/__dev-history/preview/${SHA}/`);
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-popups');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');

    fireEvent.click(screen.getByRole('button', { name: 'Back to current' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Revision preview' })).toBeNull();
    });
  });

  it('shows API errors in the drawer', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ error: 'git failed' }, 500)));
    vi.stubGlobal('fetch', fetchMock);

    render(<DevHistoryPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(await screen.findByText('git failed')).toBeTruthy();
  });
});
