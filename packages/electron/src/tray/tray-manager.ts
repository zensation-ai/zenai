/**
 * Tray Manager
 *
 * Manages the system-tray icon, tooltip, context menu, and click-to-toggle
 * behaviour for the ZenAI desktop app.
 */

import { Tray, Menu, nativeImage, MenuItemConstructorOptions } from 'electron';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrayCallbacks {
  /** Navigate to a page and ensure the main window is visible */
  showAndNavigate: (page: string) => void;
  /** Bring the main window to the foreground */
  showMainWindow: () => void;
  /** Hide the main window */
  hideMainWindow: () => void;
  /** Returns true when the main window is currently visible */
  isMainWindowVisible: () => boolean;
  /** Quit the application */
  quit: () => void;
}

// ─── 16×16 transparent PNG (base64) used as the tray icon ────────────────────
//
// A minimal valid PNG: 1×1 fully-transparent pixel, scaled by macOS/Win to the
// required tray size.  Using a buffer lets us avoid shipping a separate asset
// file and keeps the module self-contained.
const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAADUlE' +
  'QVQI12NgYGBgAAAABQABpjarzwAAAABJRU5ErkJggg==';

// ─── TrayManager ─────────────────────────────────────────────────────────────

export class TrayManager {
  /** The underlying Electron Tray instance (set after create()) */
  private tray: Tray | null = null;

  constructor(private readonly callbacks: TrayCallbacks) {}

  /**
   * Create the tray icon, set its tooltip, build the context menu, and wire
   * up the click handler.  Call once after `app` is ready.
   */
  create(): void {
    const iconBuffer = Buffer.from(TRAY_ICON_BASE64, 'base64');
    const icon = nativeImage.createFromBuffer(iconBuffer);

    this.tray = new Tray(icon);
    this.tray.setToolTip('ZenAI');

    const contextMenu = Menu.buildFromTemplate(this.buildMenuTemplate());
    this.tray.setContextMenu(contextMenu);

    this.tray.on('click', () => {
      if (this.callbacks.isMainWindowVisible()) {
        this.callbacks.hideMainWindow();
      } else {
        this.callbacks.showMainWindow();
      }
    });
  }

  /**
   * Destroy the tray icon.  Call when the app is about to quit.
   */
  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private buildMenuTemplate(): MenuItemConstructorOptions[] {
    const { showAndNavigate, showMainWindow, quit } = this.callbacks;

    return [
      // App title (disabled, acts as a heading)
      { label: 'ZenAI - Personal AI OS', enabled: false },
      { type: 'separator' },

      // Quick actions
      {
        label: 'Neuer Gedanke',
        click: () => showAndNavigate('ideas/new'),
      },
      {
        label: 'Quick Chat',
        click: () => showAndNavigate('chat'),
      },
      {
        label: 'Suche',
        click: () => showAndNavigate('search'),
      },
      { type: 'separator' },

      // Navigation
      {
        label: 'Dashboard',
        click: () => showAndNavigate('dashboard'),
      },
      {
        label: 'Planer',
        click: () => showAndNavigate('calendar'),
      },
      {
        label: 'Email',
        click: () => showAndNavigate('email'),
      },
      { type: 'separator' },

      // Window management
      {
        label: 'Fenster anzeigen',
        click: () => showMainWindow(),
      },
      { type: 'separator' },

      // Quit
      {
        label: 'Beenden',
        click: () => quit(),
      },
    ];
  }
}
