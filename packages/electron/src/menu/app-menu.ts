/**
 * Native Application Menu
 *
 * macOS-style menu bar with app-specific actions.
 * Ported from src/menu.ts into the dedicated menu/ module.
 */

import { Menu, app, BrowserWindow, shell, dialog, MenuItemConstructorOptions } from 'electron';
import { APP_NAME } from '@zenai/shared';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build and set the native application menu.
 * Call once after `app` is ready.
 */
export function createAppMenu(getMainWindow: () => BrowserWindow | null): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    // ─── App Menu (macOS only) ───────────────────────────────────────────
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: 'about' as const, label: `Ueber ${APP_NAME}` },
              { type: 'separator' as const },
              {
                label: 'Einstellungen...',
                accelerator: 'CmdOrCtrl+,',
                click: () => navigateTo(getMainWindow(), 'settings'),
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const, label: `${APP_NAME} ausblenden` },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const, label: `${APP_NAME} beenden` },
            ] as MenuItemConstructorOptions[],
          },
        ]
      : []),

    // ─── Ablage (File) ───────────────────────────────────────────────────
    {
      label: 'Ablage',
      submenu: [
        {
          label: 'Neuer Gedanke',
          accelerator: 'CmdOrCtrl+N',
          click: () => navigateTo(getMainWindow(), 'ideas/new'),
        },
        {
          label: 'Neuer Chat',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => navigateTo(getMainWindow(), 'chat'),
        },
        { type: 'separator' as const },
        {
          label: 'Suche...',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            const win = getMainWindow();
            if (win) {
              win.show();
              win.focus();
              win.webContents.send('open-command-palette');
            }
          },
        },
        { type: 'separator' as const },
        ...(isMac ? [] : ([{ role: 'quit' as const }] as MenuItemConstructorOptions[])),
      ] as MenuItemConstructorOptions[],
    },

    // ─── Bearbeiten (Edit) ───────────────────────────────────────────────
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo' as const, label: 'Widerrufen' },
        { role: 'redo' as const, label: 'Wiederholen' },
        { type: 'separator' as const },
        { role: 'cut' as const, label: 'Ausschneiden' },
        { role: 'copy' as const, label: 'Kopieren' },
        { role: 'paste' as const, label: 'Einsetzen' },
        { role: 'selectAll' as const, label: 'Alles auswaehlen' },
      ] as MenuItemConstructorOptions[],
    },

    // ─── Darstellung (View) ──────────────────────────────────────────────
    {
      label: 'Darstellung',
      submenu: [
        { role: 'reload' as const, label: 'Neu laden' },
        { role: 'forceReload' as const, label: 'Erzwungenes Neuladen' },
        { role: 'toggleDevTools' as const, label: 'Entwicklertools' },
        { type: 'separator' as const },
        { role: 'resetZoom' as const, label: 'Standardgroesse' },
        { role: 'zoomIn' as const, label: 'Vergroessern' },
        { role: 'zoomOut' as const, label: 'Verkleinern' },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const, label: 'Vollbild' },
      ] as MenuItemConstructorOptions[],
    },

    // ─── Navigieren ──────────────────────────────────────────────────────
    {
      label: 'Navigieren',
      submenu: [
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => navigateTo(getMainWindow(), 'dashboard'),
        },
        {
          label: 'Chat',
          accelerator: 'CmdOrCtrl+2',
          click: () => navigateTo(getMainWindow(), 'chat'),
        },
        {
          label: 'Gedanken',
          accelerator: 'CmdOrCtrl+3',
          click: () => navigateTo(getMainWindow(), 'ideas'),
        },
        {
          label: 'Planer',
          accelerator: 'CmdOrCtrl+4',
          click: () => navigateTo(getMainWindow(), 'calendar'),
        },
        {
          label: 'Email',
          accelerator: 'CmdOrCtrl+5',
          click: () => navigateTo(getMainWindow(), 'email'),
        },
        { type: 'separator' as const },
        {
          label: 'Wissensbasis',
          accelerator: 'CmdOrCtrl+6',
          click: () => navigateTo(getMainWindow(), 'documents'),
        },
        {
          label: 'Insights',
          accelerator: 'CmdOrCtrl+7',
          click: () => navigateTo(getMainWindow(), 'insights'),
        },
      ] as MenuItemConstructorOptions[],
    },

    // ─── Fenster (Window) ────────────────────────────────────────────────
    {
      label: 'Fenster',
      submenu: [
        { role: 'minimize' as const, label: 'Minimieren' },
        { role: 'zoom' as const, label: 'Zoomen' },
        ...(isMac
          ? ([
              { type: 'separator' as const },
              { role: 'front' as const, label: 'Alles nach vorne' },
            ] as MenuItemConstructorOptions[])
          : ([{ role: 'close' as const, label: 'Schliessen' }] as MenuItemConstructorOptions[])),
      ] as MenuItemConstructorOptions[],
    },

    // ─── Hilfe (Help) ────────────────────────────────────────────────────
    {
      label: 'Hilfe',
      submenu: [
        {
          label: `${APP_NAME} Website`,
          click: () => shell.openExternal('https://zensation.ai'),
        },
        {
          label: 'Dokumentation',
          click: () => shell.openExternal('https://docs.zensation.ai'),
        },
        { type: 'separator' as const },
        {
          label: `Ueber ${APP_NAME}`,
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: `Ueber ${APP_NAME}`,
              message: `${APP_NAME} v${app.getVersion()}`,
              detail:
                'Personal AI Operating System\n\n© 2026 Alexander Bering\nZenSation Enterprise Solutions\nhttps://zensation.ai',
            });
          },
        },
      ] as MenuItemConstructorOptions[],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function navigateTo(win: BrowserWindow | null, page: string): void {
  if (!win) return;
  win.show();
  win.focus();
  win.webContents.send('navigate', page);
}
