const { app, BrowserWindow } = require('electron');
console.log('app type:', typeof app);
console.log('app.isPackaged:', app?.isPackaged);
if (app) {
  app.whenReady().then(() => {
    console.log('Electron is ready!');
    const win = new BrowserWindow({ width: 800, height: 600 });
    win.loadFile('../frontend/dist/index.html');
  });
} else {
  console.error('app is undefined!');
}
