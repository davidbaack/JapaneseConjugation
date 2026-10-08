import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { runHeartbeat, validateHeartbeatRows } from '../../scripts/supabase-heartbeat.js';
import { loadSentenceWordMap } from '../../scripts/sentenceEnglish.js';

const words = loadSentenceWordMap();
const chunk = JSON.parse(readFileSync('public/data/sentences/by-type/plain-past.json', 'utf8'));
const samples = chunk.rows.slice(0, 3).map(([word_key, ja_template, en, segments, review]) => ({
  word_key,
  type: chunk.type,
  ja_template,
  en,
  segments,
  review,
}));
const copy = (row) => JSON.parse(JSON.stringify(row));
const response = (rows) => ({ ok: true, status: 200, json: async () => rows });
const options = (fetchImpl) => ({
  url: 'https://fixture.supabase.co',
  anonKey: 'fixture-anonymous-key',
  words,
  fetchImpl,
  retryDelayMs: 0,
  report: vi.fn(),
});

describe('semantic public sentence heartbeat', () => {
  it('accepts a content-bound approved sentence from the tracked corpus', () => {
    expect(validateHeartbeatRows([samples[0]], words)).toBe(`${samples[0].word_key}|plain-past`);
  });

  it.each([null, {}, [], [{}], [samples[0], samples[1]]])(
    'rejects empty or malformed responses: %j',
    (rows) => {
      expect(() => validateHeartbeatRows(rows, words)).toThrow();
    },
  );

  it.each(['word_key', 'type', 'ja_template', 'en', 'segments', 'review'])(
    'rejects a missing %s',
    (field) => {
      const row = copy(samples[0]);
      delete row[field];
      expect(() => validateHeartbeatRows([row], words)).toThrow();
    },
  );

  it('rejects unapproved rows, stale translations, and unknown lexical identities', () => {
    const pending = copy(samples[0]);
    pending.review.status = 'needs-review';
    const stale = { ...copy(samples[0]), en: 'Unreviewed replacement translation.' };
    const unknown = { ...copy(samples[0]), word_key: 'godan:unknown-word' };
    for (const row of [pending, stale, unknown])
      expect(() => validateHeartbeatRows([row], words)).toThrow(/approval/);
  });

  it('reads three distinct ordered approved rows with bounded transport signals', async () => {
    const fetchImpl = vi.fn();
    for (const sample of samples) fetchImpl.mockResolvedValueOnce(response([sample]));
    const config = options(fetchImpl);
    await expect(runHeartbeat(config)).resolves.toEqual({ verifiedRows: 3 });
    expect(config.report).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.map(([url]) => url.searchParams.get('offset'))).toEqual([
      '0',
      '1',
      '2',
    ]);
    for (const [url, request] of fetchImpl.mock.calls) {
      expect(url.searchParams.get('order')).toBe('word_key.asc,type.asc');
      expect(url.searchParams.get('select')).toContain('review');
      expect(request.signal).toBeInstanceOf(globalThis.AbortSignal);
    }
  });

  it('retries a transient HTTP failure and verifies all rows before succeeding', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 });
    for (const sample of samples) fetchImpl.mockResolvedValueOnce(response([sample]));
    await expect(runHeartbeat(options(fetchImpl))).resolves.toEqual({ verifiedRows: 3 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('fails after bounded retries for empty data, without reporting success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([]));
    const config = options(fetchImpl);
    await expect(runHeartbeat(config)).rejects.toThrow('Expected exactly one');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(config.report).not.toHaveBeenCalled();
  });

  it('rejects repeated samples instead of claiming three healthy rows', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([samples[0]]));
    const config = options(fetchImpl);
    await expect(runHeartbeat(config)).rejects.toThrow('duplicate rows');
    expect(config.report).toHaveBeenCalledTimes(1);
  });

  it('sanitizes failed transport and JSON messages rather than logging credentials or response bodies', async () => {
    for (const fetchImpl of [
      vi.fn().mockRejectedValue(new Error('fixture-anonymous-key transport detail')),
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('private response body');
        },
      }),
    ]) {
      const config = options(fetchImpl);
      await expect(runHeartbeat(config)).rejects.toThrow(
        /request failed or timed out|not readable JSON/,
      );
      expect(config.report).not.toHaveBeenCalled();
    }
  });

  it('refuses missing configuration before making any network request', async () => {
    const fetchImpl = vi.fn();
    await expect(runHeartbeat({ ...options(fetchImpl), anonKey: '' })).rejects.toThrow('required');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
