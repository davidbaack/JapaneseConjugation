import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOTS = ['src', 'e2e', 'scripts', 'supabase'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.css', '.ts']);
const SUPPORTED_SHADES = new Set([
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
]);
const COLOR_UTILITY =
  /(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(\d+)/g;

function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

describe('Tailwind color tokens', () => {
  it('uses only supported numeric palette shades', () => {
    const invalid = [];

    for (const root of SOURCE_ROOTS) {
      for (const path of sourceFiles(root)) {
        const source = readFileSync(path, 'utf8');
        for (const match of source.matchAll(COLOR_UTILITY)) {
          if (!SUPPORTED_SHADES.has(match[1])) {
            invalid.push(`${relative('.', path)}: ${match[0]}`);
          }
        }
      }
    }

    expect(invalid).toEqual([]);
  });
});
