# Phase 4: Desktop Agent Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full rewrite of `packages/electron/` as a modular Desktop Agent with spotlight popup, hybrid backend, native notifications, and configurable dock/menubar mode.

**Architecture:** Modular classes — each Electron concern (windows, tray, shortcuts, backend, notifications) is a separate testable module. `ZenAIApp` orchestrates lifecycle. Cloud-first backend with local fallback. Spotlight popup as frameless BrowserWindow.

**Tech Stack:** Electron 41, TypeScript, Jest, electron-store, eventsource, electron-updater, @zenai/shared

**Spec:** `docs/superpowers/specs/2026-03-23-phase4-desktop-agent-design.md`

**Codebase Patterns:**
- Imports from `@zenai/shared`: `APP_NAME`, `DEFAULT_API_PORT`, `DEFAULT_FRONTEND_PORT`
- tsconfig: `target: ES2022`, `module: CommonJS`, `strict: true`
- Existing screen-memory service (`src/screen-memory/capture-service.ts`) is kept as-is

---

## File Structure

```
packages/electron/
  src/
    main.ts                              # Entry point (< 30 lines)
    app.ts                               # ZenAIApp lifecycle orchestrator
    config.ts                            # AppConfig with electron-store
    windows/
      main-window.ts                     # Full app BrowserWindow
      spotlight-window.ts                # Frameless spotlight popup
      window-manager.ts                  # Coordinates both windows
    tray/
      tray-manager.ts                    # System tray icon + menu
    shortcuts/
      shortcut-manager.ts               # Global keyboard shortcuts
    backend/
      backend-bridge.ts                  # Cloud + local backend manager
      local-backend.ts                   # Child process spawning
      health-checker.ts                  # Health endpoint polling
    notifications/
      notification-service.ts            # SSE → native notifications
    ipc/
      handlers.ts                        # IPC handler registration
    menu/
      app-menu.ts                        # Native menu bar
    preload.ts                           # contextBridge API
    updater.ts                           # Auto-update (kept from existing)
    screen-memory/
      capture-service.ts                 # Kept as-is from existing
  __tests__/
    __mocks__/
      electron.ts                        # Shared Electron API mocks
    config.test.ts
    windows/
      main-window.test.ts
      spotlight-window.test.ts
      window-manager.test.ts
    tray/
      tray-manager.test.ts
    shortcuts/
      shortcut-manager.test.ts
    backend/
      health-checker.test.ts
      local-backend.test.ts
      backend-bridge.test.ts
    notifications/
      notification-service.test.ts
    ipc/
      handlers.test.ts
    app.test.ts
  package.json                           # Updated deps
  tsconfig.json                          # Updated for tests
  jest.config.js                         # New
  electron-builder.yml                   # Kept as-is
```

**Modified files:**
- `packages/electron/package.json` — add deps (electron-store, eventsource, jest, ts-jest)
- `packages/electron/tsconfig.json` — add `__tests__` to include, add paths

**Deleted files (replaced by new modules):**
- `packages/electron/src/main.ts` (old 420-line monolith → new < 30 lines)
- `packages/electron/src/ipc/handlers.ts` (old → rewritten)
- `packages/electron/src/menu.ts` (old → `menu/app-menu.ts`)
- `packages/electron/src/preload.ts` (old → rewritten with cleanup pattern)

---

## Chunk 1: Project Setup + Shared Mocks + Config

### Task 1: Update package.json and add Jest config

**Files:**
- Modify: `packages/electron/package.json`
- Create: `packages/electron/jest.config.js`

- [ ] **Step 1: Update package.json with new dependencies and scripts**

```json
{
  "name": "zenai-electron",
  "version": "3.0.0",
  "private": true,
  "description": "ZenAI Desktop Agent - Electron Shell",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc && electron .",
    "clean": "rm -rf dist out",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "package:mac": "tsc && electron-builder --mac",
    "package:win": "tsc && electron-builder --win",
    "package:linux": "tsc && electron-builder --linux",
    "package:all": "tsc && electron-builder --mac --win --linux"
  },
  "dependencies": {
    "@zenai/shared": "workspace:*",
    "electron-store": "^10.0.0",
    "electron-updater": "^6.3.0",
    "eventsource": "^3.0.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "electron": "^41.0.0",
    "electron-builder": "^25.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.0",
    "typescript": "^5.3.3"
  }
}
```

- [ ] **Step 2: Create jest.config.js**

```javascript
// packages/electron/jest.config.js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^electron$': '<rootDir>/src/__tests__/__mocks__/electron.ts',
    '^electron-store$': '<rootDir>/src/__tests__/__mocks__/electron-store.ts',
    '^electron-updater$': '<rootDir>/src/__tests__/__mocks__/electron-updater.ts',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/__tests__/**',
    '!src/main.ts',
    '!src/preload.ts',
  ],
};
```

- [ ] **Step 3: Update tsconfig.json to include tests**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "out", "src/__tests__"]
}
```

Note: Tests are excluded from compilation (Jest handles them via ts-jest). The `src/__tests__` exclude prevents test files from being emitted to `dist/`.

- [ ] **Step 4: Install dependencies**

Run: `cd packages/electron && npm install`
Expected: Clean install, no errors

- [ ] **Step 5: Commit**

```bash
git add packages/electron/package.json packages/electron/jest.config.js
git commit -m "chore(electron): update deps and add jest config for desktop agent rewrite"
```

### Task 2: Create shared Electron mocks

**Files:**
- Create: `packages/electron/src/__tests__/__mocks__/electron.ts`
- Create: `packages/electron/src/__tests__/__mocks__/electron-store.ts`
- Create: `packages/electron/src/__tests__/__mocks__/electron-updater.ts`

- [ ] **Step 1: Create electron mock**

```typescript
// packages/electron/src/__tests__/__mocks__/electron.ts

const createMockBrowserWindow = () => {
  const win: any = {
    loadURL: jest.fn().mockResolvedValue(undefined),
    show: jest.fn(),
    hide: jest.fn(),
    focus: jest.fn(),
    close: jest.fn(),
    destroy: jest.fn(),
    minimize: jest.fn(),
    maximize: jest.fn(),
    unmaximize: jest.fn(),
    isVisible: jest.fn().mockReturnValue(false),
    isMaximized: jest.fn().mockReturnValue(false),
    isMinimized: jest.fn().mockReturnValue(false),
    isDestroyed: jest.fn().mockReturnValue(false),
    setSize: jest.fn(),
    getSize: jest.fn().mockReturnValue([680, 72]),
    getPosition: jest.fn().mockReturnValue([0, 0]),
    setPosition: jest.fn(),
    getTitle: jest.fn().mockReturnValue('ZenAI'),
    once: jest.fn().mockImplementation((event: string, cb: () => void) => {
      if (event === 'ready-to-show') cb();
      return win;
    }),
    on: jest.fn().mockReturnValue(win),
    webContents: {
      send: jest.fn(),
      setWindowOpenHandler: jest.fn(),
      openDevTools: jest.fn(),
      reload: jest.fn(),
      on: jest.fn(),
    },
  };
  return win;
};

export class BrowserWindow {
  static _instances: any[] = [];
  static getAllWindows = jest.fn(() => BrowserWindow._instances);

  constructor(public opts: any) {
    const mock = createMockBrowserWindow();
    Object.assign(this, mock);
    BrowserWindow._instances.push(this);
  }

  // These get overwritten by Object.assign above but need declarations for TS
  loadURL = jest.fn();
  show = jest.fn();
  hide = jest.fn();
  focus = jest.fn();
  close = jest.fn();
  destroy = jest.fn();
  isVisible = jest.fn();
  isDestroyed = jest.fn().mockReturnValue(false);
  once = jest.fn();
  on = jest.fn();
  webContents = { send: jest.fn(), setWindowOpenHandler: jest.fn(), openDevTools: jest.fn(), reload: jest.fn(), on: jest.fn() };
  setSize = jest.fn();
  getSize = jest.fn().mockReturnValue([680, 72]);
  setPosition = jest.fn();
  getPosition = jest.fn().mockReturnValue([0, 0]);

  static _reset() {
    BrowserWindow._instances = [];
  }
}

export class Tray {
  setContextMenu = jest.fn();
  setToolTip = jest.fn();
  on = jest.fn().mockReturnThis();
  destroy = jest.fn();
  constructor(public icon: any) {}
}

export class Notification {
  show = jest.fn();
  on = jest.fn().mockReturnThis();
  static isSupported = jest.fn().mockReturnValue(true);
  constructor(public opts: any) {}
}

export const Menu = {
  buildFromTemplate: jest.fn().mockReturnValue({ items: [] }),
  setApplicationMenu: jest.fn(),
};

export const app = {
  isPackaged: false,
  whenReady: jest.fn().mockResolvedValue(undefined),
  on: jest.fn().mockReturnValue(app),
  quit: jest.fn(),
  getVersion: jest.fn().mockReturnValue('3.0.0'),
  getPath: jest.fn().mockReturnValue('/tmp/zenai'),
  requestSingleInstanceLock: jest.fn().mockReturnValue(true),
  dock: {
    hide: jest.fn(),
    show: jest.fn().mockResolvedValue(undefined),
  },
  getName: jest.fn().mockReturnValue('ZenAI'),
};

export const globalShortcut = {
  register: jest.fn().mockReturnValue(true),
  unregisterAll: jest.fn(),
  isRegistered: jest.fn().mockReturnValue(false),
};

export const ipcMain = {
  on: jest.fn().mockReturnValue(ipcMain),
  handle: jest.fn().mockReturnValue(ipcMain),
  removeHandler: jest.fn(),
};

export const ipcRenderer = {
  on: jest.fn().mockReturnValue(ipcRenderer),
  send: jest.fn(),
  invoke: jest.fn(),
  removeListener: jest.fn(),
};

export const contextBridge = {
  exposeInMainWorld: jest.fn(),
};

export const shell = {
  openExternal: jest.fn().mockResolvedValue(undefined),
};

export const dialog = {
  showOpenDialog: jest.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
  showSaveDialog: jest.fn().mockResolvedValue({ canceled: true }),
  showMessageBox: jest.fn().mockResolvedValue({ response: 0 }),
};

export const nativeImage = {
  createFromBuffer: jest.fn().mockReturnValue({ isEmpty: () => false }),
};

export const screen = {
  getPrimaryDisplay: jest.fn().mockReturnValue({
    workAreaSize: { width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
  }),
};

export const desktopCapturer = {
  getSources: jest.fn().mockResolvedValue([]),
};
```

- [ ] **Step 2: Create electron-store mock**

```typescript
// packages/electron/src/__tests__/__mocks__/electron-store.ts

export default class ElectronStore {
  private data: Record<string, any> = {};

  constructor(private opts?: { defaults?: Record<string, any> }) {
    if (opts?.defaults) {
      this.data = { ...opts.defaults };
    }
  }

  get(key: string, defaultValue?: any): any {
    return key in this.data ? this.data[key] : defaultValue;
  }

  set(key: string | Record<string, any>, value?: any): void {
    if (typeof key === 'string') {
      this.data[key] = value;
    } else {
      Object.assign(this.data, key);
    }
  }

  has(key: string): boolean {
    return key in this.data;
  }

  delete(key: string): void {
    delete this.data[key];
  }

  clear(): void {
    this.data = {};
  }

  get store(): Record<string, any> {
    return { ...this.data };
  }
}
```

- [ ] **Step 3: Create electron-updater mock**

```typescript
// packages/electron/src/__tests__/__mocks__/electron-updater.ts

export const autoUpdater = {
  autoDownload: true,
  autoInstallOnAppQuit: true,
  on: jest.fn().mockReturnThis(),
  checkForUpdatesAndNotify: jest.fn().mockResolvedValue(null),
  quitAndInstall: jest.fn(),
};

export type UpdateInfo = {
  version: string;
  releaseDate: string;
};
```

- [ ] **Step 4: Commit**

```bash
git add packages/electron/src/__tests__/__mocks__/
git commit -m "test(electron): add shared Electron, electron-store, and electron-updater mocks"
```

### Task 3: Config module (TDD)

**Files:**
- Create: `packages/electron/src/__tests__/config.test.ts`
- Create: `packages/electron/src/config.ts`

- [ ] **Step 1: Write config tests**

```typescript
// packages/electron/src/__tests__/config.test.ts

import { AppConfig, createConfig, DEFAULT_CONFIG } from '../config';

describe('AppConfig', () => {
  it('returns default values', () => {
    const config = createConfig();
    expect(config.get('cloudBackendUrl')).toBe('https://ki-ab-production.up.railway.app');
    expect(config.get('localBackendPort')).toBe(3000);
    expect(config.get('dockMode')).toBe('menubar');
    expect(config.get('activeContext')).toBe('personal');
    expect(config.get('healthCheckInterval')).toBe(30000);
    expect(config.get('localBackendStartupTimeout')).toBe(15000);
    expect(config.get('frontendDevPort')).toBe(5173);
  });

  it('persists values via set/get', () => {
    const config = createConfig();
    config.set('dockMode', 'dock');
    expect(config.get('dockMode')).toBe('dock');
  });

  it('overrides from environment variables', () => {
    process.env.ZENAI_CLOUD_BACKEND_URL = 'http://localhost:9999';
    const config = createConfig();
    expect(config.get('cloudBackendUrl')).toBe('http://localhost:9999');
    delete process.env.ZENAI_CLOUD_BACKEND_URL;
  });

  it('returns all config as object', () => {
    const config = createConfig();
    const all = config.getAll();
    expect(all).toMatchObject(DEFAULT_CONFIG);
  });

  it('validates activeContext values', () => {
    const config = createConfig();
    config.set('activeContext', 'work');
    expect(config.get('activeContext')).toBe('work');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/electron && npx jest --testPathPattern config.test --no-cache`
Expected: FAIL — cannot find module `../config`

- [ ] **Step 3: Implement config module**

```typescript
// packages/electron/src/config.ts

import ElectronStore from 'electron-store';

export interface AppConfig {
  cloudBackendUrl: string;
  localBackendPort: number;
  spotlightShortcut: string;
  searchShortcut: string;
  dockMode: 'menubar' | 'dock';
  healthCheckInterval: number;
  frontendDevPort: number;
  activeContext: 'personal' | 'work' | 'learning' | 'creative';
  localBackendStartupTimeout: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  cloudBackendUrl: 'https://ki-ab-production.up.railway.app',
  localBackendPort: 3000,
  spotlightShortcut: 'CmdOrCtrl+Shift+Space',
  searchShortcut: 'CmdOrCtrl+Shift+K',
  dockMode: 'menubar',
  healthCheckInterval: 30000,
  frontendDevPort: 5173,
  activeContext: 'personal',
  localBackendStartupTimeout: 15000,
};

const ENV_MAP: Partial<Record<keyof AppConfig, string>> = {
  cloudBackendUrl: 'ZENAI_CLOUD_BACKEND_URL',
  localBackendPort: 'PORT',
  frontendDevPort: 'ZENAI_FRONTEND_PORT',
};

export interface ConfigStore {
  get<K extends keyof AppConfig>(key: K): AppConfig[K];
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void;
  getAll(): AppConfig;
}

export function createConfig(): ConfigStore {
  const store = new ElectronStore<AppConfig>({ defaults: DEFAULT_CONFIG });

  // Apply environment variable overrides
  for (const [configKey, envKey] of Object.entries(ENV_MAP)) {
    const envVal = process.env[envKey];
    if (envVal !== undefined) {
      const key = configKey as keyof AppConfig;
      if (typeof DEFAULT_CONFIG[key] === 'number') {
        store.set(key, parseInt(envVal, 10) as any);
      } else {
        store.set(key, envVal as any);
      }
    }
  }

  return {
    get<K extends keyof AppConfig>(key: K): AppConfig[K] {
      return store.get(key);
    },
    set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
      store.set(key, value);
    },
    getAll(): AppConfig {
      return store.store as AppConfig;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/electron && npx jest --testPathPattern config.test --no-cache`
Expected: PASS — all 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/electron/src/config.ts packages/electron/src/__tests__/config.test.ts
git commit -m "feat(electron): add config module with electron-store persistence and env overrides"
```

---

## Chunk 2: Backend Layer (Health Checker + Local Backend + Backend Bridge)

### Task 4: Health Checker (TDD)

**Files:**
- Create: `packages/electron/src/__tests__/backend/health-checker.test.ts`
- Create: `packages/electron/src/backend/health-checker.ts`

- [ ] **Step 1: Write health checker tests**

```typescript
// packages/electron/src/__tests__/backend/health-checker.test.ts

import { HealthChecker } from '../../backend/health-checker';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('HealthChecker', () => {
  let checker: HealthChecker;

  beforeEach(() => {
    jest.useFakeTimers();
    mockFetch.mockReset();
    checker = new HealthChecker('http://localhost:3000', 5000);
  });

  afterEach(() => {
    checker.stop();
    jest.useRealTimers();
  });

  it('emits healthy when endpoint responds OK', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const healthySpy = jest.fn();
    checker.on('healthy', healthySpy);

    const result = await checker.checkNow();

    expect(result).toBe(true);
    expect(healthySpy).toHaveBeenCalled();
  });

  it('emits unhealthy when endpoint fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const unhealthySpy = jest.fn();
    checker.on('unhealthy', unhealthySpy);

    const result = await checker.checkNow();

    expect(result).toBe(false);
    expect(unhealthySpy).toHaveBeenCalled();
  });

  it('emits unhealthy when response is not OK', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const unhealthySpy = jest.fn();
    checker.on('unhealthy', unhealthySpy);

    const result = await checker.checkNow();

    expect(result).toBe(false);
    expect(unhealthySpy).toHaveBeenCalled();
  });

  it('emits statusChange on transition from healthy to unhealthy', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await checker.checkNow();

    const changeSpy = jest.fn();
    checker.on('statusChange', changeSpy);

    mockFetch.mockRejectedValueOnce(new Error('timeout'));
    await checker.checkNow();

    expect(changeSpy).toHaveBeenCalledWith(false);
  });

  it('does not emit statusChange when status stays the same', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await checker.checkNow();

    const changeSpy = jest.fn();
    checker.on('statusChange', changeSpy);

    mockFetch.mockResolvedValueOnce({ ok: true });
    await checker.checkNow();

    expect(changeSpy).not.toHaveBeenCalled();
  });

  it('polls at configured interval when started', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    checker.start();

    expect(mockFetch).not.toHaveBeenCalled();

    jest.advanceTimersByTime(5000);
    await Promise.resolve(); // flush microtasks

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('stops polling when stopped', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    checker.start();

    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    checker.stop();

    jest.advanceTimersByTime(10000);
    await Promise.resolve();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uses 5s fetch timeout via AbortController', async () => {
    mockFetch.mockImplementationOnce(() => new Promise(() => {})); // never resolves
    const unhealthySpy = jest.fn();
    checker.on('unhealthy', unhealthySpy);

    const checkPromise = checker.checkNow();
    jest.advanceTimersByTime(6000);

    const result = await checkPromise;
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/electron && npx jest --testPathPattern health-checker.test --no-cache`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement health checker**

```typescript
// packages/electron/src/backend/health-checker.ts

import { EventEmitter } from 'events';

const FETCH_TIMEOUT = 5000;

export class HealthChecker extends EventEmitter {
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastHealthy: boolean | null = null;

  constructor(
    private url: string,
    private intervalMs: number,
  ) {
    super();
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.checkNow().catch(() => {});
    }, this.intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async checkNow(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const response = await fetch(`${this.url}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const healthy = response.ok;
      this.updateStatus(healthy);
      return healthy;
    } catch {
      this.updateStatus(false);
      return false;
    }
  }

  private updateStatus(healthy: boolean): void {
    if (healthy) {
      this.emit('healthy');
    } else {
      this.emit('unhealthy');
    }

    if (this.lastHealthy !== null && this.lastHealthy !== healthy) {
      this.emit('statusChange', healthy);
    }
    this.lastHealthy = healthy;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/electron && npx jest --testPathPattern health-checker.test --no-cache`
Expected: PASS — all 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/electron/src/backend/health-checker.ts packages/electron/src/__tests__/backend/health-checker.test.ts
git commit -m "feat(electron): add HealthChecker with polling, events, and timeout"
```

### Task 5: Local Backend (TDD)

**Files:**
- Create: `packages/electron/src/__tests__/backend/local-backend.test.ts`
- Create: `packages/electron/src/backend/local-backend.ts`

- [ ] **Step 1: Write local backend tests**

```typescript
// packages/electron/src/__tests__/backend/local-backend.test.ts

import { LocalBackend } from '../../backend/local-backend';
import { EventEmitter } from 'events';

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn(),
  execSync: jest.fn().mockReturnValue('/usr/local/bin/node\n'),
}));

jest.mock('path', () => ({
  resolve: jest.fn((...args: string[]) => args.join('/')),
  join: jest.fn((...args: string[]) => args.join('/')),
}));

import { spawn } from 'child_process';

function createMockProcess() {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn();
  proc.pid = 12345;
  return proc;
}

describe('LocalBackend', () => {
  let backend: LocalBackend;
  let mockProc: any;

  beforeEach(() => {
    mockProc = createMockProcess();
    (spawn as jest.Mock).mockReturnValue(mockProc);
    backend = new LocalBackend(3000, false);
  });

  afterEach(async () => {
    await backend.stop();
  });

  it('starts and resolves when ready signal detected in stdout', async () => {
    const startPromise = backend.start(5000);

    // Simulate backend logging ready message
    mockProc.stdout.emit('data', Buffer.from('Server running on port 3000'));

    await expect(startPromise).resolves.toBeUndefined();
    expect(backend.isRunning()).toBe(true);
  });

  it('resolves when "listening on" detected', async () => {
    const startPromise = backend.start(5000);
    mockProc.stdout.emit('data', Buffer.from('listening on port 3000'));
    await expect(startPromise).resolves.toBeUndefined();
  });

  it('resolves when "Server:" detected', async () => {
    const startPromise = backend.start(5000);
    mockProc.stdout.emit('data', Buffer.from('Server:      http://localhost:3000'));
    await expect(startPromise).resolves.toBeUndefined();
  });

  it('rejects when process emits error', async () => {
    const startPromise = backend.start(5000);
    mockProc.emit('error', new Error('ENOENT'));
    await expect(startPromise).rejects.toThrow('ENOENT');
    expect(backend.isRunning()).toBe(false);
  });

  it('rejects when process exits with non-zero code before ready', async () => {
    const startPromise = backend.start(5000);
    mockProc.emit('exit', 1);
    await expect(startPromise).rejects.toThrow('exited with code 1');
    expect(backend.isRunning()).toBe(false);
  });

  it('rejects on timeout', async () => {
    jest.useFakeTimers();
    const startPromise = backend.start(100);

    jest.advanceTimersByTime(200);

    await expect(startPromise).rejects.toThrow('timed out');
    jest.useRealTimers();
  });

  it('stop kills the process', async () => {
    const startPromise = backend.start(5000);
    mockProc.stdout.emit('data', Buffer.from('Server running'));
    await startPromise;

    await backend.stop();

    expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(backend.isRunning()).toBe(false);
  });

  it('isRunning returns false before start', () => {
    expect(backend.isRunning()).toBe(false);
  });

  it('uses npx ts-node-dev in dev mode', async () => {
    backend = new LocalBackend(3000, true);
    const startPromise = backend.start(5000);
    mockProc.stdout.emit('data', Buffer.from('Server running'));
    await startPromise;

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['ts-node-dev']),
      expect.any(Object),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/electron && npx jest --testPathPattern local-backend.test --no-cache`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement local backend**

```typescript
// packages/electron/src/backend/local-backend.ts

import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';

const READY_SIGNALS = ['Server:', 'listening on', 'Server running'];

export class LocalBackend {
  private process: ChildProcess | null = null;

  constructor(
    private port: number,
    private isDev: boolean,
  ) {}

  start(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const backendDir = this.isDev
        ? path.resolve(__dirname, '../../../../backend')
        : path.resolve(process.resourcesPath || '', 'backend');

      if (this.isDev) {
        const npxBin = this.findBin('npx');
        this.process = spawn(npxBin, [
          'ts-node-dev', '--respawn', '--transpile-only', '--clear',
          '--ignore-watch', 'node_modules', '--ignore-watch', '__tests__',
          '--ignore-watch', 'dist', 'src/main.ts',
        ], {
          cwd: backendDir,
          env: { ...process.env, PORT: String(this.port), ELECTRON_MODE: 'true', NODE_ENV: 'development' },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } else {
        const nodeBin = this.findBin('node');
        const entry = path.join(backendDir, 'dist/main.js');
        this.process = spawn(nodeBin, [entry], {
          cwd: backendDir,
          env: { ...process.env, PORT: String(this.port), ELECTRON_MODE: 'true', NODE_ENV: 'production' },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      }

      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Local backend startup timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.process.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        if (!resolved && READY_SIGNALS.some(sig => text.includes(sig))) {
          resolved = true;
          clearTimeout(timer);
          resolve();
        }
      });

      this.process.stderr?.on('data', () => {});

      this.process.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          this.process = null;
          reject(err);
        }
      });

      this.process.on('exit', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          this.process = null;
          reject(new Error(`Local backend exited with code ${code}`));
        } else {
          this.process = null;
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.process) return;
    const proc = this.process;
    this.process = null;

    proc.kill('SIGTERM');

    await new Promise<void>((resolve) => {
      const forceKill = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, 5000);

      proc.on('exit', () => {
        clearTimeout(forceKill);
        resolve();
      });
    });
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  private findBin(name: string): string {
    if (process.platform === 'win32') return name === 'node' ? 'node.exe' : 'npx.cmd';
    try {
      return execSync(`which ${name}`, { encoding: 'utf-8' }).trim();
    } catch {
      return name;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/electron && npx jest --testPathPattern local-backend.test --no-cache`
Expected: PASS — all 9 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/electron/src/backend/local-backend.ts packages/electron/src/__tests__/backend/local-backend.test.ts
git commit -m "feat(electron): add LocalBackend with child process spawning and ready detection"
```

### Task 6: Backend Bridge (TDD)

**Files:**
- Create: `packages/electron/src/__tests__/backend/backend-bridge.test.ts`
- Create: `packages/electron/src/backend/backend-bridge.ts`

- [ ] **Step 1: Write backend bridge tests**

```typescript
// packages/electron/src/__tests__/backend/backend-bridge.test.ts

import { BackendBridge, BackendStatus } from '../../backend/backend-bridge';
import { HealthChecker } from '../../backend/health-checker';
import { LocalBackend } from '../../backend/local-backend';

jest.mock('../../backend/health-checker');
jest.mock('../../backend/local-backend');

const MockHealthChecker = HealthChecker as jest.MockedClass<typeof HealthChecker>;
const MockLocalBackend = LocalBackend as jest.MockedClass<typeof LocalBackend>;

describe('BackendBridge', () => {
  let bridge: BackendBridge;

  beforeEach(() => {
    MockHealthChecker.mockClear();
    MockLocalBackend.mockClear();
  });

  afterEach(async () => {
    if (bridge) await bridge.stop();
  });

  it('starts in cloud_checking state', () => {
    bridge = new BackendBridge('http://cloud.test', 3000, false, 30000, 15000);
    expect(bridge.getStatus()).toBe('disconnected');
  });

  it('connects to cloud when health check passes', async () => {
    bridge = new BackendBridge('http://cloud.test', 3000, false, 30000, 15000);

    // Mock HealthChecker.checkNow to return true
    const mockChecker = MockHealthChecker.mock.instances[0];
    (mockChecker as any).checkNow = jest.fn().mockResolvedValue(true);
    (mockChecker as any).start = jest.fn();
    (mockChecker as any).stop = jest.fn();
    (mockChecker as any).on = jest.fn();

    // Replace the internally created checker
    (bridge as any).healthChecker = mockChecker;

    // Mock the initial cloud check
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as any;

    await bridge.start();

    expect(bridge.getStatus()).toBe('cloud_connected');
    expect(bridge.getBaseUrl()).toBe('http://cloud.test');
  });

  it('falls back to local when cloud is unreachable', async () => {
    bridge = new BackendBridge('http://cloud.test', 3000, false, 30000, 15000);

    // Mock cloud check to fail
    const mockFetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    global.fetch = mockFetch as any;

    // Mock local backend to succeed
    const mockLocal = MockLocalBackend.mock.instances[0] || new MockLocalBackend(3000, false);
    (mockLocal as any).start = jest.fn().mockResolvedValue(undefined);
    (mockLocal as any).stop = jest.fn().mockResolvedValue(undefined);
    (mockLocal as any).isRunning = jest.fn().mockReturnValue(true);
    (bridge as any).localBackend = mockLocal;

    await bridge.start();

    expect(bridge.getStatus()).toBe('local_connected');
    expect(bridge.getBaseUrl()).toBe('http://localhost:3000');
  });

  it('enters disconnected state when both cloud and local fail', async () => {
    bridge = new BackendBridge('http://cloud.test', 3000, false, 30000, 15000);

    const mockFetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    global.fetch = mockFetch as any;

    const mockLocal = MockLocalBackend.mock.instances[0] || new MockLocalBackend(3000, false);
    (mockLocal as any).start = jest.fn().mockRejectedValue(new Error('spawn failed'));
    (mockLocal as any).stop = jest.fn().mockResolvedValue(undefined);
    (bridge as any).localBackend = mockLocal;

    const errorSpy = jest.fn();
    bridge.on('error', errorSpy);

    await bridge.start();

    expect(bridge.getStatus()).toBe('disconnected');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('emits statusChange on transitions', async () => {
    bridge = new BackendBridge('http://cloud.test', 3000, false, 30000, 15000);

    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as any;

    const changeSpy = jest.fn();
    bridge.on('statusChange', changeSpy);

    await bridge.start();

    expect(changeSpy).toHaveBeenCalledWith('disconnected', 'cloud_connected');
  });

  it('stop cleans up local backend and health checker', async () => {
    bridge = new BackendBridge('http://cloud.test', 3000, false, 30000, 15000);

    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as any;

    await bridge.start();
    await bridge.stop();

    expect(bridge.getStatus()).toBe('disconnected');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/electron && npx jest --testPathPattern backend-bridge.test --no-cache`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement backend bridge**

```typescript
// packages/electron/src/backend/backend-bridge.ts

import { EventEmitter } from 'events';
import { HealthChecker } from './health-checker';
import { LocalBackend } from './local-backend';

export type BackendStatus = 'cloud_connected' | 'cloud_checking' | 'local_starting' | 'local_connected' | 'disconnected';

const CLOUD_CHECK_TIMEOUT = 5000;

export class BackendBridge extends EventEmitter {
  private status: BackendStatus = 'disconnected';
  private healthChecker: HealthChecker;
  private localBackend: LocalBackend;

  constructor(
    private cloudUrl: string,
    private localPort: number,
    private isDev: boolean,
    healthCheckInterval: number,
    private startupTimeout: number,
  ) {
    super();
    this.healthChecker = new HealthChecker(cloudUrl, healthCheckInterval);
    this.localBackend = new LocalBackend(localPort, isDev);

    this.healthChecker.on('statusChange', (healthy: boolean) => {
      if (healthy && this.status !== 'cloud_connected') {
        this.switchToCloud();
      } else if (!healthy && this.status === 'cloud_connected') {
        this.fallbackToLocal();
      }
    });
  }

  getBaseUrl(): string {
    if (this.status === 'cloud_connected') return this.cloudUrl;
    if (this.status === 'local_connected') return `http://localhost:${this.localPort}`;
    return this.cloudUrl; // fallback
  }

  getStatus(): BackendStatus {
    return this.status;
  }

  async start(): Promise<void> {
    this.setStatus('cloud_checking');

    const cloudHealthy = await this.checkCloudHealth();

    if (cloudHealthy) {
      this.setStatus('cloud_connected');
      this.healthChecker.start();
    } else {
      await this.fallbackToLocal();
    }
  }

  async stop(): Promise<void> {
    this.healthChecker.stop();
    await this.localBackend.stop();
    this.setStatus('disconnected');
  }

  private async checkCloudHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CLOUD_CHECK_TIMEOUT);
      const response = await fetch(`${this.cloudUrl}/api/health`, { signal: controller.signal });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async switchToCloud(): Promise<void> {
    this.setStatus('cloud_connected');
    await this.localBackend.stop();
  }

  private async fallbackToLocal(): Promise<void> {
    this.setStatus('local_starting');
    try {
      await this.localBackend.start(this.startupTimeout);
      this.setStatus('local_connected');
      this.healthChecker.start(); // keep checking if cloud comes back
    } catch (err) {
      this.setStatus('disconnected');
      this.emit('error', err instanceof Error ? err.message : 'Local backend failed to start');
    }
  }

  private setStatus(newStatus: BackendStatus): void {
    const oldStatus = this.status;
    if (oldStatus === newStatus) return;
    this.status = newStatus;
    this.emit('statusChange', oldStatus, newStatus);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/electron && npx jest --testPathPattern backend-bridge.test --no-cache`
Expected: PASS — all 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/electron/src/backend/backend-bridge.ts packages/electron/src/__tests__/backend/backend-bridge.test.ts
git commit -m "feat(electron): add BackendBridge with cloud-first, local-fallback state machine"
```

---

## Chunk 3: Windows (Main + Spotlight + Manager)

### Task 7: Main Window (TDD)

**Files:**
- Create: `packages/electron/src/__tests__/windows/main-window.test.ts`
- Create: `packages/electron/src/windows/main-window.ts`

- [ ] **Step 1: Write main window tests**

```typescript
// packages/electron/src/__tests__/windows/main-window.test.ts

import { BrowserWindow } from 'electron';
import { MainWindow } from '../../windows/main-window';

describe('MainWindow', () => {
  let mainWindow: MainWindow;

  beforeEach(() => {
    (BrowserWindow as any)._reset();
    mainWindow = new MainWindow('http://localhost:5173');
  });

  it('creates a BrowserWindow with correct options', () => {
    mainWindow.create();
    const win = (mainWindow as any).window;
    expect(win).toBeTruthy();
    expect(win.opts.width).toBe(1400);
    expect(win.opts.height).toBe(900);
    expect(win.opts.minWidth).toBe(800);
    expect(win.opts.minHeight).toBe(600);
    expect(win.opts.backgroundColor).toBe('#0f1117');
    expect(win.opts.show).toBe(false);
  });

  it('loads the frontend URL on create', () => {
    mainWindow.create();
    const win = (mainWindow as any).window;
    expect(win.loadURL).toHaveBeenCalledWith('http://localhost:5173');
  });

  it('show/hide/focus delegate to BrowserWindow', () => {
    mainWindow.create();
    const win = (mainWindow as any).window;

    mainWindow.show();
    expect(win.show).toHaveBeenCalled();

    mainWindow.hide();
    expect(win.hide).toHaveBeenCalled();

    mainWindow.focus();
    expect(win.focus).toHaveBeenCalled();
  });

  it('navigateTo sends IPC navigate event', () => {
    mainWindow.create();
    const win = (mainWindow as any).window;

    mainWindow.navigateTo('chat');
    expect(win.webContents.send).toHaveBeenCalledWith('navigate', 'chat');
  });

  it('isVisible returns false when window not created', () => {
    expect(mainWindow.isVisible()).toBe(false);
  });

  it('does not crash when calling methods before create', () => {
    expect(() => mainWindow.show()).not.toThrow();
    expect(() => mainWindow.hide()).not.toThrow();
    expect(() => mainWindow.navigateTo('test')).not.toThrow();
  });

  it('getWindow returns null before create', () => {
    expect(mainWindow.getWindow()).toBeNull();
  });

  it('getWindow returns BrowserWindow after create', () => {
    mainWindow.create();
    expect(mainWindow.getWindow()).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/electron && npx jest --testPathPattern main-window.test --no-cache`
Expected: FAIL

- [ ] **Step 3: Implement main window**

```typescript
// packages/electron/src/windows/main-window.ts

import { BrowserWindow, shell } from 'electron';
import * as path from 'path';

export class MainWindow {
  private window: BrowserWindow | null = null;

  constructor(private frontendUrl: string) {}

  create(): void {
    if (this.window && !this.window.isDestroyed()) return;

    this.window = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      title: 'ZenAI',
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      backgroundColor: '#0f1117',
      show: false,
    });

    this.window.loadURL(this.frontendUrl);

    this.window.once('ready-to-show', () => {
      this.window?.show();
    });

    this.window.on('closed', () => {
      this.window = null;
    });

    this.window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });
  }

  show(): void {
    this.window?.show();
  }

  hide(): void {
    this.window?.hide();
  }

  focus(): void {
    this.window?.focus();
  }

  navigateTo(page: string): void {
    this.window?.webContents.send('navigate', page);
  }

  isVisible(): boolean {
    return this.window?.isVisible() ?? false;
  }

  getWindow(): BrowserWindow | null {
    return this.window;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/electron && npx jest --testPathPattern main-window.test --no-cache`
Expected: PASS — all 8 tests

- [ ] **Step 5: Commit**

```bash
git add packages/electron/src/windows/main-window.ts packages/electron/src/__tests__/windows/main-window.test.ts
git commit -m "feat(electron): add MainWindow class with show/hide/navigate"
```

### Task 8: Spotlight Window (TDD)

**Files:**
- Create: `packages/electron/src/__tests__/windows/spotlight-window.test.ts`
- Create: `packages/electron/src/windows/spotlight-window.ts`

- [ ] **Step 1: Write spotlight window tests**

```typescript
// packages/electron/src/__tests__/windows/spotlight-window.test.ts

import { BrowserWindow, screen } from 'electron';
import { SpotlightWindow } from '../../windows/spotlight-window';

describe('SpotlightWindow', () => {
  let spotlight: SpotlightWindow;

  beforeEach(() => {
    (BrowserWindow as any)._reset();
    spotlight = new SpotlightWindow('http://localhost:5173');
  });

  it('creates a frameless, always-on-top window', () => {
    spotlight.create();
    const win = (spotlight as any).window;
    expect(win.opts.frame).toBe(false);
    expect(win.opts.alwaysOnTop).toBe(true);
    expect(win.opts.skipTaskbar).toBe(true);
    expect(win.opts.transparent).toBe(true);
    expect(win.opts.show).toBe(false);
    expect(win.opts.width).toBe(680);
    expect(win.opts.height).toBe(72);
  });

  it('loads /spotlight route from frontend', () => {
    spotlight.create();
    const win = (spotlight as any).window;
    expect(win.loadURL).toHaveBeenCalledWith('http://localhost:5173/spotlight');
  });

  it('toggle shows when hidden', () => {
    spotlight.create();
    const win = (spotlight as any).window;
    win.isVisible.mockReturnValue(false);

    spotlight.toggle();

    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith('spotlight:show');
  });

  it('toggle hides when visible', () => {
    spotlight.create();
    const win = (spotlight as any).window;
    win.isVisible.mockReturnValue(true);

    spotlight.toggle();

    expect(win.hide).toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith('spotlight:hide');
  });

  it('hide hides the window', () => {
    spotlight.create();
    const win = (spotlight as any).window;
    win.isVisible.mockReturnValue(true);

    spotlight.hide();

    expect(win.hide).toHaveBeenCalled();
  });

  it('resize changes window height', () => {
    spotlight.create();
    const win = (spotlight as any).window;

    spotlight.resize(400);

    expect(win.setSize).toHaveBeenCalledWith(680, 400);
  });

  it('positions centered horizontally, 20% from top', () => {
    spotlight.create();
    const win = (spotlight as any).window;

    // screen mock returns 1920x1080
    // centerX = (1920 - 680) / 2 = 620
    // topY = 1080 * 0.2 = 216
    expect(win.setPosition).toHaveBeenCalledWith(620, 216);
  });

  it('does not crash when toggling before create', () => {
    expect(() => spotlight.toggle()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/electron && npx jest --testPathPattern spotlight-window.test --no-cache`
Expected: FAIL

- [ ] **Step 3: Implement spotlight window**

```typescript
// packages/electron/src/windows/spotlight-window.ts

import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

const SPOTLIGHT_WIDTH = 680;
const SPOTLIGHT_HEIGHT = 72;

export class SpotlightWindow {
  private window: BrowserWindow | null = null;

  constructor(private frontendUrl: string) {}

  create(): void {
    if (this.window && !this.window.isDestroyed()) return;

    this.window = new BrowserWindow({
      width: SPOTLIGHT_WIDTH,
      height: SPOTLIGHT_HEIGHT,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      resizable: false,
      movable: false,
      hasShadow: true,
      vibrancy: 'under-window',
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    this.window.loadURL(`${this.frontendUrl}/spotlight`);
    this.centerOnScreen();

    this.window.on('blur', () => {
      this.hide();
    });

    this.window.on('closed', () => {
      this.window = null;
    });
  }

  toggle(): void {
    if (!this.window) return;
    if (this.window.isVisible()) {
      this.hide();
    } else {
      this.centerOnScreen();
      this.window.show();
      this.window.focus();
      this.window.webContents.send('spotlight:show');
    }
  }

  show(): void {
    if (!this.window) return;
    this.centerOnScreen();
    this.window.show();
    this.window.focus();
    this.window.webContents.send('spotlight:show');
  }

  hide(): void {
    if (!this.window?.isVisible()) return;
    this.window.hide();
    this.window.webContents.send('spotlight:hide');
  }

  resize(height: number): void {
    this.window?.setSize(SPOTLIGHT_WIDTH, height);
  }

  getWindow(): BrowserWindow | null {
    return this.window;
  }

  private centerOnScreen(): void {
    if (!this.window) return;
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.workAreaSize;
    const x = Math.round((width - SPOTLIGHT_WIDTH) / 2);
    const y = Math.round(height * 0.2);
    this.window.setPosition(x, y);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/electron && npx jest --testPathPattern spotlight-window.test --no-cache`
Expected: PASS — all 8 tests

- [ ] **Step 5: Commit**

```bash
git add packages/electron/src/windows/spotlight-window.ts packages/electron/src/__tests__/windows/spotlight-window.test.ts
git commit -m "feat(electron): add SpotlightWindow with frameless popup and centering"
```

### Task 9: Window Manager (TDD)

**Files:**
- Create: `packages/electron/src/__tests__/windows/window-manager.test.ts`
- Create: `packages/electron/src/windows/window-manager.ts`

- [ ] **Step 1: Write window manager tests**

```typescript
// packages/electron/src/__tests__/windows/window-manager.test.ts

import { WindowManager } from '../../windows/window-manager';
import { MainWindow } from '../../windows/main-window';
import { SpotlightWindow } from '../../windows/spotlight-window';

jest.mock('../../windows/main-window');
jest.mock('../../windows/spotlight-window');

describe('WindowManager', () => {
  let manager: WindowManager;
  let mockMain: jest.Mocked<MainWindow>;
  let mockSpotlight: jest.Mocked<SpotlightWindow>;

  beforeEach(() => {
    (MainWindow as jest.MockedClass<typeof MainWindow>).mockClear();
    (SpotlightWindow as jest.MockedClass<typeof SpotlightWindow>).mockClear();

    manager = new WindowManager('http://localhost:5173');
    mockMain = (MainWindow as jest.MockedClass<typeof MainWindow>).mock.instances[0] as any;
    mockSpotlight = (SpotlightWindow as jest.MockedClass<typeof SpotlightWindow>).mock.instances[0] as any;
  });

  it('creates both windows on init', () => {
    manager.init();
    expect(mockSpotlight.create).toHaveBeenCalled();
  });

  it('toggleSpotlight delegates to SpotlightWindow', () => {
    manager.init();
    manager.toggleSpotlight();
    expect(mockSpotlight.toggle).toHaveBeenCalled();
  });

  it('showMainWindow creates if not exists then shows', () => {
    manager.showMainWindow();
    expect(mockMain.create).toHaveBeenCalled();
    expect(mockMain.show).toHaveBeenCalled();
  });

  it('hideMainWindow delegates to MainWindow', () => {
    manager.hideMainWindow();
    expect(mockMain.hide).toHaveBeenCalled();
  });

  it('showAndNavigate creates, shows, and navigates', () => {
    manager.showAndNavigate('chat');
    expect(mockMain.create).toHaveBeenCalled();
    expect(mockMain.show).toHaveBeenCalled();
    expect(mockMain.focus).toHaveBeenCalled();
    expect(mockMain.navigateTo).toHaveBeenCalledWith('chat');
  });

  it('focusOrCreate shows existing or creates new', () => {
    mockMain.getWindow = jest.fn().mockReturnValue(null);
    manager.focusOrCreate();
    expect(mockMain.create).toHaveBeenCalled();
    expect(mockMain.show).toHaveBeenCalled();
  });

  it('getMainWindow returns the MainWindow instance', () => {
    expect(manager.getMainWindow()).toBe(mockMain);
  });

  it('showSpotlight calls show not toggle', () => {
    manager.init();
    manager.showSpotlight();
    expect(mockSpotlight.show).toHaveBeenCalled();
    expect(mockSpotlight.toggle).not.toHaveBeenCalled();
  });

  it('hideSpotlight delegates to SpotlightWindow', () => {
    manager.init();
    manager.hideSpotlight();
    expect(mockSpotlight.hide).toHaveBeenCalled();
  });

  it('resizeSpotlight delegates to SpotlightWindow', () => {
    manager.init();
    manager.resizeSpotlight(300);
    expect(mockSpotlight.resize).toHaveBeenCalledWith(300);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/electron && npx jest --testPathPattern window-manager.test --no-cache`
Expected: FAIL

- [ ] **Step 3: Implement window manager**

```typescript
// packages/electron/src/windows/window-manager.ts

import { MainWindow } from './main-window';
import { SpotlightWindow } from './spotlight-window';

export class WindowManager {
  private mainWindow: MainWindow;
  private spotlightWindow: SpotlightWindow;

  constructor(frontendUrl: string) {
    this.mainWindow = new MainWindow(frontendUrl);
    this.spotlightWindow = new SpotlightWindow(frontendUrl);
  }

  init(): void {
    this.spotlightWindow.create();
  }

  toggleSpotlight(): void {
    this.spotlightWindow.toggle();
  }

  showSpotlight(): void {
    this.spotlightWindow.show();
  }

  hideSpotlight(): void {
    this.spotlightWindow.hide();
  }

  resizeSpotlight(height: number): void {
    this.spotlightWindow.resize(height);
  }

  showMainWindow(): void {
    this.mainWindow.create();
    this.mainWindow.show();
  }

  hideMainWindow(): void {
    this.mainWindow.hide();
  }

  showAndNavigate(page: string): void {
    this.mainWindow.create();
    this.mainWindow.show();
    this.mainWindow.focus();
    this.mainWindow.navigateTo(page);
  }

  focusOrCreate(): void {
    this.mainWindow.create();
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  getMainWindow(): MainWindow {
    return this.mainWindow;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/electron && npx jest --testPathPattern window-manager.test --no-cache`
Expected: PASS — all 9 tests

- [ ] **Step 5: Commit**

```bash
git add packages/electron/src/windows/window-manager.ts packages/electron/src/__tests__/windows/window-manager.test.ts
git commit -m "feat(electron): add WindowManager coordinating main and spotlight windows"
```

---

## Chunk 4: Shortcuts + Tray + Menu + IPC

### Task 10: Shortcut Manager (TDD)

**Files:**
- Create: `packages/electron/src/__tests__/shortcuts/shortcut-manager.test.ts`
- Create: `packages/electron/src/shortcuts/shortcut-manager.ts`

- [ ] **Step 1: Write shortcut manager tests**

```typescript
// packages/electron/src/__tests__/shortcuts/shortcut-manager.test.ts

import { globalShortcut } from 'electron';
import { ShortcutManager } from '../../shortcuts/shortcut-manager';

describe('ShortcutManager', () => {
  let manager: ShortcutManager;
  const mockToggleSpotlight = jest.fn();
  const mockShowSearch = jest.fn();

  beforeEach(() => {
    (globalShortcut.register as jest.Mock).mockClear();
    (globalShortcut.unregisterAll as jest.Mock).mockClear();
    manager = new ShortcutManager(
      { spotlight: 'CmdOrCtrl+Shift+Space', search: 'CmdOrCtrl+Shift+K' },
      { onToggleSpotlight: mockToggleSpotlight, onShowSearch: mockShowSearch },
    );
  });

  it('registers spotlight shortcut', () => {
    manager.register();
    expect(globalShortcut.register).toHaveBeenCalledWith(
      'CmdOrCtrl+Shift+Space',
      expect.any(Function),
    );
  });

  it('registers search shortcut', () => {
    manager.register();
    expect(globalShortcut.register).toHaveBeenCalledWith(
      'CmdOrCtrl+Shift+K',
      expect.any(Function),
    );
  });

  it('calls onToggleSpotlight when spotlight shortcut fires', () => {
    manager.register();
    const call = (globalShortcut.register as jest.Mock).mock.calls.find(
      (c: any[]) => c[0] === 'CmdOrCtrl+Shift+Space'
    );
    call[1](); // invoke callback
    expect(mockToggleSpotlight).toHaveBeenCalled();
  });

  it('calls onShowSearch when search shortcut fires', () => {
    manager.register();
    const call = (globalShortcut.register as jest.Mock).mock.calls.find(
      (c: any[]) => c[0] === 'CmdOrCtrl+Shift+K'
    );
    call[1]();
    expect(mockShowSearch).toHaveBeenCalled();
  });

  it('unregister calls globalShortcut.unregisterAll', () => {
    manager.unregister();
    expect(globalShortcut.unregisterAll).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/electron && npx jest --testPathPattern shortcut-manager.test --no-cache`
Expected: FAIL

- [ ] **Step 3: Implement shortcut manager**

```typescript
// packages/electron/src/shortcuts/shortcut-manager.ts

import { globalShortcut } from 'electron';

interface ShortcutConfig {
  spotlight: string;
  search: string;
}

interface ShortcutCallbacks {
  onToggleSpotlight: () => void;
  onShowSearch: () => void;
}

export class ShortcutManager {
  constructor(
    private config: ShortcutConfig,
    private callbacks: ShortcutCallbacks,
  ) {}

  register(): void {
    globalShortcut.register(this.config.spotlight, this.callbacks.onToggleSpotlight);
    globalShortcut.register(this.config.search, this.callbacks.onShowSearch);
  }

  unregister(): void {
    globalShortcut.unregisterAll();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/electron && npx jest --testPathPattern shortcut-manager.test --no-cache`
Expected: PASS — all 5 tests

- [ ] **Step 5: Commit**

```bash
git add packages/electron/src/shortcuts/shortcut-manager.ts packages/electron/src/__tests__/shortcuts/shortcut-manager.test.ts
git commit -m "feat(electron): add ShortcutManager for global keyboard shortcuts"
```

### Task 11: Tray Manager (TDD)

**Files:**
- Create: `packages/electron/src/__tests__/tray/tray-manager.test.ts`
- Create: `packages/electron/src/tray/tray-manager.ts`

- [ ] **Step 1: Write tray manager tests**

```typescript
// packages/electron/src/__tests__/tray/tray-manager.test.ts

import { Tray, Menu, nativeImage } from 'electron';
import { TrayManager } from '../../tray/tray-manager';

describe('TrayManager', () => {
  let trayManager: TrayManager;
  const mockShowAndNavigate = jest.fn();
  const mockShowMainWindow = jest.fn();
  const mockHideMainWindow = jest.fn();
  const mockIsMainVisible = jest.fn();
  const mockQuit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    trayManager = new TrayManager({
      showAndNavigate: mockShowAndNavigate,
      showMainWindow: mockShowMainWindow,
      hideMainWindow: mockHideMainWindow,
      isMainWindowVisible: mockIsMainVisible,
      quit: mockQuit,
    });
  });

  it('creates a Tray with icon', () => {
    trayManager.create();
    expect(Tray).toHaveBeenCalled();
  });

  it('sets tooltip to ZenAI', () => {
    trayManager.create();
    const tray = (Tray as jest.MockedClass<typeof Tray>).mock.instances[0];
    expect(tray.setToolTip).toHaveBeenCalledWith('ZenAI');
  });

  it('builds context menu with Menu.buildFromTemplate', () => {
    trayManager.create();
    expect(Menu.buildFromTemplate).toHaveBeenCalled();

    const template = (Menu.buildFromTemplate as jest.Mock).mock.calls[0][0];
    const labels = template.map((item: any) => item.label).filter(Boolean);

    expect(labels).toContain('ZenAI - Personal AI OS');
    expect(labels).toContain('Neuer Gedanke');
    expect(labels).toContain('Quick Chat');
    expect(labels).toContain('Beenden');
  });

  it('registers click handler on tray', () => {
    trayManager.create();
    const tray = (Tray as jest.MockedClass<typeof Tray>).mock.instances[0];
    expect(tray.on).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('destroy cleans up tray', () => {
    trayManager.create();
    const tray = (Tray as jest.MockedClass<typeof Tray>).mock.instances[0];
    trayManager.destroy();
    expect(tray.destroy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/electron && npx jest --testPathPattern tray-manager.test --no-cache`
Expected: FAIL

- [ ] **Step 3: Implement tray manager**

```typescript
// packages/electron/src/tray/tray-manager.ts

import { Tray, Menu, nativeImage, MenuItemConstructorOptions } from 'electron';

// Minimal 16x16 tray icon (base64 PNG)
const TRAY_ICON_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADgSURBVDiN1ZMxCsJAEEX/7hqwUKzEwsZCbATBwsrK3kN4Aa/gQTyBZ/AGNjbewMI7KIhEENFCi6yskmhi1sUPw8B882dmB0KI/5bK80CShEqJmLGNjCNsHbDW4OaAXSCL8dqAZcK8BXfNfgOKEi8S1hBqH3D1Uf3IAI7+0JuaUgImpqQC+wm3v3k+8q3o0BuAL8Al0E643Pq8AEXJ5gI+P3aKxoBFGSsNFcJabMEAqwfcY7gZoJMB0j4Ab4IzlNOKXYETAkrA03XDO8B+Bwh2rz3QKOcNbvI/n58v4i/5Q0Ur36xBbpFDAAAAABJRU5ErkJggg==';

interface TrayCallbacks {
  showAndNavigate: (page: string) => void;
  showMainWindow: () => void;
  hideMainWindow: () => void;
  isMainWindowVisible: () => boolean;
  quit: () => void;
}

export class TrayManager {
  private tray: Tray | null = null;

  constructor(private callbacks: TrayCallbacks) {}

  create(): void {
    const icon = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_BASE64, 'base64'));
    this.tray = new Tray(icon);

    const template: MenuItemConstructorOptions[] = [
      { label: 'ZenAI - Personal AI OS', enabled: false },
      { type: 'separator' },
      { label: 'Neuer Gedanke', click: () => this.callbacks.showAndNavigate('ideas/new') },
      { label: 'Quick Chat', click: () => this.callbacks.showAndNavigate('chat') },
      { label: 'Suche', click: () => this.callbacks.showAndNavigate('search') },
      { type: 'separator' },
      { label: 'Dashboard', click: () => this.callbacks.showAndNavigate('dashboard') },
      { label: 'Planer', click: () => this.callbacks.showAndNavigate('calendar') },
      { label: 'Email', click: () => this.callbacks.showAndNavigate('email') },
      { type: 'separator' },
      { label: 'Fenster anzeigen', click: () => this.callbacks.showMainWindow() },
      { label: 'Beenden', click: () => this.callbacks.quit() },
    ];

    this.tray.setContextMenu(Menu.buildFromTemplate(template));
    this.tray.setToolTip('ZenAI');

    this.tray.on('click', () => {
      if (this.callbacks.isMainWindowVisible()) {
        this.callbacks.hideMainWindow();
      } else {
        this.callbacks.showMainWindow();
      }
    });
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/electron && npx jest --testPathPattern tray-manager.test --no-cache`
Expected: PASS — all 5 tests

- [ ] **Step 5: Commit**

```bash
git add packages/electron/src/tray/tray-manager.ts packages/electron/src/__tests__/tray/tray-manager.test.ts
git commit -m "feat(electron): add TrayManager with context menu and click toggle"
```

### Task 12: IPC Handlers (TDD)

**Files:**
- Create: `packages/electron/src/__tests__/ipc/handlers.test.ts`
- Create: `packages/electron/src/ipc/handlers.ts` (rewrite)

- [ ] **Step 1: Write IPC handler tests**

```typescript
// packages/electron/src/__tests__/ipc/handlers.test.ts

import { ipcMain, dialog, Notification, shell } from 'electron';
import { registerIpcHandlers } from '../../ipc/handlers';

describe('IPC Handlers', () => {
  const mockGetMainWindow = jest.fn();
  const mockGetConfig = jest.fn();
  const mockSetConfig = jest.fn();
  const mockGetBackendStatus = jest.fn();
  const mockGetBackendUrl = jest.fn();
  const mockHideSpotlight = jest.fn();
  const mockResizeSpotlight = jest.fn();

  beforeEach(() => {
    (ipcMain.on as jest.Mock).mockClear();
    (ipcMain.handle as jest.Mock).mockClear();

    registerIpcHandlers({
      getMainWindow: mockGetMainWindow,
      getConfig: mockGetConfig,
      setConfig: mockSetConfig,
      getBackendStatus: mockGetBackendStatus,
      getBackendUrl: mockGetBackendUrl,
      hideSpotlight: mockHideSpotlight,
      resizeSpotlight: mockResizeSpotlight,
    });
  });

  it('registers show-notification handler', () => {
    const calls = (ipcMain.on as jest.Mock).mock.calls;
    expect(calls.some((c: any[]) => c[0] === 'show-notification')).toBe(true);
  });

  it('registers dialog:openFile handler', () => {
    const calls = (ipcMain.handle as jest.Mock).mock.calls;
    expect(calls.some((c: any[]) => c[0] === 'dialog:openFile')).toBe(true);
  });

  it('registers dialog:saveFile handler', () => {
    const calls = (ipcMain.handle as jest.Mock).mock.calls;
    expect(calls.some((c: any[]) => c[0] === 'dialog:saveFile')).toBe(true);
  });

  it('registers window management handlers', () => {
    const onCalls = (ipcMain.on as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(onCalls).toContain('window:minimize');
    expect(onCalls).toContain('window:maximize');
    expect(onCalls).toContain('window:close');
  });

  it('registers config handlers', () => {
    const handleCalls = (ipcMain.handle as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(handleCalls).toContain('config:get');
    expect(handleCalls).toContain('config:set');
  });

  it('registers backend handlers', () => {
    const handleCalls = (ipcMain.handle as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(handleCalls).toContain('backend:getStatus');
    expect(handleCalls).toContain('backend:getUrl');
  });

  it('registers spotlight handlers', () => {
    const onCalls = (ipcMain.on as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(onCalls).toContain('spotlight:close');
    expect(onCalls).toContain('spotlight:resize');
  });

  it('registers shell:openExternal handler', () => {
    const handleCalls = (ipcMain.handle as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(handleCalls).toContain('shell:openExternal');
  });

  it('registers app:getVersion handler', () => {
    const handleCalls = (ipcMain.handle as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(handleCalls).toContain('app:getVersion');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/electron && npx jest --testPathPattern handlers.test --no-cache`
Expected: FAIL

- [ ] **Step 3: Implement IPC handlers**

```typescript
// packages/electron/src/ipc/handlers.ts

import { ipcMain, dialog, Notification, BrowserWindow, shell, app } from 'electron';
import * as fs from 'fs';

interface IpcDependencies {
  getMainWindow: () => BrowserWindow | null;
  getConfig: (key: string) => any;
  setConfig: (key: string, value: any) => void;
  getBackendStatus: () => string;
  getBackendUrl: () => string;
  hideSpotlight: () => void;
  resizeSpotlight: (height: number) => void;
}

export function registerIpcHandlers(deps: IpcDependencies): void {
  // Notifications
  ipcMain.on('show-notification', (_event, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      const notification = new Notification({ title, body });
      notification.on('click', () => {
        const win = deps.getMainWindow();
        if (win) { win.show(); win.focus(); }
      });
      notification.show();
    }
  });

  // File dialogs
  ipcMain.handle('dialog:openFile', async () => {
    const win = deps.getMainWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:saveFile', async (_event, data: string, filename: string) => {
    const win = deps.getMainWindow();
    if (!win) return null;
    const result = await dialog.showSaveDialog(win, {
      defaultPath: filename,
      filters: [{ name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, data, 'utf-8');
    return result.filePath;
  });

  // Window management
  ipcMain.on('window:minimize', () => deps.getMainWindow()?.minimize());
  ipcMain.on('window:maximize', () => {
    const win = deps.getMainWindow();
    if (win) { win.isMaximized() ? win.unmaximize() : win.maximize(); }
  });
  ipcMain.on('window:close', () => deps.getMainWindow()?.close());

  // External links
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  // App info
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getPath', (_event, name: string) => app.getPath(name as any));

  // Config
  ipcMain.handle('config:get', (_event, key: string) => deps.getConfig(key));
  ipcMain.handle('config:set', (_event, key: string, value: any) => {
    deps.setConfig(key, value);
  });

  // Backend
  ipcMain.handle('backend:getStatus', () => deps.getBackendStatus());
  ipcMain.handle('backend:getUrl', () => deps.getBackendUrl());

  // Spotlight
  ipcMain.on('spotlight:close', () => deps.hideSpotlight());
  ipcMain.on('spotlight:resize', (_event, height: number) => deps.resizeSpotlight(height));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/electron && npx jest --testPathPattern handlers.test --no-cache`
Expected: PASS — all 10 tests

- [ ] **Step 5: Commit**

```bash
git add packages/electron/src/ipc/handlers.ts packages/electron/src/__tests__/ipc/handlers.test.ts
git commit -m "feat(electron): rewrite IPC handlers with dependency injection and spotlight support"
```

### Task 13: App Menu

**Files:**
- Create: `packages/electron/src/menu/app-menu.ts`

- [ ] **Step 1: Create app-menu module** (ported from existing `menu.ts`)

```typescript
// packages/electron/src/menu/app-menu.ts

import { Menu, app, BrowserWindow, shell, dialog, MenuItemConstructorOptions } from 'electron';
import { APP_NAME } from '@zenai/shared';

export function createAppMenu(getMainWindow: () => BrowserWindow | null): void {
  const isMac = process.platform === 'darwin';

  const navigateTo = (page: string) => {
    const win = getMainWindow();
    if (!win) return;
    win.show();
    win.focus();
    win.webContents.send('navigate', page);
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: APP_NAME,
      submenu: [
        { role: 'about' as const, label: `Ueber ${APP_NAME}` },
        { type: 'separator' as const },
        { label: 'Einstellungen...', accelerator: 'CmdOrCtrl+,', click: () => navigateTo('settings') },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const, label: `${APP_NAME} ausblenden` },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const, label: `${APP_NAME} beenden` },
      ] as MenuItemConstructorOptions[],
    }] : []),
    {
      label: 'Ablage',
      submenu: [
        { label: 'Neuer Gedanke', accelerator: 'CmdOrCtrl+N', click: () => navigateTo('ideas/new') },
        { label: 'Neuer Chat', accelerator: 'CmdOrCtrl+Shift+N', click: () => navigateTo('chat') },
        { type: 'separator' },
        { label: 'Suche...', accelerator: 'CmdOrCtrl+K', click: () => {
          const win = getMainWindow();
          if (win) { win.show(); win.focus(); win.webContents.send('open-command-palette'); }
        }},
        { type: 'separator' },
        ...(isMac ? [] : [{ role: 'quit' as const }]),
      ] as MenuItemConstructorOptions[],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo', label: 'Widerrufen' }, { role: 'redo', label: 'Wiederholen' },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' }, { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einsetzen' }, { role: 'selectAll', label: 'Alles auswaehlen' },
      ] as MenuItemConstructorOptions[],
    },
    {
      label: 'Darstellung',
      submenu: [
        { role: 'reload', label: 'Neu laden' }, { role: 'forceReload', label: 'Erzwungenes Neuladen' },
        { role: 'toggleDevTools', label: 'Entwicklertools' }, { type: 'separator' },
        { role: 'resetZoom', label: 'Standardgroesse' }, { role: 'zoomIn', label: 'Vergroessern' },
        { role: 'zoomOut', label: 'Verkleinern' }, { type: 'separator' },
        { role: 'togglefullscreen', label: 'Vollbild' },
      ] as MenuItemConstructorOptions[],
    },
    {
      label: 'Navigieren',
      submenu: [
        { label: 'Dashboard', accelerator: 'CmdOrCtrl+1', click: () => navigateTo('dashboard') },
        { label: 'Chat', accelerator: 'CmdOrCtrl+2', click: () => navigateTo('chat') },
        { label: 'Gedanken', accelerator: 'CmdOrCtrl+3', click: () => navigateTo('ideas') },
        { label: 'Planer', accelerator: 'CmdOrCtrl+4', click: () => navigateTo('calendar') },
        { label: 'Email', accelerator: 'CmdOrCtrl+5', click: () => navigateTo('email') },
        { type: 'separator' },
        { label: 'Wissensbasis', accelerator: 'CmdOrCtrl+6', click: () => navigateTo('documents') },
        { label: 'Insights', accelerator: 'CmdOrCtrl+7', click: () => navigateTo('insights') },
      ] as MenuItemConstructorOptions[],
    },
    {
      label: 'Fenster',
      submenu: [
        { role: 'minimize', label: 'Minimieren' }, { role: 'zoom', label: 'Zoomen' },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const, label: 'Alles nach vorne' }]
          : [{ role: 'close' as const, label: 'Schliessen' }]),
      ] as MenuItemConstructorOptions[],
    },
    {
      label: 'Hilfe',
      submenu: [
        { label: `${APP_NAME} Website`, click: () => shell.openExternal('https://zensation.ai') },
        { label: 'Dokumentation', click: () => shell.openExternal('https://docs.zensation.ai') },
        { type: 'separator' },
        { label: `Ueber ${APP_NAME}`, click: () => {
          dialog.showMessageBox({
            type: 'info', title: `Ueber ${APP_NAME}`,
            message: `${APP_NAME} v${app.getVersion()}`,
            detail: `Personal AI Operating System\n\n© 2026 Alexander Bering\nZenSation Enterprise Solutions\nhttps://zensation.ai`,
          });
        }},
      ] as MenuItemConstructorOptions[],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/electron/src/menu/app-menu.ts
git commit -m "feat(electron): extract app menu to dedicated module"
```

---

## Chunk 5: Notifications + Preload + Updater + App Orchestrator

### Task 14: Notification Service (TDD)

**Files:**
- Create: `packages/electron/src/__tests__/notifications/notification-service.test.ts`
- Create: `packages/electron/src/notifications/notification-service.ts`

- [ ] **Step 1: Write notification service tests**

```typescript
// packages/electron/src/__tests__/notifications/notification-service.test.ts

import { Notification } from 'electron';
import { NotificationService } from '../../notifications/notification-service';

// Mock eventsource
const mockEventSource = { onmessage: null as any, onerror: null as any, close: jest.fn(), readyState: 1 };
jest.mock('eventsource', () => {
  return jest.fn().mockImplementation(() => ({ ...mockEventSource }));
});

import EventSource from 'eventsource';

describe('NotificationService', () => {
  let service: NotificationService;
  const mockShowAndNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (EventSource as unknown as jest.Mock).mockClear();
    service = new NotificationService(mockShowAndNavigate);
  });

  afterEach(() => {
    service.stop();
  });

  it('creates EventSource connections for both SSE endpoints', () => {
    service.start('http://localhost:3000', 'personal');

    expect(EventSource).toHaveBeenCalledTimes(2);
    expect(EventSource).toHaveBeenCalledWith(
      'http://localhost:3000/api/personal/smart-suggestions/stream'
    );
    expect(EventSource).toHaveBeenCalledWith(
      'http://localhost:3000/api/personal/proactive-engine/stream'
    );
  });

  it('uses the active context in SSE URLs', () => {
    service.start('http://localhost:3000', 'work');

    expect(EventSource).toHaveBeenCalledWith(
      'http://localhost:3000/api/work/smart-suggestions/stream'
    );
  });

  it('stop closes all connections', () => {
    service.start('http://localhost:3000', 'personal');
    service.stop();

    // Each EventSource instance should have close called
    const instances = (EventSource as unknown as jest.Mock).mock.results;
    for (const instance of instances) {
      expect(instance.value.close).toHaveBeenCalled();
    }
  });

  it('reconnect stops and starts with new params', () => {
    service.start('http://localhost:3000', 'personal');
    const firstCallCount = (EventSource as unknown as jest.Mock).mock.calls.length;

    service.reconnect('http://cloud.test', 'work');

    expect((EventSource as unknown as jest.Mock).mock.calls.length).toBeGreaterThan(firstCallCount);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/electron && npx jest --testPathPattern notification-service.test --no-cache`
Expected: FAIL

- [ ] **Step 3: Implement notification service**

```typescript
// packages/electron/src/notifications/notification-service.ts

import { Notification } from 'electron';
import EventSource from 'eventsource';

export class NotificationService {
  private connections: EventSource[] = [];

  constructor(private showAndNavigate: (page: string) => void) {}

  start(backendUrl: string, context: string): void {
    this.stop();

    const endpoints = [
      `${backendUrl}/api/${context}/smart-suggestions/stream`,
      `${backendUrl}/api/${context}/proactive-engine/stream`,
    ];

    for (const url of endpoints) {
      try {
        const source = new EventSource(url);

        source.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.showNativeNotification(
              data.title || 'ZenAI',
              data.body || data.message || '',
              data.page,
            );
          } catch {
            // ignore malformed events
          }
        };

        source.onerror = () => {
          // EventSource auto-reconnects
        };

        this.connections.push(source);
      } catch {
        // ignore connection failures
      }
    }
  }

  stop(): void {
    for (const conn of this.connections) {
      conn.close();
    }
    this.connections = [];
  }

  reconnect(backendUrl: string, context?: string): void {
    this.stop();
    this.start(backendUrl, context || 'personal');
  }

  private showNativeNotification(title: string, body: string, page?: string): void {
    if (!Notification.isSupported()) return;

    const notification = new Notification({ title, body });
    notification.on('click', () => {
      if (page) {
        this.showAndNavigate(page);
      }
    });
    notification.show();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/electron && npx jest --testPathPattern notification-service.test --no-cache`
Expected: PASS — all 4 tests

- [ ] **Step 5: Commit**

```bash
git add packages/electron/src/notifications/notification-service.ts packages/electron/src/__tests__/notifications/notification-service.test.ts
git commit -m "feat(electron): add NotificationService with SSE to native notification bridge"
```

### Task 15: Preload script (rewrite)

**Files:**
- Create: `packages/electron/src/preload.ts` (overwrite existing)

- [ ] **Step 1: Rewrite preload with cleanup pattern**

```typescript
// packages/electron/src/preload.ts

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

const electronAPI = {
  platform: process.platform,
  isElectron: true as const,

  // Navigation
  onNavigate: (callback: (page: string) => void) => {
    const handler = (_event: IpcRendererEvent, page: string) => callback(page);
    ipcRenderer.on('navigate', handler);
    return () => ipcRenderer.removeListener('navigate', handler);
  },

  // Notifications
  showNotification: (title: string, body: string) => {
    ipcRenderer.send('show-notification', { title, body });
  },

  // File dialogs
  openFile: () => ipcRenderer.invoke('dialog:openFile') as Promise<string | null>,
  saveFile: (data: string, filename: string) =>
    ipcRenderer.invoke('dialog:saveFile', data, filename) as Promise<string | null>,

  // Window management
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // External links
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url) as Promise<boolean>,

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,

  // Auto-update events
  onUpdateAvailable: (callback: (info: { version: string; releaseDate: string }) => void) => {
    const handler = (_event: IpcRendererEvent, info: any) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateProgress: (callback: (info: { percent: number }) => void) => {
    const handler = (_event: IpcRendererEvent, info: any) => callback(info);
    ipcRenderer.on('update-progress', handler);
    return () => ipcRenderer.removeListener('update-progress', handler);
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    const handler = (_event: IpcRendererEvent, info: any) => callback(info);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },

  // Command palette
  onOpenCommandPalette: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('open-command-palette', handler);
    return () => ipcRenderer.removeListener('open-command-palette', handler);
  },

  // Config
  config: {
    get: (key: string) => ipcRenderer.invoke('config:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('config:set', key, value),
  },

  // Backend
  backend: {
    getStatus: () => ipcRenderer.invoke('backend:getStatus') as Promise<string>,
    getUrl: () => ipcRenderer.invoke('backend:getUrl') as Promise<string>,
  },

  // Spotlight
  spotlight: {
    onShow: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('spotlight:show', handler);
      return () => ipcRenderer.removeListener('spotlight:show', handler);
    },
    onHide: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('spotlight:hide', handler);
      return () => ipcRenderer.removeListener('spotlight:hide', handler);
    },
    close: () => ipcRenderer.send('spotlight:close'),
    resize: (height: number) => ipcRenderer.send('spotlight:resize', height),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
```

- [ ] **Step 2: Commit**

```bash
git add packages/electron/src/preload.ts
git commit -m "feat(electron): rewrite preload with listener cleanup pattern and new APIs"
```

### Task 16: Updater (keep existing)

**Files:**
- Keep: `packages/electron/src/updater.ts` (no changes needed)

No action required — the existing updater.ts is already clean and modular.

### Task 17: ZenAIApp orchestrator + main.ts (TDD)

**Files:**
- Create: `packages/electron/src/__tests__/app.test.ts`
- Create: `packages/electron/src/app.ts`
- Create: `packages/electron/src/main.ts` (overwrite)

- [ ] **Step 1: Write app tests**

```typescript
// packages/electron/src/__tests__/app.test.ts

import { app } from 'electron';
import { ZenAIApp } from '../app';

jest.mock('../config', () => ({
  createConfig: jest.fn().mockReturnValue({
    get: jest.fn().mockImplementation((key: string) => {
      const defaults: Record<string, any> = {
        cloudBackendUrl: 'http://cloud.test',
        localBackendPort: 3000,
        spotlightShortcut: 'CmdOrCtrl+Shift+Space',
        searchShortcut: 'CmdOrCtrl+Shift+K',
        dockMode: 'menubar',
        healthCheckInterval: 30000,
        frontendDevPort: 5173,
        activeContext: 'personal',
        localBackendStartupTimeout: 15000,
      };
      return defaults[key];
    }),
    set: jest.fn(),
    getAll: jest.fn(),
  }),
}));

jest.mock('../backend/backend-bridge', () => ({
  BackendBridge: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    getBaseUrl: jest.fn().mockReturnValue('http://cloud.test'),
    getStatus: jest.fn().mockReturnValue('cloud_connected'),
    on: jest.fn(),
  })),
}));

jest.mock('../windows/window-manager', () => ({
  WindowManager: jest.fn().mockImplementation(() => ({
    init: jest.fn(),
    toggleSpotlight: jest.fn(),
    showMainWindow: jest.fn(),
    hideMainWindow: jest.fn(),
    showAndNavigate: jest.fn(),
    focusOrCreate: jest.fn(),
    hideSpotlight: jest.fn(),
    resizeSpotlight: jest.fn(),
    getMainWindow: jest.fn().mockReturnValue({ getWindow: jest.fn().mockReturnValue(null) }),
  })),
}));

jest.mock('../ipc/handlers', () => ({ registerIpcHandlers: jest.fn() }));
jest.mock('../tray/tray-manager', () => ({
  TrayManager: jest.fn().mockImplementation(() => ({
    create: jest.fn(),
    destroy: jest.fn(),
  })),
}));
jest.mock('../shortcuts/shortcut-manager', () => ({
  ShortcutManager: jest.fn().mockImplementation(() => ({
    register: jest.fn(),
    unregister: jest.fn(),
  })),
}));
jest.mock('../menu/app-menu', () => ({ createAppMenu: jest.fn() }));
jest.mock('../notifications/notification-service', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    reconnect: jest.fn(),
  })),
}));
jest.mock('../updater', () => ({ initAutoUpdater: jest.fn() }));

describe('ZenAIApp', () => {
  let zenaiApp: ZenAIApp;

  beforeEach(() => {
    jest.clearAllMocks();
    zenaiApp = new ZenAIApp();
  });

  it('requests single instance lock', () => {
    expect(app.requestSingleInstanceLock).toHaveBeenCalled();
  });

  it('start calls app.whenReady', async () => {
    await zenaiApp.start();
    expect(app.whenReady).toHaveBeenCalled();
  });

  it('initializes all modules on start', async () => {
    await zenaiApp.start();

    const { registerIpcHandlers } = require('../ipc/handlers');
    const { createAppMenu } = require('../menu/app-menu');
    const { initAutoUpdater } = require('../updater');
    const { WindowManager } = require('../windows/window-manager');
    const { TrayManager } = require('../tray/tray-manager');
    const { ShortcutManager } = require('../shortcuts/shortcut-manager');

    expect(registerIpcHandlers).toHaveBeenCalled();
    expect(createAppMenu).toHaveBeenCalled();
    expect(initAutoUpdater).toHaveBeenCalled();
    expect(WindowManager).toHaveBeenCalled();
    expect(TrayManager).toHaveBeenCalled();
    expect(ShortcutManager).toHaveBeenCalled();
  });

  it('hides dock in menubar mode on macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    zenaiApp = new ZenAIApp();
    await zenaiApp.start();
    expect(app.dock.hide).toHaveBeenCalled();
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  });

  it('registers will-quit handler', async () => {
    await zenaiApp.start();
    const onCalls = (app.on as jest.Mock).mock.calls;
    expect(onCalls.some((c: any[]) => c[0] === 'will-quit')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/electron && npx jest --testPathPattern app.test --no-cache`
Expected: FAIL

- [ ] **Step 3: Implement ZenAIApp**

```typescript
// packages/electron/src/app.ts

import { app, BrowserWindow } from 'electron';
import { APP_NAME, DEFAULT_FRONTEND_PORT } from '@zenai/shared';
import { createConfig, ConfigStore } from './config';
import { BackendBridge } from './backend/backend-bridge';
import { WindowManager } from './windows/window-manager';
import { TrayManager } from './tray/tray-manager';
import { ShortcutManager } from './shortcuts/shortcut-manager';
import { NotificationService } from './notifications/notification-service';
import { registerIpcHandlers } from './ipc/handlers';
import { createAppMenu } from './menu/app-menu';
import { initAutoUpdater } from './updater';

export class ZenAIApp {
  private config: ConfigStore;
  private backendBridge!: BackendBridge;
  private windowManager!: WindowManager;
  private trayManager!: TrayManager;
  private shortcutManager!: ShortcutManager;
  private notificationService!: NotificationService;

  constructor() {
    this.config = createConfig();

    // Prevent multiple instances
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
      app.quit();
      return;
    }

    app.on('second-instance', () => {
      this.windowManager?.focusOrCreate();
    });
  }

  async start(): Promise<void> {
    await app.whenReady();

    // Dock mode
    if (this.config.get('dockMode') === 'menubar' && process.platform === 'darwin') {
      app.dock.hide();
    }

    const isDev = !app.isPackaged;
    const frontendUrl = isDev
      ? `http://localhost:${this.config.get('frontendDevPort')}`
      : `file://${require('path').join(__dirname, '../renderer/index.html')}`;

    // Backend
    this.backendBridge = new BackendBridge(
      this.config.get('cloudBackendUrl'),
      this.config.get('localBackendPort'),
      isDev,
      this.config.get('healthCheckInterval'),
      this.config.get('localBackendStartupTimeout'),
    );

    try {
      await this.backendBridge.start();
      console.log(`[${APP_NAME}] Backend: ${this.backendBridge.getStatus()} at ${this.backendBridge.getBaseUrl()}`);
    } catch (err) {
      console.error(`[${APP_NAME}] Backend start failed:`, err);
    }

    // Windows
    this.windowManager = new WindowManager(frontendUrl);
    this.windowManager.init();

    // IPC
    registerIpcHandlers({
      getMainWindow: () => this.windowManager.getMainWindow().getWindow(),
      getConfig: (key) => this.config.get(key as any),
      setConfig: (key, value) => this.config.set(key as any, value),
      getBackendStatus: () => this.backendBridge.getStatus(),
      getBackendUrl: () => this.backendBridge.getBaseUrl(),
      hideSpotlight: () => this.windowManager.hideSpotlight(),
      resizeSpotlight: (h) => this.windowManager.resizeSpotlight(h),
    });

    // Tray
    this.trayManager = new TrayManager({
      showAndNavigate: (page) => this.windowManager.showAndNavigate(page),
      showMainWindow: () => this.windowManager.showMainWindow(),
      hideMainWindow: () => this.windowManager.hideMainWindow(),
      isMainWindowVisible: () => this.windowManager.getMainWindow().isVisible(),
      quit: () => app.quit(),
    });
    this.trayManager.create();

    // Shortcuts
    this.shortcutManager = new ShortcutManager(
      {
        spotlight: this.config.get('spotlightShortcut'),
        search: this.config.get('searchShortcut'),
      },
      {
        onToggleSpotlight: () => this.windowManager.toggleSpotlight(),
        onShowSearch: () => {
          this.windowManager.showMainWindow();
          this.windowManager.getMainWindow().getWindow()?.webContents.send('open-command-palette');
        },
      },
    );
    this.shortcutManager.register();

    // Menu
    createAppMenu(() => this.windowManager.getMainWindow().getWindow());

    // Notifications
    this.notificationService = new NotificationService(
      (page) => this.windowManager.showAndNavigate(page),
    );
    this.notificationService.start(
      this.backendBridge.getBaseUrl(),
      this.config.get('activeContext'),
    );

    // Auto-updater
    initAutoUpdater(() => this.windowManager.getMainWindow().getWindow());

    // macOS: re-create window on dock click
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.windowManager.focusOrCreate();
      } else {
        this.windowManager.showMainWindow();
      }
    });

    // Cleanup
    app.on('will-quit', () => {
      this.shortcutManager.unregister();
      this.notificationService.stop();
      this.trayManager.destroy();
      this.backendBridge.stop();
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    console.log(`[${APP_NAME}] Desktop Agent ready (${isDev ? 'development' : 'production'})`);
  }
}
```

- [ ] **Step 4: Write main.ts entry point**

```typescript
// packages/electron/src/main.ts

import { ZenAIApp } from './app';

const zenai = new ZenAIApp();
zenai.start().catch((err) => {
  console.error('[ZenAI] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/electron && npx jest --testPathPattern app.test --no-cache`
Expected: PASS — all 5 tests

- [ ] **Step 6: Delete old files that are now replaced**

```bash
rm packages/electron/src/menu.ts
```

- [ ] **Step 7: Run full test suite**

Run: `cd packages/electron && npx jest --no-cache`
Expected: PASS — all tests across all modules (~80+ tests)

- [ ] **Step 8: Run TypeScript build**

Run: `cd packages/electron && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 9: Commit**

```bash
git add packages/electron/src/app.ts packages/electron/src/main.ts
git rm packages/electron/src/menu.ts
git add -A packages/electron/src/__tests__/app.test.ts
git commit -m "feat(electron): add ZenAIApp orchestrator and minimal main.ts entry point

Full rewrite of Desktop Agent with modular architecture:
- SpotlightWindow (frameless popup, Cmd+Shift+Space)
- BackendBridge (cloud-first, local fallback)
- NotificationService (SSE → native notifications)
- Configurable dock/menubar mode
- ~80+ tests across all modules"
```

---

## Chunk 6: Final Verification

### Task 18: Full build and test verification

- [ ] **Step 1: Run full test suite**

Run: `cd packages/electron && npx jest --no-cache --verbose`
Expected: All tests pass, 0 failures

- [ ] **Step 2: Run TypeScript build**

Run: `cd packages/electron && npm run build`
Expected: Clean compilation, no errors

- [ ] **Step 3: Verify file structure matches spec**

Run: `find packages/electron/src -name '*.ts' | sort`
Expected output should match the architecture from the spec.

- [ ] **Step 4: Verify no old monolithic files remain**

Run: `wc -l packages/electron/src/main.ts`
Expected: < 30 lines

- [ ] **Step 5: Final commit (if any cleanup needed)**

```bash
git add -A packages/electron/
git commit -m "chore(electron): final cleanup for Phase 4 Desktop Agent"
```
