import { BrowserWindow, shell } from 'electron';
import * as path from 'path';

/**
 * Manages the primary application window.
 * All methods are safe to call before create() (no-op when window is absent).
 */
export class MainWindow {
  private win: BrowserWindow | null = null;
  private readonly frontendUrl: string;

  constructor(frontendUrl: string) {
    this.frontendUrl = frontendUrl;
  }

  /** Creates the BrowserWindow and loads the frontend URL. */
  create(): void {
    if (this.win) return;

    this.win = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: '#0f1117',
      show: false,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Show window once the renderer is ready (avoid white flash)
    this.win.once('ready-to-show', () => {
      this.win?.show();
    });

    // Open external links in the default browser instead of a new Electron window
    this.win.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    this.win.loadURL(this.frontendUrl);
  }

  show(): void {
    this.win?.show();
  }

  hide(): void {
    this.win?.hide();
  }

  focus(): void {
    this.win?.focus();
  }

  /**
   * Sends an IPC 'navigate' message to the renderer so it can push a new route.
   */
  navigateTo(page: string): void {
    this.win?.webContents.send('navigate', page);
  }

  isVisible(): boolean {
    return this.win?.isVisible() ?? false;
  }

  getWindow(): BrowserWindow | null {
    return this.win;
  }
}
