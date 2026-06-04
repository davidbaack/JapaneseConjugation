import { describe, expect, it } from 'vitest';
import { sentenceDisplay, sentenceReadingParts } from '../utils/sentenceDisplay.js';

describe('sentenceDisplay', () => {
  it('adds furigana parts for known kanji in sentence-mode cloze frames', () => {
    const view = sentenceDisplay('週末はよく [______]。', {
      furigana: true,
      displayScripts: { kanji: true, kana: true, romaji: false },
    });

    expect(view.main).toBe('週末はよく [______]。');
    expect(view.sub).toBe('');
    expect(view.parts).toContainEqual({ text: '週末', ruby: 'しゅうまつ' });
  });

  it('renders sentence-mode cloze frames in kana when kanji is hidden', () => {
    const view = sentenceDisplay('週末はよく [______]。', {
      furigana: true,
      displayScripts: { kanji: false, kana: true, romaji: false },
    });

    expect(view.main).toBe('しゅうまつはよく [______]。');
    expect(view.parts).toBeUndefined();
  });

  it('keeps longer readings together before matching shorter words', () => {
    expect(sentenceReadingParts('休み時間に、先生に [______]。').slice(0, 5)).toEqual([
      { text: '休み時間', ruby: 'やすみじかん' },
      { text: 'に', ruby: '' },
      { text: '、', ruby: '' },
      { text: '先生', ruby: 'せんせい' },
      { text: 'に', ruby: '' },
    ]);
  });
});
