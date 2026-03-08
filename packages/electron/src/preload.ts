/**
 * ZenAI Electron Preload Script
 *
 * Exposes a safe API to the renderer process via contextBridge.
 * The renderer (React frontend) can access these via window.electronAPI.
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * Exposed API available in the renderer as window.electronAPI
 */
const electronAPI = {
  // Platform info
  platform: process.platform,
  isElectron: true as const,

  // Navigation (from main process menu/tray/shortcuts)
  onNavigate: (callback: (page: string) => void) => {
    ipcRenderer.on('navigate', (_event, page: string) => callback(page));
  },

  // Native notifications
  showNotification: (title: string, body: string) => {
    ipcRenderer.send('show-notification', { title, body });
  },

  // File system dialogs
  openFile: () => ipcRenderer.invoke('dialog:openFile') as Promise<string | null>,
  saveFile: (data: string, filename: string) =>
    ipcRenderer.invoke('dialog:saveFile', data, filename) as Promise<string | null>,

  // Window management
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // External links
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url) as Promise<boolean>,

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,

  // Auto-update events (from main process)
  onUpdateAvailable: (callback: (info: { version: string; releaseDate: string }) => void) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info));
  },
  onUpdateProgress: (callback: (info: { percent: number }) => void) => {
    ipcRenderer.on('update-progress', (_event, info) => callback(info));
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
  },

  // Command palette (from main process menu)
  onOpenCommandPalette: (callback: () => void) => {
    ipcRenderer.on('open-command-palette', () => callback());
  },

  // Screen Memory (Phase 5 - placeholder)
  screenMemory: {
    isEnabled: () => ipcRenderer.invoke('screen-memory:isEnabled') as Promise<boolean>,
    toggle: (enabled: boolean) => ipcRenderer.invoke('screen-memory:toggle', enabled) as Promise<void>,
    search: (query: string) => ipcRenderer.invoke('screen-memory:search', query) as Promise<unknown[]>,
  },

  // Browser (Phase 2 - placeholder)
  browser: {
    openTab: (url: string) => ipcRenderer.invoke('browser:openTab', url) as Promise<string>,
    closeTab: (tabId: string) => ipcRenderer.invoke('browser:closeTab', tabId) as Promise<void>,
    getActiveTab: () => ipcRenderer.invoke('browser:getActiveTab') as Promise<{ id: string; url: string; title: string } | null>,
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for renderer access
export type ElectronAPI = typeof electronAPI;
