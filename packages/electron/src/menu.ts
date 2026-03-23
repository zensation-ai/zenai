/**
 * Native Application Menu
 *
 * macOS-style menu bar with app-specific actions.
 */

import { Menu, app, BrowserWindow, shell, MenuItemConstructorOptions } from 'electron';
const APP_NAME = 'ZenAI';

/**
 * Build and set the application menu
 */
export function createAppMenu(getMainWindow: () => BrowserWindow | null): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    // ─── App Menu (macOS only) ───
    ...(isMac ? [{
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
    }] : []),

    // ─── File Menu ───
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
        { type: 'separator' },
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
        { type: 'separator' },
        ...(isMac ? [] : [{ role: 'quit' as const }]),
      ] as MenuItemConstructorOptions[],
    },

    // ─── Edit Menu ───
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo', label: 'Widerrufen' },
        { role: 'redo', label: 'Wiederholen' },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einsetzen' },
        { role: 'selectAll', label: 'Alles auswaehlen' },
      ] as MenuItemConstructorOptions[],
    },

    // ─── View Menu ───
    {
      label: 'Darstellung',
      submenu: [
        { role: 'reload', label: 'Neu laden' },
        { role: 'forceReload', label: 'Erzwungenes Neuladen' },
        { role: 'toggleDevTools', label: 'Entwicklertools' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Standardgroesse' },
        { role: 'zoomIn', label: 'Vergroessern' },
        { role: 'zoomOut', label: 'Verkleinern' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Vollbild' },
      ] as MenuItemConstructorOptions[],
    },

    // ─── Navigate Menu ───
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
        { type: 'separator' },
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

    // ─── Window Menu ───
    {
      label: 'Fenster',
      submenu: [
        { role: 'minimize', label: 'Minimieren' },
        { role: 'zoom', label: 'Zoomen' },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const, label: 'Alles nach vorne' },
        ] : [
          { role: 'close' as const, label: 'Schliessen' },
        ]),
      ] as MenuItemConstructorOptions[],
    },

    // ─── Help Menu ───
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
        { type: 'separator' },
        {
          label: `Ueber ${APP_NAME}`,
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox({
              type: 'info',
              title: `Ueber ${APP_NAME}`,
              message: `${APP_NAME} v${app.getVersion()}`,
              detail: 'Personal AI Operating System\n\n© 2026 Alexander Bering\nZenSation Enterprise Solutions\nhttps://zensation.ai',
            });
          },
        },
      ] as MenuItemConstructorOptions[],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Navigate to a page in the renderer
 */
function navigateTo(win: BrowserWindow | null, page: string): void {
  if (!win) return;
  win.show();
  win.focus();
  win.webContents.send('navigate', page);
}
