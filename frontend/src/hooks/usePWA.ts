/**
 * Phase 62: PWA Hook
 *
 * Custom React hook for Progressive Web App functionality:
 * - Online/offline status tracking
 * - Install prompt detection and triggering
 * - Standalone mode detection
 * - Pending sync count from offline queue
 * - Service worker update detection
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface UsePWAReturn {
  /** Whether the device is currently online */
  isOnline: boolean;
  /** Whether the app can be installed (beforeinstallprompt fired) */
  isInstallable: boolean;
  /** Whether the app is running in standalone/installed mode */
  isInstalled: boolean;
  /** Trigger the install prompt */
  installApp: () => Promise<boolean>;
  /** Number of offline mutations pending sync */
  pendingSync: number;
  /** Whether a service worker update is available */
  swUpdate: boolean;
  /** Apply the pending service worker update */
  applyUpdate: () => void;
}

export function usePWA(): UsePWAReturn {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isInstallable, setIsInstallable] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [swUpdate, setSwUpdate] = useState(false);

  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  // Check if app is installed (standalone mode)
  const isInstalled = typeof window !== 'undefined'
    && window.matchMedia('(display-mode: standalone)').matches;

  // Online/offline tracking
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

  // Install prompt detection
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Service worker update detection
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const checkForUpdate = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (
                  newWorker.state === 'installed' &&
                  navigator.serviceWorker.controller
                ) {
                  waitingWorkerRef.current = newWorker;
                  setSwUpdate(true);
                }
              });
            }
          });
        }
      } catch {
        // Service worker not supported or error
      }
    };

    checkForUpdate();
  }, []);

  // Listen for service worker messages (pending sync count)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PENDING_SYNC_COUNT') {
        setPendingSync(event.data.count || 0);
      }
      if (event.data?.type === 'SW_UPDATE_AVAILABLE') {
        setSwUpdate(true);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    // Request initial pending count
    navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({ type: 'GET_PENDING_SYNC_COUNT' });
    }).catch(() => {
      // Service worker not ready
    });

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, []);

  // Install the app
  const installApp = useCallback(async (): Promise<boolean> => {
    if (!deferredPromptRef.current) return false;

    try {
      await deferredPromptRef.current.prompt();
      const { outcome } = await deferredPromptRef.current.userChoice;

      if (outcome === 'accepted') {
        deferredPromptRef.current = null;
        setIsInstallable(false);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  // Apply SW update
  const applyUpdate = useCallback(() => {
    if (waitingWorkerRef.current) {
      waitingWorkerRef.current.postMessage({ type: 'SKIP_WAITING' });
      setSwUpdate(false);
      window.location.reload();
    }
  }, []);

  return {
    isOnline,
    isInstallable,
    isInstalled,
    installApp,
    pendingSync,
    swUpdate,
    applyUpdate,
  };
}
