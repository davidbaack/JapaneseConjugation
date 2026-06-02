import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readRepoJson(path) {
  return JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
}

describe('static coverage configuration', () => {
  it('lints the maintained JavaScript surface instead of src only', () => {
    const pkg = readRepoJson('package.json');

    expect(pkg.scripts.lint).toBe('eslint .');
    expect(pkg.scripts['ci:fast']).toContain('npm run lint');
  });

  it('runs app, tooling, and Supabase type checks in CI', () => {
    const pkg = readRepoJson('package.json');

    expect(pkg.scripts.typecheck).toContain('typecheck:app');
    expect(pkg.scripts.typecheck).toContain('typecheck:tooling');
    expect(pkg.scripts.typecheck).toContain('typecheck:supabase');
    expect(pkg.scripts['ci:fast']).toContain('npm run typecheck');
  });

  it('keeps strict checkJs coverage enabled for new typecheck surfaces', () => {
    const base = readRepoJson('tsconfig.json');
    const tooling = readRepoJson('tsconfig.tooling.json');
    const supabase = readRepoJson('tsconfig.supabase.json');

    expect(base.compilerOptions.checkJs).toBe(true);
    expect(base.compilerOptions.strict).toBe(true);
    expect(tooling.compilerOptions.checkJs).not.toBe(false);
    expect(tooling.compilerOptions.strict).not.toBe(false);
    expect(supabase.compilerOptions.checkJs).not.toBe(false);
    expect(supabase.compilerOptions.strict).not.toBe(false);
    expect(tooling.include).toEqual(
      expect.arrayContaining(['*.config.js', 'e2e/**/*.js', 'scripts/**/*.js']),
    );
    expect(supabase.include).toEqual(
      expect.arrayContaining(['types/deno.d.ts', 'supabase/functions/**/*.ts']),
    );
  });
});
