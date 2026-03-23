/**
 * Mock for the `electron-updater` module used in unit tests.
 */

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseName?: string;
  releaseNotes?: string | null;
}

export const autoUpdater = {
  on: jest.fn(),
  checkForUpdatesAndNotify: jest.fn().mockResolvedValue(null),
  quitAndInstall: jest.fn(),
};
