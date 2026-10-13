#!/usr/bin/env node
// Reproduce the source facts for a bounded independent AI editorial review.
// This script never translates, grants approval, publishes, or calls a provider.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadSentenceWords } from './export-sentence-corpus.js';
import { sha256, verifiedReview } from './sentenceReview.js';
import { conjugateItem, surfaceFormFor, wordKey } from '../src/utils/conjugator.js';
import { sentenceReviewIssue } from '../src/utils/sentenceTrust.js';
import { buildReviewedSentence } from '../src/utils/reviewedSentenceFrames.js';
import { reviewedSentenceProfile } from '../src/data/reviewedSentenceProfiles.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const EDITORIAL_REPORT_PATH = 'data/sentence-reviews/2026-10-13-editorial-sample.json';
const CORPUS_PATH = 'public/data/sentences';
const MANIFEST_PATH = `${CORPUS_PATH}/manifest.json`;
const CONTEXT_PATHS = [
  'public/data/verb-lexicon.json',
  'src/data/starterWords.js',
  'src/data/verbLexicon.js',
  'src/utils/conjugator.js',
  'src/utils/sentenceTrust.js',
  'src/data/reviewedSentenceProfiles.js',
  'src/utils/reviewedSentenceFrames.js',
];

// Fixed, purposeful strata rather than a claim of statistical representation.
// Every selector must match exactly one published row; there is no replacement
// fallback that could silently change what an editorial decision refers to.
/** @type {Array<[string, string, string[]]>} */
export const EDITORIAL_SELECTION = [
  ['plain-past', 'godan:行く', ['iku-exception', 'past', 'positive', 'plain']],
  ['te-form', 'godan:泳ぐ', ['godan-onbin', 'sequence', 'past', 'plain']],
  ['polite-negative', 'ichidan:食べる', ['ichidan', 'nonpast', 'negative', 'polite']],
  ['plain-past-negative', 'suru:する', ['suru-exception', 'past', 'negative', 'plain']],
  ['polite-past', 'kuru:来る', ['kuru-exception', 'past', 'positive', 'polite']],
  ['plain-negative', 'godan:有る', ['aru-exception', 'existence', 'negative', 'plain']],
  ['progressive', 'ichidan:着る', ['resulting-state', 'clothing', 'positive', 'plain']],
  ['progressive-past-negative', 'godan:書く', ['ongoing-aspect', 'past', 'negative', 'plain']],
  ['progressive-polite', 'godan:知る', ['resulting-state', 'knowledge', 'positive', 'polite']],
  ['potential-polite-past-negative', 'godan:読む', ['ability', 'past', 'negative', 'polite']],
  ['passive-polite-past', 'ichidan:褒める', ['passive', 'agent-receiver', 'past', 'polite']],
  ['causative', 'godan:飲む', ['causative', 'actor-causee-object', 'nonpast', 'plain']],
  [
    'causative-passive-past-negative',
    'godan:待つ',
    ['causative-passive', 'actor-causee-object', 'past', 'negative', 'plain'],
  ],
  ['conditional-nara', 'godan:行く', ['conditional', 'nara', 'speaker-subject', 'plain']],
  ['desiderative-past-negative', 'ichidan:食べる', ['wanting', 'past', 'negative', 'plain']],
  ['volitional', 'godan:脱ぐ', ['volitional', 'implicit-inclusive-subject', 'plain']],
  ['negative-zuni', 'godan:買う', ['without-doing', 'anaphora', 'negative', 'plain']],
  ['obligation', 'suru:勉強する', ['obligation', 'suru', 'nonpast', 'plain']],
  ['honorific-polite', 'godan:行く', ['honorific', 'irregular-keigo', 'respected-actor', 'polite']],
  ['humble-polite', 'godan:書く', ['humble', 'recipient-viewpoint', 'polite']],
  ['humble', 'godan:飲む', ['humble', 'irregular-keigo', 'gift-source', 'plain']],
  ['honorific', 'ichidan:食べる', ['honorific', 'irregular-keigo', 'respected-actor', 'plain']],
  ['adj-plain-past', 'i-adjective:いい', ['i-adjective', 'ii-exception', 'past', 'plain']],
  ['adj-polite-negative', 'na-adjective:静か', ['na-adjective', 'nonpast', 'negative', 'polite']],
  [
    'adj-plain-past-negative',
    'i-adjective:暑い',
    ['i-adjective', 'weather-sense', 'past', 'negative'],
  ],
  ['adj-sou', 'na-adjective:元気', ['na-adjective', 'appearance', 'energetic-sense', 'plain']],
  ['adj-conditional', 'i-adjective:高い', ['i-adjective', 'conditional', 'height-sense', 'plain']],
  [
    'adj-negative-te-form',
    'i-adjective:新しい',
    ['i-adjective', 'negative', 'cause', 'subject-shift'],
  ],
  ['adj-adverb', 'i-adjective:長い', ['i-adjective', 'resultative-adverb', 'length-sense']],
  ['adj-attributive', 'na-adjective:きれい', ['na-adjective', 'attributive', 'clean-sense']],
  ['adj-naru', 'i-adjective:早い', ['i-adjective', 'change-of-state', 'early-sense']],
  ['adj-sugiru', 'i-adjective:多い', ['i-adjective', 'excess', 'plural-subject']],
];

function trackedPaths() {
  return new Set(
    execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean),
  );
}

function readTracked(path, tracked) {
  if (!tracked.has(path)) throw new Error(`Editorial source is not tracked: ${path}`);
  return readFileSync(join(ROOT, path), 'utf8');
}

/** The returned facts are mechanical evidence, never an editorial verdict. */
export function loadEditorialSample() {
  const tracked = trackedPaths();
  const manifestBody = readTracked(MANIFEST_PATH, tracked);
  const manifest = JSON.parse(manifestBody);
  if (manifest.schema !== 2) throw new Error('Expected schema2 corpus manifest');
  const chunks = new Map();
  const revisions = [];
  let totalRows = 0;
  for (const entry of manifest.types) {
    if (!/^[a-z0-9-]+$/.test(entry.type) || entry.path !== `by-type/${entry.type}.json`) {
      throw new Error('Unexpected corpus chunk path');
    }
    if (chunks.has(entry.type)) throw new Error(`Duplicate corpus type: ${entry.type}`);
    const chunk = JSON.parse(readTracked(`${CORPUS_PATH}/${entry.path}`, tracked));
    const revision = sha256(JSON.stringify(chunk.rows));
    if (
      chunk.schema !== 2 ||
      chunk.type !== entry.type ||
      chunk.rows.length !== entry.count ||
      chunk.revision !== revision ||
      entry.revision !== revision
    ) {
      throw new Error(`Corpus chunk integrity failed: ${entry.type}`);
    }
    totalRows += chunk.rows.length;
    chunks.set(entry.type, chunk);
    revisions.push([entry.type, revision]);
  }
  if (totalRows !== manifest.totalRows || sha256(JSON.stringify(revisions)) !== manifest.revision) {
    throw new Error('Corpus manifest integrity failed');
  }
  const contextSources = CONTEXT_PATHS.map((path) => ({
    path,
    sha256: sha256(readTracked(path, tracked)),
  }));
  const words = new Map(loadSentenceWords().map((word) => [wordKey(word), word]));
  const samples = EDITORIAL_SELECTION.map(([type, key, coverage], index) => {
    const chunk = chunks.get(type);
    const matches = chunk?.rows.filter((row) => row[0] === key) || [];
    if (matches.length !== 1) throw new Error(`Expected one selected row: ${type} ${key}`);
    const row = matches[0];
    const word = words.get(key);
    const [, jaTemplate, en, segments, review] = row;
    const value = { jaTemplate, en, segments, review };
    const issue = sentenceReviewIssue(word, type, value);
    if (issue || !verifiedReview(word, type, value)) {
      throw new Error(`Selected row has invalid review: ${type} ${key}: ${issue || 'hash'}`);
    }
    const profile = reviewedSentenceProfile(word);
    const composition = buildReviewedSentence(word, type);
    if (
      !profile ||
      !composition ||
      composition.jaTemplate !== jaTemplate ||
      composition.en !== en ||
      composition.sense !== review.sense
    ) {
      throw new Error(`Selected row differs from authored profile/frame: ${type} ${key}`);
    }
    const surface = surfaceFormFor(word, type);
    const kana = conjugateItem(word, type);
    const reading = segments.map((segment) => (segment.w ? kana : segment.r || segment.t)).join('');
    if (!/^[\u3040-\u30ff\s。、！？]+$/u.test(reading)) {
      throw new Error(`Incomplete selected sentence reading: ${type} ${key}`);
    }
    return {
      sampleId: `editorial-${String(index + 1).padStart(2, '0')}`,
      type,
      key,
      coverage,
      source: {
        path: `${CORPUS_PATH}/by-type/${type}.json`,
        // Offset within chunk.rows; zero-based, unlike editor line numbers.
        rowIndex: chunk.rows.indexOf(row),
        rowSha256: sha256(JSON.stringify(row)),
        chunkRevision: chunk.revision,
        contentReviewHash: review.hash,
      },
      word: {
        dict: word.dict,
        reading: word.reading,
        group: word.group,
        meaning: word.meaning,
        exerciseMeaning: word.exerciseMeaning || '',
        jlpt: word.jlpt || '',
      },
      jaTemplate,
      completedJapanese: jaTemplate.replace('{w}', surface),
      completedReading: reading,
      conjugatedForm: { surface, kana },
      english: en,
      segments,
      corpusReview: review,
      authoredProfile: profile,
      compositionVersions: {
        profile: composition.profileVersion,
        frame: composition.frameVersion,
      },
    };
  });
  return {
    selection: {
      method: 'fixed-purposeful-stratified-v1',
      sampleCount: EDITORIAL_SELECTION.length,
      explanation:
        '32 fixed exact word/form selectors cover selected semantic and conjugation risks. This is not random sampling or whole-corpus clearance. Missing or changed selectors fail instead of being silently replaced.',
    },
    corpus: {
      path: MANIFEST_PATH,
      manifestSha256: sha256(manifestBody),
      revision: manifest.revision,
      totalRows,
      typeCount: chunks.size,
    },
    contextSources,
    samples,
  };
}

export function checkEditorialReport(report, current = loadEditorialSample()) {
  for (const field of ['selection', 'corpus', 'contextSources']) {
    if (JSON.stringify(report[field]) !== JSON.stringify(current[field])) {
      throw new Error(`Editorial report source has changed: ${field}`);
    }
  }
  if (report.samples?.length !== current.samples.length) throw new Error('Sample count changed');
  const decisions = { accept: 0, edit: 0, block: 0 };
  for (let index = 0; index < current.samples.length; index++) {
    const { editorial, ...recordedSource } = report.samples[index];
    const source = current.samples[index];
    if (JSON.stringify(recordedSource) !== JSON.stringify(source)) {
      throw new Error(`Editorial sample source has changed: ${source.sampleId}`);
    }
    if (
      !editorial ||
      !Object.hasOwn(decisions, editorial.decision) ||
      !editorial.independentTranslation?.trim() ||
      !editorial.reason?.trim() ||
      !editorial.readingCheck?.trim() ||
      !editorial.senseCheck?.trim() ||
      !editorial.registerCheck?.trim() ||
      !editorial.rolesAndGrammar?.trim() ||
      (editorial.decision !== 'accept' && !editorial.recommendedChange?.trim())
    ) {
      throw new Error(`Missing explicit editorial reasoning: ${source.sampleId}`);
    }
    decisions[editorial.decision]++;
  }
  if (
    report.summary?.sampleCount !== current.samples.length ||
    JSON.stringify(report.summary?.decisions) !== JSON.stringify(decisions) ||
    report.reviewer?.kind !== 'independent-ai-editorial-review' ||
    report.reviewer?.nativeSpeakerSignoff !== false ||
    report.reviewer?.wholeCorpusClearance !== false
  ) {
    throw new Error('Editorial summary or bounded review scope is inconsistent');
  }
  return {
    sampleCount: current.samples.length,
    decisions,
    corpusRevision: current.corpus.revision,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--snapshot', '--check'].includes(arg)) || args.length > 1) {
    throw new Error('Usage: node scripts/sample-sentence-editorial.js [--snapshot|--check]');
  }
  const current = loadEditorialSample();
  if (args.includes('--snapshot')) {
    console.log(JSON.stringify(current, null, 2));
    return;
  }
  const report = JSON.parse(readFileSync(join(ROOT, EDITORIAL_REPORT_PATH), 'utf8'));
  const result = checkEditorialReport(report, current);
  console.log(`Editorial source/record check: ${result.sampleCount} exact tracked pairs verified.`);
  console.log(`Recorded decisions: ${JSON.stringify(result.decisions)}.`);
  console.log(
    'Mechanical validation preserves recorded AI decisions; it does not prove them correct.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
