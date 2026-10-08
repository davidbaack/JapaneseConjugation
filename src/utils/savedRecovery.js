import { STORAGE_KEY } from '../data/defaults.js';

// Read raw bytes without parsing learner data or touching authentication storage.
// This must remain usable even when the normal learner-state loader has failed.
export function serializeSavedRecoveryData() {
  const pending = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(`${STORAGE_KEY}:pending:`))
      pending.push({ key, raw: localStorage.getItem(key) });
  }
  return JSON.stringify(
    {
      format: 'katachiya-saved-recovery',
      version: 1,
      exportedAt: new Date().toISOString(),
      saved: localStorage.getItem(STORAGE_KEY),
      pending,
    },
    null,
    2,
  );
}
