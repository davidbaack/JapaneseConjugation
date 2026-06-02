import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IconEye, IconList, IconRefresh, IconX } from './Icons.jsx';

const API_BASE = '/__dev-history/api';

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

export function formatRevisionDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function DevHistoryPanel({ apiBase = API_BASE }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState({ dirty: false, headSha: '', revisions: [] });
  const [buildingSha, setBuildingSha] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [preview, setPreview] = useState(null);

  const revisions = useMemo(() => history.revisions || [], [history.revisions]);
  const currentRevision = useMemo(
    () => revisions.find((revision) => revision.current),
    [revisions],
  );

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await readJson(await fetch(`${apiBase}/revisions?limit=30`));
      setHistory(payload);
      setLoaded(true);
    } catch (err) {
      setError(err.message || 'Could not load revision history.');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  async function restorePreview(revision) {
    setBuildingSha(revision.sha);
    setPreviewError('');
    try {
      const payload = await readJson(
        await fetch(`${apiBase}/previews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sha: revision.sha }),
        }),
      );
      setPreview({
        ...payload,
        subject: revision.subject,
        relativeTime: revision.relativeTime,
      });
    } catch (err) {
      setPreviewError(err.message || 'Could not build preview.');
    } finally {
      setBuildingSha('');
    }
  }

  useEffect(() => {
    if (open && !loaded && !loading) loadHistory();
  }, [open, loaded, loading, loadHistory]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open local revision history"
        className="fixed right-3 top-24 z-40 flex min-h-10 items-center gap-2 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-xs font-semibold text-white shadow-lg transition hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
      >
        <IconList className="h-4 w-4" />
        <span>History</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Local revision history"
          className="fixed inset-0 z-50"
        >
          <button
            type="button"
            aria-label="Close revision history"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-stone-950/20"
          />
          <aside className="absolute right-0 top-0 flex h-screen w-[min(27rem,calc(100vw-1rem))] flex-col border-l border-stone-250 bg-stone-50 text-stone-900 shadow-2xl dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100">
            <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    Local dev tool
                  </div>
                  <h2 className="mt-1 text-base font-semibold">Revision history</h2>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={loadHistory}
                    title="Refresh commits"
                    disabled={loading}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-250 bg-white text-stone-700 transition hover:bg-stone-100 disabled:opacity-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                  >
                    <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    title="Close"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-250 bg-white text-stone-700 transition hover:bg-stone-100 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                  >
                    <IconX className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
                <span className="rounded-md border border-stone-250 bg-white px-2 py-1 font-medium dark:border-stone-800 dark:bg-stone-900">
                  {currentRevision?.shortSha || history.headSha?.slice(0, 7) || 'no HEAD'}
                </span>
                {history.dirty && (
                  <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                    worktree dirty
                  </span>
                )}
                <span>{revisions.length} commits</span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {loading && !revisions.length && (
                <div className="rounded-lg border border-stone-200 bg-white px-3 py-3 text-sm text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
                  Loading local commits...
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
                  {error}
                </div>
              )}

              {previewError && (
                <div className="mb-3 whitespace-pre-wrap rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
                  {previewError}
                </div>
              )}

              <div className="grid gap-2">
                {revisions.map((revision) => {
                  const building = buildingSha === revision.sha;
                  return (
                    <button
                      key={revision.sha}
                      type="button"
                      onClick={() => restorePreview(revision)}
                      disabled={!!buildingSha}
                      aria-label={`Preview commit ${revision.shortSha}: ${
                        revision.subject || 'no subject'
                      }`}
                      className="w-full rounded-lg border border-stone-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/40 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:cursor-wait disabled:opacity-65 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30"
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                            <code className="font-semibold text-stone-800 dark:text-stone-100">
                              {revision.shortSha}
                            </code>
                            <span>{formatRevisionDate(revision.committedAt)}</span>
                            {revision.current && (
                              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800">
                                current
                              </span>
                            )}
                            {revision.dirty && (
                              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
                                dirty
                              </span>
                            )}
                          </span>
                          <span className="mt-1 block text-sm font-semibold leading-5 text-stone-950 dark:text-stone-50">
                            {revision.subject || '(no subject)'}
                          </span>
                          {revision.refs && (
                            <span className="mt-1 block truncate text-xs text-stone-500 dark:text-stone-400">
                              {revision.refs}
                            </span>
                          )}
                        </span>
                        <span
                          aria-hidden="true"
                          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white dark:bg-emerald-700"
                        >
                          <IconEye className="h-3.5 w-3.5" />
                          {building ? 'Building' : 'Restore'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      )}

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Revision preview"
          className="fixed inset-0 z-[60] flex flex-col bg-stone-950 text-white"
        >
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-white/10 bg-stone-950 px-3 py-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-emerald-300">
                Previewing {preview.shortSha || preview.sha?.slice(0, 7)}
              </div>
              <div className="truncate text-sm text-stone-200">{preview.subject}</div>
            </div>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-stone-950 transition hover:bg-stone-200"
            >
              <IconX className="h-4 w-4" />
              Back to current
            </button>
          </div>
          <iframe
            title={`Revision preview ${preview.shortSha || preview.sha?.slice(0, 7)}`}
            src={preview.previewUrl}
            sandbox="allow-scripts allow-forms allow-popups"
            className="min-h-0 flex-1 border-0 bg-white"
          />
        </div>
      )}
    </>
  );
}
