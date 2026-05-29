import { describe, it, expect, beforeEach } from 'vitest';
import { audioClipUrl, registerAudioClips, clearAudioClips } from '../utils/speech.js';

beforeEach(() => {
  clearAudioClips();
});

describe('audioClipUrl', () => {
  it('returns null when there is no manifest entry and no base URL', () => {
    expect(audioClipUrl('たべる', { baseUrl: '' })).toBeNull();
  });

  it('prefers an explicit manifest entry', () => {
    registerAudioClips({ たべる: 'https://cdn.example/taberu.mp3' });
    expect(audioClipUrl('たべる', { baseUrl: 'https://base' })).toBe(
      'https://cdn.example/taberu.mp3',
    );
  });

  it('falls back to a base URL, encoding the text', () => {
    expect(audioClipUrl('食べる', { baseUrl: 'https://base' })).toBe(
      `https://base/${encodeURIComponent('食べる')}.mp3`,
    );
  });

  it('returns null for empty text', () => {
    expect(audioClipUrl('', { baseUrl: 'https://base' })).toBeNull();
  });

  it('registerAudioClips ignores empty keys/urls and clearAudioClips empties it', () => {
    registerAudioClips({ '': 'x', あ: '', い: 'https://cdn/i.mp3' });
    expect(audioClipUrl('い', { baseUrl: '' })).toBe('https://cdn/i.mp3');
    clearAudioClips();
    expect(audioClipUrl('い', { baseUrl: '' })).toBeNull();
  });
});
