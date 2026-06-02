import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  boundedLogLimit,
  isValidCommitSha,
  parseGitLog,
  previewStatusFromCache,
  previewUrlForSha,
  safeResolveUnder,
} from '../../scripts/dev-history.js';

describe('dev history plugin helpers', () => {
  it('validates Git commit SHA shapes', () => {
    expect(isValidCommitSha('abcdef1')).toBe(true);
    expect(isValidCommitSha('abcdef1234567890abcdef1234567890abcdef12')).toBe(true);
    expect(isValidCommitSha('abc')).toBe(false);
    expect(isValidCommitSha('../abcdef1')).toBe(false);
    expect(isValidCommitSha('not-a-sha')).toBe(false);
  });

  it('bounds requested log limits', () => {
    expect(boundedLogLimit('3')).toBe(3);
    expect(boundedLogLimit('0')).toBe(1);
    expect(boundedLogLimit('999')).toBe(100);
    expect(boundedLogLimit('nope')).toBe(30);
  });

  it('parses git log rows with current and dirty markers', () => {
    const headSha = 'abcdef1234567890abcdef1234567890abcdef12';
    const row = [
      headSha,
      'abcdef1',
      '2026-06-01T12:00:00-07:00',
      '2 hours ago',
      'HEAD -> main',
      'Restore preserved learner controls',
    ].join('\x1f');

    expect(parseGitLog(row, { dirty: true, headSha })).toEqual([
      {
        sha: headSha,
        shortSha: 'abcdef1',
        committedAt: '2026-06-01T12:00:00-07:00',
        relativeTime: '2 hours ago',
        refs: 'HEAD -> main',
        subject: 'Restore preserved learner controls',
        current: true,
        dirty: true,
      },
    ]);
  });

  it('keeps cache paths inside temp-vite/history', () => {
    const root = path.resolve('C:/repo/JapaneseConjugation');
    const sha = 'abcdef1234567890abcdef1234567890abcdef12';
    const status = previewStatusFromCache(root, sha);

    expect(status.previewUrl).toBe(previewUrlForSha(sha));
    expect(status.cacheRoot).toContain(path.join('temp-vite', 'history', sha));
    expect(() => safeResolveUnder(root, '..', 'outside')).toThrow(/outside/);
  });
});
