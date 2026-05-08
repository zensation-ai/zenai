/**
 * Main Application Window
 *
 * Extracted from main.ts — creates and manages the primary BrowserWindow
 * that loads the Vercel-hosted frontend.
 */

import { BrowserWindow, shell } from 'electron';
import * as path from 'path';

// ===========================
// State
// ===========================

let mainWindow: BrowserWindow | null = null;

// ===========================
// Public API
// ===========================

export interface MainWindowConfig {
  frontendUrl: string;
  vercelOrigin: string;
  railwayOrigin: string;
  isDev: boolean;
}

/**
 * Create the main application window.
 */
export function createMainWindow(config: MainWindowConfig): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'ZenAI',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f1117',
    show: false,
  });

  mainWindow.loadURL(config.frontendUrl);

  // Offline fallback — only for main frame, ignore aborted navigations
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _desc, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      mainWindow?.loadFile(path.join(__dirname, '..', 'offline.html'));
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Allow OAuth popups from our own origins, open everything else externally
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(config.vercelOrigin) || url.startsWith(config.railwayOrigin)) {
      return { action: 'allow' };
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (config.isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  return mainWindow;
}

/**
 * Get the current main window instance.
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/**
 * Show and focus the main window, navigating to a specific page.
 */
export function showAndFocus(page: string): void {
  mainWindow?.show();
  mainWindow?.focus();
  mainWindow?.webContents.send('navigate', page);
}
