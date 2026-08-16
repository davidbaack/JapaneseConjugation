// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WORD = {
  dict: '\u98df\u3079\u308b',
  reading: '\u305f\u3079\u308b',
  meaning: 'to eat',
  group: 'ichidan',
};
const ADJECTIVE = {
  dict: '\u304b\u3086\u3044',
  reading: '\u304b\u3086\u3044',
  meaning: 'itchy',
  group: 'i-adjective',
};
const CONFIG = { url: 'https://katachiya.example.supabase.co', anonKey: 'anon-key' };

function response(rows, { ok = true, status = 200 } = {}) {
  return { ok, status, json: vi.fn().mockResolvedValue(rows) };
}

function validRow(overrides = {}) {
  return {
    ja_template: '\u4eca\u65e5 {w}\u3002',
    segments: [{ t: '\u4eca\u65e5', r: '\u304d\u3087\u3046' }, { w: true }, { t: '\u3002', r: '' }],
    en: 'I ate today.',
    ...overrides,
  };
}

async function load(config = CONFIG) {
  vi.resetModules();
  vi.doMock('../utils/supabase.js', () => ({ getSupabaseConfig: () => config }));
  return import('../utils/sentenceLibrary.js');
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('fetchTailoredSentence', () => {
  it('returns null without configuration and does not touch the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTailoredSentence } = await load({ url: '', anonKey: '' });

    expect(await fetchTailoredSentence(WORD, 'plain-past')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks the local cache before configuration or network access', async () => {
    localStorage.setItem(
      'katachiya_ai_sentence_cache',
      JSON.stringify({
        ['ichidan:\u98df\u3079\u308b|plain-past']: { ts: Date.now(), v: validRow() },
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTailoredSentence } = await load({ url: '', anonKey: '' });

    await expect(fetchTailoredSentence(WORD, 'plain-past')).resolves.toMatchObject({
      source: 'db',
      surface: '\u98df\u3079\u305f',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the public sentence row over REST with anonymous headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([validRow()]));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTailoredSentence } = await load();

    const result = await fetchTailoredSentence(WORD, 'plain-past');

    expect(result).toMatchObject({
      jaTemplate: '\u4eca\u65e5 {w}\u3002',
      source: 'db',
      surface: '\u98df\u3079\u305f',
      kanaSurface: '\u305f\u3079\u305f',
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/rest/v1/sentences?');
    expect(decodeURIComponent(url)).toContain('word_key=eq.ichidan:\u98df\u3079\u308b');
    expect(decodeURIComponent(url)).toContain('type=eq.plain-past');
    expect(options.headers).toEqual({
      apikey: 'anon-key',
      Authorization: 'Bearer anon-key',
      Accept: 'application/json',
    });
  });

  it('caches a hit so a repeat lookup skips the network', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([validRow()]));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTailoredSentence } = await load();

    await fetchTailoredSentence(WORD, 'plain-past');
    await fetchTailoredSentence(WORD, 'plain-past');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache a miss, an HTTP error, or an awkward adjective row', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([], { ok: false, status: 403 }))
      .mockResolvedValueOnce(
        response([
          validRow({
            ja_template: 'if {w}.',
            segments: [{ w: true }],
            en: 'If this task is itchy, I will add a break.',
          }),
        ]),
      )
      .mockResolvedValueOnce(
        response([
          validRow({
            ja_template: 'if {w}.',
            segments: [{ w: true }],
            en: 'If my skin is itchy, I will rest for a bit.',
          }),
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTailoredSentence } = await load();

    expect(await fetchTailoredSentence(WORD, 'plain-negative')).toBeNull();
    expect(await fetchTailoredSentence(WORD, 'plain-negative')).toBeNull();
    expect(await fetchTailoredSentence(ADJECTIVE, 'adj-tara')).toBeNull();
    await expect(fetchTailoredSentence(ADJECTIVE, 'adj-tara')).resolves.toMatchObject({
      source: 'db',
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
