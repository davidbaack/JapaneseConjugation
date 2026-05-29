import { useState, useEffect, useCallback } from 'react';

// Timed-drill clock for Study (improvement #4 — StudyView decomposition).
// Owns the countdown end time and a ticking "now", derives the remaining
// seconds, and exposes restart() for the "Restart timed drill" action. When
// durationSec is 0 there is no timer (timeLeft is null).
export function useStudyTimer(durationSec) {
  const [endAt, setEndAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  // (Re)arm the timer whenever the configured duration changes.
  useEffect(() => {
    setEndAt(durationSec > 0 ? Date.now() + durationSec * 1000 : null);
    setNow(Date.now());
  }, [durationSec]);

  // Tick while a deadline is active; clean up on unmount / deadline change.
  useEffect(() => {
    if (!endAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [endAt]);

  const restart = useCallback(() => {
    setEndAt(durationSec > 0 ? Date.now() + durationSec * 1000 : null);
    setNow(Date.now());
  }, [durationSec]);

  const timeLeft = endAt ? Math.max(0, Math.ceil((endAt - now) / 1000)) : null;

  return { endAt, timeLeft, restart };
}
