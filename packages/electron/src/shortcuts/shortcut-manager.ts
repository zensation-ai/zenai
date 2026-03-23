/**
 * Shortcut Manager
 *
 * Registers and manages global keyboard shortcuts for the ZenAI desktop app.
 */

import { globalShortcut } from 'electron';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShortcutConfig {
  /** Accelerator string for the spotlight overlay toggle */
  spotlight: string;
  /** Accelerator string for the search overlay */
  search: string;
}

export interface ShortcutCallbacks {
  /** Called when the spotlight shortcut is pressed */
  onToggleSpotlight: () => void;
  /** Called when the search shortcut is pressed */
  onShowSearch: () => void;
}

// ─── ShortcutManager ─────────────────────────────────────────────────────────

export class ShortcutManager {
  constructor(
    private readonly config: ShortcutConfig,
    private readonly callbacks: ShortcutCallbacks,
  ) {}

  /**
   * Register all global shortcuts.
   * Must be called after app is ready.
   */
  register(): void {
    globalShortcut.register(this.config.spotlight, this.callbacks.onToggleSpotlight);
    globalShortcut.register(this.config.search, this.callbacks.onShowSearch);
  }

  /**
   * Unregister all global shortcuts.
   * Should be called before app quits.
   */
  unregister(): void {
    globalShortcut.unregisterAll();
  }
}
