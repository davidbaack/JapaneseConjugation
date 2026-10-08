import React from 'react';
import { logError } from '../utils/logger.js';
import { serializeSavedRecoveryData } from '../utils/savedRecovery.js';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, recoveryMessage: '', recoveryError: '', recoveryText: '' };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    logError(error, { source: 'ErrorBoundary', componentStack: info?.componentStack });
  }

  handleRecoveryDownload() {
    let text = '';
    let url;
    let link;
    try {
      text = serializeSavedRecoveryData();
      url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      link = document.createElement('a');
      link.href = url;
      link.download = `katachiya-saved-recovery-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      this.setState({
        recoveryMessage:
          'Recovery download started. Keep the file before clearing browser storage.',
        recoveryError: '',
        recoveryText: '',
      });
    } catch {
      this.setState({
        recoveryMessage: '',
        recoveryError: text
          ? 'Download could not start. Copy the recovery JSON below and keep this browser open. Nothing has been cleared.'
          : 'Saved data could not be read. Keep this browser open and try again. Nothing has been cleared.',
        recoveryText: text,
      });
    } finally {
      link?.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-8 text-center">
          <div className="text-4xl mb-4" aria-hidden="true">
            ⚠️
          </div>
          <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">
            Try reloading. You can download the data currently saved in this browser before taking
            further recovery steps.
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Reload app
            </button>
            <button
              type="button"
              onClick={() => this.handleRecoveryDownload()}
              className="w-full py-2 border border-stone-300 dark:border-stone-700 rounded-lg text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Download saved recovery data
            </button>
            <p className="text-left text-sm text-stone-500 dark:text-stone-400">
              This file contains raw saved data and pending saves. It may need repair before import.
              Once the app opens, checked restore and reset controls are in Settings → Data &amp;
              account.
            </p>
            {this.state.recoveryMessage && <p role="status">{this.state.recoveryMessage}</p>}
            {this.state.recoveryError && <p role="alert">{this.state.recoveryError}</p>}
            {this.state.recoveryText && (
              <label className="text-left text-sm">
                Saved recovery JSON
                <textarea
                  readOnly
                  value={this.state.recoveryText}
                  onFocus={(event) => event.target.select()}
                  className="mt-2 w-full h-32 p-2 rounded border border-stone-300 dark:border-stone-700 bg-transparent font-mono text-xs"
                />
              </label>
            )}
            <details className="text-left mt-2">
              <summary className="text-xs text-stone-400 cursor-pointer hover:text-stone-500">
                Error details
              </summary>
              <pre className="mt-2 text-xs text-stone-500 bg-stone-50 dark:bg-stone-950 rounded p-3 overflow-auto whitespace-pre-wrap break-all">
                {this.state.error.toString()}
              </pre>
            </details>
          </div>
        </div>
      </div>
    );
  }
}
