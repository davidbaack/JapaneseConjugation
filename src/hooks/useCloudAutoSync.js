import { useEffect, useRef } from 'react';
import { saveAll, cloudUpsert } from '../utils/storage.js';
import { supabase } from '../utils/supabase.js';

// How long to wait after the last change before pushing to the cloud. Rapid
// edits (e.g. grading several cards in a row) keep resetting this timer so they
// coalesce into a single upsert instead of one request per keystroke/grade.
export const PUSH_DEBOUNCE_MS = 2000;

// Persists the app state bundle to localStorage on every change and, when the
// user is signed in, debounces a push of the full payload to Supabase. The
// lastSyncedAtRef and setSyncStatus are owned by App so this hook stays in
// agreement with the login and manual-sync paths about the last sync time.
export function useCloudAutoSync({
  hydrated,
  session,
  state,
  customVerbs,
  customAdjectives,
  wordLists,
  geminiKey,
  practicePrefs,
  lastSyncedAtRef,
  setSyncStatus,
}) {
  const pushTimer = useRef(null);

  useEffect(() => {
    if (!hydrated) return;
    const dummySync = { enabled: !!session };
    saveAll(state, customVerbs, customAdjectives, wordLists, dummySync, lastSyncedAtRef.current, geminiKey, practicePrefs);

    if (session?.user && supabase) {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(async () => {
        setSyncStatus(s => ({ ...s, kind: 'syncing', message: 'Saving to cloud…' }));
        try {
          await cloudUpsert({ state, customVerbs, customAdjectives, wordLists, practicePrefs });
          const now = Date.now();
          lastSyncedAtRef.current = now;
          saveAll(state, customVerbs, customAdjectives, wordLists, dummySync, now, geminiKey, practicePrefs);
          setSyncStatus({ kind: 'ok', message: 'Saved to cloud', at: now });
        } catch (e) {
          setSyncStatus({ kind: 'error', message: e.message || 'Push failed', at: null });
        }
      }, PUSH_DEBOUNCE_MS);
    }
  }, [state, customVerbs, customAdjectives, wordLists, session, geminiKey, practicePrefs, hydrated, lastSyncedAtRef, setSyncStatus]);
}
