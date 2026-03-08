/**
 * Auto-Updater
 *
 * Uses electron-updater to check for and install updates.
 * Updates are sourced from GitHub Releases by default.
 */

import { autoUpdater, UpdateInfo } from 'electron-updater';
import { BrowserWindow } from 'electron';

let updateAvailable = false;

/**
 * Initialize the auto-updater
 */
export function initAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  // Don't auto-update in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[Updater] Skipping auto-update in development mode');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates...');
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log(`[Updater] Update available: v${info.version}`);
    updateAvailable = true;

    const win = getMainWindow();
    if (win) {
      win.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] No update available');
  });

  autoUpdater.on('download-progress', (progress) => {
    const win = getMainWindow();
    if (win) {
      win.webContents.send('update-progress', {
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log(`[Updater] Update downloaded: v${info.version}`);

    const win = getMainWindow();
    if (win) {
      win.webContents.send('update-downloaded', {
        version: info.version,
      });
    }
  });

  autoUpdater.on('error', (err: Error) => {
    console.error('[Updater] Error:', err.message);
  });

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[Updater] Check failed:', err.message);
    });
  }, 10_000);
}

/**
 * Manually trigger update check
 */
export function checkForUpdates(): void {
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('[Updater] Manual check failed:', err.message);
  });
}

/**
 * Install downloaded update and restart
 */
export function installUpdate(): void {
  if (updateAvailable) {
    autoUpdater.quitAndInstall();
  }
}

/**
 * Check if an update has been downloaded and is ready to install
 */
export function isUpdateAvailable(): boolean {
  return updateAvailable;
}
