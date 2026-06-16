// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import { formDisplay } from '../utils/display.js';

const TABERU = {
  dict: '\u98df\u3079\u308b',
  reading: '\u305f\u3079\u308b',
  meaning: 'to eat',
  group: 'ichidan',
};

const FURIGANA_PREFS = {
  furigana: true,
  displayScripts: { kanji: true, kana: true, romaji: false },
};

afterEach(() => {
  cleanup();
});

describe('ScriptDisplay', () => {
  it('does not add duplicate ruby to kana-only polite suffixes', () => {
    const { container } = render(
      <ScriptDisplay
        view={formDisplay('\u305f\u3079\u307e\u3057\u305f', FURIGANA_PREFS, TABERU, 'polite-past')}
        word={TABERU}
        type="polite-past"
      />,
    );

    const readings = [...container.querySelectorAll('rt')].map((node) => node.textContent);
    expect(readings).toEqual(['\u305f\u3079']);
    expect(readings).not.toContain('\u307e\u3057\u305f');
  });

  it('does not add duplicate ruby to kana-only potential suffixes', () => {
    const { container } = render(
      <ScriptDisplay
        view={formDisplay('\u305f\u3079\u3089\u308c\u308b', FURIGANA_PREFS, TABERU, 'potential')}
        word={TABERU}
        type="potential"
      />,
    );

    const readings = [...container.querySelectorAll('rt')].map((node) => node.textContent);
    expect(readings).toEqual(['\u305f\u3079']);
    expect(readings).not.toContain('\u3089\u308c\u308b');
  });
});
