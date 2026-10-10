import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logError, logWarn, logInfo, getRecentLogs, clearLogs } from '../utils/logger.js';

beforeEach(() => {
  clearLogs();
  // Silence the mirrored console output during the test run.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => vi.unstubAllGlobals());

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

describe('telemetry URL privacy', () => {
  async function configuredLogger(href, sendBeacon) {
    vi.resetModules();
    vi.stubGlobal('window', { location: { href }, addEventListener: vi.fn() });
    vi.stubGlobal('navigator', { sendBeacon });
    const logger = await import('../utils/logger.js');
    logger.initLogger({ endpoint: 'https://collector.invalid', version: 'test' });
    return logger;
  }

  const sensitiveUrl =
    'https://user:password@learner.invalid/JapaneseConjugation/?code=auth-code#access_token=token';

  it('sends only origin and path through sendBeacon', async () => {
    const sendBeacon = vi.fn(() => true);
    const logger = await configuredLogger(sensitiveUrl, sendBeacon);
    logger.logError('boom', { source: 'test' });
    const payload = JSON.parse(await sendBeacon.mock.calls[0][1].text());
    expect(payload).toEqual({
      level: 'error',
      message: 'boom',
      context: { source: 'test' },
      ts: expect.any(Number),
      version: 'test',
      url: 'https://learner.invalid/JapaneseConjugation/',
    });
    expect(JSON.stringify(payload)).not.toMatch(/password|auth-code|access_token|token/);
  });

  it('uses the same redacted URL through the fetch fallback', async () => {
    const fetchMock = vi.fn(() => Promise.resolve());
    vi.stubGlobal('fetch', fetchMock);
    const logger = await configuredLogger(sensitiveUrl);
    logger.logWarn('offline');
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.url).toBe('https://learner.invalid/JapaneseConjugation/');
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });

  it('omits unreadable URL data instead of forwarding the raw value', async () => {
    const sendBeacon = vi.fn(() => true);
    const logger = await configuredLogger('invalid?code=auth-code#access_token=token', sendBeacon);
    logger.logError('boom');
    expect(JSON.parse(await sendBeacon.mock.calls[0][1].text()).url).toBe('');
  });

  it('keeps telemetry disabled when no endpoint is configured', async () => {
    const sendBeacon = vi.fn();
    const logger = await configuredLogger(sensitiveUrl, sendBeacon);
    logger.initLogger({ endpoint: '' });
    logger.logError('boom');
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});
