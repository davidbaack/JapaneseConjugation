import { basename, join, resolve, sep } from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gunzipSync, gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { surfaceFormFor, wordKey } from '../utils/conjugator.js';
import {
  reviewedContentHash,
  reviewProvenance,
  sha256,
  verifiedReview,
} from '../../scripts/sentenceReview.js';

const fixtures = vi.hoisted(() => ({
  words: [],
  pairs: [],
  buildReviewedSentence: vi.fn(),
}));

vi.mock('../utils/reviewedSentenceFrames.js', () => ({
  buildReviewedSentence: fixtures.buildReviewedSentence,
}));

vi.mock('../../scripts/import-sentence-library.js', () => ({
  deriveSentenceSegments: async (ja, surface) => {
    const [before, after] = ja.split(surface);
    return [{ t: before, r: '' }, { w: true }, { t: after, r: '' }];
  },
}));

vi.mock('../../scripts/export-sentence-corpus.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadSentenceWords: () => fixtures.words,
  expectedSentencePairs: () => fixtures.pairs,
}));

import {
  prepareSentenceReview,
  publishSentenceReview,
  snapshotSentenceTable,
  sourceRowHash,
  sourceRowSignature,
  verifySentencePublication,
} from '../../scripts/review-sentence-corpus.js';
import { buildCorpusChunks, buildCorpusFileBodies } from '../../scripts/export-sentence-corpus.js';

const BUY = { dict: '買う', reading: 'かう', meaning: 'to buy', group: 'godan' };
const EAT = { dict: '食べる', reading: 'たべる', meaning: 'to eat', group: 'ichidan' };
const GENKI = { dict: '元気', reading: 'げんき', meaning: 'healthy', group: 'na-adjective' };
const TYPE = 'plain-past';
const scratchDirectories = [];

function newPackageDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'sentence-review-workflow-'));
  scratchDirectories.push(directory);
  return join(directory, 'package');
}

function sourceRow(word, type, jaTemplate, en, segments) {
  return {
    word_key: wordKey(word),
    type,
    dict: word.dict,
    reading: word.reading,
    group: word.group,
    ja_template: jaTemplate,
    en,
    segments,
    surface: surfaceFormFor(word, type),
    model: 'legacy-generator',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function sourceRows() {
  return [
    sourceRow(BUY, TYPE, '昨日{w}。', 'I bought it yesterday.', [
      { t: '昨日', r: 'きのう' },
      { w: true },
      { t: '。', r: '' },
    ]),
    sourceRow(EAT, TYPE, '朝に{w}。', 'I ate in the morning.', [
      { t: '朝に', r: '' },
      { w: true },
      { t: '。', r: '' },
    ]),
    sourceRow(GENKI, 'adj-sou', '休憩中に、新しい服は{w}。', 'The plan looks energetic.', [
      { t: '休憩中に、新しい服は', r: '' },
      { w: true },
      { t: '。', r: '' },
    ]),
    {
      ...sourceRow(BUY, TYPE, '昨年{w}。', 'I bought it last year.', [
        { t: '昨年', r: 'さくねん' },
        { w: true },
        { t: '。', r: '' },
      ]),
      word_key: 'godan:old-word',
    },
  ];
}

function readGzip(directory, name) {
  return gunzipSync(readFileSync(join(directory, name))).toString('utf8');
}

function readLedger(directory) {
  return readGzip(directory, 'ledger.jsonl.gz')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

function readPublication(directory) {
  return JSON.parse(readGzip(directory, 'publication.json.gz'));
}

function installServer(initialRows) {
  const server = {
    rows: globalThis.structuredClone(initialRows),
    posts: [],
    rpcAttempts: [],
    beforeRpc: null,
    responseCount: null,
  };
  const fetchMock = vi.fn(async (url, options = {}) => {
    if (options.method === 'POST') {
      expect(new URL(url).pathname).toBe('/rest/v1/rpc/publish_reviewed_sentences');
      const { batch } = JSON.parse(options.body);
      server.rpcAttempts.push(batch);
      if (server.beforeRpc) {
        const beforeRpc = server.beforeRpc;
        server.beforeRpc = null;
        beforeRpc(server);
      }
      for (const item of batch) {
        const existing = server.rows.find(
          (row) => row.word_key === item.row.word_key && row.type === item.row.type,
        );
        const signature = existing ? JSON.stringify(sourceRowSignature(existing)) : null;
        if (
          (!existing && item.expected !== null) ||
          (existing &&
            signature !== JSON.stringify(item.expected) &&
            signature !== JSON.stringify(item.target))
        ) {
          return new globalThis.Response(
            JSON.stringify({ message: 'Concurrent sentence edit or deletion' }),
            { status: 409 },
          );
        }
        expect(item.target).toEqual(sourceRowSignature(item.row));
      }
      const rows = batch.map((item) => item.row);
      server.posts.push(rows);
      for (const row of rows) {
        const index = server.rows.findIndex(
          (existing) => existing.word_key === row.word_key && existing.type === row.type,
        );
        if (index >= 0) server.rows[index] = { ...server.rows[index], ...row };
        else server.rows.push(row);
      }
      return new globalThis.Response(JSON.stringify(server.responseCount ?? rows.length), {
        status: 200,
      });
    }
    const query = new URL(url).searchParams;
    const offset = Number(query.get('offset') || 0);
    return new globalThis.Response(JSON.stringify(server.rows.slice(offset, offset + 1000)), {
      status: 200,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { server, fetchMock };
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://sentences.example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  fixtures.words = [BUY, EAT, GENKI];
  fixtures.pairs = [
    { word_key: wordKey(BUY), type: TYPE },
    { word_key: wordKey(EAT), type: TYPE },
    { word_key: wordKey(GENKI), type: 'adj-sou' },
    { word_key: wordKey(BUY), type: 'plain-negative' },
  ];
  fixtures.buildReviewedSentence.mockReset();
  fixtures.buildReviewedSentence.mockImplementation((word, type) =>
    word.dict === BUY.dict && type === TYPE
      ? {
          jaTemplate: '昼に{w}。',
          en: 'I bought it at noon.',
          sense: 'to buy',
          basis: 'agent-reviewed-lexical-sense-and-paired-frame-v1',
        }
      : null,
  );
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  while (scratchDirectories.length) {
    const directory = resolve(scratchDirectories.pop());
    // Delete only our own allocated test directory, never a caller's output.
    if (
      !directory.startsWith(`${resolve(tmpdir())}${sep}`) ||
      !basename(directory).startsWith('sentence-review-workflow-')
    ) {
      throw new Error('Unsafe test temporary directory');
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('exhaustive sentence review evidence', () => {
  it('accounts for every original row, missing pair, pending context, and stale row', async () => {
    const directory = newPackageDirectory();
    const original = sourceRows();
    const summary = await prepareSentenceReview(original, directory, fixtures.words);
    const ledger = readLedger(directory);
    const publication = readPublication(directory);
    const originalHashes = original.map(sourceRowHash).sort();
    expect(
      ledger
        .filter((record) => record.sourceHash)
        .map((record) => record.sourceHash)
        .sort(),
    ).toEqual(originalHashes);
    expect(new Set(ledger.map((record) => `${record.word_key}|${record.type}`)).size).toBe(
      ledger.length,
    );
    expect(ledger).toHaveLength(fixtures.pairs.length + 1);
    expect(summary.counts).toMatchObject({
      sourceRows: 4,
      expectedPairs: 4,
      accepted: 1,
      repaired: 1,
      retained: 0,
      needsReview: 2,
      unsuitable: 1,
      stale: 1,
      concreteSourceIssues: 1,
    });
    expect(ledger.find((record) => record.word_key === wordKey(GENKI))).toMatchObject({
      status: 'unsuitable',
      disposition: 'quarantined',
      sourceAssessment: 'japanese-clothes-english-plan',
    });
    expect(ledger.find((record) => record.type === 'plain-negative')).toMatchObject({
      status: 'needs-review',
      sourceHash: null,
      reviewedHash: null,
    });
    expect(publication).toHaveLength(original.length);
    expect(
      publication.filter((row) => JSON.parse(row.model).review.status === 'accepted'),
    ).toHaveLength(1);
    expect(
      JSON.parse(publication.find((row) => row.word_key === wordKey(EAT)).model).review.status,
    ).toBe('pending');
  });

  it('keeps the source backup exact and binds ledger and publication artifacts to the summary', async () => {
    const directory = newPackageDirectory();
    const original = sourceRows();
    const summary = await prepareSentenceReview(original, directory, fixtures.words);
    expect(JSON.parse(readGzip(directory, 'source-backup.json.gz'))).toEqual(original);
    expect(summary.sourceDigest).toBe(sha256(JSON.stringify(original.map(sourceRowHash).sort())));
    expect(summary.ledgerDigest).toBe(sha256(readGzip(directory, 'ledger.jsonl.gz')));
    expect(summary.publicationDigest).toBe(sha256(readGzip(directory, 'publication.json.gz')));
    expect(summary.humanEditorialReview).toBe(false);
    expect(summary.reviewMethod).toContain('lexical');
    const accepted = readPublication(directory).find(
      (row) => JSON.parse(row.model).review.status === 'accepted',
    );
    expect(verifiedReview(BUY, TYPE, accepted)?.basis).toBe(
      'agent-reviewed-lexical-sense-and-paired-frame-v1',
    );
    expect(readLedger(directory).find((record) => record.status === 'accepted').reviewedHash).toBe(
      JSON.parse(accepted.model).review.hash,
    );
  });

  it('refuses to overwrite a completed review package', async () => {
    const directory = newPackageDirectory();
    await prepareSentenceReview(sourceRows(), directory, fixtures.words);
    const originalBackup = readFileSync(join(directory, 'source-backup.json.gz'));
    await expect(prepareSentenceReview([], directory, fixtures.words)).rejects.toThrow(
      /already exists/i,
    );
    expect(readFileSync(join(directory, 'source-backup.json.gz'))).toEqual(originalBackup);
  });

  it('preserves a source backup left by an interrupted preparation', async () => {
    const directory = newPackageDirectory();
    mkdirSync(directory, { recursive: true });
    const originalBackup = gzipSync(JSON.stringify(sourceRows()));
    writeFileSync(join(directory, 'source-backup.json.gz'), originalBackup);
    await expect(prepareSentenceReview([], directory, fixtures.words)).rejects.toThrow(
      /already exists|backup/i,
    );
    expect(readFileSync(join(directory, 'source-backup.json.gz'))).toEqual(originalBackup);
  });

  it('hashes every content field publication may overwrite while excluding timestamps', () => {
    const row = sourceRows()[0];
    for (const field of ['dict', 'reading', 'group', 'surface', 'ja_template', 'en', 'model']) {
      expect(sourceRowHash({ ...row, [field]: `${row[field]} changed` })).not.toBe(
        sourceRowHash(row),
      );
    }
    expect(sourceRowHash({ ...row, updated_at: 'later', created_at: 'later' })).toBe(
      sourceRowHash(row),
    );
  });

  it('treats JSONB segment property ordering as equivalent while detecting changed readings', () => {
    const row = sourceRows()[0];
    const reordered = {
      ...row,
      segments: row.segments.map((segment) =>
        segment.w ? { w: true } : { r: segment.r, t: segment.t },
      ),
    };
    expect(JSON.stringify(sourceRowSignature(reordered))).not.toBe(
      JSON.stringify(sourceRowSignature(row)),
    );
    expect(sourceRowHash(reordered)).toBe(sourceRowHash(row));
    const changed = globalThis.structuredClone(reordered);
    changed.segments[0].r = 'あした';
    expect(sourceRowHash(changed)).not.toBe(sourceRowHash(row));
  });
});

describe('reviewed publication integrity and resume guards', () => {
  it('resumes an already partially applied package without losing source evidence', async () => {
    const directory = newPackageDirectory();
    const original = sourceRows();
    await prepareSentenceReview(original, directory, fixtures.words);
    const target = readPublication(directory);
    const backup = readFileSync(join(directory, 'source-backup.json.gz'));
    const partial = globalThis.structuredClone(original);
    partial[0] = target[0];
    const { server } = installServer(partial);
    await publishSentenceReview(directory);
    expect(server.posts.flat()).toHaveLength(target.length);
    expect(server.rows.map(sourceRowHash).sort()).toEqual(target.map(sourceRowHash).sort());
    expect(readFileSync(join(directory, 'source-backup.json.gz'))).toEqual(backup);
    expect(
      JSON.parse(readFileSync(join(directory, 'publication-verified.json'), 'utf8')).rows,
    ).toBe(target.length);
  });

  it('rejects publication content tampering before issuing a database request', async () => {
    const directory = newPackageDirectory();
    await prepareSentenceReview(sourceRows(), directory, fixtures.words);
    const rows = readPublication(directory);
    rows[0].en = 'I sold it at noon.';
    writeFileSync(join(directory, 'publication.json.gz'), gzipSync(JSON.stringify(rows)));
    const { fetchMock } = installServer(sourceRows());
    await expect(publishSentenceReview(directory)).rejects.toThrow(/digest mismatch/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects ledger tampering before issuing a database request', async () => {
    const directory = newPackageDirectory();
    await prepareSentenceReview(sourceRows(), directory, fixtures.words);
    writeFileSync(
      join(directory, 'ledger.jsonl.gz'),
      gzipSync(`${readGzip(directory, 'ledger.jsonl.gz')}{}\n`),
    );
    const { fetchMock } = installServer(sourceRows());
    await expect(publishSentenceReview(directory)).rejects.toThrow(
      /ledger.*digest|digest.*ledger/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects altered source evidence even when it matches a concurrent database edit', async () => {
    const directory = newPackageDirectory();
    await prepareSentenceReview(sourceRows(), directory, fixtures.words);
    const changed = sourceRows();
    changed[0].en = 'Concurrent editorial change.';
    writeFileSync(join(directory, 'source-backup.json.gz'), gzipSync(JSON.stringify(changed)));
    const { server } = installServer(changed);
    await expect(publishSentenceReview(directory)).rejects.toThrow(
      /source.*digest|backup.*digest/i,
    );
    expect(server.posts).toHaveLength(0);
  });

  it('rejects concurrent sentence edits and additions before writing any batch', async () => {
    for (const mutate of [
      (rows) => {
        rows[0].en = 'Concurrent editorial change.';
      },
      (rows) => {
        rows[0].reading = 'different reading';
      },
      (rows) => {
        rows.push({ ...rows[0], word_key: 'godan:concurrent-new-word' });
      },
    ]) {
      const directory = newPackageDirectory();
      await prepareSentenceReview(sourceRows(), directory, fixtures.words);
      const changed = sourceRows();
      mutate(changed);
      const { server } = installServer(changed);
      await expect(publishSentenceReview(directory)).rejects.toThrow(/concurrent sentence/i);
      expect(server.posts).toHaveLength(0);
    }
  });

  it('rejects a concurrent deletion instead of resurrecting the removed row', async () => {
    const directory = newPackageDirectory();
    await prepareSentenceReview(sourceRows(), directory, fixtures.words);
    const { server } = installServer(sourceRows().slice(1));
    await expect(publishSentenceReview(directory)).rejects.toThrow(
      /concurrent sentence|deleted|missing/i,
    );
    expect(server.posts).toHaveLength(0);
  });

  it('sends source and target signatures to the atomic publisher and stops after a raced edit', async () => {
    const directory = newPackageDirectory();
    const original = sourceRows();
    for (let index = 0; index < 501; index += 1) {
      original.push({ ...original[0], word_key: `godan:stale-${index}` });
    }
    await prepareSentenceReview(original, directory, fixtures.words);
    const { server } = installServer(original);
    server.beforeRpc = (state) => {
      state.rows[0].en = 'Edit after preflight completed.';
    };
    await expect(publishSentenceReview(directory)).rejects.toThrow(/HTTP 409|concurrent sentence/i);
    expect(server.posts).toHaveLength(0);
    expect(server.rows[0].en).toBe('Edit after preflight completed.');
    expect(server.rpcAttempts.length).toBeGreaterThan(0);
    for (const attemptedBatch of server.rpcAttempts) {
      expect(attemptedBatch).toHaveLength(500);
      expect(attemptedBatch[0].expected).toEqual(sourceRowSignature(original[0]));
      expect(attemptedBatch.some((item) => item.row.word_key === 'godan:stale-500')).toBe(false);
    }
    expect(existsSync(join(directory, 'publication-progress.json'))).toBe(false);
    expect(existsSync(join(directory, 'publication-verified.json'))).toBe(false);
  });

  it('rejects an atomic publication count mismatch without recording successful progress', async () => {
    const directory = newPackageDirectory();
    await prepareSentenceReview(sourceRows(), directory, fixtures.words);
    const { server } = installServer(sourceRows());
    server.responseCount = 1;
    await expect(publishSentenceReview(directory)).rejects.toThrow(/publication count mismatch/i);
    expect(existsSync(join(directory, 'publication-progress.json'))).toBe(false);
    expect(existsSync(join(directory, 'publication-verified.json'))).toBe(false);
  });

  it('rechecks approved content against the current dictionary before publication', async () => {
    const directory = newPackageDirectory();
    await prepareSentenceReview(sourceRows(), directory, fixtures.words);
    fixtures.words = [{ ...BUY, meaning: 'a changed sense' }, EAT, GENKI];
    const { server } = installServer(sourceRows());
    await expect(publishSentenceReview(directory)).rejects.toThrow(/stale approval/i);
    expect(server.posts).toHaveLength(0);
    expect(existsSync(join(directory, 'publication-verified.json'))).toBe(false);
  });
});

describe('read-only publication verification', () => {
  it('verifies an exact already-published package without resending any publication batch', async () => {
    const directory = newPackageDirectory();
    const summary = await prepareSentenceReview(sourceRows(), directory, fixtures.words);
    const { server, fetchMock } = installServer(readPublication(directory));
    expect(await verifySentencePublication(directory)).toEqual(summary);
    expect(server.posts).toHaveLength(0);
    expect(server.rpcAttempts).toHaveLength(0);
    expect(fetchMock.mock.calls.every(([, options]) => options.method !== 'POST')).toBe(true);
    expect(
      JSON.parse(readFileSync(join(directory, 'publication-verified.json'), 'utf8')),
    ).toMatchObject({ rows: readPublication(directory).length, digest: summary.publicationDigest });
    expect(existsSync(join(directory, 'publication-progress.json'))).toBe(false);
  });

  it('accepts immutable legacy v1 source digests while comparing JSONB-normalized live content', async () => {
    const directory = newPackageDirectory();
    const original = sourceRows();
    const summary = await prepareSentenceReview(original, directory, fixtures.words);
    expect(summary.sourceHashVersion).toBe(2);
    delete summary.sourceHashVersion;
    const legacyHashes = original.map((row) => sha256(JSON.stringify(sourceRowSignature(row))));
    summary.sourceDigest = sha256(JSON.stringify(legacyHashes.sort()));
    writeFileSync(join(directory, 'summary.json'), `${JSON.stringify(summary)}\n`);
    const preserved = new Map(
      ['source-backup.json.gz', 'ledger.jsonl.gz', 'publication.json.gz'].map((name) => [
        name,
        readFileSync(join(directory, name)),
      ]),
    );
    const target = readPublication(directory).map((row) => ({
      ...row,
      segments: row.segments.map((segment) =>
        segment.w ? { w: true } : { r: segment.r, t: segment.t },
      ),
    }));
    const { server } = installServer(target);
    expect(await verifySentencePublication(directory)).toEqual(summary);
    expect(server.posts).toHaveLength(0);
    expect(
      JSON.parse(readFileSync(join(directory, 'publication-verified.json'), 'utf8')),
    ).toMatchObject({ rows: target.length, digest: summary.publicationDigest });
    for (const [name, bytes] of preserved)
      expect(readFileSync(join(directory, name))).toEqual(bytes);
  });

  it('refuses a tampered publication package before any request or success marker', async () => {
    const directory = newPackageDirectory();
    await prepareSentenceReview(sourceRows(), directory, fixtures.words);
    const rows = readPublication(directory);
    rows[0].en = 'Tampered local publication text.';
    writeFileSync(join(directory, 'publication.json.gz'), gzipSync(JSON.stringify(rows)));
    const { fetchMock } = installServer(rows);
    await expect(verifySentencePublication(directory)).rejects.toThrow(/digest mismatch/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(existsSync(join(directory, 'publication-verified.json'))).toBe(false);
  });

  it('refuses changed or missing published content without writing data or a success marker', async () => {
    for (const mutate of [
      (rows) => {
        rows[0].en = 'Changed published translation.';
      },
      (rows) => {
        rows.pop();
      },
    ]) {
      const directory = newPackageDirectory();
      await prepareSentenceReview(sourceRows(), directory, fixtures.words);
      const rows = readPublication(directory);
      mutate(rows);
      const { server } = installServer(rows);
      await expect(verifySentencePublication(directory)).rejects.toThrow(/did not match/i);
      expect(server.posts).toHaveLength(0);
      expect(existsSync(join(directory, 'publication-verified.json'))).toBe(false);
    }
  });

  it('refuses duplicate published keys even when row counts and individual hashes match', async () => {
    const directory = newPackageDirectory();
    await prepareSentenceReview(sourceRows(), directory, fixtures.words);
    const rows = readPublication(directory);
    rows[1] = globalThis.structuredClone(rows[0]);
    const { server } = installServer(rows);
    await expect(verifySentencePublication(directory)).rejects.toThrow(/did not match|duplicate/i);
    expect(server.posts).toHaveLength(0);
    expect(existsSync(join(directory, 'publication-verified.json'))).toBe(false);
  });
});

describe('keyset sentence snapshots', () => {
  function fullPage() {
    const rows = Array.from({ length: 999 }, (_, index) => ({
      word_key: `godan:word-${String(index).padStart(4, '0')}`,
      type: TYPE,
    }));
    rows.push({ word_key: 'godan:文, "引用"', type: 'plain-negative' });
    return rows;
  }

  it('pages by the complete word/type cursor with quoted values and never uses OFFSET', async () => {
    const page = fullPage();
    const tail = [
      { word_key: page[999].word_key, type: 'plain-past' },
      { word_key: 'godan:次', type: 'plain-past' },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new globalThis.Response(JSON.stringify(page)))
      .mockResolvedValueOnce(new globalThis.Response(JSON.stringify(tail)));
    vi.stubGlobal('fetch', fetchMock);
    expect(await snapshotSentenceTable()).toEqual([...page, ...tail]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = new URL(fetchMock.mock.calls[0][0]).searchParams;
    const second = new URL(fetchMock.mock.calls[1][0]).searchParams;
    expect(first.get('order')).toBe('word_key.asc,type.asc');
    expect(first.get('limit')).toBe('1000');
    expect(first.has('offset')).toBe(false);
    expect(first.has('or')).toBe(false);
    expect(second.has('offset')).toBe(false);
    const key = JSON.stringify(page[999].word_key);
    const type = JSON.stringify(page[999].type);
    expect(second.get('or')).toBe(`(word_key.gt.${key},and(word_key.eq.${key},type.gt.${type}))`);
    expect(fetchMock.mock.calls.every(([, options]) => options.method !== 'POST')).toBe(true);
  });

  it('refuses a server that repeats a full page instead of advancing the cursor', async () => {
    const page = fullPage();
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new globalThis.Response(JSON.stringify(page)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(snapshotSentenceTable()).rejects.toThrow(/cursor did not advance/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses a non-array server response instead of silently producing a partial snapshot', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new globalThis.Response(JSON.stringify({ rows: [] })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(snapshotSentenceTable()).rejects.toThrow(/invalid sentence snapshot response/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('review-to-bundle publication contract', () => {
  it('publishes accepted rows only, preserves unavailable coverage, and emits verifiable revisions', async () => {
    const directory = newPackageDirectory();
    await prepareSentenceReview(sourceRows(), directory, fixtures.words);
    const result = buildCorpusChunks(fixtures.pairs, readPublication(directory), fixtures.words);
    expect(result.invalid).toEqual([]);
    expect(result.pending).toHaveLength(1);
    expect(result.quarantined).toHaveLength(1);
    expect(result.stale).toHaveLength(1);
    expect(result.missing).toHaveLength(3);
    const { files, stats } = buildCorpusFileBodies(result.chunks);
    const manifest = JSON.parse(files.get('manifest.json'));
    expect(stats.totalRows).toBe(1);
    expect(manifest.schema).toBe(2);
    const revisions = manifest.types
      .map((entry) => [entry.type, entry.revision])
      .sort((a, b) => a[0].localeCompare(b[0]));
    expect(manifest.revision).toBe(sha256(JSON.stringify(revisions)));
    for (const entry of manifest.types) {
      const chunk = JSON.parse(files.get(entry.path));
      expect(chunk.revision).toBe(sha256(JSON.stringify(chunk.rows)));
      expect(chunk.revision).toBe(entry.revision);
      expect(chunk.rows).toHaveLength(entry.count);
      expect(chunk.rows.every((row) => row[4].status === 'accepted')).toBe(true);
    }
  });

  it('changes publication revision for same-length content edits and rejects stale approval', async () => {
    const directory = newPackageDirectory();
    await prepareSentenceReview(sourceRows(), directory, fixtures.words);
    const firstRows = readPublication(directory);
    const changedRows = globalThis.structuredClone(firstRows);
    changedRows[0].en = 'I bought it at dusk.';
    expect(JSON.stringify(firstRows).length).toBe(JSON.stringify(changedRows).length);
    const stale = buildCorpusChunks(fixtures.pairs, changedRows, fixtures.words);
    expect(stale.invalid).toContainEqual({
      key: `${wordKey(BUY)}|${TYPE}`,
      reason: 'invalid-or-stale-review',
    });
    const review = JSON.parse(changedRows[0].model).review;
    review.hash = reviewedContentHash(BUY, TYPE, changedRows[0], review);
    changedRows[0].model = reviewProvenance(review);
    const before = buildCorpusFileBodies(
      buildCorpusChunks(fixtures.pairs, firstRows, fixtures.words).chunks,
    );
    const after = buildCorpusFileBodies(
      buildCorpusChunks(fixtures.pairs, changedRows, fixtures.words).chunks,
    );
    expect(JSON.parse(before.files.get('manifest.json')).revision).not.toBe(
      JSON.parse(after.files.get('manifest.json')).revision,
    );
  });
});

describe('ordinary importer approval boundary', () => {
  function importDryRun(out) {
    const directory = newPackageDirectory();
    mkdirSync(directory, { recursive: true });
    const input = join(directory, 'generated.jsonl');
    writeFileSync(input, `${JSON.stringify(out)}\n`);
    return {
      stdout: execFileSync(
        globalThis.process.execPath,
        ['scripts/import-sentence-library.js', input],
        {
          cwd: globalThis.process.cwd(),
          encoding: 'utf8',
          env: {
            ...globalThis.process.env,
            SENTENCE_DRY_RUN: '1',
            SENTENCE_NO_KUROMOJI: '1',
            SENTENCE_TEMPLATE_CAP: '0',
          },
        },
      ),
      rejects: input.replace(/\.jsonl$/, '') + '.rejects.jsonl',
    };
  }

  it('leaves structurally valid generated output pending without independent review evidence', () => {
    const result = importDryRun({
      word_key: wordKey(BUY),
      type: TYPE,
      ja: '昼に買った。',
      en: 'I bought it at noon.',
      segments: [{ t: '昼に', r: '' }, { w: true }, { t: '。', r: '' }],
    });
    expect(result.stdout).toContain('0 approved, 1 pending');
    expect(result.stdout).toContain('dry run, not upserted');
    expect(existsSync(result.rejects)).toBe(false);
  });

  it('rejects generated content that carries a stale claimed approval', () => {
    const result = importDryRun({
      word_key: wordKey(BUY),
      type: TYPE,
      ja: '昼に買った。',
      en: 'I bought it at noon.',
      segments: [{ t: '昼に', r: '' }, { w: true }, { t: '。', r: '' }],
      review: {
        status: 'accepted',
        version: 1,
        hash: 'a'.repeat(64),
        sense: 'to buy',
        basis: 'stale-editorial-review',
      },
    });
    expect(result.stdout).toContain('0 approved, 0 pending');
    expect(JSON.parse(readFileSync(result.rejects, 'utf8').trim()).reason).toBe(
      'invalid-or-stale-review',
    );
  });
});
