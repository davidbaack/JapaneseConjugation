import React from 'react';
import { STORAGE_KEY } from '../data/defaults.js';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('App error:', error, info.componentStack);
  }

  handleReset() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    window.location.reload();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-8 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">
            An unexpected error occurred. Your progress is saved — try reloading first.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition"
            >
              Reload app
            </button>
            <button
              onClick={() => this.handleReset()}
              className="w-full py-2 border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg text-sm transition"
            >
              Reset app data &amp; reload
            </button>
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
