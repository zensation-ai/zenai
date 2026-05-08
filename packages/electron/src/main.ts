/**
 * ZenAI Electron Main Process — Cloud Shell
 *
 * Loads the Vercel-hosted frontend in a native desktop window.
 * Provides: System Tray, Spotlight Overlay, Global Shortcuts,
 * Native Notifications, Screen Memory, Menubar-Only Mode,
 * Auto-Updates via GitHub Releases.
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut } from 'electron';
import { registerIpcHandlers } from './ipc/handlers';
import { createAppMenu } from './menu';
import { initAutoUpdater } from './updater';
import { createMainWindow, getMainWindow, showAndFocus } from './windows/main-window';
import {
  createSpotlightWindow,
  toggleSpotlight,
  hideSpotlight,
  resizeSpotlight,
} from './windows/spotlight-window';
import { bindTray, setTrayStatus, destroyTrayManager } from './tray/tray-manager';
import { handleDeepLink } from './deep-link';

// ===========================
// Constants
// ===========================

const APP_NAME = 'ZenAI';
const PRODUCTION_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const DEV_URL = 'http://localhost:5173';
const VERCEL_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';
const RAILWAY_ORIGIN = process.env.API_URL || 'http://localhost:3000';

// ===========================
// State
// ===========================

let tray: Tray | null = null;
let runInBackground = false;

const isDev = !app.isPackaged;
const FRONTEND_URL = isDev ? DEV_URL : PRODUCTION_URL;

// ===========================
// System Tray
// ===========================

/**
 * Create system tray with quick actions and menubar-only toggle.
 */
function createTray(): void {
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADgSURBVDiN1ZMxCsJAEEX/7hqwUKzEwsZCbATBwsrK3kN4Aa/gQTyBZ/AGNjbewMI7KIhEENFCi6yskmhi1sUPw8B882dmB0KI/5bK80CShEqJmLGNjCNsHbDW4OaAXSCL8dqAZcK8BXfNfgOKEi8S1hBqH3D1Uf3IAI7+0JuaUgImpqQC+wm3v3k+8q3o0BuAL8Al0E643Pq8AEXJ5gI+P3aKxoBFGSsNFcJabMEAqwfcY7gZoJMB0j4Ab4IzlNOKXYETAkrA03XDO8B+Bwh2rz3QKOcNbvI/n58v4i/5Q0Ur36xBbpFDAAAAABJRU5ErkJggg==',
      'base64'
    )
  );

  tray = new Tray(icon);
  bindTray(tray);

  rebuildTrayMenu();

  tray.setToolTip(APP_NAME);

  tray.on('click', () => {
    const win = getMainWindow();
    if (win) {
      win.isVisible() ? win.hide() : win.show();
    } else {
      ensureMainWindow();
    }
  });
}

/**
 * Rebuild the tray context menu (called when runInBackground toggles).
 */
function rebuildTrayMenu(): void {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    { label: APP_NAME, enabled: false },
    { type: 'separator' },
    {
      label: 'Quick Chat',
      accelerator: 'CmdOrCtrl+Shift+Space',
      click: () => toggleSpotlight(),
    },
    {
      label: 'Neue Idee',
      accelerator: 'CmdOrCtrl+Shift+N',
      click: () => { ensureMainWindow(); showAndFocus('ideas/new'); },
    },
    {
      label: 'Suche',
      accelerator: 'CmdOrCtrl+Shift+K',
      click: () => {
        ensureMainWindow();
        showAndFocus('search');
        getMainWindow()?.webContents.send('open-command-palette');
      },
    },
    { type: 'separator' },
    {
      label: 'Fenster oeffnen',
      click: () => { ensureMainWindow(); getMainWindow()?.show(); },
    },
    {
      label: 'Im Hintergrund laufen',
      type: 'checkbox',
      checked: runInBackground,
      click: (menuItem) => {
        runInBackground = menuItem.checked;
      },
    },
    { type: 'separator' },
    {
      label: 'Beenden',
      accelerator: 'CmdOrCtrl+Q',
      click: () => {
        runInBackground = false; // ensure quit actually quits
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// ===========================
// Window Helpers
// ===========================

/**
 * Ensure the main window exists; create if destroyed.
 */
function ensureMainWindow(): void {
  if (!getMainWindow()) {
    createMainWindow({
      frontendUrl: FRONTEND_URL,
      vercelOrigin: VERCEL_ORIGIN,
      railwayOrigin: RAILWAY_ORIGIN,
      isDev,
    });
  }
}

// ===========================
// Deep Linking
// ===========================

app.setAsDefaultProtocolClient('zenai');

const deepLinkDeps = { ensureMainWindow };

// ===========================
// Shortcuts
// ===========================

function registerShortcuts(): void {
  // Spotlight overlay toggle (replaces old showAndFocus('chat'))
  globalShortcut.register('CmdOrCtrl+Shift+Space', () => {
    toggleSpotlight();
  });

  globalShortcut.register('CmdOrCtrl+Shift+N', () => {
    ensureMainWindow();
    showAndFocus('ideas/new');
  });

  globalShortcut.register('CmdOrCtrl+Shift+K', () => {
    ensureMainWindow();
    showAndFocus('search');
    getMainWindow()?.webContents.send('open-command-palette');
  });
}

// ===========================
// App Lifecycle
// ===========================

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // Windows/Linux: deep links arrive via argv
    const deepLink = argv.find(arg => arg.startsWith('zenai://'));
    if (deepLink) {
      handleDeepLink(deepLink, deepLinkDeps);
      return;
    }

    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
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
    hideSpotlight,
    resizeSpotlight,
    setTrayStatus: setTrayStatus as (status: string) => void,
  });

  createAppMenu(() => getMainWindow());
  ensureMainWindow();
  createSpotlightWindow();
  createTray();
  registerShortcuts();
  initAutoUpdater(getMainWindow);

  console.log(`[${APP_NAME}] Desktop app ready (${isDev ? 'development' : 'production'})`);
  console.log(`[${APP_NAME}] Loading: ${FRONTEND_URL}`);

  // macOS: deep links via open-url
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url, deepLinkDeps);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      ensureMainWindow();
    } else {
      getMainWindow()?.show();
    }
  });
});

// Menubar-only mode: hide to tray instead of quitting on macOS
app.on('window-all-closed', () => {
  if (process.platform === 'darwin' && runInBackground) {
    // Stay alive in tray — don't quit
    return;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Intercept main window close when running in background
app.on('browser-window-created', (_event, window) => {
  window.on('close', (e) => {
    if (runInBackground && window === getMainWindow()) {
      e.preventDefault();
      window.hide();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  destroyTrayManager();

  if (tray) {
    tray.destroy();
    tray = null;
  }
});
