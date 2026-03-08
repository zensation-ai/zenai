/**
 * Electron Platform Utilities
 *
 * Provides detection and API wrappers for Electron desktop features.
 * Falls back gracefully when running in the web browser.
 */

/**
 * Check if running inside Electron desktop app
 */
export const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

/**
 * Get the Electron API, or null if not in Electron
 */
export function getElectronAPI(): ElectronAPI | null {
  if (isElectron && window.electronAPI) {
    return window.electronAPI;
  }
  return null;
}

/**
 * Show a native notification (falls back to browser Notification API)
 */
export function showNativeNotification(title: string, body: string): void {
  const api = getElectronAPI();
  if (api) {
    api.showNotification(title, body);
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

/**
 * Open a file using native dialog (Electron) or file input (web)
 * Returns the file path (Electron) or null
 */
export async function openFileDialog(): Promise<string | null> {
  const api = getElectronAPI();
  if (api) {
    return api.openFile();
  }
  return null;
}

/**
 * Save file using native dialog (Electron only)
 * Returns the saved file path or null
 */
export async function saveFileDialog(data: string, filename: string): Promise<string | null> {
  const api = getElectronAPI();
  if (api) {
    return api.saveFile(data, filename);
  }
  return null;
}

/**
 * Open an external URL in the default browser
 * In Electron: uses shell.openExternal (secure)
 * In web: uses window.open
 */
export function openExternal(url: string): void {
  const api = getElectronAPI();
  if (api) {
    api.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Get the platform string
 */
export function getPlatform(): string {
  const api = getElectronAPI();
  if (api) {
    return api.platform;
  }
  return 'web';
}

/**
 * Initialize Electron-specific features.
 * Called once during app startup in main.tsx.
 */
export function initializeElectron(navigate: (path: string) => void): void {
  const api = getElectronAPI();
  if (!api) return;

  // Listen for navigation commands from the main process
  api.onNavigate((page: string) => {
    navigate(`/${page}`);
  });

  // Listen for command palette trigger from menu
  api.onOpenCommandPalette(() => {
    // Dispatch a custom event that CommandPalette can listen to
    window.dispatchEvent(new CustomEvent('open-command-palette'));
  });

  console.log(`[ZenAI] Running in Electron on ${api.platform}`);
}
