// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatPanel } from '../components/ChatPanel.jsx';

const mock = vi.hoisted(() => ({ callGemini: vi.fn() }));
vi.mock('../utils/gemini.js', () => ({
  AI_SYSTEM: 'system',
  aiSystemFromPrefs: (_prefs, base) => base,
  callGemini: mock.callGemini,
}));

const props = {
  verb: { dict: 'taberu', reading: 'taberu', meaning: 'to eat', group: 'ichidan' },
  type: 'plain-past',
  userAnswer: 'tadeta',
  expected: 'tabeta',
  explanation: { intro: 'Use past.', rule: 'Drop ru and add ta.', derivation: '' },
  geminiKey: 'proxy',
};
const question = () => screen.getByRole('textbox', { name: 'Ask Gemini a follow-up question' });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function ask(text) {
  fireEvent.change(question(), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
}
beforeEach(() => mock.callGemini.mockReset().mockResolvedValue('Initial explanation.'));
afterEach(cleanup);

it.each(['resolve', 'reject'])('keeps B active when cancelled A later %ss', async (outcome) => {
  const a = deferred(),
    b = deferred();
  mock.callGemini
    .mockResolvedValueOnce('Initial explanation.')
    .mockReturnValueOnce(a.promise)
    .mockReturnValueOnce(b.promise);
  render(<ChatPanel {...props} />);
  await screen.findByText('Initial explanation.');
  ask('Question A');
  const aSignal = mock.callGemini.mock.calls[1][5].signal;
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(aSignal.aborted).toBe(true);
  expect(document.activeElement).toBe(question());
  expect(screen.getByRole('status').textContent).toContain('Request stopped');
  ask('Question B');
  await act(async () =>
    a[outcome](outcome === 'resolve' ? 'Stale reply A' : new Error('Stale error A')),
  );
  const log = screen.getByRole('log');
  expect(log.textContent).toContain('Question B');
  expect(log.textContent).not.toMatch(/Stale (reply|error) A/);
  expect(log.getAttribute('aria-busy')).toBe('true');
  expect(question().disabled).toBe(true);
  await act(async () => b.resolve('Current reply B'));
  expect(log.textContent).toContain('Current reply B');
  expect(log.getAttribute('aria-busy')).toBe('false');
});

it('cancels the initial reply and retains exercise context for a follow-up', async () => {
  const initial = deferred(),
    followup = deferred();
  mock.callGemini.mockReturnValueOnce(initial.promise).mockReturnValueOnce(followup.promise);
  render(<ChatPanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(mock.callGemini.mock.calls[0][5].signal.aborted).toBe(true);
  ask('Help me again');
  expect(mock.callGemini.mock.calls[1][0][0].parts[0].text).toContain('Correct: tabeta');
  await act(async () => initial.resolve('Cancelled initial reply'));
  expect(screen.getByRole('log').textContent).not.toContain('Cancelled initial reply');
  expect(screen.getByRole('log').getAttribute('aria-busy')).toBe('true');
  await act(async () => followup.resolve('Helpful reply'));
  expect(screen.getByRole('log').textContent).toContain('Helpful reply');
});

it('retains context after initial failure without sending error text to the model', async () => {
  mock.callGemini.mockRejectedValueOnce(new Error('Try a shorter question.'));
  render(<ChatPanel {...props} />);
  await screen.findByText('Error: Try a shorter question.');
  ask('Why is that the past form?');
  await screen.findByText('Initial explanation.');
  const history = mock.callGemini.mock.calls[1][0];
  expect(history[0].parts[0].text).toContain('Correct: tabeta');
  expect(JSON.stringify(history)).not.toContain('Error:');
});

it('isolates draft, display and pending replies when the exercise changes', async () => {
  const old = deferred(),
    next = deferred();
  mock.callGemini
    .mockResolvedValueOnce('Initial explanation.')
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(next.promise);
  const view = render(<ChatPanel {...props} />);
  await screen.findByText('Initial explanation.');
  ask('Old question');
  view.rerender(<ChatPanel {...props} expected="tabete" type="te-form" />);
  expect(mock.callGemini.mock.calls[1][5].signal.aborted).toBe(true);
  expect(question().value).toBe('');
  expect(screen.getByRole('log').textContent).not.toContain('Old question');
  await act(async () => old.resolve('Old reply'));
  expect(screen.getByRole('log').textContent).not.toContain('Old reply');
  expect(screen.getByRole('log').getAttribute('aria-busy')).toBe('true');
  await act(async () => next.resolve('New exercise explanation'));
  expect(screen.getByRole('log').textContent).toContain('New exercise explanation');
});

it('aborts a pending follow-up when the panel unmounts', async () => {
  const pending = deferred();
  mock.callGemini
    .mockResolvedValueOnce('Initial explanation.')
    .mockReturnValueOnce(pending.promise);
  const view = render(<ChatPanel {...props} />);
  await screen.findByText('Initial explanation.');
  ask('Pending question');
  const signal = mock.callGemini.mock.calls[1][5].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve('Reply after unmount'));
});
