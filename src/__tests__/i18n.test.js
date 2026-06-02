import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLocale, getLocale, detectLocale, registerCatalog } from '../i18n/index.js';

beforeEach(() => {
  setLocale('en');
});

describe('t', () => {
  it('returns the English string for a known key', () => {
    expect(t('nav.study')).toBe('Reviews');
    expect(t('nav.lessons')).toBe('Lessons');
    expect(t('nav.lab')).toBe('Practice Lab');
    expect(t('app.title')).toBe('Katachiya');
  });

  it('interpolates {placeholders}', () => {
    expect(t('header.session', { correct: 3, reviewed: 5 })).toBe('3/5 this session');
    expect(t('header.goalStreak', { days: 7 })).toBe('7 day goal streak');
  });

  it('leaves unknown placeholders intact', () => {
    expect(t('header.today', { count: 2 })).toBe('2/{goal} today');
  });

  it('falls back to the key itself when the string is missing', () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
  });
});

describe('locale management', () => {
  it('ignores an unregistered locale and stays on the fallback', () => {
    expect(setLocale('zz')).toBe('en');
    expect(getLocale()).toBe('en');
  });

  it('uses a registered locale and falls back per-key for gaps', () => {
    registerCatalog('ja', { 'nav.study': '学習' });
    expect(setLocale('ja')).toBe('ja');
    expect(t('nav.study')).toBe('学習');
    // Key absent in ja → English fallback, not the raw key.
    expect(t('app.title')).toBe('Katachiya');
  });
});

describe('detectLocale', () => {
  it('selects a supported base language from navigator.languages', () => {
    registerCatalog('ja', {});
    expect(detectLocale({ languages: ['ja-JP', 'en'] })).toBe('ja');
  });

  it('falls back to English for unsupported languages', () => {
    expect(detectLocale({ languages: ['fr-FR', 'de'] })).toBe('en');
    expect(detectLocale({})).toBe('en');
  });
});
