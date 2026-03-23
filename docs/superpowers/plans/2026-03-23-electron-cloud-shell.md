# ZenAI Desktop — Cloud Shell Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Electron desktop app from a self-hosted architecture to a cloud-connected shell that loads the Vercel frontend, with auto-updates via GitHub Releases.

**Architecture:** Electron BrowserWindow loads `https://frontend-mu-six-93.vercel.app` in production. No local backend. Native features (tray, menu, shortcuts, screen memory) remain. Auto-updates via `electron-updater` + GitHub Releases on `Alexander-Bering/zenai-desktop`.

**Tech Stack:** Electron 41, electron-builder 25, electron-updater 6, TypeScript 5

**Spec:** `docs/superpowers/specs/2026-03-23-electron-cloud-shell-design.md`

---

## Chunk 1: Strip Backend & Inline Constants

### Task 1: Simplify main.ts — Remove backend spawning and inline constants

**Files:**
- Modify: `packages/electron/src/main.ts`

- [ ] **Step 1: Rewrite main.ts**

Replace the entire file with the cloud-shell version. This removes:
- All backend spawning code (`startBackend`, `findNodeBin`, `findNpxBin`, `getBackendDir`, `watchElectronSource`)
- `@zenai/shared` import (inline `APP_NAME = 'ZenAI'`)
- `backendProcess`, `backendWatcher`, `BACKEND_PORT` state
- `child_process`, `fs` imports
- Backend watcher cleanup in `will-quit`

And adds:
- `PRODUCTION_URL` constant pointing to Vercel
- Offline fallback with guarded `did-fail-load`
- OAuth-aware `windowOpenHandler`
- `sandbox: true` in webPreferences

```typescript
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
const PRODUCTION_URL = 'https://frontend-mu-six-93.vercel.app';
const DEV_URL = 'http://localhost:5173';
const VERCEL_ORIGIN = 'https://frontend-mu-six-93.vercel.app';
const RAILWAY_ORIGIN = 'https://ki-ab-production.up.railway.app';

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
  registerIpcHandlers(getMainWindow);
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/electron && npx tsc --noEmit`
Expected: 0 errors (may fail on `@zenai/shared` import in menu.ts — fixed in Task 2)

- [ ] **Step 3: Commit**

```bash
git add packages/electron/src/main.ts
git commit -m "feat(electron): convert to cloud shell, remove backend spawning"
```

---

### Task 2: Inline APP_NAME in menu.ts and remove @zenai/shared dependency

**Files:**
- Modify: `packages/electron/src/menu.ts`
- Modify: `packages/electron/package.json`

- [ ] **Step 1: Replace @zenai/shared import in menu.ts**

Replace line 8:
```typescript
// Before:
import { APP_NAME } from '@zenai/shared';

// After:
const APP_NAME = 'ZenAI';
```

- [ ] **Step 2: Remove @zenai/shared from package.json dependencies**

```json
{
  "dependencies": {
    "electron-updater": "^6.3.0"
  }
}
```

Also update build script to copy offline.html:
```json
{
  "scripts": {
    "build": "tsc && cp src/offline.html dist/",
    "dev": "tsc && cp src/offline.html dist/ && electron .",
    "clean": "rm -rf dist out",
    "typecheck": "tsc --noEmit",
    "package:mac": "tsc && cp src/offline.html dist/ && electron-builder --mac",
    "package:win": "tsc && cp src/offline.html dist/ && electron-builder --win",
    "package:linux": "tsc && cp src/offline.html dist/ && electron-builder --linux",
    "package:all": "tsc && cp src/offline.html dist/ && electron-builder --mac --win --linux"
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/electron && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add packages/electron/src/menu.ts packages/electron/package.json
git commit -m "feat(electron): inline APP_NAME, remove @zenai/shared dependency"
```

---

### Task 3: Update electron-builder.yml

**Files:**
- Modify: `packages/electron/electron-builder.yml`

- [ ] **Step 1: Remove extraResources, add offline.html to files**

```yaml
appId: ai.zensation.zenai
productName: ZenAI
copyright: "© 2026 Alexander Bering / ZenSation Enterprise Solutions"

directories:
  buildResources: resources
  output: out

files:
  - dist/**/*
  - "!**/*.map"

mac:
  target:
    - dmg
    - zip
  category: public.app-category.productivity
  icon: resources/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: resources/entitlements.mac.plist
  entitlementsInherit: resources/entitlements.mac.plist

win:
  target:
    - nsis
    - portable
  icon: resources/icon.ico

linux:
  target:
    - AppImage
    - deb
  category: Office
  icon: resources/icon.png

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true

publish:
  provider: github
  owner: Alexander-Bering
  repo: zenai-desktop
```

- [ ] **Step 2: Commit**

```bash
git add packages/electron/electron-builder.yml
git commit -m "feat(electron): remove bundled frontend/backend from build config"
```

---

## Chunk 2: Offline Page + App Icon + Build

### Task 4: Create offline fallback page

**Files:**
- Create: `packages/electron/src/offline.html`

- [ ] **Step 1: Create offline.html**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZenAI — Offline</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: #0f1117;
      color: #e4e4e7;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      -webkit-app-region: drag;
    }
    .container {
      text-align: center;
      max-width: 400px;
      padding: 2rem;
      -webkit-app-region: no-drag;
    }
    .icon {
      font-size: 4rem;
      margin-bottom: 1.5rem;
      opacity: 0.6;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      background: linear-gradient(135deg, #818cf8, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    p {
      color: #a1a1aa;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    button {
      background: rgba(129, 140, 248, 0.15);
      border: 1px solid rgba(129, 140, 248, 0.3);
      color: #818cf8;
      padding: 0.75rem 2rem;
      border-radius: 8px;
      font-size: 0.95rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    button:hover {
      background: rgba(129, 140, 248, 0.25);
      border-color: rgba(129, 140, 248, 0.5);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">Z</div>
    <h1>Keine Verbindung</h1>
    <p>ZenAI benoetigt eine Internetverbindung. Bitte ueberpruefen Sie Ihre Netzwerkeinstellungen.</p>
    <button onclick="window.location.reload()">Erneut versuchen</button>
  </div>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add packages/electron/src/offline.html
git commit -m "feat(electron): add offline fallback page"
```

---

### Task 5: Generate app icons

**Files:**
- Create: `packages/electron/resources/icon.png` (1024x1024)
- Create: `packages/electron/resources/icon.icns` (macOS)
- Create: `packages/electron/resources/icon.ico` (Windows)

- [ ] **Step 1: Install png2icons**

Run: `npm install -g png2icons` (or use `npx`)

- [ ] **Step 2: Generate icon.png programmatically**

Create a Node.js script to generate the icon using Canvas API, or use a pre-made 1024x1024 PNG with a "Z" logo on a dark gradient background (#0f1117 to #1e1b4b with an indigo "Z" in #818cf8).

Alternative: Use ImageMagick if available:
```bash
cd packages/electron/resources
convert -size 1024x1024 \
  -define gradient:angle=135 \
  gradient:'#1e1b4b-#0f1117' \
  -font Helvetica-Bold -pointsize 600 \
  -fill '#818cf8' -gravity center \
  -annotate 0 'Z' \
  icon.png
```

If ImageMagick is not available, create a simple icon using a Python or Node.js script, or use the built-in Electron `nativeImage` approach.

- [ ] **Step 3: Generate icns and ico from PNG**

```bash
cd packages/electron/resources

# macOS .icns
mkdir icon.iconset
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
rm -rf icon.iconset

# Windows .ico (use png2icons or ImageMagick)
npx png2icons icon.png icon -icow
# or: convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

- [ ] **Step 4: Verify all three icon files exist**

Run: `ls -la packages/electron/resources/icon.*`
Expected: `icon.png`, `icon.icns`, `icon.ico` all present

- [ ] **Step 5: Commit**

```bash
git add packages/electron/resources/icon.png packages/electron/resources/icon.icns packages/electron/resources/icon.ico
git commit -m "feat(electron): add app icons for all platforms"
```

---

### Task 6: Install dependencies and build the .dmg

**Files:**
- None (build step only)

- [ ] **Step 1: Install Electron dependencies**

Run: `cd packages/electron && npm install`
Expected: `node_modules/` created with `electron`, `electron-builder`, `electron-updater`

- [ ] **Step 2: Build TypeScript + copy offline.html**

Run: `cd packages/electron && npm run build`
Expected: `dist/` created with `main.js`, `preload.js`, `menu.js`, `updater.js`, `offline.html`, `ipc/handlers.js`, `screen-memory/capture-service.js`

- [ ] **Step 3: Package macOS .dmg**

Run: `cd packages/electron && npm run package:mac`
Expected: `out/` directory with `ZenAI-2.0.0.dmg` and `ZenAI-2.0.0-mac.zip`

Note: First run may take several minutes to download Electron binaries.
Note: If code signing fails (no Apple Developer cert), add `"mac": { "identity": null }` to skip signing for local testing.

- [ ] **Step 4: Test the built app**

Open the .dmg:
```bash
open packages/electron/out/ZenAI-2.0.0.dmg
```

Verify:
1. App opens and shows the Vercel frontend
2. System tray icon appears
3. Menu bar has German labels
4. Cmd+Shift+Space opens chat
5. Cmd+Shift+K opens command palette
6. Disconnect WiFi → reload → offline page appears
7. Reconnect WiFi → click "Erneut versuchen" → frontend loads

- [ ] **Step 5: Commit any build fixes**

```bash
git add -A
git commit -m "feat(electron): working macOS build"
```
