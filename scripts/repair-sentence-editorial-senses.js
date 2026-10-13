#!/usr/bin/env node
// Exact two-pair offline repair. No live reads, publication or provider calls.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCorpusFileBodies, loadSentenceWords } from './export-sentence-corpus.js';
import { reviewedContentHash, reviewProvenance, sha256, verifiedReview } from './sentenceReview.js';
import { sourceRowSignature } from './review-sentence-corpus.js';
import { buildReviewedSentence } from '../src/utils/reviewedSentenceFrames.js';
import { surfaceFormFor, wordKey } from '../src/utils/conjugator.js';
import { parseSentenceReview } from '../src/utils/sentenceTrust.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_PATH = 'public/data/sentences';
const MANIFEST_PATH = `${CORPUS_PATH}/manifest.json`;
export const EXACT_SENSE_REPAIR_PATH = 'data/sentence-reviews/2026-10-13-exact-sense-repair.json';
const BASELINE_PATH = 'data/sentence-reviews/2026-10-13-editorial-sample-baseline.json';

export const EXACT_SENSE_REPAIRS = [
  {
    key: 'ichidan:褒める',
    type: 'passive-polite-past',
    oldSense: 'praise a child',
    newSense: 'be praised by the teacher',
    oldHash: '54608d3119900b375b10c5b5e90690d385e16dc232d3e6ea8037bbe78a79c746',
  },
  {
    key: 'godan:飲む',
    type: 'humble',
    oldSense: 'drink water',
    newSense: 'drink tea received from the teacher',
    oldHash: '86e7d8f6bcd3e6b8e1cc4012185da103e84730ae8975d343a908d17b376e9b61',
  },
];

const identity = (key, type) => `${key}|${type}`;
const rowValue = (row) => ({
  jaTemplate: row[1],
  en: row[2],
  segments: row[3],
  review: row[4],
});
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );

function corpusChunks() {
  const tracked = new Set(
    execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0'),
  );
  if (!tracked.has(MANIFEST_PATH)) throw new Error('Corpus manifest must be tracked');
  const manifest = JSON.parse(read(MANIFEST_PATH));
  const chunks = manifest.types.map((entry) => {
    if (!/^[a-z0-9-]+$/.test(entry.type) || entry.path !== `by-type/${entry.type}.json`) {
      throw new Error('Invalid sentence chunk path');
    }
    const path = `${CORPUS_PATH}/${entry.path}`;
    if (!tracked.has(path)) throw new Error(`Sentence chunk must be tracked: ${path}`);
    return JSON.parse(read(path));
  });
  const generated = buildCorpusFileBodies(chunks);
  for (const [relativePath, body] of generated.files) {
    if (read(`${CORPUS_PATH}/${relativePath}`) !== body) {
      throw new Error(`Noncanonical or inconsistent corpus file: ${relativePath}`);
    }
  }
  return { manifest, chunks, generated };
}

function untouchedRowsDigest(chunks) {
  const repaired = new Set(EXACT_SENSE_REPAIRS.map((pair) => identity(pair.key, pair.type)));
  return sha256(
    canonical(
      chunks.flatMap((chunk) =>
        chunk.rows
          .filter((row) => !repaired.has(identity(row[0], chunk.type)))
          .map((row) => [chunk.type, row]),
      ),
    ),
  );
}

/** Prepare from the original corpus; preserve it before writing any target file. */
export function prepareExactSenseRepairPackage() {
  const { manifest, chunks, generated: original } = corpusChunks();
  const baseline = JSON.parse(read(BASELINE_PATH));
  if (baseline.corpus.revision !== manifest.revision) {
    throw new Error('Original corpus revision differs from the historical editorial baseline');
  }
  const words = new Map(loadSentenceWords().map((word) => [wordKey(word), word]));
  const targetChunks = JSON.parse(JSON.stringify(chunks));
  const pairs = EXACT_SENSE_REPAIRS.map((spec) => {
    const chunk = targetChunks.find((candidate) => candidate.type === spec.type);
    const matches = chunk?.rows.filter((row) => row[0] === spec.key) || [];
    if (matches.length !== 1) throw new Error(`Expected one exact repair source: ${spec.key}`);
    const sourceTuple = matches[0];
    const word = words.get(spec.key);
    if (
      sourceTuple[4].sense !== spec.oldSense ||
      sourceTuple[4].hash !== spec.oldHash ||
      !verifiedReview(word, spec.type, rowValue(sourceTuple))
    ) {
      throw new Error(`Exact repair source differs from reviewed baseline: ${spec.key}`);
    }
    const composition = buildReviewedSentence(word, spec.type);
    if (
      composition?.sense !== spec.newSense ||
      composition.jaTemplate !== sourceTuple[1] ||
      composition.en !== sourceTuple[2]
    ) {
      throw new Error(`Repair must change only the exact intended sense: ${spec.key}`);
    }
    const review = { ...sourceTuple[4], sense: spec.newSense };
    review.hash = reviewedContentHash(word, spec.type, rowValue(sourceTuple), review);
    const targetTuple = [...sourceTuple.slice(0, 4), review];
    if (!verifiedReview(word, spec.type, rowValue(targetTuple))) {
      throw new Error(`Invalid repair target approval: ${spec.key}`);
    }
    chunk.rows[chunk.rows.indexOf(sourceTuple)] = targetTuple;
    const targetRow = {
      word_key: spec.key,
      type: spec.type,
      dict: word.dict,
      reading: word.reading,
      group: word.group,
      surface: surfaceFormFor(word, spec.type),
      ja_template: targetTuple[1],
      en: targetTuple[2],
      segments: targetTuple[3],
      model: reviewProvenance(review),
      review,
    };
    return {
      ...spec,
      sourceTuple,
      sourceTupleSha256: sha256(JSON.stringify(sourceTuple)),
      targetTuple,
      targetTupleSha256: sha256(JSON.stringify(targetTuple)),
      targetRow,
      targetCasSignature: sourceRowSignature(targetRow),
    };
  });
  const target = buildCorpusFileBodies(targetChunks);
  const changedFiles = [...target.files]
    .filter(([path, body]) => original.files.get(path) !== body)
    .map(([path, body]) => ({
      path: `${CORPUS_PATH}/${path}`,
      sourceBody: original.files.get(path),
      sourceSha256: sha256(original.files.get(path)),
      targetBody: body,
      targetSha256: sha256(body),
    }));
  const expectedFiles = ['by-type/humble.json', 'by-type/passive-polite-past.json', 'manifest.json']
    .map((path) => `${CORPUS_PATH}/${path}`)
    .sort();
  if (canonical(changedFiles.map((file) => file.path).sort()) !== canonical(expectedFiles)) {
    throw new Error('Exact repair would change more than the two selected chunks and manifest');
  }
  const untouchedDigest = untouchedRowsDigest(chunks);
  if (untouchedDigest !== untouchedRowsDigest(targetChunks)) {
    throw new Error('Exact repair would change an unreviewed pair');
  }
  const payload = {
    schema: 1,
    kind: 'exact-pair-sense-metadata-repair',
    reviewedAtUtc: '2026-10-13T07:39:10Z',
    nativeSpeakerSignoff: false,
    livePublication: false,
    scope:
      'Only these two full-context sense labels and their approval hashes change. Japanese, English, readings, lexical identities, and all other pairs remain unchanged.',
    baseline: { path: BASELINE_PATH, sha256: sha256(read(BASELINE_PATH)) },
    sourceCorpusRevision: manifest.revision,
    targetCorpusRevision: JSON.parse(target.files.get('manifest.json')).revision,
    totalRows: manifest.totalRows,
    changedPairs: pairs.length,
    untouchedPairs: manifest.totalRows - pairs.length,
    untouchedRowsDigest: untouchedDigest,
    pairs,
    files: changedFiles,
    publicationContract:
      'Read only the exact two current live rows before publication. bindExactSenseRepairPublication validates source-or-target content and identity, then derives expected RPC signatures from actual live rows, including their actual model value. Bundled tuples do not pretend to contain live DB CAS source fields. Submit this two-row batch to the existing atomic publish_reviewed_sentences RPC and verify the exact targets afterward.',
  };
  return { ...payload, packageDigest: sha256(canonical(payload)) };
}

function verifyPackage(packageValue) {
  const { packageDigest, ...payload } = packageValue;
  if (packageDigest !== sha256(canonical(payload)))
    throw new Error('Repair package digest mismatch');
  if (packageValue.baseline.sha256 !== sha256(read(BASELINE_PATH))) {
    throw new Error('Historical editorial baseline changed');
  }
  if (
    packageValue.kind !== 'exact-pair-sense-metadata-repair' ||
    packageValue.changedPairs !== 2 ||
    packageValue.pairs.length !== 2 ||
    packageValue.files.length !== 3 ||
    packageValue.livePublication !== false
  ) {
    throw new Error('Repair package scope changed');
  }
  const words = new Map(loadSentenceWords().map((word) => [wordKey(word), word]));
  const baseline = JSON.parse(read(BASELINE_PATH));
  const expectedPaths = [
    `${CORPUS_PATH}/by-type/humble.json`,
    `${CORPUS_PATH}/by-type/passive-polite-past.json`,
    MANIFEST_PATH,
  ].sort();
  if (canonical(packageValue.files.map((file) => file.path).sort()) !== canonical(expectedPaths)) {
    throw new Error('Repair package file scope changed');
  }
  for (let index = 0; index < EXACT_SENSE_REPAIRS.length; index++) {
    const spec = EXACT_SENSE_REPAIRS[index];
    const pair = packageValue.pairs[index];
    const word = words.get(spec.key);
    const prior = baseline.samples.find(
      (sample) => sample.key === spec.key && sample.type === spec.type,
    );
    if (
      pair.key !== spec.key ||
      pair.type !== spec.type ||
      pair.sourceTuple[0] !== spec.key ||
      pair.targetTuple[0] !== spec.key ||
      pair.sourceTuple[4].sense !== spec.oldSense ||
      pair.sourceTuple[4].hash !== spec.oldHash ||
      pair.targetTuple[4].sense !== spec.newSense ||
      !prior ||
      canonical(pair.sourceTuple) !==
        canonical([
          prior.key,
          prior.jaTemplate,
          prior.english,
          prior.segments,
          prior.corpusReview,
        ]) ||
      canonical({ ...pair.targetTuple[4], sense: spec.oldSense, hash: spec.oldHash }) !==
        canonical(pair.sourceTuple[4]) ||
      canonical(pair.sourceTuple.slice(0, 4)) !== canonical(pair.targetTuple.slice(0, 4)) ||
      pair.sourceTupleSha256 !== sha256(JSON.stringify(pair.sourceTuple)) ||
      pair.targetTupleSha256 !== sha256(JSON.stringify(pair.targetTuple)) ||
      !verifiedReview(word, spec.type, rowValue(pair.sourceTuple)) ||
      !verifiedReview(word, spec.type, rowValue(pair.targetTuple)) ||
      canonical(pair.targetCasSignature) !== canonical(sourceRowSignature(pair.targetRow))
    ) {
      throw new Error(`Invalid exact repair pair: ${spec.key}|${spec.type}`);
    }
    const composition = buildReviewedSentence(word, spec.type);
    if (
      !composition ||
      composition.sense !== pair.targetTuple[4].sense ||
      composition.jaTemplate !== pair.targetTuple[1] ||
      composition.en !== pair.targetTuple[2] ||
      !verifiedReview(word, spec.type, pair.targetRow)
    ) {
      throw new Error(
        `Repair target differs from current reviewed frame: ${spec.key}|${spec.type}`,
      );
    }
    if (
      pair.targetRow.word_key !== spec.key ||
      pair.targetRow.type !== spec.type ||
      pair.targetRow.dict !== word.dict ||
      pair.targetRow.reading !== word.reading ||
      pair.targetRow.group !== word.group ||
      pair.targetRow.surface !== surfaceFormFor(word, spec.type) ||
      pair.targetRow.ja_template !== pair.targetTuple[1] ||
      pair.targetRow.en !== pair.targetTuple[2] ||
      canonical(pair.targetRow.segments) !== canonical(pair.targetTuple[3]) ||
      canonical(pair.targetRow.review) !== canonical(pair.targetTuple[4]) ||
      pair.targetRow.model !== reviewProvenance(pair.targetTuple[4])
    ) {
      throw new Error(`Repair target DB columns changed: ${spec.key}|${spec.type}`);
    }
  }
  return words;
}

/** Resume only original-or-exact-target files; reject unrelated file changes. */
export function applyExactSenseRepairPackage(packageValue) {
  verifyPackage(packageValue);
  for (const file of packageValue.files) {
    if (
      file.sourceSha256 !== sha256(file.sourceBody) ||
      file.targetSha256 !== sha256(file.targetBody) ||
      ![
        `${CORPUS_PATH}/by-type/humble.json`,
        `${CORPUS_PATH}/by-type/passive-polite-past.json`,
        MANIFEST_PATH,
      ].includes(file.path)
    ) {
      throw new Error('Repair file backup or target is invalid');
    }
    const current = read(file.path);
    if (current !== file.sourceBody && current !== file.targetBody) {
      throw new Error(`Concurrent corpus edit; refusing overwrite: ${file.path}`);
    }
  }
  // Every path is a fixed allowlisted file inside the repository.
  for (const file of packageValue.files) {
    if (read(file.path) !== file.targetBody) {
      writeFileSync(join(ROOT, file.path), file.targetBody);
    }
  }
  return checkExactSenseRepairPackage(packageValue);
}

export function checkExactSenseRepairPackage(packageValue) {
  verifyPackage(packageValue);
  const { manifest, chunks } = corpusChunks();
  if (
    manifest.revision !== packageValue.targetCorpusRevision ||
    manifest.totalRows !== packageValue.totalRows ||
    untouchedRowsDigest(chunks) !== packageValue.untouchedRowsDigest
  ) {
    throw new Error('Repair corpus revision or untouched rows changed');
  }
  for (const file of packageValue.files) {
    if (read(file.path) !== file.targetBody)
      throw new Error(`Repair target not applied: ${file.path}`);
  }
  for (const pair of packageValue.pairs) {
    const row = chunks
      .find((chunk) => chunk.type === pair.type)
      ?.rows.find((r) => r[0] === pair.key);
    if (canonical(row) !== canonical(pair.targetTuple)) {
      throw new Error(`Repair target row changed: ${pair.key}|${pair.type}`);
    }
  }
  return { changedPairs: 2, changedFiles: 3, untouchedPairs: packageValue.untouchedPairs };
}

/** Pure live-source binding for the root's later separately authorized RPC. */
export function bindExactSenseRepairPublication(packageValue, liveRows) {
  const words = verifyPackage(packageValue);
  const required = new Set(packageValue.pairs.map((pair) => identity(pair.key, pair.type)));
  if (
    !Array.isArray(liveRows) ||
    liveRows.length !== 2 ||
    new Set(liveRows.map((row) => identity(row.word_key, row.type))).size !== 2 ||
    liveRows.some((row) => !required.has(identity(row.word_key, row.type)))
  ) {
    throw new Error('Publication binding requires exactly the two reviewed live rows');
  }
  return packageValue.pairs.map((pair) => {
    const live = liveRows.find((row) => row.word_key === pair.key && row.type === pair.type);
    const word = words.get(pair.key);
    const review = parseSentenceReview(live.review || live.model);
    const liveTuple = [live.word_key, live.ja_template, live.en, live.segments, review];
    if (
      live.dict !== word.dict ||
      live.reading !== word.reading ||
      live.group !== word.group ||
      live.surface !== surfaceFormFor(word, pair.type) ||
      !verifiedReview(word, pair.type, live) ||
      (canonical(liveTuple) !== canonical(pair.sourceTuple) &&
        canonical(liveTuple) !== canonical(pair.targetTuple))
    ) {
      throw new Error(`Concurrent live edit or identity mismatch: ${pair.key}|${pair.type}`);
    }
    return {
      row: pair.targetRow,
      expected: sourceRowSignature(live),
      target: sourceRowSignature(pair.targetRow),
    };
  });
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => !['--prepare', '--check'].includes(arg))) {
    throw new Error('Usage: node scripts/repair-sentence-editorial-senses.js [--prepare|--check]');
  }
  let packageValue;
  if (args.includes('--prepare') && !existsSync(join(ROOT, EXACT_SENSE_REPAIR_PATH))) {
    packageValue = prepareExactSenseRepairPackage();
    writeFileSync(
      join(ROOT, EXACT_SENSE_REPAIR_PATH),
      `${JSON.stringify(packageValue, null, 2)}\n`,
    );
  } else {
    packageValue = JSON.parse(read(EXACT_SENSE_REPAIR_PATH));
  }
  const result = args.includes('--prepare')
    ? applyExactSenseRepairPackage(packageValue)
    : checkExactSenseRepairPackage(packageValue);
  console.log(`Exact offline sense repair: ${JSON.stringify(result)}.`);
  console.log('Package preserves original evidence; live publication was not performed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
