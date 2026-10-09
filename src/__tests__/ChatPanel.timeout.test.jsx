// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatPanel } from '../components/ChatPanel.jsx';

vi.mock('../utils/supabase.js', () => ({ getLoadedSupabaseClient: () => null }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('releases coaching controls after stalled body retries and allows a successful follow-up', async () => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://katachiya.example.supabase.co');
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <ChatPanel
      verb={{ dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' }}
      type="plain-past"
      userAnswer="たべて"
      expected="たべた"
      explanation={{ intro: 'Use the past form.', rule: 'Drop ru and add ta.', derivation: '' }}
      geminiKey="proxy"
    />,
  );
  const input = screen.getByRole('textbox', { name: 'Ask Gemini a follow-up question' });
  expect(input.disabled).toBe(true);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(92000);
  });

  expect(screen.getByText(/Error: Request timed out/)).toBeTruthy();
  expect(screen.queryByText('Gemini is thinking…')).toBeNull();
  expect(screen.getByRole('log').getAttribute('aria-busy')).toBe('false');
  expect(input.disabled).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(3);

  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: 'Try the past ending.' }] } }],
    }),
  });
  fireEvent.change(input, { target: { value: 'Help me try again.' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.advanceTimersByTimeAsync(0);
  });

  expect(screen.getByText('Try the past ending.')).toBeTruthy();
  expect(input.disabled).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});
