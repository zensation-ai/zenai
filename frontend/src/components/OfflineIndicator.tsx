/**
 * OfflineIndicator - Global offline status banner
 *
 * Shows a glassmorphism banner at the top of the main content area when the
 * user is offline.  Displays the count of pending mutations queued by the
 * service worker and shows a sync animation when connectivity is restored.
 * Auto-dismisses once sync completes.
 *
 * @phase 5.3 - Offline Resilience Enhancement
 */

import { useState, useEffect, useRef } from 'react';
import { usePWA } from '../hooks/usePWA';
import './OfflineIndicator.css';

export function OfflineIndicator() {
  const { isOnline, pendingSync } = usePWA();

  // Track "just came back online" state for the sync animation
  const [syncing, setSyncing] = useState(false);
  const wasOfflineRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect offline -> online transition
  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      // Clear any pending dismiss timer when going offline again
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      setSyncing(false);
      return;
    }

    // Just came back online
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setSyncing(true);

      // Auto-dismiss after a short delay once online
      dismissTimerRef.current = setTimeout(() => {
        setSyncing(false);
        dismissTimerRef.current = null;
      }, 3000);
    }

    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [isOnline]);

  // Nothing to show when online and not syncing
  if (isOnline && !syncing) return null;

  return (
    <div
      className={`offline-indicator ${syncing ? 'offline-indicator--syncing' : ''}`}
      role="status"
      aria-live="polite"
    >
      {syncing ? (
        <>
          <svg
            className="offline-indicator__icon offline-indicator__icon--spin"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M14 8a6 6 0 01-6 6M2 8a6 6 0 016-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>Synchronisiere{pendingSync > 0 ? ` (${pendingSync})` : ''}...</span>
        </>
      ) : (
        <>
          <svg
            className="offline-indicator__icon"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M1 1l14 14M3.5 6.5A7.47 7.47 0 018 5c1.66 0 3.19.54 4.43 1.45M5.75 9.25A4.48 4.48 0 018 8.5c.85 0 1.63.27 2.28.73"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="8" cy="12" r="1" fill="currentColor" />
          </svg>
          <span>
            Offline
            {pendingSync > 0 && (
              <span className="offline-indicator__count">
                {' '}&middot; {pendingSync} ausstehend{pendingSync !== 1 ? 'e' : 'e'} Aktion{pendingSync !== 1 ? 'en' : ''}
              </span>
            )}
          </span>
        </>
      )}
    </div>
  );
}
