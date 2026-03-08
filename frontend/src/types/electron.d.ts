/**
 * Type declarations for the Electron API exposed via preload script.
 * These types are available when running inside the Electron desktop app.
 *
 * Access via: window.electronAPI
 */

interface ElectronAPI {
  // Platform info
  platform: NodeJS.Platform;
  isElectron: true;

  // Navigation (IPC from main process)
  onNavigate: (callback: (page: string) => void) => void;

  // Native notifications
  showNotification: (title: string, body: string) => void;

  // File system dialogs
  openFile: () => Promise<string | null>;
  saveFile: (data: string, filename: string) => Promise<string | null>;

  // Window management
  minimize: () => void;
  maximize: () => void;
  close: () => void;

  // External links
  openExternal: (url: string) => Promise<boolean>;

  // App info
  getVersion: () => Promise<string>;

  // Update events (received from main process)
  onUpdateAvailable: (callback: (info: { version: string; releaseDate: string }) => void) => void;
  onUpdateProgress: (callback: (info: { percent: number }) => void) => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => void;

  // Command palette (received from main process)
  onOpenCommandPalette: (callback: () => void) => void;

  // Screen Memory (Phase 5 - placeholder)
  screenMemory: {
    isEnabled: () => Promise<boolean>;
    toggle: (enabled: boolean) => Promise<void>;
    search: (query: string) => Promise<unknown[]>;
  };

  // Browser (Phase 2 - placeholder)
  browser: {
    openTab: (url: string) => Promise<string>;
    closeTab: (tabId: string) => Promise<void>;
    getActiveTab: () => Promise<{ id: string; url: string; title: string } | null>;
  };
}

interface Window {
  electronAPI?: ElectronAPI;
}
