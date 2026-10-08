import { createHash, webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wordKey } from '../utils/conjugator.js';
import { sentenceContentSerialization } from '../utils/sentenceTrust.js';

const WORD = { dict: '買う', reading: 'かう', meaning: 'to buy', group: 'godan' };
const TYPE = 'plain-past';
const TEMPLATE = '昼に{w}。';
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function reviewedRow({ word = WORD, type = TYPE, ...overrides } = {}) {
  const value = {
    jaTemplate: TEMPLATE,
    en: 'I bought it at noon.',
    segments: [{ t: '昼', r: 'ひる' }, { t: 'に', r: '' }, { w: true }, { t: '。', r: '' }],
    review: { status: 'accepted', version: 1, sense: word.meaning, basis: 'bilingual-fixture' },
    ...overrides,
  };
  value.review.hash = createHash('sha256')
    .update(sentenceContentSerialization(word, type, value))
    .digest('hex');
  return [wordKey(word), value.jaTemplate, value.en, value.segments, value.review];
}

function corpusPayload(rows = [reviewedRow()], type = TYPE) {
  const revision = digest(rows);
  const entry = { type, count: rows.length, path: `by-type/${type}.json`, revision };
  return {
    manifest: {
      schema: 2,
      revision: digest([[type, revision]]),
      totalRows: rows.length,
      rawBytes: 123,
      gzipBytes: 45,
      types: [entry],
    },
    chunk: { schema: 2, type, revision, rows },
  };
}

function response(payload, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(payload) };
}

function installCorpus(payload = corpusPayload()) {
  const fetchMock = vi.fn((url) =>
    Promise.resolve(
      response(String(url).endsWith('/manifest.json') ? payload.manifest : payload.chunk),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function loadCorpus() {
  vi.resetModules();
  return import('../utils/sentenceCorpus.js');
}

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('TextEncoder', TextEncoder);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});

describe('fetchBundledSentence', () => {
  it('verifies accepted content and memoizes chunks using their content revision', async () => {
    const payload = corpusPayload();
    const fetchMock = installCorpus(payload);
    const { fetchBundledSentence, getSentenceCorpusRevision } = await loadCorpus();
    const first = await fetchBundledSentence(WORD, TYPE);
    const second = await fetchBundledSentence(WORD, TYPE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/data/sentences/manifest.json', {
      cache: 'no-cache',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/data/sentences/by-type/${TYPE}.json?v=${payload.chunk.revision}`,
      { cache: 'force-cache' },
    );
    expect(first).toMatchObject({
      jaTemplate: TEMPLATE,
      en: 'I bought it at noon.',
      surface: '買った',
      kanaSurface: 'かった',
      source: 'bundled',
    });
    expect(second).toEqual(first);
    expect(await getSentenceCorpusRevision()).toBe(payload.manifest.revision);
  });

  it('does not fetch unversioned content when the manifest is missing or obsolete', async () => {
    for (const manifest of [null, { ...corpusPayload().manifest, schema: 1 }]) {
      const fetchMock = vi.fn().mockResolvedValue(response(manifest, !!manifest));
      vi.stubGlobal('fetch', fetchMock);
      const { fetchBundledSentence } = await loadCorpus();
      expect(await fetchBundledSentence(WORD, TYPE)).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('retries missing chunks without negative caching', async () => {
    const payload = corpusPayload();
    const fetchMock = vi.fn((url) =>
      Promise.resolve(
        String(url).endsWith('/manifest.json') ? response(payload.manifest) : response({}, false),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { fetchBundledSentence } = await loadCorpus();
    expect(await fetchBundledSentence(WORD, TYPE)).toBeNull();
    expect(await fetchBundledSentence(WORD, TYPE)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejects corrupt chunks even if their claimed revision is current', async () => {
    const payload = corpusPayload();
    payload.chunk.rows[0][2] = 'I sold it at noon.';
    installCorpus(payload);
    const { fetchBundledSentence } = await loadCorpus();
    expect(await fetchBundledSentence(WORD, TYPE)).toBeNull();
  });

  it.each(['schema', 'type', 'revision'])('rejects a mismatched chunk %s', async (field) => {
    const payload = corpusPayload();
    payload.chunk[field] = field === 'schema' ? 1 : 'obsolete';
    installCorpus(payload);
    const { fetchBundledSentence } = await loadCorpus();
    expect(await fetchBundledSentence(WORD, TYPE)).toBeNull();
  });

  it('rejects a manifest whose revision does not describe its type entries', async () => {
    const payload = corpusPayload();
    payload.manifest.revision = 'f'.repeat(64);
    const fetchMock = installCorpus(payload);
    const { fetchBundledSentence } = await loadCorpus();
    expect(await fetchBundledSentence(WORD, TYPE)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not request unavailable types or unsafe type names', async () => {
    const fetchMock = installCorpus();
    const { fetchBundledSentence } = await loadCorpus();
    expect(await fetchBundledSentence(WORD, '../plain-past')).toBeNull();
    expect(await fetchBundledSentence(WORD, 'plain-negative')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects pending, malformed, or content-edited rows inside valid chunks', async () => {
    const pending = reviewedRow();
    pending[4].status = 'pending';
    const edited = reviewedRow();
    edited[2] = 'I sold it at noon.';
    const malformed = reviewedRow({ segments: [{ w: true }] });
    for (const row of [pending, edited, malformed, reviewedRow().slice(0, 4)]) {
      installCorpus(corpusPayload([row]));
      const { fetchBundledSentence } = await loadCorpus();
      expect(await fetchBundledSentence(WORD, TYPE)).toBeNull();
    }
  });

  it('rechecks the current word meaning instead of reusing an approved sense', async () => {
    installCorpus();
    const { fetchBundledSentence } = await loadCorpus();
    expect(await fetchBundledSentence(WORD, TYPE)).not.toBeNull();
    expect(await fetchBundledSentence({ ...WORD, meaning: 'to keep a pet' }, TYPE)).toBeNull();
  });

  it('refreshes the manifest and invalidates an old chunk when publication changes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const firstPayload = corpusPayload();
    const nextRow = reviewedRow({ en: 'At noon, I bought it.' });
    const nextPayload = corpusPayload([nextRow]);
    let currentPayload = firstPayload;
    const fetchMock = vi.fn((url) =>
      Promise.resolve(
        response(
          String(url).endsWith('/manifest.json') ? currentPayload.manifest : currentPayload.chunk,
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { fetchBundledSentence } = await loadCorpus();
    expect((await fetchBundledSentence(WORD, TYPE)).en).toBe('I bought it at noon.');
    currentPayload = nextPayload;
    vi.setSystemTime(Date.now() + 60_001);
    expect((await fetchBundledSentence(WORD, TYPE)).en).toBe('At noon, I bought it.');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][0]).toContain(nextPayload.chunk.revision);
  });
});
