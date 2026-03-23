# ZenAI Desktop — Cloud-Connected Native Shell

**Date:** 2026-03-23
**Status:** Approved
**Author:** Claude + Alexander Bering

## Overview

Transform the existing Electron app from a self-hosted architecture (bundled backend + frontend) into a lightweight cloud-connected native shell that loads the production Vercel frontend and provides native desktop features.

## Architecture

```
┌─────────────────────────────────────┐
│  Electron Shell (ZenAI.app, ~100MB) │
│  ┌───────────────────────────────┐  │
│  │  BrowserWindow                │  │
│  │  Production: Vercel Frontend  │  │
│  │  Dev: localhost:5173          │  │
│  └───────────────────────────────┘  │
│                                     │
│  Native Features:                   │
│  • System Tray + Quick Actions      │
│  • Global Shortcuts (Cmd+Shift+Space│
│  • Native OS Notifications          │
│  • Screen Memory (100% local)       │
│  • macOS Menu Bar (German)          │
│  • Auto-Updater (GitHub Releases)   │
│  • Single Instance Lock             │
└─────────────────────────────────────┘
         │
         ▼
  Vercel Frontend ──► Railway Backend ──► Supabase
  (frontend-mu-six-93.vercel.app)  (ki-ab-production.up.railway.app)
```

## Changes from Current Implementation

### Remove: Backend Spawning
- Delete `startBackend()`, `findNodeBin()`, `findNpxBin()`, `watchElectronSource()` from `main.ts`
- Remove `backendProcess`, `backendWatcher` state variables
- Remove `BACKEND_PORT` constant (no longer used)
- Remove `child_process` and `fs` watch imports
- Remove `backendWatcher` cleanup block in `will-quit` handler

### Remove: `@zenai/shared` dependency
The only import used from `@zenai/shared` is `APP_NAME`, `DEFAULT_API_PORT`, and `DEFAULT_FRONTEND_PORT`. After removing backend spawning:
- `DEFAULT_API_PORT` and `BACKEND_PORT` are dead code
- `DEFAULT_FRONTEND_PORT` can be hardcoded (`5173`)
- `APP_NAME` can be hardcoded (`'ZenAI'`)

This eliminates the workspace dependency entirely, avoiding `workspace:*` resolution issues in electron-builder.

### Change: Production Frontend URL
```typescript
const PRODUCTION_URL = 'https://frontend-mu-six-93.vercel.app';
const FRONTEND_URL = !app.isPackaged
  ? 'http://localhost:5173'
  : PRODUCTION_URL;
```

### Change: electron-builder.yml
Remove bundled frontend/backend from `extraResources`:
```yaml
# Remove entirely:
extraResources:
  - from: "../../frontend/dist"
    to: "renderer"
  - from: "../../backend/dist"
    to: "backend/dist"

# Keep separate repo for clean auto-updates:
publish:
  provider: github
  owner: Alexander-Bering
  repo: zenai-desktop
```

### Change: OAuth Popup Handling
The existing `windowOpenHandler` opens ALL http/https URLs in the system browser. This breaks OAuth popups (Google, Microsoft, GitHub). Fix:
```typescript
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  const vercelOrigin = 'https://frontend-mu-six-93.vercel.app';
  const railwayOrigin = 'https://ki-ab-production.up.railway.app';
  // Allow OAuth popups from our own origins
  if (url.startsWith(vercelOrigin) || url.startsWith(railwayOrigin)) {
    return { action: 'allow' };
  }
  // External links open in default browser
  if (url.startsWith('http://') || url.startsWith('https://')) {
    shell.openExternal(url);
  }
  return { action: 'deny' };
});
```

### Add: App Icon
Generate a minimalist "Z" icon in ZenAI brand colors:
- `resources/icon.png` (1024x1024, source)
- `resources/icon.icns` (macOS, generated via `png2icons` or `iconutil`)
- `resources/icon.ico` (Windows, generated via `png2icons`)

### Add: Offline Fallback
When the app can't reach the Vercel URL, show a minimal offline page. Guard against non-fatal navigation errors:
```typescript
mainWindow.webContents.on('did-fail-load', (_event, errorCode, _desc, _url, isMainFrame) => {
  // Only handle main frame failures, ignore aborted navigations (-3)
  if (isMainFrame && errorCode !== -3) {
    mainWindow.loadFile(path.join(__dirname, 'offline.html'));
  }
});
```

**File location:** `offline.html` must be in `src/` and copied to `dist/` during build. Add to `package.json` build script:
```json
"build": "tsc && cp src/offline.html dist/"
```

### Security: Sandbox Mode
With remote URL loading, enable sandbox for security:
```typescript
webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,  // Changed from false — safer with remote URLs
}
```

## Auto-Update Strategy

### Provider: GitHub Releases on separate `zenai-desktop` repo

Keep the existing `zenai-desktop` repo config (not the main KI-AB repo) to avoid tag/release conflicts with backend/frontend releases. `electron-updater` uses `latest-mac.yml` artifacts — mixing desktop and non-desktop releases in one repo causes update failures.

### Update Flow
1. App starts → 10s delay → `checkForUpdatesAndNotify()`
2. Checks GitHub API: `GET /repos/Alexander-Bering/zenai-desktop/releases/latest`
3. Compares `version` in `package.json` with release tag
4. If newer: downloads `.zip` (macOS) or `.exe` (Windows) in background
5. Shows notification: "Update verfuegbar"
6. Installs on next app quit (`autoInstallOnAppQuit: true`)

### Publishing a Release
```bash
cd packages/electron
npm version patch  # bumps version
npm run package:mac  # builds .dmg + .zip
# Create GitHub Release on zenai-desktop repo, upload .dmg + .zip + latest-mac.yml
```

Future: GitHub Actions workflow to automate this on tag push.

## Build Outputs

| Platform | Format | Auto-Update Format |
|----------|--------|--------------------|
| macOS | `.dmg` (installer) | `.zip` + `latest-mac.yml` |
| Windows | `.exe` (NSIS) + portable | `.exe` + `latest.yml` (block-map delta) |
| Linux | `.AppImage` + `.deb` | `.AppImage` + `latest-linux.yml` |

## Files to Modify

| File | Action | Details |
|------|--------|---------|
| `packages/electron/src/main.ts` | Modify | Remove backend spawning, inline constants, change production URL, fix OAuth handler, enable sandbox |
| `packages/electron/electron-builder.yml` | Modify | Remove extraResources, keep zenai-desktop publish config |
| `packages/electron/package.json` | Modify | Remove `@zenai/shared` dependency, update build script |
| `packages/electron/resources/icon.png` | Create | 1024x1024 app icon |
| `packages/electron/resources/icon.icns` | Create | macOS icon (from PNG) |
| `packages/electron/resources/icon.ico` | Create | Windows icon (from PNG) |
| `packages/electron/src/offline.html` | Create | Minimal offline fallback page |

## Files Unchanged

- `packages/electron/src/preload.ts` — IPC bridge stays the same
- `packages/electron/src/menu.ts` — Native menu stays the same (will inline APP_NAME)
- `packages/electron/src/updater.ts` — Auto-updater stays the same
- `packages/electron/src/ipc/handlers.ts` — IPC handlers stay the same
- `packages/electron/src/screen-memory/capture-service.ts` — Screen memory stays local

## Known Gaps (Out of Scope)

- Screen Memory IPC handlers (`screen-memory:isEnabled`, `toggle`, `search`) are exposed in preload but have no `ipcMain.handle()` — pre-existing, not introduced by this change
- Browser tab IPC handlers (`browser:openTab`, `closeTab`, `getActiveTab`) are stubs — pre-existing
- `menu.ts` imports `APP_NAME` from `@zenai/shared` — must be inlined too

## Success Criteria

1. `npm run package:mac` produces a working `.dmg`
2. App opens and shows the Vercel frontend
3. System tray, menu, and shortcuts work
4. Offline fallback page shows when no internet
5. Auto-updater checks GitHub releases (no errors in console)
6. OAuth popups from Vercel/Railway origins work correctly
