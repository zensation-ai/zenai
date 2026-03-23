/**
 * IPC Event Handlers (v2 — dependency-injected)
 *
 * Handles communication between the renderer (React) and main process.
 * All external dependencies are passed in via IpcDependencies so this module
 * is fully unit-testable without a running Electron runtime.
 */

import { ipcMain, dialog, Notification, BrowserWindow, shell, app } from 'electron';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IpcDependencies {
  /** Returns the current main BrowserWindow, or null if not yet created */
  getMainWindow: () => BrowserWindow | null;
  /** Read a config value by key */
  getConfig: (key: string) => unknown;
  /** Write a config value by key */
  setConfig: (key: string, value: unknown) => void;
  /** Returns the current backend health status string */
  getBackendStatus: () => string;
  /** Returns the active backend URL */
  getBackendUrl: () => string;
  /** Hide the spotlight overlay window */
  hideSpotlight: () => void;
  /** Resize the spotlight overlay to a given height */
  resizeSpotlight: (height: number) => void;
}

// ─── Handler registration ─────────────────────────────────────────────────────

/**
 * Register all IPC channels.  Call once after `app` is ready.
 */
export function registerIpcHandlers(deps: IpcDependencies): void {
  const {
    getMainWindow,
    getConfig,
    setConfig,
    getBackendStatus,
    getBackendUrl,
    hideSpotlight,
    resizeSpotlight,
  } = deps;

  // ─── Notifications ───────────────────────────────────────────────────────

  ipcMain.on('show-notification', (_event, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      const notification = new Notification({ title, body });
      notification.on('click', () => {
        const win = getMainWindow();
        if (win) {
          win.show();
          win.focus();
        }
      });
      notification.show();
    }
  });

  // ─── File Dialogs ────────────────────────────────────────────────────────

  ipcMain.handle('dialog:openFile', async () => {
    const win = getMainWindow();
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
        { name: 'Data', extensions: ['json', 'csv', 'xlsx'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:saveFile', async (_event, data: string, filename: string) => {
    const win = getMainWindow();
    if (!win) return null;

    const result = await dialog.showSaveDialog(win, {
      defaultPath: filename,
      filters: [{ name: 'All Files', extensions: ['*'] }],
    });

    if (result.canceled || !result.filePath) return null;

    const fs = await import('fs');
    fs.writeFileSync(result.filePath, data, 'utf-8');
    return result.filePath;
  });

  // ─── Window Management ───────────────────────────────────────────────────

  ipcMain.on('window:minimize', () => {
    getMainWindow()?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    const win = getMainWindow();
    if (win) {
      // BrowserWindow.isMaximized is present at runtime; cast for TS
      const bw = win as BrowserWindow & { isMaximized?: () => boolean; unmaximize?: () => void };
      bw.isMaximized?.() ? bw.unmaximize?.() : win.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    getMainWindow()?.close();
  });

  // ─── Spotlight ───────────────────────────────────────────────────────────

  ipcMain.on('spotlight:close', () => {
    hideSpotlight();
  });

  ipcMain.on('spotlight:resize', (_event, height: number) => {
    resizeSpotlight(height);
  });

  // ─── External Links ──────────────────────────────────────────────────────

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  // ─── App Info ────────────────────────────────────────────────────────────

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:getPath', (_event, name: string) => {
    return app.getPath(name as Parameters<typeof app.getPath>[0]);
  });

  // ─── Config ──────────────────────────────────────────────────────────────

  ipcMain.handle('config:get', (_event, key: string) => {
    return getConfig(key);
  });

  ipcMain.handle('config:set', (_event, key: string, value: unknown) => {
    setConfig(key, value);
  });

  // ─── Backend ─────────────────────────────────────────────────────────────

  ipcMain.handle('backend:getStatus', () => {
    return getBackendStatus();
  });

  ipcMain.handle('backend:getUrl', () => {
    return getBackendUrl();
  });
}
