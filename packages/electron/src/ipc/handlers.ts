/**
 * IPC Event Handlers
 *
 * Handles communication between the renderer (React) and main process.
 * Registered in main.ts during app initialization.
 */

import { ipcMain, dialog, Notification, BrowserWindow, shell } from 'electron';

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  // ─── Notifications ───

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

  // ─── File Dialogs ───

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

  // ─── Window Management ───

  ipcMain.on('window:minimize', () => {
    getMainWindow()?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    const win = getMainWindow();
    if (win) {
      win.isMaximized() ? win.unmaximize() : win.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    getMainWindow()?.close();
  });

  // ─── External Links ───

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    // Only allow http/https URLs
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  // ─── App Info ───

  ipcMain.handle('app:getVersion', () => {
    const { app } = require('electron');
    return app.getVersion();
  });

  ipcMain.handle('app:getPath', (_event, name: string) => {
    const { app } = require('electron');
    return app.getPath(name as Parameters<typeof app.getPath>[0]);
  });
}
