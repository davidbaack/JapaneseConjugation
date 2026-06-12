import { afterEach, describe, expect, it, vi } from 'vitest';
import { wordKey } from '../utils/conjugator.js';

const WORD = { dict: '買う', reading: 'かう', meaning: 'to buy', group: 'godan' };

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('fetchBundledSentence', () => {
  it('hydrates a bundled row and memoizes the type chunk', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        response({
          schema: 1,
          type: 'plain-past',
          rows: [[wordKey(WORD), '昼に{w}。', 'I bought it at noon.', [{ w: true }]]],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { fetchBundledSentence } = await loadCorpus();

    const first = await fetchBundledSentence(WORD, 'plain-past');
    const second = await fetchBundledSentence(WORD, 'plain-past');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/data/sentences/by-type/plain-past.json', {
      cache: 'force-cache',
    });
    expect(first).toMatchObject({
      jaTemplate: '昼に{w}。',
      en: 'I bought it at noon.',
      surface: '買った',
      kanaSurface: 'かった',
      source: 'bundled',
    });
    expect(second).toEqual(first);
  });

  it('returns null and retries later for missing chunks', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response({}, false)));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchBundledSentence } = await loadCorpus();

    expect(await fetchBundledSentence(WORD, 'plain-negative')).toBeNull();
    expect(await fetchBundledSentence(WORD, 'plain-negative')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ignores malformed corpus rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          response({
            schema: 1,
            type: 'plain-past',
            rows: [[wordKey(WORD), '', 'Missing template.', []]],
          }),
        ),
      ),
    );
    const { fetchBundledSentence } = await loadCorpus();

    expect(await fetchBundledSentence(WORD, 'plain-past')).toBeNull();
  });
});
