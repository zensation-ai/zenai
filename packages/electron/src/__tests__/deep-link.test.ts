import { BrowserWindow } from 'electron';
import { handleDeepLink, DeepLinkDeps } from '../deep-link';
import { createMainWindow, getMainWindow, MainWindowConfig } from '../windows/main-window';

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

function setupWindow(): BrowserWindow {
  const win = createMainWindow(defaultConfig);
  // Reset call counts from createMainWindow
  jest.clearAllMocks();
  return win;
}

function makeDeps(): DeepLinkDeps {
  return { ensureMainWindow: jest.fn() };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deep-link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockBW._reset();
  });

  describe('handleDeepLink', () => {
    it('calls ensureMainWindow on every invocation', () => {
      const deps = makeDeps();
      setupWindow();
      handleDeepLink('zenai://chat', deps);
      expect(deps.ensureMainWindow).toHaveBeenCalledTimes(1);
    });

    it('shows and focuses the main window', () => {
      const deps = makeDeps();
      setupWindow();
      handleDeepLink('zenai://chat', deps);
      const win = getMainWindow()!;
      expect(win.show).toHaveBeenCalled();
      expect(win.focus).toHaveBeenCalled();
    });

    it('navigates to chat for zenai://chat', () => {
      const deps = makeDeps();
      setupWindow();
      handleDeepLink('zenai://chat', deps);
      const win = getMainWindow()!;
      expect(win.webContents.send).toHaveBeenCalledWith('navigate', 'chat');
    });

    it('navigates to settings for zenai://settings', () => {
      const deps = makeDeps();
      setupWindow();
      handleDeepLink('zenai://settings', deps);
      const win = getMainWindow()!;
      expect(win.webContents.send).toHaveBeenCalledWith('navigate', 'settings');
    });

    it('navigates to specific idea for zenai://idea/abc-123', () => {
      const deps = makeDeps();
      setupWindow();
      handleDeepLink('zenai://idea/abc-123', deps);
      const win = getMainWindow()!;
      expect(win.webContents.send).toHaveBeenCalledWith('navigate', 'ideas/abc-123');
    });

    it('navigates to ideas list for zenai://idea (no id)', () => {
      const deps = makeDeps();
      setupWindow();
      handleDeepLink('zenai://idea', deps);
      const win = getMainWindow()!;
      expect(win.webContents.send).toHaveBeenCalledWith('navigate', 'ideas');
    });

    it('handles unknown scheme gracefully (just focuses window)', () => {
      const deps = makeDeps();
      setupWindow();
      handleDeepLink('zenai://unknown-path', deps);
      const win = getMainWindow()!;
      // Window should be shown/focused but no navigate for unknown host
      expect(win.show).toHaveBeenCalled();
      expect(win.focus).toHaveBeenCalled();
      // navigate is NOT called since unknown host falls through the switch
      expect(win.webContents.send).not.toHaveBeenCalledWith('navigate', expect.anything());
    });

    it('handles malformed URLs gracefully', () => {
      const deps = makeDeps();
      setupWindow();
      // Should not throw
      expect(() => handleDeepLink('not-a-valid-url', deps)).not.toThrow();
      expect(deps.ensureMainWindow).toHaveBeenCalled();
    });

    it('handles empty string gracefully', () => {
      const deps = makeDeps();
      setupWindow();
      expect(() => handleDeepLink('', deps)).not.toThrow();
    });

    it('handles idea with nested path', () => {
      const deps = makeDeps();
      setupWindow();
      handleDeepLink('zenai://idea/uuid-with-dashes', deps);
      const win = getMainWindow()!;
      expect(win.webContents.send).toHaveBeenCalledWith('navigate', 'ideas/uuid-with-dashes');
    });

    it('restores minimized window', () => {
      const deps = makeDeps();
      setupWindow();
      const win = getMainWindow()!;
      (win.isMinimized as jest.Mock).mockReturnValue(true);

      handleDeepLink('zenai://chat', deps);
      expect(win.restore).toHaveBeenCalled();
    });
  });
});
