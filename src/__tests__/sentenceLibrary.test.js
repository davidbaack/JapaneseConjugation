// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const WORD = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };

// Mirror the chainable Supabase query builder: from().select().eq().eq().maybeSingle().
function selectChain(result) {
  const maybeSingle = vi.fn(() => Promise.resolve(result));
  const eqType = vi.fn(() => ({ maybeSingle }));
  const eqWord = vi.fn(() => ({ eq: eqType }));
  const select = vi.fn(() => ({ eq: eqWord }));
  const from = vi.fn(() => ({ select }));
  return { from, select, eqWord, eqType, maybeSingle };
}

// Load sentenceLibrary fresh with a specific (or null) Supabase client mock.
async function load(client) {
  vi.resetModules();
  vi.doMock('../utils/supabase.js', () => ({ supabase: client }));
  return import('../utils/sentenceLibrary.js');
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('fetchTailoredSentence', () => {
  it('returns null when Supabase is unconfigured', async () => {
    const { fetchTailoredSentence } = await load(null);
    expect(await fetchTailoredSentence(WORD, 'plain-past')).toBeNull();
  });

  it('maps a row and derives the form locally from the engine', async () => {
    const data = {
      ja_template: '今日 {w}。',
      segments: [{ t: '今日', r: 'きょう' }, { w: true }, { t: '。', r: '' }],
      en: 'I ate today.',
    };
    const chain = selectChain({ data, error: null });
    const { fetchTailoredSentence } = await load(chain);

    const res = await fetchTailoredSentence(WORD, 'plain-past');
    expect(res).toMatchObject({
      jaTemplate: '今日 {w}。',
      en: 'I ate today.',
      source: 'db',
    });
    expect(res.segments).toHaveLength(3);
    // surface / kanaSurface come from the conjugation engine, not the DB.
    expect(res.surface).toBe('食べた');
    expect(res.kanaSurface).toBe('たべた');
    expect(chain.eqWord).toHaveBeenCalledWith('word_key', 'ichidan:食べる');
    expect(chain.eqType).toHaveBeenCalledWith('type', 'plain-past');
  });

  it('caches a hit so a repeat lookup skips the query', async () => {
    const chain = selectChain({
      data: { ja_template: 'x {w}', segments: [{ w: true }], en: 'x' },
      error: null,
    });
    const { fetchTailoredSentence } = await load(chain);

    await fetchTailoredSentence(WORD, 'plain-past');
    await fetchTailoredSentence(WORD, 'plain-past');
    expect(chain.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('negative-caches a miss so it does not re-query', async () => {
    const chain = selectChain({ data: null, error: null });
    const { fetchTailoredSentence } = await load(chain);

    expect(await fetchTailoredSentence(WORD, 'plain-negative')).toBeNull();
    expect(await fetchTailoredSentence(WORD, 'plain-negative')).toBeNull();
    expect(chain.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('returns null on a query error without caching the miss', async () => {
    // Non-transient (403) so retryWithBackoff fails fast.
    const chain = selectChain({ data: null, error: { message: 'denied', status: 403 } });
    const { fetchTailoredSentence } = await load(chain);

    expect(await fetchTailoredSentence(WORD, 'potential')).toBeNull();
    // A later success for the same key must still query (miss not cached).
    chain.maybeSingle.mockResolvedValueOnce({
      data: { ja_template: 'y {w}', segments: [{ w: true }], en: 'y' },
      error: null,
    });
    const res = await fetchTailoredSentence(WORD, 'potential');
    expect(res?.source).toBe('db');
  });
});
