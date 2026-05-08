/**
 * Spotlight Overlay Window
 *
 * A floating, frameless input window for quick AI interactions.
 * Inspired by Raycast/Alfred — appears center-top of screen.
 *
 * Behavior:
 * - Cmd+Shift+Space toggles visibility
 * - Starts at 600x56px, expands to 600x400px when showing results
 * - ESC or blur hides the window (not destroyed)
 * - Sends queries to backend /api/chat/quick via main process
 */

import { BrowserWindow, screen, app } from 'electron';
import * as path from 'path';

// ===========================
// Constants
// ===========================

const SPOTLIGHT_WIDTH = 600;
const SPOTLIGHT_HEIGHT_COLLAPSED = 56;
const SPOTLIGHT_HEIGHT_EXPANDED = 400;

// ===========================
// State
// ===========================

let spotlightWindow: BrowserWindow | null = null;
let isAppQuitting = false;

// Set quitting flag so the close handler lets the window actually close
app.on('before-quit', () => {
  isAppQuitting = true;
});

// ===========================
// Public API
// ===========================

/**
 * Create the spotlight overlay window (hidden initially).
 */
export function createSpotlightWindow(): BrowserWindow {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  spotlightWindow = new BrowserWindow({
    width: SPOTLIGHT_WIDTH,
    height: SPOTLIGHT_HEIGHT_COLLAPSED,
    x: Math.round((screenWidth - SPOTLIGHT_WIDTH) / 2),
    y: 140, // positioned near top of screen, below menu bar
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: true,
    vibrancy: 'under-window', // macOS frosted glass
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  spotlightWindow.loadFile(path.join(__dirname, '..', 'spotlight', 'spotlight.html'));

  // Hide on blur (clicking outside)
  spotlightWindow.on('blur', () => {
    hideSpotlight();
  });

  // Prevent destruction — just hide (unless app is quitting)
  spotlightWindow.on('close', (event) => {
    if (!isAppQuitting) {
      event.preventDefault();
      hideSpotlight();
    }
  });

  return spotlightWindow;
}

/**
 * Toggle spotlight visibility.
 */
export function toggleSpotlight(): void {
  if (!spotlightWindow) return;

  if (spotlightWindow.isVisible()) {
    hideSpotlight();
  } else {
    showSpotlight();
  }
}

/**
 * Show the spotlight window, reset to collapsed size, and focus input.
 */
export function showSpotlight(): void {
  if (!spotlightWindow) return;

  // Re-center horizontally (display may have changed)
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const x = Math.round((screenWidth - SPOTLIGHT_WIDTH) / 2);
  spotlightWindow.setBounds({ x, y: 140, width: SPOTLIGHT_WIDTH, height: SPOTLIGHT_HEIGHT_COLLAPSED });

  spotlightWindow.show();
  spotlightWindow.focus();
  spotlightWindow.webContents.send('spotlight:show');
}

/**
 * Hide the spotlight window and notify the renderer.
 */
export function hideSpotlight(): void {
  if (!spotlightWindow || !spotlightWindow.isVisible()) return;

  spotlightWindow.webContents.send('spotlight:hide');
  spotlightWindow.hide();
}

/**
 * Resize the spotlight window (e.g. when results are shown).
 * Height is clamped between collapsed and expanded sizes.
 */
export function resizeSpotlight(height: number): void {
  if (!spotlightWindow) return;

  const clampedHeight = Math.max(
    SPOTLIGHT_HEIGHT_COLLAPSED,
    Math.min(height, SPOTLIGHT_HEIGHT_EXPANDED),
  );
  const bounds = spotlightWindow.getBounds();
  spotlightWindow.setBounds({ ...bounds, height: clampedHeight });
}

/**
 * Get the current spotlight window instance.
 */
export function getSpotlightWindow(): BrowserWindow | null {
  return spotlightWindow;
}
