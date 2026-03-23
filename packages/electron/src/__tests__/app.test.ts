/**
 * ZenAIApp orchestrator tests
 *
 * Verifies that start() initialises all sub-modules and wires lifecycle hooks.
 */

import { app } from 'electron';

// ─── Config mock ─────────────────────────────────────────────────────────────

const defaults: Record<string, unknown> = {
  cloudBackendUrl: 'https://cloud.test',
  localBackendPort: 3000,
  healthCheckInterval: 30000,
  localBackendStartupTimeout: 30000,
  spotlightShortcut: 'CommandOrControl+Space',
  searchShortcut: 'CommandOrControl+Shift+F',
  dockMode: 'spotlight',
  frontendDevPort: 5173,
  activeContext: 'personal',
};

const mockConfig = {
  get: jest.fn((key: string) => defaults[key]),
  set: jest.fn(),
  getAll: jest.fn(() => defaults),
};

jest.mock('../config', () => ({
  createConfig: jest.fn().mockReturnValue(mockConfig),
}));

// ─── BackendBridge mock ───────────────────────────────────────────────────────

const mockBackendBridge = {
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  getBaseUrl: jest.fn().mockReturnValue('http://cloud.test'),
  getStatus: jest.fn().mockReturnValue('cloud_connected'),
  on: jest.fn(),
};

jest.mock('../backend/backend-bridge', () => ({
  BackendBridge: jest.fn().mockImplementation(() => mockBackendBridge),
}));

// ─── WindowManager mock ───────────────────────────────────────────────────────

const mockMainWindowHandle = {
  getWindow: jest.fn().mockReturnValue(null),
  isVisible: jest.fn().mockReturnValue(false),
};

const mockWindowManager = {
  init: jest.fn(),
  toggleSpotlight: jest.fn(),
  showMainWindow: jest.fn(),
  hideMainWindow: jest.fn(),
  showAndNavigate: jest.fn(),
  focusOrCreate: jest.fn(),
  hideSpotlight: jest.fn(),
  resizeSpotlight: jest.fn(),
  getMainWindow: jest.fn().mockReturnValue(mockMainWindowHandle),
};

jest.mock('../windows/window-manager', () => ({
  WindowManager: jest.fn().mockImplementation(() => mockWindowManager),
}));

// ─── IPC handlers mock ────────────────────────────────────────────────────────

const mockRegisterIpcHandlers = jest.fn();
jest.mock('../ipc/handlers', () => ({
  registerIpcHandlers: mockRegisterIpcHandlers,
}));

// ─── TrayManager mock ─────────────────────────────────────────────────────────

const mockTrayManager = {
  create: jest.fn(),
  destroy: jest.fn(),
};

jest.mock('../tray/tray-manager', () => ({
  TrayManager: jest.fn().mockImplementation(() => mockTrayManager),
}));

// ─── ShortcutManager mock ─────────────────────────────────────────────────────

const mockShortcutManager = {
  register: jest.fn(),
  unregister: jest.fn(),
};

jest.mock('../shortcuts/shortcut-manager', () => ({
  ShortcutManager: jest.fn().mockImplementation(() => mockShortcutManager),
}));

// ─── App menu mock ────────────────────────────────────────────────────────────

const mockCreateAppMenu = jest.fn();
jest.mock('../menu/app-menu', () => ({
  createAppMenu: mockCreateAppMenu,
}));

// ─── NotificationService mock ─────────────────────────────────────────────────

const mockNotificationService = {
  start: jest.fn(),
  stop: jest.fn(),
  reconnect: jest.fn(),
};

jest.mock('../notifications/notification-service', () => ({
  NotificationService: jest.fn().mockImplementation(() => mockNotificationService),
}));

// ─── Auto-updater mock ────────────────────────────────────────────────────────

const mockInitAutoUpdater = jest.fn();
jest.mock('../updater', () => ({
  initAutoUpdater: mockInitAutoUpdater,
}));

// ─── Import subject under test ────────────────────────────────────────────────

import { ZenAIApp } from '../app';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ZenAIApp', () => {
  let zenai: ZenAIApp;
  const mockApp = app as jest.Mocked<typeof app>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure whenReady resolves immediately
    (mockApp.whenReady as jest.Mock).mockResolvedValue(undefined);
    zenai = new ZenAIApp();
  });

  it('requests the single instance lock during construction', () => {
    expect(mockApp.requestSingleInstanceLock).toHaveBeenCalledTimes(1);
  });

  it('start() calls app.whenReady()', async () => {
    await zenai.start();
    expect(mockApp.whenReady).toHaveBeenCalledTimes(1);
  });

  it('initialises all required modules during start()', async () => {
    await zenai.start();

    expect(mockRegisterIpcHandlers).toHaveBeenCalledTimes(1);
    expect(mockCreateAppMenu).toHaveBeenCalledTimes(1);
    expect(mockInitAutoUpdater).toHaveBeenCalledTimes(1);
    expect(mockWindowManager.init).toHaveBeenCalledTimes(1);
    expect(mockTrayManager.create).toHaveBeenCalledTimes(1);
    expect(mockShortcutManager.register).toHaveBeenCalledTimes(1);
  });

  it('hides the dock in menubar mode on macOS', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    // Set dockMode to 'menubar'
    mockConfig.get.mockImplementation((key: string) =>
      key === 'dockMode' ? 'menubar' : defaults[key],
    );

    zenai = new ZenAIApp();
    await zenai.start();

    expect(mockApp.dock?.hide).toHaveBeenCalledTimes(1);

    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    mockConfig.get.mockImplementation((key: string) => defaults[key]);
  });

  it('registers the will-quit event handler', async () => {
    await zenai.start();

    const calls = (mockApp.on as jest.Mock).mock.calls;
    const willQuitCall = calls.find(([event]: [string]) => event === 'will-quit');
    expect(willQuitCall).toBeDefined();
  });
});
