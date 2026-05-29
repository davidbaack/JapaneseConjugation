// Lightweight client logger (improvement #13).
//
// The app has an ErrorBoundary and many silent `catch {}` blocks, but errors
// currently go nowhere — real-world sync/AI failures are invisible. This module
// keeps a small in-memory ring buffer (surfaced in Settings for bug reports)
// and, when VITE_LOG_ENDPOINT is configured, best-effort posts entries to a
// collector. It never throws and never recurses into itself.

const MAX_BUFFER = 50;
const MIN_POST_INTERVAL_MS = 5000;

const buffer = [];
let endpoint = '';
let appVersion = '';
let lastPostAt = 0;
let initialized = false;

function serialize(value) {
  if (value == null) return String(value);
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function maybePost(entry) {
  if (!endpoint || typeof window === 'undefined') return;
  // Only ship warnings/errors, and throttle so a burst can't flood the network.
  if (entry.level === 'info') return;
  const now = Date.now();
  if (now - lastPostAt < MIN_POST_INTERVAL_MS) return;
  lastPostAt = now;

  const body = JSON.stringify({ ...entry, version: appVersion, url: window.location?.href });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
    } else {
      // keepalive lets the request outlive a page unload; failures are ignored.
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Logging must never break the app.
  }
}

function record(level, message, context) {
  const entry = {
    level,
    message: serialize(message),
    context: context || {},
    ts: Date.now(),
  };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();

  const line = `[${level}] ${entry.message}`;
  if (level === 'error') console.error(line, context || '');
  else if (level === 'warn') console.warn(line, context || '');
  else console.info(line, context || '');

  maybePost(entry);
  return entry;
}

export const logError = (message, context) => record('error', message, context);
export const logWarn = (message, context) => record('warn', message, context);
export const logInfo = (message, context) => record('info', message, context);

// The most recent log entries (newest last) — used by Settings' diagnostics.
export function getRecentLogs() {
  return buffer.slice();
}

export function clearLogs() {
  buffer.length = 0;
}

// Wire up global handlers once. Safe to call on every mount; only the first
// call attaches listeners.
export function initLogger({ endpoint: ep = '', version = '' } = {}) {
  endpoint = ep || '';
  appVersion = version || '';
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('error', (event) => {
    logError(event.error || event.message, { source: 'window.onerror' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    logError(event.reason, { source: 'unhandledrejection' });
  });
}
