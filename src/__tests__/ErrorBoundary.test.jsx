// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { STORAGE_KEY } from '../data/defaults.js';

let downloadedBlob;
let createObjectURL;
let unregister;

function Crash() {
  throw new Error('Fixture render failure');
}

function savedBytes() {
  return Object.fromEntries(
    Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]),
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, '{unreadable learner snapshot');
  localStorage.setItem(`${STORAGE_KEY}:pending:fixture`, 'unreadable pending answer');
  localStorage.setItem('sb-fixture-auth-token', 'private-auth-fixture');
  createObjectURL = vi.fn((blob) => {
    downloadedBlob = blob;
    return 'blob:fixture-recovery';
  });
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = vi.fn();
    },
  );
  unregister = vi.fn();
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistrations: vi.fn(async () => [{ unregister }]) },
  });
  vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('preservation-first crash recovery', () => {
  it('offers reload and recovery without exposing destructive reset or touching workers', () => {
    const before = savedBytes();
    render(
      <ErrorBoundary>
        <Crash />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Reload app' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download saved recovery data' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();
    expect(savedBytes()).toEqual(before);
    expect(navigator.serviceWorker.getRegistrations).not.toHaveBeenCalled();
    expect(unregister).not.toHaveBeenCalled();
  });

  it('downloads exact saved and pending bytes without exporting authentication or mutating storage', async () => {
    const before = savedBytes();
    render(
      <ErrorBoundary>
        <Crash />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Download saved recovery data' }));
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(downloadedBlob);
    });
    const recovery = JSON.parse(text);
    expect(recovery.saved).toBe(before[STORAGE_KEY]);
    expect(recovery.pending).toEqual([
      { key: `${STORAGE_KEY}:pending:fixture`, raw: 'unreadable pending answer' },
    ]);
    expect(text).not.toContain('private-auth-fixture');
    expect(screen.getByRole('status').textContent).toContain('download started');
    expect(savedBytes()).toEqual(before);
  });

  it('offers copyable raw JSON when the download fails and allows retry', () => {
    const before = savedBytes();
    createObjectURL.mockImplementationOnce(() => {
      throw new Error('Downloads unavailable');
    });
    render(
      <ErrorBoundary>
        <Crash />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Download saved recovery data' }));
    expect(screen.getByRole('alert').textContent).toContain('Nothing has been cleared');
    expect(
      JSON.parse(screen.getByRole('textbox', { name: 'Saved recovery JSON' }).value).saved,
    ).toBe(before[STORAGE_KEY]);
    expect(savedBytes()).toEqual(before);
    fireEvent.click(screen.getByRole('button', { name: 'Download saved recovery data' }));
    expect(screen.getByRole('status').textContent).toContain('download started');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports unreadable storage without claiming a successful export or clearing anything', () => {
    const before = savedBytes();
    render(
      <ErrorBoundary>
        <Crash />
      </ErrorBoundary>,
    );
    const reads = vi.spyOn(window.Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage access denied');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download saved recovery data' }));
    expect(screen.getByRole('alert').textContent).toContain('Saved data could not be read');
    expect(screen.queryByRole('status')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
    reads.mockRestore();
    expect(savedBytes()).toEqual(before);
  });
});
