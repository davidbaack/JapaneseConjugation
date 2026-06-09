// @ts-check
// Rewrite generated sentence-library JSONL files with natural English glosses.
//
// Usage:
//   node scripts/rewrite-sentence-english.js [input-dir] [output-dir]
//
// The input dir must contain matching batch-XXXX.jsonl and out-XXXX.jsonl files.
// The output dir receives corrected out-XXXX.jsonl files only.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadSentenceWordMap, sentenceEnglish } from './sentenceEnglish.js';

const inputDir = process.argv[2] || join('tmp', 'sentence-batches');
const outputDir = process.argv[3] || join('tmp', 'sentence-natural-english');

function jsonl(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function outputNameForBatch(batchName) {
  return batchName.replace(/^batch-/, 'out-');
}

function assertSamePair(batchItem, outItem, file, index) {
  if (batchItem.word_key !== outItem.word_key || batchItem.type !== outItem.type) {
    throw new Error(
      `${file}:${index + 1} mismatched pair: ${batchItem.word_key}/${batchItem.type} vs ${outItem.word_key}/${outItem.type}`,
    );
  }
}

function fallbackSegments(batchItem, outItem, file, index) {
  if (Array.isArray(outItem.segments) && outItem.segments.length) return outItem.segments;
  const surface = String(batchItem.expected_surface || '');
  const ja = String(outItem.ja || '');
  const start = surface ? ja.indexOf(surface) : -1;
  if (start < 0 || ja.indexOf(surface, start + surface.length) >= 0) {
    throw new Error(`${file}:${index + 1} cannot locate unique expected surface`);
  }
  return [
    { t: ja.slice(0, start), r: '' },
    { w: true },
    { t: ja.slice(start + surface.length), r: '' },
  ];
}

function needsEnglishRepair(en) {
  const text = String(en || '').trim();
  return (
    !text ||
    /A short practice sentence using/i.test(text) ||
    /practice sentence/i.test(text) ||
    /\bin the\b[^.]*\bform\b/i.test(text)
  );
}

const batchFiles = readdirSync(inputDir)
  .filter((name) => /^batch-\d{4}\.jsonl$/.test(name))
  .sort();

if (!batchFiles.length) throw new Error(`No batch-XXXX.jsonl files found in ${inputDir}`);

mkdirSync(outputDir, { recursive: true });
const words = loadSentenceWordMap();

let files = 0;
let rows = 0;
let changed = 0;

for (const batchFile of batchFiles) {
  const outFile = outputNameForBatch(batchFile);
  const batchPath = join(inputDir, batchFile);
  const outPath = join(inputDir, outFile);
  if (!existsSync(outPath)) throw new Error(`Missing output file for ${batchFile}: ${outFile}`);

  const batch = jsonl(batchPath);
  const output = jsonl(outPath);
  if (batch.length !== output.length) {
    throw new Error(`${batchFile} has ${batch.length} rows but ${outFile} has ${output.length}`);
  }

  const corrected = output.map((outItem, index) => {
    const batchItem = batch[index];
    assertSamePair(batchItem, outItem, outFile, index);
    const word = words.get(outItem.word_key);
    if (!word) throw new Error(`${outFile}:${index + 1} unknown word ${outItem.word_key}`);
    const en = needsEnglishRepair(outItem.en) ? sentenceEnglish(word, outItem.type) : outItem.en;
    if (en !== outItem.en) changed += 1;
    return { ...outItem, en, segments: fallbackSegments(batchItem, outItem, outFile, index) };
  });

  writeFileSync(
    join(outputDir, basename(outFile)),
    corrected.map((row) => JSON.stringify(row)).join('\n') + '\n',
  );
  rows += corrected.length;
  files += 1;
}

console.log(`Wrote ${rows} corrected sentence row(s) across ${files} file(s) to ${outputDir}`);
console.log(`Updated English glosses: ${changed}`);
