import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readRepoJson(path) {
  return JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
}

function readRepoText(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
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

  it('keeps strict seed coverage and broad app-surface coverage enabled', () => {
    const base = readRepoJson('tsconfig.json');
    const app = readRepoJson('tsconfig.app.json');
    const appStrict = readRepoJson('tsconfig.app.strict.json');
    const tooling = readRepoJson('tsconfig.tooling.json');
    const supabase = readRepoJson('tsconfig.supabase.json');
    const pkg = readRepoJson('package.json');

    expect(base.compilerOptions.checkJs).toBe(true);
    expect(base.compilerOptions.strict).toBe(true);
    expect(pkg.scripts['typecheck:app']).toContain('tsconfig.app.strict.json');
    expect(pkg.scripts['typecheck:app']).toContain('tsconfig.app.json');
    expect(appStrict.compilerOptions.checkJs).not.toBe(false);
    expect(appStrict.compilerOptions.strict).not.toBe(false);
    expect(appStrict.compilerOptions.noImplicitAny).not.toBe(false);
    expect(appStrict.include).toEqual(
      expect.arrayContaining([
        'src/data/defaults.js',
        'src/i18n/**/*.js',
        'src/utils/rateLimiter.js',
        'src/utils/retry.js',
      ]),
    );
    expect(app.compilerOptions.checkJs).not.toBe(false);
    expect(app.include).toEqual(
      expect.arrayContaining([
        'src/data/defaults.js',
        'src/i18n/**/*.js',
        'src/state/AppStateContext.jsx',
        'src/utils/rateLimiter.js',
        'src/utils/retry.js',
        'src/utils/storage.js',
        'src/views/StudyView.jsx',
      ]),
    );
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

  it('keeps browser API origins limited to current visible features', () => {
    const html = readRepoText('index.html');

    const connectSrc = html.match(/connect-src ([^;"]+)/)?.[1] || '';
    expect(connectSrc).toContain('https://*.supabase.co');
    expect(connectSrc).not.toContain('api.wanikani.com');
  });

  it('keeps the Gemini proxy fail-closed unless public origins are explicit', () => {
    const proxy = readRepoText('supabase/functions/gemini-proxy/index.ts');

    expect(proxy).not.toContain("Deno.env.get('ALLOWED_ORIGIN') ?? '*'");
    expect(proxy).toContain('MISSING_ALLOWED_ORIGIN_ERROR');
    expect(proxy).toContain('GEMINI_ALLOW_PUBLIC_ORIGIN');
    expect(proxy).toContain('ALLOWED_ORIGIN=* requires GEMINI_ALLOW_PUBLIC_ORIGIN=true');
  });

  it('runtime-caches the sentence corpus without precaching every chunk', () => {
    const config = readRepoText('vite.config.js');

    expect(config).toContain(
      "globIgnores: ['**/data/sentences/manifest.json', '**/data/sentences/by-type/*.json']",
    );
    expect(config).toContain("cacheName: 'sentence-corpus-manifest-v1'");
    expect(config).toContain("handler: 'NetworkFirst'");
    expect(config).toContain("cacheName: 'sentence-corpus-v1'");
    expect(config).toContain("handler: 'CacheFirst'");
  });
});
