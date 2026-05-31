#!/usr/bin/env node
// Performance budget for the production bundle (improvement #20).
//
// Katachiya is a PWA, so payload size directly affects first load on the phones
// it's mostly used on. This script measures the built assets' gzipped transfer
// size and fails CI if the total — or any single chunk — exceeds budget, so a
// careless dependency or un-split view can't silently bloat the app over time.
//
// Run after `vite build` (see the `size` npm script and the deploy workflow).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const ASSET_DIR = 'dist/assets';

// Budgets in kilobytes (gzipped). Tuned with ~20% headroom over current sizes;
// bump deliberately (with a note) when a real feature justifies the growth.
// Bumped 250→260: minimal-pair drills feature added ~6 KB gzipped (May 2026).
// Bumped 260->275: PWA update flow, lessons, and drill feedback added ~10 KB gzipped.
const TOTAL_GZIP_KB = 275;
const MAX_CHUNK_GZIP_KB = 70;

const KB = 1024;
const fmt = (bytes) => `${(bytes / KB).toFixed(1)} KB`;

function collectAssets() {
  let entries;
  try {
    entries = readdirSync(ASSET_DIR);
  } catch {
    console.error(`✗ ${ASSET_DIR} not found — run \`npm run build\` first.`);
    process.exit(1);
  }
  return entries
    .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
    .map((name) => {
      const path = join(ASSET_DIR, name);
      const raw = readFileSync(path);
      return { name, raw: statSync(path).size, gzip: gzipSync(raw).length };
    })
    .sort((a, b) => b.gzip - a.gzip);
}

const assets = collectAssets();
const totalGzip = assets.reduce((sum, a) => sum + a.gzip, 0);
const totalRaw = assets.reduce((sum, a) => sum + a.raw, 0);

const failures = [];
const totalBudget = TOTAL_GZIP_KB * KB;
const chunkBudget = MAX_CHUNK_GZIP_KB * KB;

if (totalGzip > totalBudget) {
  failures.push(`Total gzipped bundle ${fmt(totalGzip)} exceeds budget ${fmt(totalBudget)}.`);
}
for (const a of assets) {
  if (a.gzip > chunkBudget) {
    failures.push(`Chunk ${a.name} (${fmt(a.gzip)}) exceeds per-chunk budget ${fmt(chunkBudget)}.`);
  }
}

console.log('Bundle size report (gzipped):');
for (const a of assets) {
  const flag = a.gzip > chunkBudget ? ' ⚠️' : '';
  console.log(`  ${a.name.padEnd(40)} ${fmt(a.gzip).padStart(10)}  (raw ${fmt(a.raw)})${flag}`);
}
console.log(
  `  ${'TOTAL'.padEnd(40)} ${fmt(totalGzip).padStart(10)}  (raw ${fmt(totalRaw)}) / budget ${TOTAL_GZIP_KB} KB`,
);

if (failures.length) {
  console.error('\n✗ Bundle size budget exceeded:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n✓ Within performance budget.');
