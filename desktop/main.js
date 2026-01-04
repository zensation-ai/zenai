const { app, BrowserWindow, Menu, Tray, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');
const Store = require('electron-store');

const store = new Store();
const isDev = !app.isPackaged;

let mainWindow;
let tray;
let backendProcess;
let frontendProcess;

// Pfade
const projectRoot = isDev
  ? path.join(__dirname, '..')
  : path.join(process.resourcesPath, '..');

const backendPath = path.join(projectRoot, 'backend');
const frontendPath = isDev
  ? path.join(projectRoot, 'frontend')
  : path.join(process.resourcesPath, 'frontend');

// Konfiguration
const BACKEND_URL = 'http://localhost:3000';
const FRONTEND_URL = isDev ? 'http://localhost:5173' : null;

function createWindow() {
  const { width, height, x, y } = store.get('windowBounds', {
    width: 1400,
    height: 900
  });

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 800,
    minHeight: 600,
    title: 'AI Brain',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#0a1520',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  });

  // Fensterposition speichern
  mainWindow.on('close', () => {
    store.set('windowBounds', mainWindow.getBounds());
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Externe Links im Browser öffnen
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Immer das laufende Frontend laden (sowohl Dev als auch Produktion)
  // Das Backend und Frontend müssen separat gestartet werden
  const frontendURL = 'http://localhost:5173';

  mainWindow.loadURL(frontendURL).catch(() => {
    // Fallback: Zeige Hinweis, dass Frontend gestartet werden muss
    mainWindow.loadURL(`data:text/html,
      <html>
        <head>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #0a1520 0%, #0f1f2e 100%);
              color: #f0f4f8;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              flex-direction: column;
            }
            h1 {
              background: linear-gradient(135deg, #ff6b35 0%, #ff8c5a 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              margin-bottom: 20px;
            }
            p { color: #8ba3b8; max-width: 400px; text-align: center; line-height: 1.6; }
            code {
              background: #1a3040;
              border: 1px solid #2a4a5a;
              padding: 15px 20px;
              border-radius: 8px;
              display: block;
              margin: 20px 0;
              font-size: 14px;
              color: #ff6b35;
            }
            .hint { font-size: 12px; color: #6b8a9e; margin-top: 30px; }
          </style>
        </head>
        <body>
          <h1>AI Brain</h1>
          <p>Das Frontend ist nicht erreichbar. Bitte starte die Services:</p>
          <code>cd ~/Projects/KI-AB && ./start-app.sh</code>
          <p class="hint">Dann drücke Cmd+R zum Neuladen</p>
        </body>
      </html>
    `);
  });

  if (isDev) {
    // DevTools in separatem Fenster bei Bedarf
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');

  // Fallback wenn Icon nicht existiert
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = nativeImage.createEmpty();
    }
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon.resize({ width: 18, height: 18 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'AI Brain öffnen',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Backend Status',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Beenden',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('AI Brain');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function createMenu() {
  const template = [
    {
      label: 'AI Brain',
      submenu: [
        { role: 'about', label: 'Über AI Brain' },
        { type: 'separator' },
        {
          label: 'Einstellungen...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            // Einstellungen öffnen
          }
        },
        { type: 'separator' },
        { role: 'services', label: 'Dienste' },
        { type: 'separator' },
        { role: 'hide', label: 'AI Brain ausblenden' },
        { role: 'hideOthers', label: 'Andere ausblenden' },
        { role: 'unhide', label: 'Alle einblenden' },
        { type: 'separator' },
        { role: 'quit', label: 'AI Brain beenden' }
      ]
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo', label: 'Widerrufen' },
        { role: 'redo', label: 'Wiederholen' },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einfügen' },
        { role: 'selectAll', label: 'Alles auswählen' }
      ]
    },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'reload', label: 'Neu laden' },
        { role: 'forceReload', label: 'Erzwungenes Neuladen' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Originalgröße' },
        { role: 'zoomIn', label: 'Vergrößern' },
        { role: 'zoomOut', label: 'Verkleinern' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Vollbild' }
      ]
    },
    {
      label: 'Fenster',
      submenu: [
        { role: 'minimize', label: 'Minimieren' },
        { role: 'zoom', label: 'Zoom' },
        { type: 'separator' },
        { role: 'front', label: 'Alle nach vorne bringen' }
      ]
    },
    {
      label: 'Hilfe',
      submenu: [
        {
          label: 'Dokumentation',
          click: () => {
            shell.openExternal('https://github.com/alexanderbering/personal-ai-brain');
          }
        }
      ]
    }
  ];

  if (isDev) {
    template[2].submenu.push(
      { type: 'separator' },
      { role: 'toggleDevTools', label: 'Entwicklertools' }
    );
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function checkBackendHealth() {
  return new Promise((resolve) => {
    http.get(`${BACKEND_URL}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => {
      resolve(false);
    });
  });
}

async function waitForBackend(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const healthy = await checkBackendHealth();
    if (healthy) return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function startServices() {
  // Prüfe ob Backend bereits läuft
  const backendRunning = await checkBackendHealth();

  if (!backendRunning && isDev) {
    console.log('Starting backend...');
    // Im Dev-Modus erwarten wir, dass Backend bereits läuft
    // oder wir starten es manuell
  }

  return waitForBackend();
}

// App Events
app.whenReady().then(async () => {
  createMenu();

  // Warte auf Backend
  const backendReady = await startServices();

  if (!backendReady) {
    dialog.showErrorBox(
      'Backend nicht erreichbar',
      'Das Backend konnte nicht gestartet werden. Bitte stelle sicher, dass:\n\n' +
      '1. Docker läuft\n' +
      '2. Ollama läuft\n' +
      '3. Das Backend gestartet ist (npm run dev im backend Ordner)\n\n' +
      'Die App wird trotzdem gestartet, aber einige Funktionen sind nicht verfügbar.'
    );
  }

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  // Auf Mac bleibt die App im Dock
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Cleanup
  if (backendProcess) {
    backendProcess.kill();
  }
  if (frontendProcess) {
    frontendProcess.kill();
  }
});

// Verhindere mehrere Instanzen
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
