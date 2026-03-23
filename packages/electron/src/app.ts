/**
 * ZenAIApp — Application Orchestrator
 *
 * Owns the full lifecycle of the Electron application:
 *   construction → start() → [running] → will-quit
 *
 * All sub-modules are created here and wired together via dependency injection
 * so that each module stays independently testable.
 */

import * as path from 'path';
import { app } from 'electron';

import { createConfig, type ConfigStore } from './config';
import { BackendBridge } from './backend/backend-bridge';
import { WindowManager } from './windows/window-manager';
import { registerIpcHandlers } from './ipc/handlers';
import { TrayManager } from './tray/tray-manager';
import { ShortcutManager } from './shortcuts/shortcut-manager';
import { createAppMenu } from './menu/app-menu';
import { NotificationService } from './notifications/notification-service';
import { initAutoUpdater } from './updater';

// ─── ZenAIApp ─────────────────────────────────────────────────────────────────

export class ZenAIApp {
  private readonly config: ConfigStore;
  private backend!: BackendBridge;
  private windows!: WindowManager;
  private tray!: TrayManager;
  private shortcuts!: ShortcutManager;
  private notifications!: NotificationService;

  constructor() {
    this.config = createConfig();

    // Enforce single-instance; second launches focus the existing window.
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
      app.quit();
      return;
    }

    app.on('second-instance', () => {
      this.windows?.focusOrCreate();
    });
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    await app.whenReady();
    await this.initModules();
    this.registerAppEventHandlers();
  }

  // ─── Private initialisation ──────────────────────────────────────────────────

  private async initModules(): Promise<void> {
    const isDev = !app.isPackaged;

    // ── Config values ──────────────────────────────────────────────────────────
    const cloudBackendUrl = this.config.get('cloudBackendUrl') as string;
    const localBackendPort = this.config.get('localBackendPort') as number;
    const healthCheckInterval = this.config.get('healthCheckInterval') as number;
    const localBackendStartupTimeout = this.config.get('localBackendStartupTimeout') as number;
    const spotlightShortcut = this.config.get('spotlightShortcut') as string;
    const searchShortcut = this.config.get('searchShortcut') as string;
    const dockMode = this.config.get('dockMode') as string;
    const frontendDevPort = this.config.get('frontendDevPort') as number;
    const activeContext = this.config.get('activeContext') as string;

    // ── macOS dock mode ────────────────────────────────────────────────────────
    if (process.platform === 'darwin' && dockMode === 'menubar') {
      app.dock?.hide();
    }

    // ── Frontend URL ───────────────────────────────────────────────────────────
    const frontendUrl = isDev
      ? `http://localhost:${frontendDevPort}`
      : `file://${path.join(__dirname, '../renderer/index.html')}`;

    // ── Backend ────────────────────────────────────────────────────────────────
    this.backend = new BackendBridge(
      cloudBackendUrl,
      localBackendPort,
      isDev,
      healthCheckInterval,
      localBackendStartupTimeout,
    );
    await this.backend.start();

    // ── Windows ────────────────────────────────────────────────────────────────
    this.windows = new WindowManager(frontendUrl);
    this.windows.init();

    // ── IPC handlers ──────────────────────────────────────────────────────────
    registerIpcHandlers({
      getMainWindow: () => {
        const mw = this.windows.getMainWindow();
        return mw.getWindow?.() ?? null;
      },
      getConfig: (key: string) => this.config.get(key as Parameters<ConfigStore['get']>[0]),
      setConfig: (key: string, value: unknown) =>
        this.config.set(
          key as Parameters<ConfigStore['set']>[0],
          value as Parameters<ConfigStore['set']>[1],
        ),
      getBackendStatus: () => this.backend.getStatus(),
      getBackendUrl: () => this.backend.getBaseUrl(),
      hideSpotlight: () => this.windows.hideSpotlight(),
      resizeSpotlight: (height: number) => this.windows.resizeSpotlight(height),
    });

    // ── Tray ──────────────────────────────────────────────────────────────────
    this.tray = new TrayManager({
      showAndNavigate: (page: string) => this.windows.showAndNavigate(page),
      showMainWindow: () => this.windows.showMainWindow(),
      hideMainWindow: () => this.windows.hideMainWindow(),
      isMainWindowVisible: () => this.windows.getMainWindow().isVisible?.() ?? false,
      quit: () => app.quit(),
    });
    this.tray.create();

    // ── Shortcuts ─────────────────────────────────────────────────────────────
    this.shortcuts = new ShortcutManager(
      { spotlight: spotlightShortcut, search: searchShortcut },
      {
        onToggleSpotlight: () => this.windows.toggleSpotlight(),
        onShowSearch: () => this.windows.showAndNavigate('search'),
      },
    );
    this.shortcuts.register();

    // ── Application menu ──────────────────────────────────────────────────────
    createAppMenu(() => {
      const mw = this.windows.getMainWindow();
      return mw.getWindow?.() ?? null;
    });

    // ── Notifications (SSE bridge) ────────────────────────────────────────────
    this.notifications = new NotificationService((page: string) =>
      this.windows.showAndNavigate(page),
    );
    this.notifications.start(this.backend.getBaseUrl(), activeContext);

    // ── Auto-updater ──────────────────────────────────────────────────────────
    initAutoUpdater(() => {
      const mw = this.windows.getMainWindow();
      return mw.getWindow?.() ?? null;
    });
  }

  private registerAppEventHandlers(): void {
    app.on('activate', () => {
      this.windows.focusOrCreate();
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('will-quit', () => {
      this.shortcuts?.unregister();
      this.notifications?.stop();
      void this.backend?.stop();
      this.tray?.destroy();
    });
  }
}
