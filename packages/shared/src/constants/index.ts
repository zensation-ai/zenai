/**
 * Shared constants used across all packages
 */

export const APP_NAME = 'ZenAI';
export const APP_VERSION = '2.0.0';
export const APP_AUTHOR = 'Alexander Bering';
export const APP_HOMEPAGE = 'https://zensation.ai';

/**
 * Default API port for the Express backend
 */
export const DEFAULT_API_PORT = 3000;

/**
 * Default frontend dev server port
 */
export const DEFAULT_FRONTEND_PORT = 5173;

/**
 * Feature flags for platform-specific features
 */
export const FEATURES = {
  BROWSER: 'browser',
  SCREEN_MEMORY: 'screen-memory',
  NATIVE_NOTIFICATIONS: 'native-notifications',
  FILE_SYSTEM: 'file-system',
  SYSTEM_TRAY: 'system-tray',
} as const;
