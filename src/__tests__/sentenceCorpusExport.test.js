import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCorpusChunks,
  buildCorpusFileBodies,
  checkCorpusFiles,
  expectedSentencePairs,
  fetchSentenceRowsFromSupabase,
  resolveCorpusOutputDir,
  writeCorpusFiles,
} from '../../scripts/export-sentence-corpus.js';
import { reviewedContentHash, reviewProvenance, sha256 } from '../../scripts/sentenceReview.js';
import { wordKey } from '../utils/conjugator.js';
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

const WORD = { dict: '買う', reading: 'かう', meaning: 'to buy', group: 'godan' };
const WRITE = { dict: '書く', reading: 'かく', meaning: 'to write', group: 'godan' };
const GOOD = { dict: 'いい', reading: 'いい', meaning: 'good', group: 'i-adjective' };
const ITCHY = { dict: 'かゆい', reading: 'かゆい', meaning: 'itchy', group: 'i-adjective' };
const tempRoots = [];

function makeCorpusOutDir() {
  const root = mkdtempSync(join(tmpdir(), 'katachiya-corpus-'));
  tempRoots.push(root);
  return join(root, 'data', 'sentences');
}

function pair(word, type = 'plain-past') {
  return { word_key: wordKey(word), type };
}

function acceptedRow(word = WORD, type = 'plain-past', overrides = {}) {
  const row = {
    ...pair(word, type),
    ja_template: '昼に{w}。',
    en: 'I bought it at noon.',
    segments: [{ t: '昼', r: 'ひる' }, { t: 'に', r: '' }, { w: true }, { t: '。', r: '' }],
    ...overrides,
  };
  const review = {
    status: 'accepted',
    version: 1,
    basis: 'fixture-reviewed-pair',
    sense: word.meaning,
    hash: '',
  };
  review.hash = reviewedContentHash(word, type, row, review);
  return { ...row, review };
}

function sampleChunks() {
  const past = acceptedRow();
  const negative = acceptedRow(WORD, 'plain-negative', {
    ja_template: '今日は{w}。',
    en: 'I will not buy it today.',
    segments: [{ t: '今日は', r: '' }, { w: true }, { t: '。', r: '' }],
  });
  return buildCorpusChunks([pair(WORD), pair(WORD, 'plain-negative')], [past, negative], [WORD])
    .chunks;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('sentence corpus exporter helpers', () => {
  it('keeps service-role export visibility aligned with accepted-only public content', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const filters = [];
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((key, value) => {
        filters.push([key, value]);
        return query;
      }),
      order: vi.fn().mockReturnThis(),
      range: vi.fn(async () => ({
        data: filters.some(([key, value]) => key === 'review->>status' && value === 'accepted')
          ? [{ word_key: 'ichidan:見る', type: 'plain-past', review: { status: 'accepted' } }]
          : [{ review: { status: 'pending' } }],
        error: null,
      })),
    };
    vi.mocked(createClient).mockReturnValue({ from: vi.fn(() => query) });
    const rows = await fetchSentenceRowsFromSupabase({
      url: 'https://test.invalid',
      key: 'test-key',
      typeIds: ['plain-past'],
    });
    expect(rows).toEqual([
      { word_key: 'ichidan:見る', type: 'plain-past', review: { status: 'accepted' } },
    ]);
  });
  it('builds expected pairs from current conjugation rules', () => {
    expect(expectedSentencePairs([WORD], ['plain-past'])).toEqual([pair(WORD)]);
  });

  it('filters stale rows and exports valid approvals sorted by real word key', () => {
    const buy = acceptedRow();
    const write = acceptedRow(WRITE, 'plain-past', {
      ja_template: 'ノートに{w}。',
      en: 'I wrote it in my notebook.',
      segments: [{ t: 'ノートに', r: '' }, { w: true }, { t: '。', r: '' }],
    });
    const stale = { ...acceptedRow(), type: 'plain-present' };
    const result = buildCorpusChunks([pair(WRITE), pair(WORD)], [stale, buy, write], [WORD, WRITE]);

    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.pending).toEqual([]);
    expect(result.quarantined).toEqual([]);
    expect(result.stale).toEqual([`${wordKey(WORD)}|plain-present`]);
    expect(result.chunks).toEqual([
      {
        type: 'plain-past',
        rows: [buy, write]
          .sort((a, b) => a.word_key.localeCompare(b.word_key))
          .map((row) => [row.word_key, row.ja_template, row.en, row.segments, row.review]),
      },
    ]);
  });

  it('accepts serialized database review provenance only with matching content', () => {
    const accepted = acceptedRow();
    const row = { ...accepted, model: reviewProvenance(accepted.review) };
    delete row.review;
    const result = buildCorpusChunks([pair(WORD)], [row], [WORD]);
    expect(result.invalid).toEqual([]);
    expect(result.chunks[0].rows[0][4]).toEqual(accepted.review);
  });

  it('allows partial coverage while excluding pending and quarantined contexts', () => {
    const accepted = acceptedRow();
    const pending = { ...acceptedRow(WORD, 'plain-negative'), review: { status: 'needs-repair' } };
    const quarantined = { ...acceptedRow(WORD, 'plain-present'), review: { status: 'unsuitable' } };
    const expected = [
      pair(WORD),
      pair(WORD, 'plain-negative'),
      pair(WORD, 'plain-present'),
      pair(WRITE),
    ];
    const result = buildCorpusChunks(expected, [accepted, pending, quarantined], [WORD, WRITE]);

    expect(result.invalid).toEqual([]);
    expect(result.pending).toEqual([`${wordKey(WORD)}|plain-negative`]);
    expect(result.quarantined).toEqual([`${wordKey(WORD)}|plain-present`]);
    expect(result.missing).toEqual(
      expected.slice(1).map((value) => `${value.word_key}|${value.type}`),
    );
    expect(result.chunks.reduce((sum, chunk) => sum + chunk.rows.length, 0)).toBe(1);
    expect(result.chunks.find((chunk) => chunk.type === 'plain-negative').rows).toEqual([]);
    const outDir = makeCorpusOutDir();
    writeCorpusFiles(result.chunks, outDir);
    expect(checkCorpusFiles(result.chunks, outDir).ok).toBe(true);
  });

  it('does not infer approval from structurally valid but unreviewed content', () => {
    const row = acceptedRow();
    delete row.review;
    const result = buildCorpusChunks([pair(WORD)], [row], [WORD]);
    expect(result.invalid).toEqual([]);
    expect(result.pending).toEqual([`${wordKey(WORD)}|plain-past`]);
    expect(result.chunks[0].rows).toEqual([]);
  });

  it('reports conflicting duplicate approvals instead of publishing both', () => {
    const original = acceptedRow();
    const changed = acceptedRow(WORD, 'plain-past', {
      ja_template: '夜に{w}。',
      en: 'I bought it at night.',
      segments: [{ t: '夜に', r: '' }, { w: true }, { t: '。', r: '' }],
    });
    const result = buildCorpusChunks([pair(WORD)], [original, changed], [WORD]);
    expect(result.invalid).toEqual([
      { key: `${wordKey(WORD)}|plain-past`, reason: 'duplicate-word-form' },
    ]);
    expect(result.chunks[0].rows).toHaveLength(1);
  });

  it('reports missing and malformed accepted rows', () => {
    const result = buildCorpusChunks(
      [pair(WORD), pair(WRITE)],
      [acceptedRow(WORD, 'plain-past', { segments: null })],
      [WORD, WRITE],
    );
    expect(result.invalid).toEqual([
      { key: `${wordKey(WORD)}|plain-past`, reason: 'missing-segments' },
    ]);
    expect(result.missing).toEqual([`${wordKey(WORD)}|plain-past`, `${wordKey(WRITE)}|plain-past`]);
  });

  it.each([
    ['segments that omit the context', { segments: [{ w: true }] }],
    ['multiple target slots', { ja_template: '昼に{w}、{w}。' }],
    [
      'non-kana readings',
      { segments: [{ t: '昼に', r: 'noon' }, { w: true }, { t: '。', r: '' }] },
    ],
  ])('rejects even signed accepted rows with %s', (_label, overrides) => {
    const result = buildCorpusChunks(
      [pair(WORD)],
      [acceptedRow(WORD, 'plain-past', overrides)],
      [WORD],
    );
    expect(result.invalid).toEqual([
      { key: `${wordKey(WORD)}|plain-past`, reason: 'invalid-or-stale-review' },
    ]);
    expect(result.chunks[0].rows).toEqual([]);
  });

  it('rejects an approval after English, Japanese, readings, or the current sense changes', () => {
    const row = acceptedRow();
    for (const changed of [
      { ...row, en: 'I bought it at night.' },
      {
        ...row,
        ja_template: '夜に{w}。',
        segments: [{ t: '夜に', r: '' }, { w: true }, { t: '。', r: '' }],
      },
      { ...row, segments: [{ t: '昼', r: 'よる' }, ...row.segments.slice(1)] },
    ]) {
      expect(buildCorpusChunks([pair(WORD)], [changed], [WORD]).invalid).toEqual([
        { key: `${wordKey(WORD)}|plain-past`, reason: 'invalid-or-stale-review' },
      ]);
    }
    const changedSense = { ...WORD, meaning: 'to purchase affection' };
    expect(buildCorpusChunks([pair(WORD)], [row], [changedSense]).invalid).toEqual([
      { key: `${wordKey(WORD)}|plain-past`, reason: 'invalid-or-stale-review' },
    ]);
  });

  it('rejects accepted rows with known misleading adjective English', () => {
    const generic = acceptedRow(GOOD, 'adj-conditional', {
      ja_template: 'この部屋が{w}、助かる。',
      en: 'If the room is good, I will use it.',
      segments: [{ t: 'この部屋が', r: '' }, { w: true }, { t: '、助かる。', r: '' }],
    });
    expect(buildCorpusChunks([pair(GOOD, 'adj-conditional')], [generic], [GOOD]).invalid).toEqual([
      { key: `${wordKey(GOOD)}|adj-conditional`, reason: 'en-generic-adjective-result' },
    ]);
    const incompatible = acceptedRow(ITCHY, 'adj-tara', {
      ja_template: 'この仕事が{w}、休憩を増やす。',
      en: 'If this task is itchy, I will add a break.',
      segments: [{ t: 'この仕事が', r: '' }, { w: true }, { t: '、休憩を増やす。', r: '' }],
    });
    expect(buildCorpusChunks([pair(ITCHY, 'adj-tara')], [incompatible], [ITCHY]).invalid).toEqual([
      { key: `${wordKey(ITCHY)}|adj-tara`, reason: 'en-adjective-body-context-mismatch' },
    ]);
  });

  it('refuses unsafe output directories before deletion', () => {
    expect(() => resolveCorpusOutputDir('.')).toThrow(/Unsafe sentence corpus output directory/);
    expect(() => resolveCorpusOutputDir('public')).toThrow(
      /Unsafe sentence corpus output directory/,
    );
    expect(() => writeCorpusFiles([], 'public')).toThrow(/Unsafe sentence corpus output directory/);
  });

  it.each(['../outside', '../../outside', '/absolute', 'plain/past', 'plain\\past'])(
    'rejects unsafe chunk type %s before deleting existing files',
    (type) => {
      const outDir = makeCorpusOutDir();
      mkdirSync(outDir, { recursive: true });
      const marker = join(outDir, 'keep.txt');
      writeFileSync(marker, 'Keep existing output if input is unsafe.');
      const chunks = [{ type, rows: [] }];
      expect(() => buildCorpusFileBodies(chunks)).toThrow(/unsafe|invalid/i);
      expect(() => writeCorpusFiles(chunks, outDir)).toThrow(/unsafe|invalid/i);
      expect(readFileSync(marker, 'utf8')).toBe('Keep existing output if input is unsafe.');
    },
  );

  it('writes schema 2 chunks and exact content revisions with durable approvals', () => {
    const chunks = sampleChunks();
    const outDir = makeCorpusOutDir();
    const stats = writeCorpusFiles(chunks, outDir);
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'));
    expect(stats).toMatchObject({ totalRows: 2, typeCount: 2 });
    expect(manifest.schema).toBe(2);
    expect(manifest.revision).toBe(
      sha256(
        JSON.stringify(chunks.map((chunk) => [chunk.type, sha256(JSON.stringify(chunk.rows))])),
      ),
    );
    for (const chunk of chunks) {
      const revision = sha256(JSON.stringify(chunk.rows));
      expect(
        JSON.parse(readFileSync(join(outDir, 'by-type', `${chunk.type}.json`), 'utf8')),
      ).toEqual({ schema: 2, type: chunk.type, revision, rows: chunk.rows });
      expect(manifest.types.find((entry) => entry.type === chunk.type)).toEqual({
        type: chunk.type,
        count: chunk.rows.length,
        revision,
        path: `by-type/${chunk.type}.json`,
      });
    }
  });

  it('changes content revision for equal-byte-length paired repairs', () => {
    const rows = ['ペン', '帽子'].map((noun, index) =>
      acceptedRow(WORD, 'plain-past', {
        ja_template: `${noun}を{w}。`,
        en: `I bought a ${index ? 'hat' : 'pen'}.`,
        segments: [{ t: `${noun}を`, r: '' }, { w: true }, { t: '。', r: '' }],
      }),
    );
    const bodies = rows.map((row) =>
      buildCorpusFileBodies(buildCorpusChunks([pair(WORD)], [row], [WORD]).chunks),
    );
    const first = bodies[0].files.get('by-type/plain-past.json');
    const second = bodies[1].files.get('by-type/plain-past.json');
    expect(Buffer.byteLength(first)).toBe(Buffer.byteLength(second));
    expect(JSON.parse(first).revision).not.toBe(JSON.parse(second).revision);
    expect(JSON.parse(bodies[0].files.get('manifest.json')).revision).not.toBe(
      JSON.parse(bodies[1].files.get('manifest.json')).revision,
    );
  });

  it('uses exact file bytes for consistency checks and size reporting', () => {
    const chunks = sampleChunks();
    const outDir = makeCorpusOutDir();
    const { files, stats } = buildCorpusFileBodies(chunks);
    writeCorpusFiles(chunks, outDir);
    expect(stats.rawBytes).toBe(
      [...files.values()].reduce((sum, body) => sum + Buffer.byteLength(body), 0),
    );
    expect(stats.gzipBytes).toBe(
      [...files.values()].reduce((sum, body) => sum + gzipSync(body).length, 0),
    );
    for (const [relativePath, body] of files)
      expect(readFileSync(join(outDir, relativePath), 'utf8')).toBe(body);
    expect(checkCorpusFiles(chunks, outDir)).toMatchObject({
      ok: true,
      totalRows: 2,
      typeCount: 2,
      missingFiles: [],
      extraFiles: [],
      changedFiles: [],
    });
    const chunkPath = join(outDir, 'by-type', 'plain-past.json');
    writeFileSync(chunkPath, `${readFileSync(chunkPath, 'utf8')} `);
    expect(checkCorpusFiles(chunks, outDir)).toMatchObject({
      ok: false,
      changedFiles: ['by-type/plain-past.json'],
    });
  });

  it('reports missing chunk files', () => {
    const chunks = sampleChunks();
    const outDir = makeCorpusOutDir();
    writeCorpusFiles(chunks, outDir);
    rmSync(join(outDir, 'by-type', 'plain-negative.json'));
    expect(checkCorpusFiles(chunks, outDir)).toMatchObject({
      ok: false,
      missingFiles: ['by-type/plain-negative.json'],
      extraFiles: [],
      changedFiles: [],
    });
  });

  it('reports extra exported files', () => {
    const chunks = sampleChunks();
    const outDir = makeCorpusOutDir();
    writeCorpusFiles(chunks, outDir);
    writeFileSync(join(outDir, 'by-type', 'obsolete.json'), '{}\n');
    expect(checkCorpusFiles(chunks, outDir)).toMatchObject({
      ok: false,
      missingFiles: [],
      extraFiles: ['by-type/obsolete.json'],
      changedFiles: [],
    });
  });

  it('reports manifest mismatch separately from chunk matches', () => {
    const chunks = sampleChunks();
    const outDir = makeCorpusOutDir();
    writeCorpusFiles(chunks, outDir);
    writeFileSync(join(outDir, 'manifest.json'), '{}\n');
    expect(checkCorpusFiles(chunks, outDir)).toMatchObject({
      ok: false,
      missingFiles: [],
      extraFiles: [],
      changedFiles: ['manifest.json'],
    });
  });
});
