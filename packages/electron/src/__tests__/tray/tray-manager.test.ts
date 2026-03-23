import { Tray, Menu, nativeImage } from 'electron';
import { TrayManager } from '../../tray/tray-manager';

// ─── Types ────────────────────────────────────────────────────────────────────

type MockTray = {
  setContextMenu: jest.Mock;
  setToolTip: jest.Mock;
  on: jest.Mock;
  destroy: jest.Mock;
};

type MockTrayClass = typeof Tray & {
  _instances?: MockTray[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCallbacks() {
  return {
    showAndNavigate: jest.fn(),
    showMainWindow: jest.fn(),
    hideMainWindow: jest.fn(),
    isMainWindowVisible: jest.fn().mockReturnValue(false),
    quit: jest.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TrayManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Creates a Tray with icon
  it('creates a Tray with icon', () => {
    const callbacks = makeCallbacks();
    const manager = new TrayManager(callbacks);
    manager.create();

    expect(nativeImage.createFromBuffer).toHaveBeenCalled();
    // Verify a Tray instance was created and is accessible on the manager
    const trayInstance = (manager as unknown as { tray: MockTray | null }).tray;
    expect(trayInstance).not.toBeNull();
  });

  // 2. Sets tooltip to 'ZenAI'
  it("sets tooltip to 'ZenAI'", () => {
    const callbacks = makeCallbacks();
    const manager = new TrayManager(callbacks);
    manager.create();

    // The Tray constructor was called; grab the most recently created instance
    const MockTrayClass = Tray as unknown as MockTrayClass;
    // All Tray instances since mock tracks via the class prototype methods
    // We verify via the mock prototype directly
    const trayInstance = (manager as unknown as { tray: MockTray }).tray;
    expect(trayInstance.setToolTip).toHaveBeenCalledWith('ZenAI');
  });

  // 3. Builds context menu with correct items
  it('builds context menu with correct items', () => {
    const callbacks = makeCallbacks();
    const manager = new TrayManager(callbacks);
    manager.create();

    expect(Menu.buildFromTemplate).toHaveBeenCalled();
    const template = (Menu.buildFromTemplate as jest.Mock).mock.calls[0][0] as Array<{ label?: string }>;

    const labels = template.map((item) => item.label).filter(Boolean);
    expect(labels).toContain('ZenAI - Personal AI OS');
    expect(labels).toContain('Neuer Gedanke');
    expect(labels).toContain('Quick Chat');
    expect(labels).toContain('Suche');
    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Planer');
    expect(labels).toContain('Email');
    expect(labels).toContain('Fenster anzeigen');
    expect(labels).toContain('Beenden');
  });

  // 4. Registers click handler on tray
  it('registers click handler on tray', () => {
    const callbacks = makeCallbacks();
    const manager = new TrayManager(callbacks);
    manager.create();

    const trayInstance = (manager as unknown as { tray: MockTray }).tray;
    expect(trayInstance.on).toHaveBeenCalledWith('click', expect.any(Function));
  });

  // 5. destroy() cleans up tray
  it('destroy() cleans up tray', () => {
    const callbacks = makeCallbacks();
    const manager = new TrayManager(callbacks);
    manager.create();

    const trayInstance = (manager as unknown as { tray: MockTray }).tray;
    manager.destroy();
    expect(trayInstance.destroy).toHaveBeenCalledTimes(1);
  });
});
