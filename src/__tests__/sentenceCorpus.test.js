import { afterEach, describe, expect, it, vi } from 'vitest';
import { wordKey } from '../utils/conjugator.js';

const WORD = { dict: '\u8cb7\u3046', reading: '\u304b\u3046', meaning: 'to buy', group: 'godan' };
const TEMPLATE = '\u663c\u306b{w}\u3002';

async function loadCorpus() {
  vi.resetModules();
  return import('../utils/sentenceCorpus.js');
}

function response(payload, ok = true) {
  return {
    ok,
    json: vi.fn(() => Promise.resolve(payload)),
  };
}

function manifestPayload(type = 'plain-past') {
  return {
    schema: 1,
    totalRows: 1,
    rawBytes: 123,
    gzipBytes: 45,
    types: [{ type, count: 1, path: `by-type/${type}.json` }],
  };
}

function chunkPayload(
  type = 'plain-past',
  rows = [[wordKey(WORD), TEMPLATE, 'I bought it at noon.', [{ w: true }]]],
) {
  return { schema: 1, type, rows };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('fetchBundledSentence', () => {
  it('hydrates a bundled row and memoizes the type chunk', async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).endsWith('/manifest.json')) {
        return Promise.resolve(response(manifestPayload()));
      }
      return Promise.resolve(response(chunkPayload()));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchBundledSentence } = await loadCorpus();

    const first = await fetchBundledSentence(WORD, 'plain-past');
    const second = await fetchBundledSentence(WORD, 'plain-past');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/data/sentences/manifest.json', {
      cache: 'no-cache',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/data/sentences/by-type/plain-past.json?v=1-1-123-45-1',
      { cache: 'force-cache' },
    );
    expect(first).toMatchObject({
      jaTemplate: TEMPLATE,
      en: 'I bought it at noon.',
      surface: '\u8cb7\u3063\u305f',
      kanaSurface: '\u304b\u3063\u305f',
      source: 'bundled',
    });
    expect(second).toEqual(first);
  });

  it('falls back to the unversioned chunk when the manifest is unavailable', async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).endsWith('/manifest.json')) return Promise.resolve(response({}, false));
      return Promise.resolve(response(chunkPayload()));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchBundledSentence } = await loadCorpus();

    const sentence = await fetchBundledSentence(WORD, 'plain-past');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/data/sentences/manifest.json', {
      cache: 'no-cache',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/data/sentences/by-type/plain-past.json', {
      cache: 'force-cache',
    });
    expect(sentence).toMatchObject({
      jaTemplate: TEMPLATE,
      en: 'I bought it at noon.',
      surface: '\u8cb7\u3063\u305f',
      kanaSurface: '\u304b\u3063\u305f',
      source: 'bundled',
    });
  });

  it('returns null and retries later for missing chunks', async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).endsWith('/manifest.json')) {
        return Promise.resolve(response(manifestPayload('plain-negative')));
      }
      return Promise.resolve(response({}, false));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchBundledSentence } = await loadCorpus();

    expect(await fetchBundledSentence(WORD, 'plain-negative')).toBeNull();
    expect(await fetchBundledSentence(WORD, 'plain-negative')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/data/sentences/by-type/plain-negative.json?v=1-1-123-45-1',
      { cache: 'force-cache' },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/data/sentences/by-type/plain-negative.json?v=1-1-123-45-1',
      { cache: 'force-cache' },
    );
  });

  it('ignores malformed corpus rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (String(url).endsWith('/manifest.json')) {
          return Promise.resolve(response(manifestPayload()));
        }
        return Promise.resolve(
          response(chunkPayload('plain-past', [[wordKey(WORD), '', 'Missing template.', []]])),
        );
      }),
    );
    const { fetchBundledSentence } = await loadCorpus();

    expect(await fetchBundledSentence(WORD, 'plain-past')).toBeNull();
  });
});
