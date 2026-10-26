// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import StickyAction from '../components/StickyAction.jsx';

function installVisualViewport({ height = 480, offsetTop = 0, scale = 1 } = {}) {
  const viewport = new window.EventTarget();
  viewport.height = height;
  viewport.offsetTop = offsetTop;
  viewport.scale = scale;

  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
  });

  return viewport;
}

afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: undefined,
  });
});

describe('StickyAction', () => {
  it('can keep mobile help in flow until a focused keyboard requires docking', async () => {
    const viewport = installVisualViewport({ height: 780 });
    render(
      <StickyAction dock flowUntilKeyboardOnMobile>
        <input aria-label="Answer" />
        <button type="button">Check</button>
      </StickyAction>,
    );
    const input = screen.getByLabelText('Answer');
    const dock = input.parentElement;
    expect(dock.classList.contains('sm:sticky')).toBe(true);
    input.focus();
    viewport.height = 480;
    viewport.dispatchEvent(new Event('resize'));
    await waitFor(() => {
      expect(dock.style.bottom).toBe('320px');
      expect(dock.classList.contains('sticky')).toBe(true);
    });
    viewport.height = 780;
    viewport.dispatchEvent(new Event('resize'));
    await waitFor(() => {
      expect(dock.style.bottom).toBe('0px');
      expect(dock.classList.contains('sm:sticky')).toBe(true);
    });
  });

  it('offsets above the visual viewport occlusion while a text input is focused', async () => {
    const viewport = installVisualViewport({ height: 480, offsetTop: 0 });

    render(
      <>
        <input aria-label="Answer" />
        <StickyAction>
          <button type="button">Check</button>
        </StickyAction>
      </>,
    );

    screen.getByLabelText('Answer').focus();
    viewport.dispatchEvent(new Event('resize'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Check' }).parentElement.style.bottom).toBe(
        '320px',
      );
    });
  });

  it('sticks to the bottom when no soft keyboard is detected', async () => {
    const viewport = installVisualViewport({ height: 780, offsetTop: 0 });

    render(
      <>
        <input aria-label="Answer" />
        <StickyAction>
          <button type="button">Check</button>
        </StickyAction>
      </>,
    );

    screen.getByLabelText('Answer').focus();
    viewport.dispatchEvent(new Event('resize'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Check' }).parentElement.style.bottom).toBe('0px');
    });
  });

  it('marks a full answer dock while preserving every adjacent action', () => {
    render(
      <StickyAction dock>
        <button type="button">Check</button>
        <button type="button">Hint</button>
        <button type="button">Reveal</button>
        <button type="button">Skip</button>
      </StickyAction>,
    );

    const dock = screen.getByRole('button', { name: 'Check' }).parentElement;
    expect(dock.dataset.actionDock).toBe('true');
    expect(screen.getByRole('button', { name: 'Hint' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reveal' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
  });
});
