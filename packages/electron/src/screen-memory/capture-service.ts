/**
 * Screen Memory Capture Service - Phase 5
 *
 * Takes periodic screenshots using Electron's desktopCapturer.
 * Stores compressed images locally and extracts text via OCR.
 * 100% local — no screenshots leave the device.
 */

import { desktopCapturer, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================
// Types
// ============================================================

export interface CaptureConfig {
  intervalMs: number;           // Screenshot interval (default: 10000 = 10s)
  storagePath: string;          // Local storage path
  retentionDays: number;        // Auto-delete after N days (default: 30)
  isEnabled: boolean;           // Toggle capture on/off
  excludedApps: string[];       // App names to skip
  quality: number;              // JPEG quality 0-100 (default: 50)
}

export interface ScreenCapture {
  id: number;
  timestamp: string;
  app_name: string;
  window_title: string;
  url: string | null;
  ocr_text: string;
  screenshot_path: string;
  duration_seconds: number;
  is_sensitive: boolean;
  metadata: Record<string, unknown>;
}

// ============================================================
// Default Config
// ============================================================

const DEFAULT_CONFIG: CaptureConfig = {
  intervalMs: 10000,
  storagePath: '',
  retentionDays: 30,
  isEnabled: false,
  excludedApps: [
    '1Password', 'Bitwarden', 'LastPass', 'KeePassXC',
    'Keychain Access', 'Schlüsselbundverwaltung',
    'System Preferences', 'Systemeinstellungen',
  ],
  quality: 50,
};

// ============================================================
// Privacy Filter
// ============================================================

const SENSITIVE_DOMAINS = [
  'banking', 'bank', 'paypal', 'stripe',
  'health', 'medical', 'arzt', 'krankenhaus',
  'password', 'passwort', 'login',
];

function isSensitiveWindow(appName: string, title: string, excludedApps: string[]): boolean {
  const lowerApp = appName.toLowerCase();
  const lowerTitle = title.toLowerCase();

  // Check excluded apps list
  if (excludedApps.some(app => lowerApp.includes(app.toLowerCase()))) {
    return true;
  }

  // Check sensitive domains
  if (SENSITIVE_DOMAINS.some(domain => lowerTitle.includes(domain) || lowerApp.includes(domain))) {
    return true;
  }

  return false;
}

// ============================================================
// Capture Service
// ============================================================

let captureInterval: NodeJS.Timeout | null = null;
let config: CaptureConfig = { ...DEFAULT_CONFIG };

export function getConfig(): CaptureConfig {
  return { ...config };
}

export function updateConfig(updates: Partial<CaptureConfig>): CaptureConfig {
  config = { ...config, ...updates };
  if (config.isEnabled && !captureInterval) {
    startCapture();
  } else if (!config.isEnabled && captureInterval) {
    stopCapture();
  }
  return { ...config };
}

export function startCapture(): void {
  if (captureInterval) return;
  if (!config.isEnabled) return;

  // Ensure storage directory exists
  if (config.storagePath) {
    fs.mkdirSync(path.join(config.storagePath, 'screenshots'), { recursive: true });
  }

  captureInterval = setInterval(async () => {
    try {
      await takeScreenshot();
    } catch (err) {
      console.error('[ScreenMemory] Capture failed:', err);
    }
  }, config.intervalMs);

  console.log(`[ScreenMemory] Capture started (interval: ${config.intervalMs}ms)`);
}

export function stopCapture(): void {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
    console.log('[ScreenMemory] Capture stopped');
  }
}

export function isCapturing(): boolean {
  return captureInterval !== null;
}

async function takeScreenshot(): Promise<void> {
  // Get active window info
  const focusedWindow = BrowserWindow.getFocusedWindow();
  const windowTitle = focusedWindow?.getTitle() || '';
  const appName = 'ZenAI'; // In production, use native APIs to get active app

  // Check privacy filter
  if (isSensitiveWindow(appName, windowTitle, config.excludedApps)) {
    return;
  }

  // Capture screen
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1280, height: 720 },
  });

  if (sources.length === 0) return;

  const source = sources[0];
  const thumbnail = source.thumbnail;

  if (!thumbnail || thumbnail.isEmpty()) return;

  // Save compressed screenshot
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `capture-${timestamp}.jpg`;
  const filepath = path.join(config.storagePath, 'screenshots', filename);

  const jpegBuffer = thumbnail.toJPEG(config.quality);
  fs.writeFileSync(filepath, jpegBuffer);

  // The OCR and database storage will be handled by the backend
  // via IPC when the electron app communicates with the express server
  console.log(`[ScreenMemory] Captured: ${filepath} (${jpegBuffer.length} bytes)`);
}

/**
 * Clean up old screenshots based on retention policy
 */
export function cleanupOldCaptures(): void {
  if (!config.storagePath) return;

  const screenshotsDir = path.join(config.storagePath, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) return;

  const now = Date.now();
  const retentionMs = config.retentionDays * 24 * 60 * 60 * 1000;

  const files = fs.readdirSync(screenshotsDir);
  let deletedCount = 0;

  for (const file of files) {
    const filepath = path.join(screenshotsDir, file);
    const stat = fs.statSync(filepath);
    if (now - stat.mtimeMs > retentionMs) {
      fs.unlinkSync(filepath);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    console.log(`[ScreenMemory] Cleaned up ${deletedCount} old captures`);
  }
}
