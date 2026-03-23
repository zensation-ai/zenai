import { WindowManager } from '../../windows/window-manager';

// ─── Mock MainWindow ──────────────────────────────────────────────────────────

const mockMainWindowInstance = {
  create: jest.fn(),
  show: jest.fn(),
  hide: jest.fn(),
  focus: jest.fn(),
  navigateTo: jest.fn(),
  isVisible: jest.fn().mockReturnValue(false),
  getWindow: jest.fn().mockReturnValue(null),
};

jest.mock('../../windows/main-window', () => ({
  MainWindow: jest.fn().mockImplementation(() => mockMainWindowInstance),
}));

// ─── Mock SpotlightWindow ─────────────────────────────────────────────────────

const mockSpotlightWindowInstance = {
  create: jest.fn(),
  toggle: jest.fn(),
  show: jest.fn(),
  hide: jest.fn(),
  resize: jest.fn(),
  getWindow: jest.fn().mockReturnValue(null),
};

jest.mock('../../windows/spotlight-window', () => ({
  SpotlightWindow: jest.fn().mockImplementation(() => mockSpotlightWindowInstance),
  SPOTLIGHT_WIDTH: 680,
  SPOTLIGHT_HEIGHT: 72,
}));

const FRONTEND_URL = 'http://localhost:5173';

beforeEach(() => {
  jest.clearAllMocks();
  // Reset return values to defaults
  mockMainWindowInstance.isVisible.mockReturnValue(false);
  mockMainWindowInstance.getWindow.mockReturnValue(null);
  mockSpotlightWindowInstance.getWindow.mockReturnValue(null);
});

describe('WindowManager', () => {
  // 1. Creates both windows on init
  it('creates both windows on init', () => {
    const { MainWindow } = require('../../windows/main-window');
    const { SpotlightWindow } = require('../../windows/spotlight-window');

    new WindowManager(FRONTEND_URL);

    expect(MainWindow).toHaveBeenCalledWith(FRONTEND_URL);
    expect(SpotlightWindow).toHaveBeenCalledWith(FRONTEND_URL);
  });

  // 2. toggleSpotlight delegates to SpotlightWindow.toggle()
  it('toggleSpotlight delegates to SpotlightWindow.toggle()', () => {
    const wm = new WindowManager(FRONTEND_URL);
    wm.toggleSpotlight();
    expect(mockSpotlightWindowInstance.toggle).toHaveBeenCalledTimes(1);
  });

  // 3. showMainWindow creates if not exists then shows
  it('showMainWindow creates if not exists then shows', () => {
    // getWindow returns null → window not yet created
    mockMainWindowInstance.getWindow.mockReturnValue(null);

    const wm = new WindowManager(FRONTEND_URL);
    wm.showMainWindow();

    expect(mockMainWindowInstance.create).toHaveBeenCalledTimes(1);
    expect(mockMainWindowInstance.show).toHaveBeenCalledTimes(1);
  });

  // 4. hideMainWindow delegates to MainWindow.hide()
  it('hideMainWindow delegates to MainWindow.hide()', () => {
    const wm = new WindowManager(FRONTEND_URL);
    wm.hideMainWindow();
    expect(mockMainWindowInstance.hide).toHaveBeenCalledTimes(1);
  });

  // 5. showAndNavigate creates, shows, focuses, navigates
  it('showAndNavigate creates, shows, focuses, and navigates', () => {
    mockMainWindowInstance.getWindow.mockReturnValue(null);

    const wm = new WindowManager(FRONTEND_URL);
    wm.showAndNavigate('/chat');

    expect(mockMainWindowInstance.create).toHaveBeenCalledTimes(1);
    expect(mockMainWindowInstance.show).toHaveBeenCalledTimes(1);
    expect(mockMainWindowInstance.focus).toHaveBeenCalledTimes(1);
    expect(mockMainWindowInstance.navigateTo).toHaveBeenCalledWith('/chat');
  });

  // 6. focusOrCreate shows existing or creates new
  it('focusOrCreate creates and shows when window does not exist', () => {
    mockMainWindowInstance.getWindow.mockReturnValue(null);

    const wm = new WindowManager(FRONTEND_URL);
    wm.focusOrCreate();

    expect(mockMainWindowInstance.create).toHaveBeenCalledTimes(1);
    expect(mockMainWindowInstance.show).toHaveBeenCalledTimes(1);
    expect(mockMainWindowInstance.focus).toHaveBeenCalledTimes(1);
  });

  // 7. getMainWindow returns the MainWindow instance
  it('getMainWindow returns the MainWindow instance', () => {
    const { MainWindow } = require('../../windows/main-window');
    const wm = new WindowManager(FRONTEND_URL);
    const result = wm.getMainWindow();

    // Should return the MainWindow instance (the mock object)
    expect(result).toBe(mockMainWindowInstance);
    expect(MainWindow).toHaveBeenCalledWith(FRONTEND_URL);
  });

  // 8. hideSpotlight delegates to SpotlightWindow.hide()
  it('hideSpotlight delegates to SpotlightWindow.hide()', () => {
    const wm = new WindowManager(FRONTEND_URL);
    wm.hideSpotlight();
    expect(mockSpotlightWindowInstance.hide).toHaveBeenCalledTimes(1);
  });

  // 9. resizeSpotlight delegates to SpotlightWindow.resize()
  it('resizeSpotlight delegates to SpotlightWindow.resize()', () => {
    const wm = new WindowManager(FRONTEND_URL);
    wm.resizeSpotlight(300);
    expect(mockSpotlightWindowInstance.resize).toHaveBeenCalledWith(300);
  });

  // 10. showSpotlight calls SpotlightWindow.show() (NOT toggle)
  it('showSpotlight calls SpotlightWindow.show() and NOT toggle()', () => {
    const wm = new WindowManager(FRONTEND_URL);
    wm.showSpotlight();

    expect(mockSpotlightWindowInstance.show).toHaveBeenCalledTimes(1);
    expect(mockSpotlightWindowInstance.toggle).not.toHaveBeenCalled();
  });
});
