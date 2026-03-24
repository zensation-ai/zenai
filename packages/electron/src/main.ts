/**
 * ZenAI Electron Main Process — Cloud Shell
 *
 * Loads the Vercel-hosted frontend in a native desktop window.
 * Provides: System Tray, Global Shortcuts, Native Notifications,
 * Screen Memory, Auto-Updates via GitHub Releases.
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, shell } from 'electron';
import * as path from 'path';
import { registerIpcHandlers } from './ipc/handlers';
import { createAppMenu } from './menu';
import { initAutoUpdater } from './updater';

// ===========================
// Constants
// ===========================

const APP_NAME = 'ZenAI';
const PRODUCTION_URL = process.env.FRONTEND_URL || 'https://frontend-mu-six-93.vercel.app';
const DEV_URL = 'http://localhost:5173';
const VERCEL_ORIGIN = process.env.FRONTEND_URL || 'https://frontend-mu-six-93.vercel.app';
const RAILWAY_ORIGIN = process.env.API_URL || 'https://ki-ab-production.up.railway.app';

// ===========================
// State
// ===========================

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const isDev = !app.isPackaged;
const FRONTEND_URL = isDev ? DEV_URL : PRODUCTION_URL;

/**
 * Get the main window (used by IPC handlers, menu, updater)
 */
function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

// ===========================
// Window Management
// ===========================

/**
 * Create the main application window
 */
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f1117',
    show: false,
  });

  mainWindow.loadURL(FRONTEND_URL);

  // Offline fallback — only for main frame, ignore aborted navigations
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _desc, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      mainWindow?.loadFile(path.join(__dirname, 'offline.html'));
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
    if (url.startsWith(VERCEL_ORIGIN) || url.startsWith(RAILWAY_ORIGIN)) {
      return { action: 'allow' };
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ===========================
// System Tray
// ===========================

/**
 * Create system tray with quick actions
 */
function createTray(): void {
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADgSURBVDiN1ZMxCsJAEEX/7hqwUKzEwsZCbATBwsrK3kN4Aa/gQTyBZ/AGNjbewMI7KIhEENFCi6yskmhi1sUPw8B882dmB0KI/5bK80CShEqJmLGNjCNsHbDW4OaAXSCL8dqAZcK8BXfNfgOKEi8S1hBqH3D1Uf3IAI7+0JuaUgImpqQC+wm3v3k+8q3o0BuAL8Al0E643Pq8AEXJ5gI+P3aKxoBFGSsNFcJabMEAqwfcY7gZoJMB0j4Ab4IzlNOKXYETAkrA03XDO8B+Bwh2rz3QKOcNbvI/n58v4i/5Q0Ur36xBbpFDAAAAABJRU5ErkJggg==',
      'base64'
    )
  );

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: `${APP_NAME} - Personal AI OS`, enabled: false },
    { type: 'separator' },
    { label: 'Neuer Gedanke', accelerator: 'CmdOrCtrl+Shift+N', click: () => showAndFocus('ideas/new') },
    { label: 'Quick Chat', accelerator: 'CmdOrCtrl+Shift+C', click: () => showAndFocus('chat') },
    { label: 'Suche', accelerator: 'CmdOrCtrl+K', click: () => showAndFocus('search') },
    { type: 'separator' },
    { label: 'Dashboard', click: () => showAndFocus('dashboard') },
    { label: 'Planer', click: () => showAndFocus('calendar') },
    { label: 'Email', click: () => showAndFocus('email') },
    { type: 'separator' },
    { label: 'Fenster anzeigen', click: () => mainWindow?.show() },
    { label: 'Beenden', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(APP_NAME);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

// ===========================
// Shortcuts & Navigation
// ===========================

function showAndFocus(page: string): void {
  if (!mainWindow) {
    createMainWindow();
  }
  mainWindow?.show();
  mainWindow?.focus();
  mainWindow?.webContents.send('navigate', page);
}

function registerShortcuts(): void {
  globalShortcut.register('CmdOrCtrl+Shift+Space', () => {
    showAndFocus('chat');
  });

  globalShortcut.register('CmdOrCtrl+Shift+K', () => {
    showAndFocus('search');
    mainWindow?.webContents.send('open-command-palette');
  });
}

// ===========================
// App Lifecycle
// ===========================

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers({
    getMainWindow,
    getConfig: () => null,
    setConfig: () => {},
    getBackendStatus: () => 'cloud',
    getBackendUrl: () => RAILWAY_ORIGIN,
    hideSpotlight: () => {},
    resizeSpotlight: () => {},
  });
  createAppMenu(getMainWindow);
  createMainWindow();
  createTray();
  registerShortcuts();
  initAutoUpdater(getMainWindow);

  console.log(`[${APP_NAME}] Desktop app ready (${isDev ? 'development' : 'production'})`);
  console.log(`[${APP_NAME}] Loading: ${FRONTEND_URL}`);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();

  if (tray) {
    tray.destroy();
    tray = null;
  }
});
