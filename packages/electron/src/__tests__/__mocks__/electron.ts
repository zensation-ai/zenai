/**
 * Mock for the `electron` module used in unit tests.
 * All APIs are jest.fn() stubs; BrowserWindow keeps a static _instances array
 * so tests can inspect created windows without running the real Electron runtime.
 */

// ─── BrowserWindow ────────────────────────────────────────────────────────────

function createMockBrowserWindow(self: BrowserWindow) {
  return {
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
    isDestroyed: jest.fn().mockReturnValue(false),
    setSize: jest.fn(),
    getSize: jest.fn().mockReturnValue([680, 72]),
    setPosition: jest.fn(),
    getPosition: jest.fn().mockReturnValue([0, 0]),
    /** once auto-calls the callback for 'ready-to-show' */
    once: jest.fn().mockImplementation((event: string, cb: () => void) => {
      if (event === 'ready-to-show') {
        cb();
      }
    }),
    on: jest.fn(),
    webContents: {
      send: jest.fn(),
      setWindowOpenHandler: jest.fn(),
      openDevTools: jest.fn(),
      reload: jest.fn(),
      on: jest.fn(),
    },
  };
}

export class BrowserWindow {
  static _instances: BrowserWindow[] = [];

  static _reset(): void {
    BrowserWindow._instances = [];
  }

  static getAllWindows(): BrowserWindow[] {
    return BrowserWindow._instances;
  }

  opts: unknown;
  // Properties assigned via Object.assign in constructor — use definite assignment assertions
  loadURL!: jest.Mock;
  show!: jest.Mock;
  hide!: jest.Mock;
  focus!: jest.Mock;
  close!: jest.Mock;
  destroy!: jest.Mock;
  minimize!: jest.Mock;
  maximize!: jest.Mock;
  unmaximize!: jest.Mock;
  isVisible!: jest.Mock;
  isDestroyed!: jest.Mock;
  setSize!: jest.Mock;
  getSize!: jest.Mock;
  setPosition!: jest.Mock;
  getPosition!: jest.Mock;
  once!: jest.Mock;
  on!: jest.Mock;
  webContents!: {
    send: jest.Mock;
    setWindowOpenHandler: jest.Mock;
    openDevTools: jest.Mock;
    reload: jest.Mock;
    on: jest.Mock;
  };

  constructor(options?: unknown) {
    this.opts = options;
    Object.assign(this, createMockBrowserWindow(this));
    BrowserWindow._instances.push(this);
  }
}

// ─── Tray ────────────────────────────────────────────────────────────────────

export class Tray {
  setContextMenu = jest.fn();
  setToolTip = jest.fn();
  on = jest.fn();
  destroy = jest.fn();

  constructor(_image?: unknown) {}
}

// ─── Notification ─────────────────────────────────────────────────────────────

export class Notification {
  static isSupported = jest.fn().mockReturnValue(true);

  show = jest.fn();
  on = jest.fn();

  constructor(_options?: unknown) {}
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export const Menu = {
  buildFromTemplate: jest.fn().mockReturnValue({}),
  setApplicationMenu: jest.fn(),
};

// ─── app ─────────────────────────────────────────────────────────────────────

export const app = {
  isPackaged: false,
  whenReady: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  quit: jest.fn(),
  getVersion: jest.fn().mockReturnValue('3.0.0'),
  getPath: jest.fn().mockReturnValue('/tmp/zenai-test'),
  requestSingleInstanceLock: jest.fn().mockReturnValue(true),
  dock: {
    hide: jest.fn(),
    show: jest.fn(),
  },
  getName: jest.fn().mockReturnValue('ZenAI'),
};

// ─── globalShortcut ──────────────────────────────────────────────────────────

export const globalShortcut = {
  register: jest.fn().mockReturnValue(true),
  unregisterAll: jest.fn(),
  isRegistered: jest.fn().mockReturnValue(false),
};

// ─── ipcMain ─────────────────────────────────────────────────────────────────

export const ipcMain = {
  on: jest.fn(),
  handle: jest.fn(),
  removeHandler: jest.fn(),
};

// ─── ipcRenderer ─────────────────────────────────────────────────────────────

export const ipcRenderer = {
  on: jest.fn(),
  send: jest.fn(),
  invoke: jest.fn().mockResolvedValue(undefined),
  removeListener: jest.fn(),
};

// ─── contextBridge ──────────────────────────────────────────────────────────

export const contextBridge = {
  exposeInMainWorld: jest.fn(),
};

// ─── shell ───────────────────────────────────────────────────────────────────

export const shell = {
  openExternal: jest.fn().mockResolvedValue(undefined),
};

// ─── dialog ──────────────────────────────────────────────────────────────────

export const dialog = {
  showOpenDialog: jest.fn().mockResolvedValue({ canceled: false, filePaths: [] }),
  showSaveDialog: jest.fn().mockResolvedValue({ canceled: false, filePath: undefined }),
  showMessageBox: jest.fn().mockResolvedValue({ response: 0, checkboxChecked: false }),
};

// ─── nativeImage ─────────────────────────────────────────────────────────────

export const nativeImage = {
  createFromBuffer: jest.fn().mockReturnValue({}),
};

// ─── screen ──────────────────────────────────────────────────────────────────

export const screen = {
  getPrimaryDisplay: jest.fn().mockReturnValue({
    workAreaSize: { width: 1920, height: 1080 },
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  }),
};

// ─── desktopCapturer ─────────────────────────────────────────────────────────

export const desktopCapturer = {
  getSources: jest.fn().mockResolvedValue([]),
};
