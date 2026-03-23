import { BrowserWindow } from 'electron';
import { MainWindow } from '../../windows/main-window';

const FRONTEND_URL = 'http://localhost:5173';

// Type alias to make it easier to access mock-specific methods and properties
type MockBW = {
  opts: Record<string, unknown>;
  loadURL: jest.Mock;
  show: jest.Mock;
  hide: jest.Mock;
  focus: jest.Mock;
  webContents: { send: jest.Mock; setWindowOpenHandler: jest.Mock };
};

type MockBWClass = typeof BrowserWindow & {
  _reset: () => void;
  _instances: MockBW[];
};

const MockBrowserWindow = BrowserWindow as unknown as MockBWClass;

beforeEach(() => {
  MockBrowserWindow._reset();
});

describe('MainWindow', () => {
  // 1. Creates BrowserWindow with correct options
  it('creates BrowserWindow with correct options', () => {
    const mw = new MainWindow(FRONTEND_URL);
    mw.create();

    expect(MockBrowserWindow._instances).toHaveLength(1);
    const win = MockBrowserWindow._instances[0];
    expect(win.opts).toMatchObject({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: '#0f1117',
      show: false,
    });
  });

  // 2. Loads the frontend URL on create
  it('loads the frontend URL on create', () => {
    const mw = new MainWindow(FRONTEND_URL);
    mw.create();

    const win = MockBrowserWindow._instances[0];
    expect(win.loadURL).toHaveBeenCalledWith(FRONTEND_URL);
  });

  // 3. show/hide/focus delegate to BrowserWindow
  it('show/hide/focus delegate to BrowserWindow', () => {
    const mw = new MainWindow(FRONTEND_URL);
    mw.create();

    const win = MockBrowserWindow._instances[0];

    // Clear any calls that happened during create() (e.g. ready-to-show auto-show)
    win.show.mockClear();
    win.hide.mockClear();
    win.focus.mockClear();

    mw.show();
    expect(win.show).toHaveBeenCalledTimes(1);

    mw.hide();
    expect(win.hide).toHaveBeenCalledTimes(1);

    mw.focus();
    expect(win.focus).toHaveBeenCalledTimes(1);
  });

  // 4. navigateTo sends IPC 'navigate' event via webContents.send
  it('navigateTo sends navigate IPC event via webContents.send', () => {
    const mw = new MainWindow(FRONTEND_URL);
    mw.create();

    const win = MockBrowserWindow._instances[0];

    mw.navigateTo('/chat');
    expect(win.webContents.send).toHaveBeenCalledWith('navigate', '/chat');
  });

  // 5. isVisible returns false when window not created
  it('isVisible returns false when window not created', () => {
    const mw = new MainWindow(FRONTEND_URL);
    expect(mw.isVisible()).toBe(false);
  });

  // 6. Does not crash when calling methods before create
  it('does not crash when calling methods before create', () => {
    const mw = new MainWindow(FRONTEND_URL);
    expect(() => {
      mw.show();
      mw.hide();
      mw.focus();
      mw.navigateTo('/chat');
    }).not.toThrow();
  });

  // 7. getWindow returns null before create
  it('getWindow returns null before create', () => {
    const mw = new MainWindow(FRONTEND_URL);
    expect(mw.getWindow()).toBeNull();
  });

  // 8. getWindow returns BrowserWindow after create
  it('getWindow returns BrowserWindow after create', () => {
    const mw = new MainWindow(FRONTEND_URL);
    mw.create();
    expect(mw.getWindow()).not.toBeNull();
    expect(mw.getWindow()).toBeInstanceOf(BrowserWindow);
  });
});
