/**
 * Preload Script (v2)
 *
 * Exposes a typed `window.electronAPI` surface to the renderer via
 * contextBridge.  All ipcRenderer.on() subscriptions return a cleanup
 * function so React components can remove listeners in useEffect teardown.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// ─── API definition ───────────────────────────────────────────────────────────

const electronAPI = {
  /** Runtime platform string ('darwin' | 'win32' | 'linux') */
  platform: process.platform,

  /** Always true — lets the renderer detect it's running inside Electron */
  isElectron: true as const,

  // ─── Navigation ─────────────────────────────────────────────────────────

  /**
   * Subscribe to navigation events sent from the main process.
   * Returns a cleanup function — call it in `useEffect` teardown.
   */
  onNavigate: (callback: (page: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, page: string) => callback(page);
    ipcRenderer.on('navigate', handler);
    return () => ipcRenderer.removeListener('navigate', handler);
  },

  // ─── Notifications ───────────────────────────────────────────────────────

  showNotification: (title: string, body: string): void =>
    ipcRenderer.send('show-notification', { title, body }),

  // ─── Dialogs ────────────────────────────────────────────────────────────

  openFile: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile') as Promise<string | null>,

  saveFile: (data: string, filename: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', data, filename) as Promise<string | null>,

  // ─── Window controls ────────────────────────────────────────────────────

  minimize: (): void => ipcRenderer.send('window:minimize'),
  maximize: (): void => ipcRenderer.send('window:maximize'),
  close: (): void => ipcRenderer.send('window:close'),

  // ─── Shell ──────────────────────────────────────────────────────────────

  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:openExternal', url) as Promise<boolean>,

  // ─── App info ───────────────────────────────────────────────────────────

  getVersion: (): Promise<string> =>
    ipcRenderer.invoke('app:getVersion') as Promise<string>,

  // ─── Auto-updater events ─────────────────────────────────────────────────

  onUpdateAvailable: (
    callback: (info: { version: string; releaseDate: string }) => void,
  ): (() => void) => {
    const handler = (_event: IpcRendererEvent, info: { version: string; releaseDate: string }) =>
      callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },

  onUpdateProgress: (callback: (info: { percent: number }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, info: { percent: number }) => callback(info);
    ipcRenderer.on('update-progress', handler);
    return () => ipcRenderer.removeListener('update-progress', handler);
  },

  onUpdateDownloaded: (callback: (info: { version: string }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },

  // ─── Command palette ────────────────────────────────────────────────────

  onOpenCommandPalette: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('open-command-palette', handler);
    return () => ipcRenderer.removeListener('open-command-palette', handler);
  },

  // ─── Config ─────────────────────────────────────────────────────────────

  config: {
    get: (key: string): Promise<unknown> => ipcRenderer.invoke('config:get', key),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set: (key: string, value: any): Promise<void> =>
      ipcRenderer.invoke('config:set', key, value),
  },

  // ─── Backend status ──────────────────────────────────────────────────────

  backend: {
    getStatus: (): Promise<string> =>
      ipcRenderer.invoke('backend:getStatus') as Promise<string>,
    getUrl: (): Promise<string> =>
      ipcRenderer.invoke('backend:getUrl') as Promise<string>,
  },

  // ─── Spotlight overlay ───────────────────────────────────────────────────

  spotlight: {
    onShow: (callback: () => void): (() => void) => {
      const handler = () => callback();
      ipcRenderer.on('spotlight:show', handler);
      return () => ipcRenderer.removeListener('spotlight:show', handler);
    },

    onHide: (callback: () => void): (() => void) => {
      const handler = () => callback();
      ipcRenderer.on('spotlight:hide', handler);
      return () => ipcRenderer.removeListener('spotlight:hide', handler);
    },

    close: (): void => ipcRenderer.send('spotlight:close'),
    resize: (height: number): void => ipcRenderer.send('spotlight:resize', height),
  },
};

// ─── Expose to renderer ───────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// ─── Type export (used by the renderer's TypeScript project) ─────────────────

export type ElectronAPI = typeof electronAPI;
