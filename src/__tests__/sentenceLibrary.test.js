// @vitest-environment jsdom
import { createHash, webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sentenceContentSerialization } from '../utils/sentenceTrust.js';

const WORD = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
const TYPE = 'plain-past';
const CONFIG = { url: 'https://katachiya.example.supabase.co', anonKey: 'anon-key' };
const REVISION = 'a'.repeat(64);
const CACHE_STORE = 'katachiya_ai_sentence_cache';
const cacheKey = (revision = REVISION) => `review-v1|${revision}|ichidan:食べる|${TYPE}`;
let currentRevision;

function response(rows, { ok = true, status = 200 } = {}) {
  return { ok, status, json: vi.fn().mockResolvedValue(rows) };
}

function validRow(overrides = {}, word = WORD, type = TYPE) {
  const row = {
    ja_template: '今日{w}。',
    segments: [{ t: '今日', r: 'きょう' }, { w: true }, { t: '。', r: '' }],
    en: 'I ate today.',
    ...overrides,
  };
  const review = {
    status: 'accepted',
    version: 1,
    sense: word.meaning,
    basis: 'bilingual-fixture',
  };
  review.hash = createHash('sha256')
    .update(sentenceContentSerialization(word, type, row, review))
    .digest('hex');
  row.model = JSON.stringify({ generator: 'codex-sentence-trust', review });
  return row;
}

function seedCache(key, value) {
  localStorage.setItem(CACHE_STORE, JSON.stringify({ [key]: { ts: Date.now(), v: value } }));
}

async function load(config = CONFIG) {
  vi.resetModules();
  vi.doMock('../utils/supabase.js', () => ({ getSupabaseConfig: () => config }));
  vi.doMock('../utils/sentenceCorpus.js', () => ({
    getSentenceCorpusRevision: async () => currentRevision,
  }));
  return import('../utils/sentenceLibrary.js');
}

beforeEach(() => {
  currentRevision = REVISION;
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('TextEncoder', TextEncoder);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('../utils/supabase.js');
  vi.doUnmock('../utils/sentenceCorpus.js');
  vi.resetModules();
});

describe('fetchTailoredSentence', () => {
  it('returns null without configuration and does not query the database', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTailoredSentence } = await load({ url: '', anonKey: '' });
    expect(await fetchTailoredSentence(WORD, TYPE)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts only the reviewed cache entry for the current corpus publication', async () => {
    seedCache(cacheKey(), validRow());
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTailoredSentence } = await load({ url: '', anonKey: '' });
    expect(await fetchTailoredSentence(WORD, TYPE)).toMatchObject({
      source: 'db',
      surface: '食べた',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not revive legacy or previous-publication caches', async () => {
    for (const key of [`ichidan:食べる|${TYPE}`, cacheKey('b'.repeat(64))]) {
      seedCache(key, validRow());
      const { fetchTailoredSentence } = await load({ url: '', anonKey: '' });
      expect(await fetchTailoredSentence(WORD, TYPE)).toBeNull();
    }
  });

  it('reads public review metadata over REST with anonymous headers and no HTTP cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([validRow()]));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTailoredSentence } = await load();
    expect(await fetchTailoredSentence(WORD, TYPE)).toMatchObject({
      jaTemplate: '今日{w}。',
      source: 'db',
      surface: '食べた',
      kanaSurface: 'たべた',
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/rest/v1/sentences?');
    expect(decodeURIComponent(url)).toContain('select=ja_template,segments,en,model,review');
    expect(decodeURIComponent(url)).toContain('word_key=eq.ichidan:食べる');
    expect(decodeURIComponent(url)).toContain(`type=eq.${TYPE}`);
    expect(options.headers).toEqual({
      apikey: 'anon-key',
      Authorization: 'Bearer anon-key',
      Accept: 'application/json',
    });
    expect(options.cache).toBe('no-store');
  });

  it('uses structured database review metadata as the authoritative approval', async () => {
    const accepted = validRow();
    accepted.review = JSON.parse(accepted.model).review;
    accepted.model = 'legacy-generator';
    const quarantined = validRow();
    quarantined.review = { ...JSON.parse(quarantined.model).review, status: 'pending' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([quarantined]))
      .mockResolvedValueOnce(response([accepted]));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTailoredSentence } = await load();
    expect(await fetchTailoredSentence(WORD, TYPE)).toBeNull();
    expect(await fetchTailoredSentence(WORD, TYPE)).toMatchObject({ en: 'I ate today.' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches an accepted hit and verifies it again before reuse', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([validRow()]));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTailoredSentence } = await load();
    await fetchTailoredSentence(WORD, TYPE);
    await fetchTailoredSentence(WORD, TYPE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const store = JSON.parse(localStorage.getItem(CACHE_STORE));
    expect(store[cacheKey()].v.review.status).toBe('accepted');
    store[cacheKey()].v.en = 'I drank today.';
    localStorage.setItem(CACHE_STORE, JSON.stringify(store));
    expect((await fetchTailoredSentence(WORD, TYPE)).en).toBe('I ate today.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ignores a cached approval when the word meaning or reading changes', async () => {
    seedCache(cacheKey(), validRow());
    const { fetchTailoredSentence } = await load({ url: '', anonKey: '' });
    expect(
      await fetchTailoredSentence({ ...WORD, meaning: 'to live on a salary' }, TYPE),
    ).toBeNull();
    expect(await fetchTailoredSentence({ ...WORD, reading: 'くう' }, TYPE)).toBeNull();
  });

  it('invalidates a cached sentence after corpus revision changes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([validRow()]))
      .mockResolvedValueOnce(response([validRow({ en: 'Today I ate.' })]));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTailoredSentence } = await load();
    expect((await fetchTailoredSentence(WORD, TYPE)).en).toBe('I ate today.');
    currentRevision = 'b'.repeat(64);
    expect((await fetchTailoredSentence(WORD, TYPE)).en).toBe('Today I ate.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never reuses a cached row when the publication revision is unavailable', async () => {
    seedCache(cacheKey(), validRow());
    currentRevision = null;
    const { fetchTailoredSentence } = await load({ url: '', anonKey: '' });
    expect(await fetchTailoredSentence(WORD, TYPE)).toBeNull();
  });

  it('can use a fresh reviewed database row without a manifest but does not cache it', async () => {
    currentRevision = null;
    const fetchMock = vi.fn().mockResolvedValue(response([validRow()]));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTailoredSentence } = await load();
    expect(await fetchTailoredSentence(WORD, TYPE)).toMatchObject({ source: 'db' });
    expect(localStorage.getItem(CACHE_STORE)).toBeNull();
  });

  it('does not cache misses, HTTP errors, or rows without valid content approval', async () => {
    const pending = validRow();
    const metadata = JSON.parse(pending.model);
    metadata.review.status = 'pending';
    pending.model = JSON.stringify(metadata);
    const edited = validRow();
    edited.en = 'I drank today.';
    const legacy = validRow();
    legacy.model = 'old-generator';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([], { ok: false, status: 403 }))
      .mockResolvedValueOnce(response([pending]))
      .mockResolvedValueOnce(response([edited]))
      .mockResolvedValueOnce(response([legacy]))
      .mockResolvedValueOnce(response([validRow({ segments: [{ w: true }] })]));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTailoredSentence } = await load();
    for (let i = 0; i < 6; i += 1) expect(await fetchTailoredSentence(WORD, TYPE)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(localStorage.getItem(CACHE_STORE)).toBeNull();
  });
});
