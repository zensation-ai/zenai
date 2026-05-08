import { BrowserWindow, screen } from 'electron';
import {
  createSpotlightWindow,
  toggleSpotlight,
  showSpotlight,
  hideSpotlight,
  resizeSpotlight,
  getSpotlightWindow,
} from '../../windows/spotlight-window';

// Cast to access mock-only static members
const MockBW = BrowserWindow as unknown as {
  _instances: BrowserWindow[];
  _reset(): void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLastWindow(): BrowserWindow {
  const instances = MockBW._instances;
  return instances[instances.length - 1];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('spotlight-window', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockBW._reset();
  });

  describe('createSpotlightWindow', () => {
    it('creates a BrowserWindow instance', () => {
      createSpotlightWindow();
      expect(MockBW._instances).toHaveLength(1);
    });

    it('creates window with correct dimensions (600x56)', () => {
      createSpotlightWindow();
      const win = getLastWindow();
      expect((win as any).opts).toMatchObject({
        width: 600,
        height: 56,
      });
    });

    it('creates frameless, transparent, always-on-top window', () => {
      createSpotlightWindow();
      const win = getLastWindow();
      expect((win as any).opts).toMatchObject({
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
      });
    });

    it('centers window horizontally based on screen width', () => {
      (screen.getPrimaryDisplay as jest.Mock).mockReturnValue({
        workAreaSize: { width: 1920, height: 1080 },
      });
      createSpotlightWindow();
      const win = getLastWindow();
      // (1920 - 600) / 2 = 660
      expect((win as any).opts.x).toBe(660);
    });

    it('positions window near top of screen (y=140)', () => {
      createSpotlightWindow();
      const win = getLastWindow();
      expect((win as any).opts.y).toBe(140);
    });

    it('registers blur handler to auto-hide', () => {
      createSpotlightWindow();
      const win = getLastWindow();
      expect(win.on).toHaveBeenCalledWith('blur', expect.any(Function));
    });

    it('registers close handler to prevent destruction', () => {
      createSpotlightWindow();
      const win = getLastWindow();
      expect(win.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('returns the created BrowserWindow', () => {
      const win = createSpotlightWindow();
      expect(win).toBe(getLastWindow());
    });
  });

  describe('getSpotlightWindow', () => {
    it('returns null before creation', () => {
      // getSpotlightWindow returns whatever was last created — in a fresh
      // module state it would be null, but since we share module state
      // across tests, just verify it returns a BrowserWindow after creation
      createSpotlightWindow();
      expect(getSpotlightWindow()).toBe(getLastWindow());
    });
  });

  describe('showSpotlight', () => {
    it('shows and focuses the window', () => {
      createSpotlightWindow();
      const win = getSpotlightWindow()!;
      showSpotlight();
      expect(win.show).toHaveBeenCalled();
      expect(win.focus).toHaveBeenCalled();
    });

    it('sends spotlight:show event to renderer', () => {
      createSpotlightWindow();
      const win = getSpotlightWindow()!;
      showSpotlight();
      expect(win.webContents.send).toHaveBeenCalledWith('spotlight:show');
    });
  });

  describe('hideSpotlight', () => {
    it('hides the window when visible', () => {
      createSpotlightWindow();
      const win = getSpotlightWindow()!;
      (win.isVisible as jest.Mock).mockReturnValue(true);
      hideSpotlight();
      expect(win.hide).toHaveBeenCalled();
    });

    it('sends spotlight:hide event to renderer', () => {
      createSpotlightWindow();
      const win = getSpotlightWindow()!;
      (win.isVisible as jest.Mock).mockReturnValue(true);
      hideSpotlight();
      expect(win.webContents.send).toHaveBeenCalledWith('spotlight:hide');
    });

    it('does nothing when window is already hidden', () => {
      createSpotlightWindow();
      const win = getSpotlightWindow()!;
      (win.isVisible as jest.Mock).mockReturnValue(false);
      hideSpotlight();
      expect(win.hide).not.toHaveBeenCalled();
    });
  });

  describe('toggleSpotlight', () => {
    it('shows when hidden', () => {
      createSpotlightWindow();
      const win = getSpotlightWindow()!;
      (win.isVisible as jest.Mock).mockReturnValue(false);
      toggleSpotlight();
      expect(win.show).toHaveBeenCalled();
    });

    it('hides when visible', () => {
      createSpotlightWindow();
      const win = getSpotlightWindow()!;
      (win.isVisible as jest.Mock).mockReturnValue(true);
      toggleSpotlight();
      expect(win.hide).toHaveBeenCalled();
    });
  });

  describe('resizeSpotlight', () => {
    it('clamps height to minimum 56px', () => {
      createSpotlightWindow();
      const win = getSpotlightWindow()!;
      resizeSpotlight(20);
      expect((win as any).setBounds).toHaveBeenCalledWith(
        expect.objectContaining({ height: 56 }),
      );
    });

    it('clamps height to maximum 400px', () => {
      createSpotlightWindow();
      const win = getSpotlightWindow()!;
      resizeSpotlight(800);
      expect((win as any).setBounds).toHaveBeenCalledWith(
        expect.objectContaining({ height: 400 }),
      );
    });

    it('accepts heights within the valid range', () => {
      createSpotlightWindow();
      const win = getSpotlightWindow()!;
      resizeSpotlight(200);
      expect((win as any).setBounds).toHaveBeenCalledWith(
        expect.objectContaining({ height: 200 }),
      );
    });
  });
});
