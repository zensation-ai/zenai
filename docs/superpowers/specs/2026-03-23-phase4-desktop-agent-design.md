# Phase 4: Desktop Agent — Design Spec

> **Created:** 2026-03-23
> **Masterplan Phase:** 4 of 8 (Desktop Agent)
> **Status:** Design approved
> **Goal:** Full rewrite of `packages/electron/` as a Raycast-style Desktop Agent with spotlight popup, native notifications, hybrid backend, and configurable dock/menubar mode.

---

## Problem

The existing Electron package (`packages/electron/`) is a monolithic 420-line `main.ts` with zero tests. It only provides a full-window wrapper around the web app. There's no quick-capture experience, no native notifications from backend events, and no menubar-only mode. Users must open the full app for every interaction — no lightweight "ask ZenAI from anywhere" experience.

## Solution

Rewrite the Electron package with modular architecture. Two window types: a **Spotlight popup** (Cmd+Shift+Space) for quick interactions and the **full app window** for deep work. **Hybrid backend** (cloud-first, local fallback). **Native notifications** from SSE streams. **Configurable dock/menubar mode**.

---

## Architecture

```
packages/electron/
  src/
    main.ts                    # < 30 lines: init modules, start app
    app.ts                     # App lifecycle (ready, quit, second-instance)
    config.ts                  # Validated config (URLs, ports, shortcuts)
    windows/
      main-window.ts           # Full app window (BrowserWindow)
      spotlight-window.ts      # Floating spotlight popup (frameless)
      window-manager.ts        # Coordinates windows, show/hide/focus
    tray/
      tray-manager.ts          # System tray icon + context menu
    shortcuts/
      shortcut-manager.ts      # Global keyboard shortcuts registration
    backend/
      backend-bridge.ts        # Cloud + local backend connection manager
      local-backend.ts         # Child process spawning for local backend
      health-checker.ts        # Backend health polling (/api/health)
    notifications/
      notification-service.ts  # SSE → native Electron notifications
    ipc/
      handlers.ts              # IPC handlers (file dialog, window mgmt, etc.)
    menu/
      app-menu.ts              # Native macOS/Windows menu bar
    preload.ts                 # contextBridge API for renderer
    updater.ts                 # Auto-update via electron-updater
  __tests__/
    windows/
      spotlight-window.test.ts
      main-window.test.ts
      window-manager.test.ts
    backend/
      backend-bridge.test.ts
      health-checker.test.ts
    notifications/
      notification-service.test.ts
    shortcuts/
      shortcut-manager.test.ts
    tray/
      tray-manager.test.ts
    config.test.ts
    app.test.ts
```

---

## Module Specifications

### 1. `main.ts` (< 30 lines)

Entry point. Imports `ZenAIApp` from `app.ts`, creates instance, calls `start()`. No business logic.

### 2. `config.ts`

Centralized configuration with defaults and environment overrides.

```typescript
interface AppConfig {
  cloudBackendUrl: string;       // default: 'https://ki-ab-production.up.railway.app'
  localBackendPort: number;      // default: 3000
  spotlightShortcut: string;     // default: 'CmdOrCtrl+Shift+Space'
  searchShortcut: string;        // default: 'CmdOrCtrl+Shift+K'
  dockMode: 'menubar' | 'dock';  // default: 'menubar'
  healthCheckInterval: number;   // default: 30000 (ms)
  frontendDevPort: number;       // default: 5173
  activeContext: 'personal' | 'work' | 'learning' | 'creative'; // default: 'personal'
  localBackendStartupTimeout: number; // default: 15000 (ms)
}
```

Persisted via `electron-store` (new dependency). Environment variables override stored values.

### 3. `app.ts` — ZenAIApp class

Orchestrates all modules. Lifecycle:

1. `requestSingleInstanceLock()` — prevent duplicates
2. `app.whenReady()` → init all modules in order:
   - Config load
   - BackendBridge start (cloud health check → fallback to local)
   - IPC handlers register
   - WindowManager init (creates main window on demand)
   - TrayManager init
   - ShortcutManager register
   - AppMenu set
   - NotificationService start (SSE subscription)
   - AutoUpdater init
3. `app.on('will-quit')` → cleanup all modules
4. `app.on('activate')` → show/create main window (macOS)

### 4. `windows/spotlight-window.ts`

Frameless, always-on-top popup window.

**Properties:**
- Width: 680px, Height: 72px initial (grows to 400px with results)
- Position: centered horizontally, 20% from screen top
- Frameless (`frame: false`), transparent (`transparent: true`)
- Always on top (`alwaysOnTop: true`)
- Not in taskbar (`skipTaskbar: true`)
- Rounded corners via CSS on the frontend page
- `vibrancy: 'under-window'` on macOS for native blur

**Behavior:**
- Created once on app start, hidden by default
- `toggle()` — shows if hidden, hides if visible
- `hide()` — on Escape key or window blur
- Loads `/spotlight` route from frontend (or cloud URL + `/spotlight`)
- Sends `spotlight:show` / `spotlight:hide` IPC events to renderer

**Frontend requirement (out of scope for Electron):** A `/spotlight` page in the React app that renders a search input with quick actions and inline chat results. This is deferred to a follow-up frontend task.

### 5. `windows/main-window.ts`

Full application window. Same as current implementation but extracted into a class.

**Properties:**
- Width: 1400, Height: 900, minWidth: 800, minHeight: 600
- Hidden title bar (`titleBarStyle: 'hiddenInset'` on macOS)
- Traffic light position: `{ x: 16, y: 16 }`
- Background: `#0f1117`
- Preload script

**Methods:**
- `create()` — creates window, loads frontend URL
- `show()` / `hide()` / `focus()`
- `navigateTo(page: string)` — sends IPC navigate event
- `isVisible(): boolean`

### 6. `windows/window-manager.ts`

Coordinates spotlight and main window.

**Methods:**
- `showSpotlight()` / `hideSpotlight()` / `toggleSpotlight()`
- `showMainWindow()` / `hideMainWindow()`
- `showAndNavigate(page: string)` — show main window + navigate
- `focusOrCreate()` — focus existing or create new main window

### 7. `tray/tray-manager.ts`

System tray icon with context menu.

**Menu items:**
- App name (disabled label)
- Separator
- "Neuer Gedanke" → `showAndNavigate('ideas/new')` (no accelerator — display-only label)
- "Quick Chat" → `showAndNavigate('chat')` (no accelerator — display-only label)
- "Suche" → `showAndNavigate('search')` (no accelerator — display-only label)
- Separator
- "Dashboard" → `showAndNavigate('dashboard')`
- "Planer" → `showAndNavigate('calendar')`
- "Email" → `showAndNavigate('email')`
- Separator
- "Fenster anzeigen" → `showMainWindow()`
- "Beenden" → `app.quit()`

**Tray click:** Toggle main window visibility (show/hide).

### 8. `shortcuts/shortcut-manager.ts`

Global keyboard shortcuts.

| Shortcut | Action |
|----------|--------|
| `CmdOrCtrl+Shift+Space` | Toggle spotlight |
| `CmdOrCtrl+Shift+K` | Show main window + open command palette |

**Methods:**
- `register()` — register all shortcuts
- `unregister()` — unregister all (on will-quit)

### 9. `backend/backend-bridge.ts`

Manages connection to backend (cloud or local).

**State machine:**
- `cloud_connected` — cloud backend healthy
- `cloud_checking` — checking cloud health
- `local_starting` — spawning local backend
- `local_connected` — local backend healthy
- `disconnected` — no backend available

**Logic:**
1. On start: set state `cloud_checking`, check cloud health (`GET /api/health`, 5s timeout)
2. If cloud healthy → `cloud_connected`, start HealthChecker (30s interval)
3. If cloud unreachable → set state `local_starting`, spawn local backend via `LocalBackend`
4. Local startup has `localBackendStartupTimeout` (default 15s). If stdout contains `"Server"`, `"listening on"`, or `"Server running"` → `local_connected`.
5. If local startup times out or process exits with error → `disconnected`. No automatic retry. Emits `error` event with reason.
6. HealthChecker polls every 30s. If cloud comes back → switch to `cloud_connected`, kill local process.
7. If HealthChecker detects cloud went down while in `cloud_connected` → attempt local fallback (step 3).

**Methods:**
- `getBaseUrl(): string` — returns current backend URL (cloud or local)
- `getStatus(): BackendStatus` — returns current state
- `start(): Promise<void>` — runs the connection logic above
- `stop(): Promise<void>` — kills local process if running, stops health checker
- Events: `statusChange(oldStatus, newStatus)`, `error(reason: string)`

### 10. `backend/local-backend.ts`

Spawns Express backend as child process. Extracted from current `startBackend()` in `main.ts`.

**Ready signal detection:** Watches stdout for `"Server"`, `"listening on"`, or `"Server running"`. Resolves promise when detected.

**Timeout:** Configurable via `localBackendStartupTimeout` (default 15s). If no ready signal within timeout, rejects with error.

**Dev vs Production:**
- Dev: spawns `npx ts-node-dev --respawn --transpile-only src/main.ts` in backend dir
- Production: spawns system `node` with `backend/dist/main.js`

**Methods:**
- `start(timeoutMs: number): Promise<void>` — spawn process, wait for ready signal or timeout
- `stop(): Promise<void>` — kill process (SIGTERM, then SIGKILL after 5s)
- `isRunning(): boolean`

### 11. `backend/health-checker.ts`

Polls backend health endpoint at configurable interval.

**Constructor:** `new HealthChecker(url: string, intervalMs: number)`

**Events (EventEmitter):**
- `healthy` — backend responded OK
- `unhealthy` — backend unreachable or error
- `statusChange` — transition between healthy/unhealthy

**Methods:**
- `start()` / `stop()`
- `checkNow(): Promise<boolean>`

### 12. `notifications/notification-service.ts`

Subscribes to SSE streams from backend and shows native notifications.

**Active context:** Reads `activeContext` from AppConfig (default: `'personal'`). When user switches context in the frontend, the renderer calls `config:set('activeContext', ctx)` which triggers `reconnect()`.

**SSE endpoints (context-aware):**
- `/api/{activeContext}/smart-suggestions/stream` — suggestion notifications
- `/api/{activeContext}/proactive-engine/stream` — proactive AI notifications

**Behavior:**
- Connects to SSE streams using `eventsource` npm package (Node.js has no native EventSource)
- Maps events to `Notification` objects with title/body
- Click handler: show main window + navigate to relevant page
- Reconnects on disconnect (5s delay, max 3 retries then stop)
- Respects system DND (check before showing)
- Listens for `activeContext` config changes → auto-reconnect to new context

**Methods:**
- `start(backendUrl: string, context: string)` — connect to SSE streams for given context
- `stop()` — close connections
- `reconnect(backendUrl: string, context?: string)` — reconnect after backend switch or context change

### 13. `ipc/handlers.ts`

Same as current implementation plus new handlers. Full list:
- `show-notification` — show native notification (ipcMain.on)
- `dialog:openFile` — file open dialog (ipcMain.handle)
- `dialog:saveFile` — file save dialog (ipcMain.handle)
- `window:minimize/maximize/close` — window management (ipcMain.on)
- `shell:openExternal` — open URL in default browser (ipcMain.handle)
- `app:getVersion` — return app version (ipcMain.handle)
- `app:getPath` — return app path (ipcMain.handle)
- `config:get/set` — read/write electron-store config (ipcMain.handle)
- `backend:getStatus` — return backend connection status (ipcMain.handle)
- `backend:getUrl` — return current backend base URL (ipcMain.handle)
- `spotlight:close` — hide spotlight window (ipcMain.on)
- `spotlight:resize` — resize spotlight window height (ipcMain.on)

### 14. `menu/app-menu.ts`

Same as current implementation but extracted to module. German labels. Navigation shortcuts Cmd+1-7.

### 15. `preload.ts`

Extended contextBridge API:

```typescript
const electronAPI = {
  // Existing
  platform: process.platform,
  isElectron: true,
  onNavigate: (cb) => ...,
  showNotification: (title, body) => ...,
  openFile: () => ...,
  saveFile: (data, filename) => ...,
  minimize: () => ...,
  maximize: () => ...,
  close: () => ...,
  openExternal: (url) => ...,
  getVersion: () => ...,
  onOpenCommandPalette: (cb) => ...,
  onUpdateAvailable: (cb) => ...,
  onUpdateProgress: (cb) => ...,
  onUpdateDownloaded: (cb) => ...,

  // New
  config: {
    get: (key) => ipcRenderer.invoke('config:get', key),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
  },
  backend: {
    getStatus: () => ipcRenderer.invoke('backend:getStatus'),
    getUrl: () => ipcRenderer.invoke('backend:getUrl'),
  },
  spotlight: {
    onShow: (cb) => ipcRenderer.on('spotlight:show', cb),
    onHide: (cb) => ipcRenderer.on('spotlight:hide', cb),
    close: () => ipcRenderer.send('spotlight:close'),
    resize: (height) => ipcRenderer.send('spotlight:resize', height),
  },
};
```

### 16. App Modes (Dock vs Menubar)

- **Menubar mode (default):** `app.dock.hide()` on macOS. App only visible via tray icon and spotlight.
- **Dock mode:** Normal dock/taskbar presence.
- **Toggle:** `config:set('dockMode', 'dock' | 'menubar')` from renderer settings.
- **Applies on next app launch** (not live toggle — `app.dock.show()` is async and can fail on macOS).
- **Persisted** via electron-store.
- **On startup:** reads `dockMode` from config. If `'menubar'` and macOS → `app.dock.hide()`.

### 17. Preload Listener Cleanup

All `ipcRenderer.on()` registrations in preload use a pattern that returns a cleanup function:

```typescript
onNavigate: (callback: (page: string) => void) => {
  const handler = (_event: IpcRendererEvent, page: string) => callback(page);
  ipcRenderer.on('navigate', handler);
  return () => ipcRenderer.removeListener('navigate', handler);
},
```

This prevents memory leaks from repeated listener registration.

### 18. Shared Electron Mocks (`__tests__/__mocks__/electron.ts`)

A shared mock file providing mock implementations for all Electron modules used across tests:
- `BrowserWindow` — mock with `show/hide/focus/loadURL/webContents.send/on/close/isVisible/isMaximized/setSize/getSize/getPosition`
- `Tray` — mock with `setContextMenu/setToolTip/on/destroy`
- `Menu` — mock with `buildFromTemplate/setApplicationMenu`
- `globalShortcut` — mock with `register/unregisterAll/isRegistered`
- `ipcMain` — mock with `on/handle/removeHandler`
- `app` — mock with `whenReady/on/quit/getVersion/getPath/isPackaged/requestSingleInstanceLock/dock.hide/dock.show`
- `Notification` — mock with `show/on`
- `nativeImage` — mock with `createFromBuffer`
- `shell` — mock with `openExternal`
- `dialog` — mock with `showOpenDialog/showSaveDialog`
- `screen` — mock with `getPrimaryDisplay`

---

## Dependencies

**New:**
- `electron-store` — persistent config storage
- `eventsource` — SSE client for Node.js (notifications)

**Existing (keep):**
- `electron` ^41.0.0
- `electron-builder` ^25.0.0
- `electron-updater` ^6.3.0
- `@zenai/shared` workspace:*

**Dev (new):**
- `jest` + `@types/jest` — testing
- `ts-jest` — TypeScript test runner

---

## Testing Strategy

- **Jest** with mocked Electron APIs
- Mock `electron` module globally (BrowserWindow, Tray, globalShortcut, etc.)
- Each module gets its own test file
- Focus on: state transitions, IPC handling, config validation, health check logic
- No E2E tests (too brittle for Electron)

**Target:** ~100 tests across all modules

---

## Out of Scope

- Frontend `/spotlight` page (separate frontend task)
- Deep link handling (`zenai://` protocol) — deferred
- Clipboard monitoring — deferred
- Screen memory capture service (exists but not touched)
- Multiple windows beyond spotlight + main

---

## Success Criteria

1. `npm run build` compiles cleanly
2. `npm test` passes all tests (target: ~100)
3. `npm run dev` starts app with spotlight + main window
4. Cmd+Shift+Space toggles spotlight popup
5. Tray icon with working context menu
6. Cloud backend connection with local fallback
7. Native notifications from SSE events
8. Menubar-only mode works (no dock icon)
9. Settings toggle between dock/menubar mode
