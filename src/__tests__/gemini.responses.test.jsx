// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatPanel } from '../components/ChatPanel.jsx';
import { callGemini } from '../utils/gemini.js';

vi.mock('../utils/supabase.js', () => ({ getLoadedSupabaseClient: () => null }));
// Response tests isolate admission from the unrelated local burst bucket.
vi.mock('../utils/rateLimiter.js', () => ({ guardAIRequest: () => {} }));
const contents = [{ role: 'user', parts: [{ text: 'Explain the past form.' }] }];
const visible = (text) => ({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
});
function setup(body, overrides = {}) {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fixture.example.supabase.co');
  const mock = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => body, ...overrides });
  vi.stubGlobal('fetch', mock);
  return mock;
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([
  ['blocked prompt', { promptFeedback: { blockReason: 'SAFETY' } }, /rephrasing/],
  [
    'thought-only',
    { candidates: [{ content: { parts: [{ text: 'Planning text', thought: true }] } }] },
    /no readable reply/,
  ],
  ['blank text', visible('  '), /no readable reply/],
  ['empty candidates', { candidates: [] }, /unsupported reply/],
  ['null JSON', null, /unsupported reply/],
  [
    'tool content',
    { candidates: [{ content: { parts: [{ functionCall: { name: 'tool' } }] } }] },
    /unsupported reply/,
  ],
  [
    'truncated reply',
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'Drop the' }] } }] },
    /incomplete.*shorter/,
  ],
  [
    'blocked candidate',
    { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'Partial' }] } }] },
    /could not complete/,
  ],
])('rejects %s without another paid attempt', async (_name, body, message) => {
  const fetchMock = setup(body);
  await expect(callGemini(contents, 'proxy')).rejects.toThrow(message);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('joins every visible part and excludes thought text', async () => {
  setup({
    candidates: [
      {
        finishReason: 'STOP',
        content: {
          parts: [
            { text: 'Planning text', thought: true },
            { text: 'Drop ru. ' },
            { text: 'Add ta.' },
          ],
        },
      },
    ],
  });
  await expect(callGemini(contents, 'proxy')).resolves.toBe('Drop ru. Add ta.');
});

it('rejects malformed successful JSON without retrying', async () => {
  const fetchMock = setup(null, {
    json: async () => {
      throw new SyntaxError('Fixture JSON error');
    },
  });
  await expect(callGemini(contents, 'proxy')).rejects.toThrow(/unreadable reply/);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('preserves retryable HTTP status when its error body is malformed', async () => {
  vi.useFakeTimers();
  const fetchMock = setup(null, {
    ok: false,
    status: 503,
    json: async () => {
      throw new SyntaxError('Fixture');
    },
  });
  fetchMock
    .mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => {
        throw new SyntaxError('Fixture');
      },
    })
    .mockResolvedValue({ ok: true, status: 200, json: async () => visible('Recovered') });
  const request = callGemini(contents, 'proxy');
  await vi.advanceTimersByTimeAsync(1000);
  await expect(request).resolves.toBe('Recovered');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('honors short burst Retry-After before retrying', async () => {
  vi.useFakeTimers();
  const fetchMock = setup(visible('Recovered'));
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 429,
    headers: new globalThis.Headers({ 'Retry-After': '6' }),
    json: async () => ({ error: 'Please wait briefly' }),
  });
  const request = callGemini(contents, 'proxy');
  await vi.advanceTimersByTimeAsync(5999);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await expect(request).resolves.toBe('Recovered');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('recovers from a transient successful-response body stream failure', async () => {
  vi.useFakeTimers();
  const fetchMock = setup(visible('Recovered body'));
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => {
      throw new TypeError('Network connection was lost');
    },
  });
  const request = callGemini(contents, 'proxy');
  await vi.advanceTimersByTimeAsync(1000);
  await expect(request).resolves.toBe('Recovered body');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('does not retry a daily denial even just before reset or when headers are unavailable', async () => {
  vi.useFakeTimers();
  const fetchMock = setup(
    {
      error: 'Daily allowance reached. Try tomorrow.',
      quotaReason: 'ip_daily',
      retryAfterSeconds: 1,
    },
    { ok: false, status: 429 },
  );
  await expect(callGemini(contents, 'proxy')).rejects.toMatchObject({
    status: 429,
    retryable: false,
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('surfaces daily exhaustion immediately without retry timers', async () => {
  vi.useFakeTimers();
  const fetchMock = setup(
    { error: 'AI daily limit reached. Try tomorrow.' },
    { ok: false, status: 429, headers: new globalThis.Headers({ 'Retry-After': '86400' }) },
  );
  await expect(callGemini(contents, 'proxy')).rejects.toMatchObject({
    status: 429,
    retryable: false,
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('renders actionable failure and allows a contextual follow-up to recover', async () => {
  const fetchMock = setup({ promptFeedback: { blockReason: 'SAFETY' } });
  render(
    <ChatPanel
      verb={{ dict: 'taberu', reading: 'taberu', meaning: 'to eat', group: 'ichidan' }}
      type="plain-past"
      expected="tabeta"
      userAnswer="tadeta"
      geminiKey="proxy"
      explanation={{ intro: 'Past form.', rule: 'Drop ru and add ta.', derivation: '' }}
    />,
  );
  await screen.findByText(/Error: Gemini could not answer/);
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => visible('Drop ru. Add ta.'),
  });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Explain the ending only' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
  await screen.findByText('Drop ru. Add ta.');
  const payload = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(payload.contents[0].parts[0].text).toContain('Correct: tabeta');
  expect(JSON.stringify(payload.contents)).not.toContain('Error:');
  expect(screen.getByRole('log').getAttribute('aria-busy')).toBe('false');
});
