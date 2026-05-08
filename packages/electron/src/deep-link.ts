/**
 * Deep Link Handler
 *
 * Parses `zenai://` protocol URLs and navigates the app accordingly.
 * Extracted from main.ts for testability.
 *
 * Supported schemes:
 *   zenai://chat          → navigate to chat
 *   zenai://idea/:id      → navigate to idea detail
 *   zenai://settings      → navigate to settings
 */

import { showAndFocus, getMainWindow } from './windows/main-window';

/**
 * Ensure the main window exists and is visible.
 * Accepts a factory so main.ts can inject its own `ensureMainWindow`.
 */
export interface DeepLinkDeps {
  ensureMainWindow: () => void;
}

/**
 * Handle an incoming `zenai://` deep link URL.
 */
export function handleDeepLink(url: string, deps: DeepLinkDeps): void {
  deps.ensureMainWindow();
  const win = getMainWindow();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  try {
    const parsed = new URL(url);
    const host = parsed.host;
    const pathname = parsed.pathname;

    switch (host) {
      case 'chat':
        showAndFocus('chat');
        break;
      case 'idea': {
        const id = pathname.replace(/^\//, '');
        showAndFocus(id ? `ideas/${id}` : 'ideas');
        break;
      }
      case 'settings':
        showAndFocus('settings');
        break;
      default:
        // Unknown scheme — window was already focused above
        break;
    }
  } catch {
    // Malformed URL — window already focused above
  }
}
