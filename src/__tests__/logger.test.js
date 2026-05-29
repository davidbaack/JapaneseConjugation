import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logError, logWarn, logInfo, getRecentLogs, clearLogs } from '../utils/logger.js';

beforeEach(() => {
  clearLogs();
  // Silence the mirrored console output during the test run.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('logger ring buffer', () => {
  it('records level, message and context', () => {
    const entry = logError('boom', { source: 'test' });
    expect(entry.level).toBe('error');
    expect(entry.message).toBe('boom');
    expect(entry.context).toEqual({ source: 'test' });
    expect(typeof entry.ts).toBe('number');
    expect(getRecentLogs()).toHaveLength(1);
  });

  it('serializes Error objects to "Name: message"', () => {
    const entry = logWarn(new TypeError('bad value'));
    expect(entry.message).toBe('TypeError: bad value');
  });

  it('serializes non-string values without throwing on cycles', () => {
    const cyclic = {};
    cyclic.self = cyclic;
    const entry = logInfo(cyclic);
    expect(typeof entry.message).toBe('string');
  });

  it('keeps newest entries and caps the buffer at 50', () => {
    for (let i = 0; i < 60; i++) logInfo(`msg-${i}`);
    const logs = getRecentLogs();
    expect(logs).toHaveLength(50);
    expect(logs[logs.length - 1].message).toBe('msg-59');
    expect(logs[0].message).toBe('msg-10');
  });

  it('clearLogs empties the buffer', () => {
    logError('x');
    clearLogs();
    expect(getRecentLogs()).toHaveLength(0);
  });
});
