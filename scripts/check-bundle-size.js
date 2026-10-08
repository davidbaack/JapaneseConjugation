#!/usr/bin/env node
// Gzipped production budgets. TOTAL covers every JS/CSS chunk, including
// deferred features. EAGER/CRITICAL follows the Vite entry manifest, while
// PRECACHE follows the generated service worker's install-time asset list.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST_DIR = 'dist';
const ASSET_DIR = join(DIST_DIR, 'assets');
const MANIFEST_PATH = join(DIST_DIR, '.vite', 'manifest.json');
const SERVICE_WORKER_PATH = join(DIST_DIR, 'sw.js');

// These caps retain material room above the August 2026 baseline while making
// regressions in the first load and PWA install visible independently.
const EAGER_CRITICAL_GZIP_KB = 160;
// Includes every Workbox install asset, notably the 2,162-word offline lexicon.
// The August 2026 baseline is ~361 KB, leaving about 15% headroom without
// weakening the separate eager or whole-JS/CSS budgets.
const PRECACHE_GZIP_KB = 415;
const TOTAL_GZIP_KB = 330;
const MAX_CHUNK_GZIP_KB = 70;

const KB = 1024;
const fmt = (bytes) => `${(bytes / KB).toFixed(1)} KB`;

function failMissing(path) {
  console.error(`x ${path} not found - run \`npm run build\` first.`);
  process.exit(1);
}

function collectAssets() {
  if (!existsSync(ASSET_DIR)) failMissing(ASSET_DIR);
  return readdirSync(ASSET_DIR)
    .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
    .map((name) => {
      const path = join(ASSET_DIR, name);
      const raw = readFileSync(path);
      return { name, raw: statSync(path).size, gzip: gzipSync(raw).length };
    })
    .sort((a, b) => b.gzip - a.gzip);
}

function eagerAssetNames() {
  if (!existsSync(MANIFEST_PATH)) failMissing(MANIFEST_PATH);
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const names = new Set();
  const visited = new Set();

  function visit(key) {
    if (!key || visited.has(key)) return;
    visited.add(key);
    const item = manifest[key];
    if (!item) return;
    if (item.file?.startsWith('assets/')) names.add(item.file.slice('assets/'.length));
    for (const css of item.css || []) {
      if (css.startsWith('assets/')) names.add(css.slice('assets/'.length));
    }
    for (const imported of item.imports || []) visit(imported);
  }

  for (const [key, item] of Object.entries(manifest)) {
    if (item.isEntry) visit(key);
  }
  return names;
}

function precachePaths() {
  if (!existsSync(SERVICE_WORKER_PATH)) failMissing(SERVICE_WORKER_PATH);
  const serviceWorker = readFileSync(SERVICE_WORKER_PATH, 'utf8');
  const paths = new Set();
  const urlPattern = /url:["']([^"']+)["']/g;
  let match;
  while ((match = urlPattern.exec(serviceWorker))) {
    const path = match[1].replace(/^\.\//, '').replace(/^\//, '');
    if (path && !path.includes('..')) paths.add(path);
  }
  return paths;
}

function sumByNames(assets, names) {
  return assets.reduce((sum, asset) => sum + (names.has(asset.name) ? asset.gzip : 0), 0);
}

function gzipFile(path) {
  if (!existsSync(path)) failMissing(path);
  return gzipSync(readFileSync(path)).length;
}

function sumPrecache(paths) {
  let total = 0;
  for (const path of paths) {
    const file = join(DIST_DIR, ...path.split('/'));
    total += gzipFile(file);
  }
  return total;
}

const assets = collectAssets();
const eagerNames = eagerAssetNames();
const cachedPaths = precachePaths();
const totalGzip = assets.reduce((sum, asset) => sum + asset.gzip, 0);
const totalRaw = assets.reduce((sum, asset) => sum + asset.raw, 0);
const eagerGzip = gzipFile(join(DIST_DIR, 'index.html')) + sumByNames(assets, eagerNames);
const precacheGzip = sumPrecache(cachedPaths);

const failures = [];
const budgets = {
  eager: EAGER_CRITICAL_GZIP_KB * KB,
  precache: PRECACHE_GZIP_KB * KB,
  total: TOTAL_GZIP_KB * KB,
  chunk: MAX_CHUNK_GZIP_KB * KB,
};

if (eagerGzip > budgets.eager) {
  failures.push(`Eager/critical payload ${fmt(eagerGzip)} exceeds budget ${fmt(budgets.eager)}.`);
}
if (precacheGzip > budgets.precache) {
  failures.push(`Precache payload ${fmt(precacheGzip)} exceeds budget ${fmt(budgets.precache)}.`);
}
if (totalGzip > budgets.total) {
  failures.push(`Total gzipped bundle ${fmt(totalGzip)} exceeds budget ${fmt(budgets.total)}.`);
}
for (const asset of assets) {
  if (asset.gzip > budgets.chunk) {
    failures.push(
      `Chunk ${asset.name} (${fmt(asset.gzip)}) exceeds per-chunk budget ${fmt(budgets.chunk)}.`,
    );
  }
}
if ([...cachedPaths].some((path) => path.includes('/vendor-supabase-'))) {
  failures.push('The deferred Supabase SDK must not be in the service-worker precache.');
}

console.log('Bundle size report (gzipped):');
for (const asset of assets) {
  const flag = asset.gzip > budgets.chunk ? ' !' : '';
  console.log(
    `  ${asset.name.padEnd(40)} ${fmt(asset.gzip).padStart(10)}  (raw ${fmt(asset.raw)})${flag}`,
  );
}
console.log(
  `  ${'EAGER/CRITICAL'.padEnd(40)} ${fmt(eagerGzip).padStart(10)} / budget ${EAGER_CRITICAL_GZIP_KB} KB`,
);
console.log(
  `  ${'PRECACHE'.padEnd(40)} ${fmt(precacheGzip).padStart(10)} / budget ${PRECACHE_GZIP_KB} KB`,
);
console.log(
  `  ${'TOTAL'.padEnd(40)} ${fmt(totalGzip).padStart(10)}  (raw ${fmt(totalRaw)}) / budget ${TOTAL_GZIP_KB} KB`,
);

if (failures.length) {
  console.error('\nx Bundle size budget exceeded:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('\nOK Within performance budgets.');
