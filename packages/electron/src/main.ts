/**
 * ZenAI Electron Main Process
 *
 * Responsibilities:
 * - Create the main application window
 * - Start the Express backend as a child process
 * - Manage system tray, global shortcuts, native notifications
 * - Handle IPC communication with the renderer
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, shell } from 'electron';
import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { DEFAULT_API_PORT, DEFAULT_FRONTEND_PORT, APP_NAME } from '@zenai/shared';
import { registerIpcHandlers } from './ipc/handlers';
import { createAppMenu } from './menu';
import { initAutoUpdater } from './updater';

// ===========================
// State
// ===========================

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let backendProcess: ChildProcess | null = null;
let backendWatcher: fs.FSWatcher | null = null;

const isDev = !app.isPackaged;
const BACKEND_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_API_PORT;
const FRONTEND_URL = isDev
  ? `http://localhost:${DEFAULT_FRONTEND_PORT}`
  : `file://${path.join(__dirname, '../renderer/index.html')}`;

/**
 * Get the main window (used by IPC handlers, menu, updater)
 */
function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

// ===========================
// Backend Process
// ===========================

/**
 * Get the backend directory path.
 */
function getBackendDir(): string {
  return isDev
    ? path.resolve(__dirname, '../../../backend')
    : path.resolve(process.resourcesPath, 'backend');
}

/**
 * Find the system Node.js binary (not Electron's).
 * Uses PATH resolution which works cross-platform.
 */
function findNodeBin(): string {
  if (process.platform === 'win32') return 'node.exe';
  try {
    return execSync('which node', { encoding: 'utf-8' }).trim();
  } catch {
    return 'node';
  }
}

/**
 * Find npx binary for ts-node-dev.
 */
function findNpxBin(): string {
  if (process.platform === 'win32') return 'npx.cmd';
  try {
    return execSync('which npx', { encoding: 'utf-8' }).trim();
  } catch {
    return 'npx';
  }
}

/**
 * Start the Express backend as a spawned child process.
 * In dev mode: uses ts-node-dev with --respawn for auto-restart on file changes.
 * In production: uses the pre-built dist/main.js with system Node.js.
 */
function startBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const backendDir = getBackendDir();

    if (isDev) {
      // Dev mode: use ts-node-dev for auto-restart on backend file changes
      const npxBin = findNpxBin();
      console.log(`[Backend] Starting in dev mode with ts-node-dev (auto-reload)`);
      console.log(`[Backend] Working directory: ${backendDir}`);

      backendProcess = spawn(npxBin, [
        'ts-node-dev',
        '--respawn',
        '--transpile-only',
        '--clear',
        '--ignore-watch', 'node_modules',
        '--ignore-watch', '__tests__',
        '--ignore-watch', 'dist',
        'src/main.ts',
      ], {
        cwd: backendDir,
        env: {
          ...process.env,
          PORT: String(BACKEND_PORT),
          ELECTRON_MODE: 'true',
          NODE_ENV: 'development',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      // Production: use pre-built dist
      const nodeBin = findNodeBin();
      const backendEntry = path.join(backendDir, 'dist/main.js');
      console.log(`[Backend] Starting from: ${backendEntry}`);
      console.log(`[Backend] Using node: ${nodeBin}`);

      backendProcess = spawn(nodeBin, [backendEntry], {
        cwd: backendDir,
        env: {
          ...process.env,
          PORT: String(BACKEND_PORT),
          ELECTRON_MODE: 'true',
          NODE_ENV: 'production',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }

    // Detect backend readiness from stdout
    let resolved = false;
    backendProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      console.log(`[Backend] ${text}`);
      // Backend logs "Server:      http://localhost:XXXX" when ready
      if (!resolved && (text.includes('Server:') || text.includes('listening on') || text.includes('Server running'))) {
        resolved = true;
        console.log('[Backend] Server ready (detected from stdout)');
        resolve();
      }
      // ts-node-dev restart detection
      if (text.includes('Restarting:') || text.includes('[INFO] Restarting')) {
        console.log('[Backend] Restarting due to file change...');
      }
    });

    backendProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      // ts-node-dev outputs restart info to stderr
      if (text.includes('Restarting') || text.includes('Watching')) {
        console.log(`[Backend] ${text}`);
      } else {
        console.error(`[Backend] ${text}`);
      }
    });

    backendProcess.on('error', (err) => {
      console.error('[Backend] Process error:', err);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    backendProcess.on('exit', (code) => {
      console.log(`[Backend] Process exited with code ${code}`);
      backendProcess = null;
    });

    // Fallback: resolve after timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log('[Backend] Startup timeout - proceeding');
        resolve();
      }
    }, 15000);
  });
}

/**
 * Watch Electron main process source files for changes.
 * On change, recompile and restart Electron.
 */
function watchElectronSource(): void {
  if (!isDev) return;

  const electronSrcDir = path.resolve(__dirname, '../../../packages/electron/src');
  if (!fs.existsSync(electronSrcDir)) return;

  console.log(`[ZenAI] Watching Electron source: ${electronSrcDir}`);

  let debounceTimer: NodeJS.Timeout | null = null;
  backendWatcher = fs.watch(electronSrcDir, { recursive: true }, (event, filename) => {
    if (!filename?.endsWith('.ts')) return;

    // Debounce rapid changes
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`[ZenAI] Electron source changed: ${filename}`);
      console.log('[ZenAI] Recompiling... (restart Electron manually with Cmd+R or relaunch)');

      // Recompile TypeScript
      try {
        const electronDir = path.resolve(__dirname, '../../../packages/electron');
        execSync('npx tsc', { cwd: electronDir, encoding: 'utf-8' });
        console.log('[ZenAI] Recompile complete. Reloading window...');
        // Reload the renderer to pick up any preload changes
        mainWindow?.webContents.reload();
      } catch (err) {
        console.error('[ZenAI] Recompile failed:', err);
      }
    }, 500);
  });
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
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f1117',
    show: false,
  });

  mainWindow.loadURL(FRONTEND_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
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
  // Create a 16x16 tray icon (small Z placeholder - replace with actual icon)
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

/**
 * Show main window and navigate to a specific page
 */
function showAndFocus(page: string): void {
  if (!mainWindow) {
    createMainWindow();
  }
  mainWindow?.show();
  mainWindow?.focus();
  mainWindow?.webContents.send('navigate', page);
}

/**
 * Register global keyboard shortcuts
 */
function registerShortcuts(): void {
  // Quick chat (CmdOrCtrl+Space conflicts with Spotlight on macOS)
  globalShortcut.register('CmdOrCtrl+Shift+Space', () => {
    showAndFocus('chat');
  });

  // Quick search / command palette
  globalShortcut.register('CmdOrCtrl+Shift+K', () => {
    showAndFocus('search');
    mainWindow?.webContents.send('open-command-palette');
  });
}

// ===========================
// App Lifecycle
// ===========================

// Prevent multiple instances
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
  // Register IPC handlers
  registerIpcHandlers(getMainWindow);

  // Set up application menu
  createAppMenu(getMainWindow);

  // Start backend first
  try {
    await startBackend();
    console.log(`[${APP_NAME}] Backend started on port ${BACKEND_PORT}`);
  } catch (err) {
    console.error(`[${APP_NAME}] Failed to start backend:`, err);
  }

  // Create UI
  createMainWindow();
  createTray();
  registerShortcuts();

  // Initialize auto-updater (production only)
  initAutoUpdater(getMainWindow);

  // Watch Electron source for changes in dev mode
  watchElectronSource();

  console.log(`[${APP_NAME}] Desktop app ready (${isDev ? 'development' : 'production'})`);

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

  if (backendWatcher) {
    backendWatcher.close();
    backendWatcher = null;
  }

  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }

  if (tray) {
    tray.destroy();
    tray = null;
  }
});
