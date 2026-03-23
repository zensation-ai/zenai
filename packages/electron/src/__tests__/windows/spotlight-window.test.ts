import { BrowserWindow, screen } from 'electron';
import { SpotlightWindow, SPOTLIGHT_WIDTH, SPOTLIGHT_HEIGHT } from '../../windows/spotlight-window';

const FRONTEND_URL = 'http://localhost:5173';

// Type alias for mock BrowserWindow instances
type MockBW = {
  opts: Record<string, unknown>;
  loadURL: jest.Mock;
  show: jest.Mock;
  hide: jest.Mock;
  focus: jest.Mock;
  close: jest.Mock;
  isVisible: jest.Mock;
  setSize: jest.Mock;
  getSize: jest.Mock;
  setPosition: jest.Mock;
  getPosition: jest.Mock;
  on: jest.Mock;
  webContents: { send: jest.Mock };
};

type MockBWClass = typeof BrowserWindow & {
  _reset: () => void;
  _instances: MockBW[];
};

const MockBrowserWindow = BrowserWindow as unknown as MockBWClass;

beforeEach(() => {
  MockBrowserWindow._reset();
  // Reset the screen mock to default 1920x1080
  (screen.getPrimaryDisplay as jest.Mock).mockReturnValue({
    workAreaSize: { width: 1920, height: 1080 },
  });
});

describe('SpotlightWindow', () => {
  // 1. Creates frameless, always-on-top, transparent, skipTaskbar, 680x72 window
  it('creates frameless, always-on-top, transparent, skipTaskbar window with correct dimensions', () => {
    const sw = new SpotlightWindow(FRONTEND_URL);
    sw.create();

    expect(MockBrowserWindow._instances).toHaveLength(1);
    const win = MockBrowserWindow._instances[0];
    expect(win.opts).toMatchObject({
      frame: false,
      alwaysOnTop: true,
      transparent: true,
      skipTaskbar: true,
      width: SPOTLIGHT_WIDTH,
      height: SPOTLIGHT_HEIGHT,
    });
    expect(SPOTLIGHT_WIDTH).toBe(680);
    expect(SPOTLIGHT_HEIGHT).toBe(72);
  });

  // 2. Loads /spotlight route appended to frontend URL
  it('loads /spotlight route appended to frontend URL', () => {
    const sw = new SpotlightWindow(FRONTEND_URL);
    sw.create();

    const win = MockBrowserWindow._instances[0];
    expect(win.loadURL).toHaveBeenCalledWith(`${FRONTEND_URL}/spotlight`);
  });

  // 3. toggle() shows + focuses + sends spotlight:show when hidden
  it('toggle() shows, focuses, and sends spotlight:show when window is hidden', () => {
    const sw = new SpotlightWindow(FRONTEND_URL);
    sw.create();

    const win = MockBrowserWindow._instances[0];
    // isVisible returns false by default (hidden)
    win.isVisible.mockReturnValue(false);
    win.show.mockClear();
    win.focus.mockClear();
    win.webContents.send.mockClear();

    sw.toggle();

    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
    expect(win.webContents.send).toHaveBeenCalledWith('spotlight:show');
  });

  // 4. toggle() hides + sends spotlight:hide when visible
  it('toggle() hides and sends spotlight:hide when window is visible', () => {
    const sw = new SpotlightWindow(FRONTEND_URL);
    sw.create();

    const win = MockBrowserWindow._instances[0];
    win.isVisible.mockReturnValue(true);
    win.hide.mockClear();
    win.webContents.send.mockClear();

    sw.toggle();

    expect(win.hide).toHaveBeenCalledTimes(1);
    expect(win.webContents.send).toHaveBeenCalledWith('spotlight:hide');
  });

  // 5. hide() hides the window
  it('hide() hides the window', () => {
    const sw = new SpotlightWindow(FRONTEND_URL);
    sw.create();

    const win = MockBrowserWindow._instances[0];
    win.hide.mockClear();

    sw.hide();

    expect(win.hide).toHaveBeenCalledTimes(1);
  });

  // 6. resize(height) changes window height (setSize with 680, height)
  it('resize(height) calls setSize with SPOTLIGHT_WIDTH and the given height', () => {
    const sw = new SpotlightWindow(FRONTEND_URL);
    sw.create();

    const win = MockBrowserWindow._instances[0];

    sw.resize(300);

    expect(win.setSize).toHaveBeenCalledWith(680, 300);
  });

  // 7. Positions centered horizontally and 20% from top
  it('positions window centered horizontally and 20% from top on 1920x1080 screen', () => {
    const sw = new SpotlightWindow(FRONTEND_URL);
    sw.create();

    const win = MockBrowserWindow._instances[0];
    win.isVisible.mockReturnValue(false);
    win.setPosition.mockClear();

    sw.show();

    // x = (1920 - 680) / 2 = 620
    // y = 1080 * 0.2 = 216
    expect(win.setPosition).toHaveBeenCalledWith(620, 216);
  });

  // 8. Does not crash when toggling before create
  it('does not crash when toggling before create', () => {
    const sw = new SpotlightWindow(FRONTEND_URL);
    expect(() => {
      sw.toggle();
      sw.show();
      sw.hide();
      sw.resize(200);
    }).not.toThrow();
  });
});
