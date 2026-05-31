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
});
