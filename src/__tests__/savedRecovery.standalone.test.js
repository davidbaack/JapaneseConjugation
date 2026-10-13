// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// These module factories throw if recovery ever imports the learner loader or
// its validator graph. Raw recovery must load independently of either failure.
vi.mock('../utils/storage.js', () => {
  throw new Error('Learner loader module failed');
});
vi.mock('../utils/learnerStateValidation.js', () => {
  throw new Error('Learner validator module failed');
});

import { STORAGE_KEY } from '../data/defaults.js';
import { serializeSavedRecoveryData } from '../utils/savedRecovery.js';

describe('standalone recovery reader', () => {
  it('copies exact saved and pending bytes without importing a failing learner module graph', () => {
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, '{unreadable learner bytes');
    const key = `${STORAGE_KEY}:pending:failed-loader`;
    localStorage.setItem(key, 'unreadable pending bytes');
    localStorage.setItem('sb-fixture-auth-token', 'private-auth-fixture');
    const text = serializeSavedRecoveryData();
    expect(JSON.parse(text)).toMatchObject({
      saved: '{unreadable learner bytes',
      pending: [{ key, raw: 'unreadable pending bytes' }],
    });
    expect(text).not.toContain('private-auth-fixture');
  });
});
