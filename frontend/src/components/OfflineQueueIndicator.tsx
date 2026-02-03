import { useState, useEffect, memo } from 'react';
import './OfflineQueueIndicator.css';

interface OfflineQueueIndicatorProps {
  /** Number of pending changes waiting to sync */
  pendingCount?: number;
  /** Callback when sync button is clicked */
  onSync?: () => void;
  /** Whether syncing is in progress */
  isSyncing?: boolean;
}

/**
 * Offline Queue Indicator
 * Shows pending changes count when offline or syncing
 * Integrates with the existing NetworkIndicator
 */
export const OfflineQueueIndicator = memo(function OfflineQueueIndicator({
  pendingCount = 0,
  onSync,
  isSyncing = false,
}: OfflineQueueIndicatorProps) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Keep visible briefly when coming back online if there are pending changes
      if (pendingCount > 0) {
        setTimeout(() => setIsVisible(false), 5000);
      } else {
        setIsVisible(false);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsVisible(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [pendingCount]);

  // Update visibility when pending count changes
  useEffect(() => {
    if (pendingCount > 0 && !isOnline) {
      setIsVisible(true);
    }
  }, [pendingCount, isOnline]);

  // Don't show if online with no pending changes and not syncing
  if (isOnline && pendingCount === 0 && !isSyncing && !isVisible) {
    return null;
  }

  // Show syncing state
  if (isSyncing) {
    return (
      <div className="offline-queue-indicator syncing" role="status" aria-live="polite">
        <span className="queue-icon syncing" aria-hidden="true">\uD83D\uDD04</span>
        <span className="queue-message">
          Synchronisiere {pendingCount > 0 ? `${pendingCount} \u00C4nderung${pendingCount !== 1 ? 'en' : ''}` : ''}...
        </span>
      </div>
    );
  }

  // Show offline state
  if (!isOnline) {
    return (
      <div className="offline-queue-indicator offline" role="status" aria-live="polite">
        <span className="queue-icon offline" aria-hidden="true">\uD83D\uDCF4</span>
        <span className="queue-message">
          Offline
          {pendingCount > 0 && (
            <span className="queue-count">
              {' '}\u2022 {pendingCount} \u00C4nderung{pendingCount !== 1 ? 'en' : ''} wartend
            </span>
          )}
        </span>
      </div>
    );
  }

  // Show pending changes when back online
  if (pendingCount > 0 && isVisible) {
    return (
      <div className="offline-queue-indicator pending" role="status" aria-live="polite">
        <span className="queue-icon pending" aria-hidden="true">\u26A0\uFE0F</span>
        <span className="queue-message">
          {pendingCount} \u00C4nderung{pendingCount !== 1 ? 'en' : ''} nicht synchronisiert
        </span>
        {onSync && (
          <button
            type="button"
            className="queue-sync-btn neuro-press-effect"
            onClick={onSync}
          >
            Jetzt synchen
          </button>
        )}
      </div>
    );
  }

  return null;
});

/**
 * Hook to track offline queue state
 */
export function useOfflineQueue() {
  const [pendingChanges, setPendingChanges] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const addPendingChange = (id: string) => {
    setPendingChanges(prev => [...prev, id]);
  };

  const removePendingChange = (id: string) => {
    setPendingChanges(prev => prev.filter(c => c !== id));
  };

  const clearPendingChanges = () => {
    setPendingChanges([]);
  };

  const syncChanges = async (syncFn: () => Promise<void>) => {
    setIsSyncing(true);
    try {
      await syncFn();
      clearPendingChanges();
    } finally {
      setIsSyncing(false);
    }
  };

  return {
    pendingCount: pendingChanges.length,
    pendingChanges,
    isSyncing,
    addPendingChange,
    removePendingChange,
    clearPendingChanges,
    syncChanges,
  };
}
