// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const geminiMock = vi.hoisted(() => ({
  callGemini: vi.fn(),
}));

vi.mock('../utils/gemini.js', () => ({
  AI_SYSTEM: 'system',
  aiSystemFromPrefs: (_prefs, base) => base,
  callGemini: geminiMock.callGemini,
}));

import { ChatPanel, buildContext } from '../components/ChatPanel.jsx';

const WORD = {
  dict: 'taberu',
  reading: 'taberu',
  meaning: 'to eat',
  group: 'ichidan',
};

const EXPLANATION = {
  intro: 'Use the past form.',
  rule: 'Drop ru and add ta.',
  derivation: 'tabe + ta = tabeta',
  note: '',
};

let originalScrollIntoView;

beforeEach(() => {
  geminiMock.callGemini.mockResolvedValue('A focused explanation.');
  originalScrollIntoView = window.Element.prototype.scrollIntoView;
  window.Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  if (originalScrollIntoView) {
    window.Element.prototype.scrollIntoView = originalScrollIntoView;
  } else {
    delete window.Element.prototype.scrollIntoView;
  }
});

describe('ChatPanel', () => {
  it('frames correct review prompts as correct-answer support', () => {
    const context = buildContext(
      WORD,
      'plain-past',
      'tabeta',
      'tabeta',
      EXPLANATION,
      undefined,
      '',
      false,
      true,
    );

    expect(context).toContain('just got this right');
    expect(context).toContain('Correct: tabeta');
    expect(context).toContain('why this answer is correct');
    expect(context).not.toContain('just got this wrong');
    expect(context).not.toContain('what I typed wrong');
  });

  it('keeps automatic Gemini replies from scrolling the whole page', async () => {
    render(
      <ChatPanel
        verb={WORD}
        type="plain-past"
        userAnswer="tadeta"
        expected="tabeta"
        explanation={EXPLANATION}
        geminiKey="proxy"
      />,
    );

    await screen.findByText('A focused explanation.');

    expect(window.Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
