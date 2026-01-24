import { useState, useEffect } from 'react';
import '../neurodesign.css';
import './NetworkIndicator.css';

interface NetworkIndicatorProps {
  showWhenOnline?: boolean;
}

/**
 * Network Status Indicator
 * Shows offline/online status to users
 */
export function NetworkIndicator({ showWhenOnline = false }: NetworkIndicatorProps) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showIndicator, setShowIndicator] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Show "back online" message briefly
      if (wasOffline) {
        setShowIndicator(true);
        setTimeout(() => setShowIndicator(false), 3000);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      setShowIndicator(true);
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
  }, [wasOffline]);

  // Don't render if online and showWhenOnline is false
  if (isOnline && !showIndicator && !showWhenOnline) {
    return null;
  }

  return (
    <div
      className={`network-indicator neuro-connection-status ${isOnline ? 'online' : 'offline'} ${showIndicator || !isOnline ? 'visible' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="network-icon" aria-hidden="true">
        {isOnline ? '✓' : '⚠'}
      </span>
      <span className="network-text">
        {isOnline ? 'Verbindung wiederhergestellt' : 'Keine Internetverbindung'}
      </span>
      {!isOnline && (
        <span className="network-hint">
          Änderungen werden gespeichert und synchronisiert, sobald du wieder online bist.
        </span>
      )}
    </div>
  );
}

/**
 * Compact version for header use
 */
export function NetworkStatusDot() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <span
      className={`network-status-dot neuro-status-dot ${isOnline ? 'online' : 'offline'}`}
      title={isOnline ? 'Online' : 'Offline'}
      aria-label={isOnline ? 'Online' : 'Offline'}
    />
  );
}
