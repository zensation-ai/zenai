import { BrowserWindow, screen } from 'electron';

export const SPOTLIGHT_WIDTH = 680;
export const SPOTLIGHT_HEIGHT = 72;

/**
 * Manages the frameless Spotlight popup window.
 * All methods are safe to call before create() (no-op when window is absent).
 */
export class SpotlightWindow {
  private win: BrowserWindow | null = null;
  private readonly frontendUrl: string;

  constructor(frontendUrl: string) {
    this.frontendUrl = frontendUrl;
  }

  /** Creates the frameless, transparent, always-on-top spotlight window. */
  create(): void {
    if (this.win) return;

    this.win = new BrowserWindow({
      width: SPOTLIGHT_WIDTH,
      height: SPOTLIGHT_HEIGHT,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      resizable: false,
      vibrancy: 'under-window',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Hide on blur so the spotlight disappears when the user clicks away
    this.win.on('blur', () => {
      this.hide();
    });

    this.win.loadURL(`${this.frontendUrl}/spotlight`);
  }

  /**
   * Shows the window if hidden, hides it if visible.
   */
  toggle(): void {
    if (!this.win) return;

    if (this.win.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Centers the window and shows it regardless of current state.
   */
  show(): void {
    if (!this.win) return;
    this.centerOnScreen();
    this.win.show();
    this.win.focus();
    this.win.webContents.send('spotlight:show');
  }

  /** Hides the window if currently visible. */
  hide(): void {
    if (!this.win) return;
    this.win.hide();
    this.win.webContents.send('spotlight:hide');
  }

  /** Resizes the spotlight window to the given height, keeping the width fixed. */
  resize(height: number): void {
    if (!this.win) return;
    this.win.setSize(SPOTLIGHT_WIDTH, height);
  }

  getWindow(): BrowserWindow | null {
    return this.win;
  }

  /** Centers the window horizontally and places it 20% from the top of the screen. */
  private centerOnScreen(): void {
    const { width: screenWidth, height: screenHeight } =
      screen.getPrimaryDisplay().workAreaSize;

    const x = Math.round((screenWidth - SPOTLIGHT_WIDTH) / 2);
    const y = Math.round(screenHeight * 0.2);

    this.win?.setPosition(x, y);
  }
}
