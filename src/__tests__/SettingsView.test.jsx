// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../utils/supabase.js', () => ({
  getSupabaseClientState: () => ({
    configured: false,
    status: 'unconfigured',
    error: null,
    client: null,
  }),
  subscribeSupabaseClient: () => () => {},
  shouldRestoreSupabaseSession: () => false,
}));

import App from '../App.jsx';
import SettingsView from '../views/SettingsView.jsx';
import * as appContext from '../state/AppStateContext.jsx';
import { STORAGE_KEY } from '../data/defaults.js';
import { buildBackup, serializeBackup } from '../utils/backup.js';
import { defaultState } from '../utils/storage.js';
import { makeLearnerSnapshot, makeLegacyV42Backup } from './fixtures/learnerSnapshot.js';

let restoreClipboard;

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreClipboard?.();
  restoreClipboard = undefined;
});

function storedLearner() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY));
}

async function openBackupSettings(parts = makeLearnerSnapshot()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(parts));
  render(<App />);
  fireEvent.click(screen.getByRole('tab', { name: 'Settings', exact: true }));
  await screen.findByText('Display & audio', {}, { timeout: 5000 });
  fireEvent.click(screen.getByText('Data & account'));
  return parts;
}

function pasteBackup(text) {
  fireEvent.click(screen.getByRole('button', { name: 'Import', exact: true }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Paste backup JSON to restore' }), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check backup', exact: true }));
}

describe('Settings backup and restore', () => {
  it('checks and previews a backup without changing data; cancel or editing requires another check', async () => {
    const parts = await openBackupSettings();
    const before = storedLearner();
    pasteBackup(serializeBackup(parts));

    const preview = screen.getByRole('region', { name: 'Backup preview' });
    expect(within(preview).getByText('Practice attempts').nextElementSibling.textContent).toBe('8');
    expect(within(preview).getByText('Guide attempts').nextElementSibling.textContent).toBe('7');
    expect(within(preview).getByText('Saved card histories').nextElementSibling.textContent).toBe(
      '2',
    );
    expect(within(preview).getByText('Custom words').nextElementSibling.textContent).toBe('2');
    expect(within(preview).getByText('Saved lists').nextElementSibling.textContent).toBe('1');
    expect(document.activeElement).toBe(
      within(preview).getByRole('heading', { name: 'Review backup' }),
    );
    expect(storedLearner()).toEqual(before);

    fireEvent.click(within(preview).getByRole('button', { name: 'Cancel restore' }));
    expect(screen.queryByRole('region', { name: 'Backup preview' })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Paste backup JSON to restore' }),
    );
    expect(storedLearner()).toEqual(before);

    fireEvent.click(screen.getByRole('button', { name: 'Check backup' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Paste backup JSON to restore' }), {
      target: { value: 'invalid after checking' },
    });
    expect(screen.queryByRole('button', { name: 'Replace learner data' })).toBeNull();
    expect(storedLearner()).toEqual(before);
  }, 15000);

  it.each(['not JSON', JSON.stringify({ ...buildBackup(makeLearnerSnapshot()), version: 999 })])(
    'rejects invalid or unsupported backup text without changing any learner data',
    async (text) => {
      await openBackupSettings();
      const before = storedLearner();
      pasteBackup(text);
      expect(screen.getByRole('alert').textContent).toMatch(/not accepted/);
      expect(screen.queryByRole('region', { name: 'Backup preview' })).toBeNull();
      expect(storedLearner()).toEqual(before);
    },
    15000,
  );

  it('shows the missing data warning for actual schema-less v42 app exports before replacement', async () => {
    await openBackupSettings();
    const before = storedLearner();
    pasteBackup(JSON.stringify(makeLegacyV42Backup()));
    const preview = screen.getByRole('region', { name: 'Backup preview' });
    expect(within(preview).getByText('Older backup limitations')).toBeTruthy();
    expect(within(preview).getByRole('list').textContent).toMatch(/did not export/i);
    expect(within(preview).getByRole('list').textContent).toMatch(/cannot recover/);
    expect(storedLearner()).toEqual(before);
  }, 15000);

  it('restores the actual Settings export losslessly and keeps a recovery backup available after reload', async () => {
    const parts = await openBackupSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Export', exact: true }));
    const exported = screen.getByRole('textbox', { name: 'Backup export JSON' }).value;
    const exportedBackup = JSON.parse(exported);
    expect(exportedBackup.state.schemaVersion).toBe(parts.state.schemaVersion);
    expect(exportedBackup.state.session).toEqual(parts.state.session);
    cleanup();

    const beforeRestore = {
      ...makeLearnerSnapshot(),
      state: defaultState(),
      customVerbs: [],
      customAdjectives: [],
      wordLists: [],
    };
    await openBackupSettings(beforeRestore);
    const recoveryExpected = storedLearner();
    sessionStorage.setItem('jp-study-current', JSON.stringify({ stale: true }));
    pasteBackup(exported);
    fireEvent.click(screen.getByRole('button', { name: 'Replace learner data' }));

    await waitFor(() => expect(storedLearner().state.guide.attempted).toBe(7));
    expect(storedLearner().state).toEqual(exportedBackup.state);
    expect(storedLearner().customVerbs).toEqual(exportedBackup.customVerbs);
    expect(storedLearner().customAdjectives).toEqual(exportedBackup.customAdjectives);
    expect(storedLearner().wordLists).toEqual(exportedBackup.wordLists);
    expect(storedLearner().practicePrefs).toEqual(exportedBackup.practicePrefs);
    expect(sessionStorage.getItem('jp-study-current')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Backup before last restore' })).toBeTruthy();

    cleanup();
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Settings', exact: true }));
    await screen.findByText('Display & audio', {}, { timeout: 5000 });
    fireEvent.click(screen.getByText('Data & account'));
    expect(storedLearner().state).toEqual(exportedBackup.state);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    restoreClipboard = () => {
      if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
      else delete navigator.clipboard;
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy recovery backup' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const recovery = JSON.parse(writeText.mock.calls[0][0]);
    expect(recovery.state).toEqual(recoveryExpected.state);
    expect(recovery.customVerbs).toEqual(recoveryExpected.customVerbs);
    expect(recovery.wordLists).toEqual(recoveryExpected.wordLists);
  }, 20000);

  it('announces paused saving across the app and opens recovery controls without overwriting unreadable data', async () => {
    const unsupported = makeLearnerSnapshot();
    unsupported.state.schemaVersion = 999;
    const original = JSON.stringify(unsupported);
    localStorage.setItem(STORAGE_KEY, original);
    render(<App />);
    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toMatch(/Saved data needs recovery/);
    expect(banner.textContent).toMatch(/practice you do now will not be saved/);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(original);
    fireEvent.click(within(banner).getByRole('button', { name: 'Open backup & restore' }));
    await screen.findByRole('heading', { name: 'Settings', level: 2 });
    expect(screen.getByRole('button', { name: 'Export', exact: true }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Import', exact: true }).disabled).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(original);
  }, 15000);
});

function mockSettingsContext(overrides = {}) {
  const parts = makeLearnerSnapshot();
  return {
    ...parts,
    session: null,
    syncStatus: { kind: 'idle', message: '' },
    syncNow: vi.fn(),
    resetLearnerData: vi.fn(),
    restoreBackup: vi.fn().mockResolvedValue({ cloud: false, pending: false }),
    recoveryBackup: null,
    restoreBusy: false,
    restoreStatus: { kind: 'idle', message: '' },
    dataRecoveryError: '',
    setPracticePrefs: vi.fn(),
    speechVoices: [],
    resolvedTheme: 'light',
    supabase: null,
    supabaseConfigured: false,
    supabaseStatus: 'unconfigured',
    supabaseError: null,
    showAuth: vi.fn(),
    ...overrides,
  };
}

describe('Settings restore error and sync feedback', () => {
  it('keeps the checked backup available when durable restore fails', async () => {
    const context = mockSettingsContext({
      restoreBackup: vi
        .fn()
        .mockRejectedValue(new Error('Not enough storage. Current data is unchanged.')),
    });
    vi.spyOn(appContext, 'useApp').mockReturnValue(context);
    render(<SettingsView />);
    fireEvent.click(screen.getByText('Data & account'));
    const text = serializeBackup(makeLearnerSnapshot());
    pasteBackup(text);
    fireEvent.click(screen.getByRole('button', { name: 'Replace learner data' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/Not enough storage/),
    );
    expect(context.restoreBackup).toHaveBeenCalledExactlyOnceWith(text);
    expect(screen.getByRole('region', { name: 'Backup preview' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Paste backup JSON to restore' }).value).toBe(text);
  });

  it('keeps partial cloud success visible and offers a retry', () => {
    const context = mockSettingsContext({
      session: { user: { id: 'learner' } },
      restoreStatus: {
        kind: 'pending',
        message:
          'Restored in this browser. Cloud sync has not finished; keep this backup until sync succeeds.',
        detail: 'Connection unavailable.',
      },
    });
    vi.spyOn(appContext, 'useApp').mockReturnValue(context);
    render(<SettingsView />);
    fireEvent.click(screen.getByText('Data & account'));
    expect(screen.getByText(context.restoreStatus.message)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry cloud sync' }));
    expect(context.syncNow).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Export', exact: true }));
    expect(screen.getByText(context.restoreStatus.message)).toBeTruthy();
  });

  it('disables placeholder exports while original saved data needs recovery', () => {
    const context = mockSettingsContext({
      dataRecoveryError: 'Saved data uses an unsupported schema. The original is preserved.',
      recoveryBackup: '{"unreadable":"original saved data"}',
    });
    vi.spyOn(appContext, 'useApp').mockReturnValue(context);
    render(<SettingsView />);
    expect(screen.getByRole('button', { name: 'Export', exact: true }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Import', exact: true }).disabled).toBe(false);
    expect(screen.getByRole('heading', { name: 'Saved data recovery copy' })).toBeTruthy();
    expect(screen.getByText(/may need repair before it can be imported/)).toBeTruthy();
  });
});

function expectPressed(button, pressed) {
  expect(button.getAttribute('aria-pressed')).toBe(String(pressed));
}

describe('SettingsView controls', () => {
  it('keeps Settings focused on durable preferences instead of workout scope', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Settings', exact: true }));

    await screen.findByText('Display & audio', {}, { timeout: 5000 });

    expect(screen.getByRole('heading', { name: 'Settings', level: 2 })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Japanese voice' })).toBeTruthy();

    for (const oldControl of [
      'Practice session',
      'Answer mode',
      'Review style',
      'Source forms',
      'New cards/day',
      'Daily goal',
      'Conjugation types in scope',
      'Conjugation type packs',
    ]) {
      expect(screen.queryByText(oldControl)).toBeNull();
    }

    const displayScripts = within(screen.getByRole('group', { name: 'Display scripts' }));
    expectPressed(displayScripts.getByRole('button', { name: 'Kanji', exact: true }), true);
    expectPressed(displayScripts.getByRole('button', { name: 'Romaji', exact: true }), false);

    const englishHints = within(screen.getByRole('group', { name: 'English meaning' }));
    expectPressed(englishHints.getByRole('button', { name: 'Hide', exact: true }), true);

    expect(screen.getByText('Word category label')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Speak answers', exact: true })).toHaveLength(1);

    expect(screen.getByText('Reset & cleanup')).toBeTruthy();
    expect(screen.getByText('Reset practice progress')).toBeTruthy();
    expect(
      screen.getByText('Settings, category scope, Tools word exclusions, custom words, and lists'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Restore settings', exact: true }));
    expect(screen.getByRole('button', { name: 'Yes, restore settings', exact: true })).toBeTruthy();
  }, 15000);
});
