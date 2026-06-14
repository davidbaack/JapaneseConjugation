import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildCorpusChunks,
  checkCorpusFiles,
  expectedSentencePairs,
  resolveCorpusOutputDir,
  writeCorpusFiles,
} from '../../scripts/export-sentence-corpus.js';

const WORD = { dict: '買う', reading: 'かう', meaning: 'to buy', group: 'godan' };
const tempRoots = [];

function makeCorpusOutDir() {
  const root = mkdtempSync(join(tmpdir(), 'katachiya-corpus-'));
  tempRoots.push(root);
  return join(root, 'data', 'sentences');
}

function sampleChunks() {
  return [
    {
      type: 'plain-past',
      rows: [['godan:a', 'today {w}.', 'I did it today.', [{ w: true }]]],
    },
    {
      type: 'plain-negative',
      rows: [['godan:a', 'tomorrow {w}.', 'I will not do it tomorrow.', [{ w: true }]]],
    },
  ];
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('sentence corpus exporter helpers', () => {
  it('builds expected pairs from current conjugation rules', () => {
    expect(expectedSentencePairs([WORD], ['plain-past'])).toEqual([
      { word_key: 'godan:買う', type: 'plain-past' },
    ]);
  });

  it('filters stale rows and sorts corpus rows by word key', () => {
    const expected = [
      { word_key: 'godan:b', type: 'plain-past' },
      { word_key: 'godan:a', type: 'plain-past' },
    ];
    const result = buildCorpusChunks(expected, [
      {
        word_key: 'godan:stale',
        type: 'plain-past',
        ja_template: '古い{w}。',
        en: 'Stale.',
        segments: [{ w: true }],
      },
      {
        word_key: 'godan:b',
        type: 'plain-past',
        ja_template: 'ノートに{w}。',
        en: 'I wrote it in my notebook.',
        segments: [{ w: true }],
      },
      {
        word_key: 'godan:a',
        type: 'plain-past',
        ja_template: '昼に{w}。',
        en: 'I bought it at noon.',
        segments: [{ w: true }],
      },
    ]);

    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.stale).toEqual(['godan:stale|plain-past']);
    expect(result.chunks).toEqual([
      {
        type: 'plain-past',
        rows: [
          ['godan:a', '昼に{w}。', 'I bought it at noon.', [{ w: true }]],
          ['godan:b', 'ノートに{w}。', 'I wrote it in my notebook.', [{ w: true }]],
        ],
      },
    ]);
  });

  it('reports missing and invalid expected rows', () => {
    const result = buildCorpusChunks(
      [
        { word_key: 'godan:買う', type: 'plain-past' },
        { word_key: 'godan:書く', type: 'plain-past' },
      ],
      [
        {
          word_key: 'godan:買う',
          type: 'plain-past',
          ja_template: '昼に{w}。',
          en: 'I bought it at noon.',
          segments: null,
        },
      ],
    );

    expect(result.invalid).toEqual([{ key: 'godan:買う|plain-past', reason: 'missing-segments' }]);
    expect(result.missing).toEqual(['godan:買う|plain-past', 'godan:書く|plain-past']);
  });

  it('refuses unsafe corpus output directories before recursive deletion', () => {
    expect(() => resolveCorpusOutputDir('.')).toThrow(/Unsafe sentence corpus output directory/);
    expect(() => resolveCorpusOutputDir('public')).toThrow(
      /Unsafe sentence corpus output directory/,
    );
    expect(() => writeCorpusFiles([], 'public')).toThrow(/Unsafe sentence corpus output directory/);
  });

  it('writes corpus files only under a nested sentences directory', () => {
    const outDir = makeCorpusOutDir();

    const stats = writeCorpusFiles(
      [
        {
          type: 'plain-past',
          rows: [['godan:買う', '昼に{w}。', 'I bought it at noon.', [{ w: true }]]],
        },
      ],
      outDir,
    );

    expect(stats).toMatchObject({ totalRows: 1, typeCount: 1 });
    expect(existsSync(join(outDir, 'manifest.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(outDir, 'by-type', 'plain-past.json'), 'utf8'))).toEqual({
      schema: 1,
      type: 'plain-past',
      rows: [['godan:買う', '昼に{w}。', 'I bought it at noon.', [{ w: true }]]],
    });
  });

  it('reports an exact checked-in corpus match', () => {
    const chunks = sampleChunks();
    const outDir = makeCorpusOutDir();
    writeCorpusFiles(chunks, outDir);

    expect(checkCorpusFiles(chunks, outDir)).toMatchObject({
      ok: true,
      totalRows: 2,
      typeCount: 2,
      missingFiles: [],
      extraFiles: [],
      changedFiles: [],
    });
  });

  it('reports changed chunk content', () => {
    const chunks = sampleChunks();
    const outDir = makeCorpusOutDir();
    writeCorpusFiles(chunks, outDir);
    writeFileSync(
      join(outDir, 'by-type', 'plain-past.json'),
      `${JSON.stringify({
        schema: 1,
        type: 'plain-past',
        rows: [['godan:a', 'changed {w}.', 'Changed.', [{ w: true }]]],
      })}\n`,
    );

    expect(checkCorpusFiles(chunks, outDir)).toMatchObject({
      ok: false,
      missingFiles: [],
      extraFiles: [],
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
    mkdirSync(join(outDir, 'by-type'), { recursive: true });
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
