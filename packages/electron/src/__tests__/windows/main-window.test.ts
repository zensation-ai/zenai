import { BrowserWindow } from 'electron';
import { createMainWindow, getMainWindow, showAndFocus, MainWindowConfig } from '../../windows/main-window';

// Cast to access mock-only static members
const MockBW = BrowserWindow as unknown as {
  _instances: BrowserWindow[];
  _reset(): void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const defaultConfig: MainWindowConfig = {
  frontendUrl: 'http://localhost:5173',
  vercelOrigin: 'http://localhost:5173',
  railwayOrigin: 'http://localhost:3000',
  isDev: false,
};

function getLastWindow(): BrowserWindow {
  const instances = MockBW._instances;
  return instances[instances.length - 1];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('main-window', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockBW._reset();
  });

  describe('createMainWindow', () => {
    it('creates a BrowserWindow instance', () => {
      createMainWindow(defaultConfig);
      expect(MockBW._instances).toHaveLength(1);
    });

    it('creates window with correct dimensions (1400x900, min 800x600)', () => {
      createMainWindow(defaultConfig);
      const win = getLastWindow();
      expect((win as any).opts).toMatchObject({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
      });
    });

    it('uses hidden inset title bar style for macOS traffic lights', () => {
      createMainWindow(defaultConfig);
      const win = getLastWindow();
      expect((win as any).opts.titleBarStyle).toBe('hiddenInset');
    });

    it('enables context isolation and disables node integration', () => {
      createMainWindow(defaultConfig);
      const win = getLastWindow();
      expect((win as any).opts.webPreferences).toMatchObject({
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      });
    });

    it('loads the configured frontend URL', () => {
      createMainWindow(defaultConfig);
      const win = getLastWindow();
      expect(win.loadURL).toHaveBeenCalledWith('http://localhost:5173');
    });

    it('returns the created BrowserWindow', () => {
      const win = createMainWindow(defaultConfig);
      expect(win).toBe(getLastWindow());
    });

    it('shows window on ready-to-show event', () => {
      createMainWindow(defaultConfig);
      const win = getLastWindow();
      // The mock's once() auto-fires 'ready-to-show' callback
      expect(win.show).toHaveBeenCalled();
    });

    it('sets up window open handler for OAuth popups', () => {
      createMainWindow(defaultConfig);
      const win = getLastWindow();
      expect(win.webContents.setWindowOpenHandler).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('getMainWindow', () => {
    it('returns the current main window after creation', () => {
      createMainWindow(defaultConfig);
      expect(getMainWindow()).toBe(getLastWindow());
    });
  });

  describe('showAndFocus', () => {
    it('shows and focuses the window', () => {
      createMainWindow(defaultConfig);
      const win = getMainWindow()!;
      showAndFocus('chat');
      expect(win.show).toHaveBeenCalled();
      expect(win.focus).toHaveBeenCalled();
    });

    it('sends navigate event with the page path', () => {
      createMainWindow(defaultConfig);
      const win = getMainWindow()!;
      showAndFocus('ideas/new');
      expect(win.webContents.send).toHaveBeenCalledWith('navigate', 'ideas/new');
    });
  });
});
