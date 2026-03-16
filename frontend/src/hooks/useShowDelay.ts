import { useState, useEffect, useRef } from 'react';

/**
 * useShowDelay — Prevents loading indicator flash for fast operations.
 *
 * - Waits `showAfterMs` (default 150ms) before showing the indicator.
 * - Once shown, stays visible for at least `minDisplayMs` (default 300ms)
 *   to prevent jarring flash.
 *
 * Usage:
 *   const showSpinner = useShowDelay(isLoading);
 *   if (showSpinner) return <Spinner />;
 */
export function useShowDelay(
  isLoading: boolean,
  showAfterMs = 150,
  minDisplayMs = 300,
): boolean {
  const [visible, setVisible] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      // Start delay timer before showing
      showTimerRef.current = setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, showAfterMs);
    } else {
      // Loading finished — clear the show timer if it hasn't fired yet
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }

      if (shownAtRef.current !== null) {
        // Ensure minimum display time
        const elapsed = Date.now() - shownAtRef.current;
        const remaining = minDisplayMs - elapsed;

        if (remaining > 0) {
          const hideTimer = setTimeout(() => {
            setVisible(false);
            shownAtRef.current = null;
          }, remaining);
          return () => clearTimeout(hideTimer);
        }

        setVisible(false);
        shownAtRef.current = null;
      }
    }

    return () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };
  }, [isLoading, showAfterMs, minDisplayMs]);

  return visible;
}
