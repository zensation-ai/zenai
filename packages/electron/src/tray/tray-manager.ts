/**
 * Tray Manager
 *
 * Manages the system tray icon and its status indicators.
 * Supports three states: idle (default), thinking (pulsing), notification (badge dot).
 *
 * The "thinking" state pulses between idle and thinking icons on a 500ms interval,
 * creating a visual heartbeat while the AI processes a query.
 */

import { Tray } from 'electron';
import { getTrayIcon, TrayStatus } from './tray-icons';

// ===========================
// State
// ===========================

let trayInstance: Tray | null = null;
let currentStatus: TrayStatus = 'idle';
let pulseInterval: ReturnType<typeof setInterval> | null = null;
let pulsePhase = false; // toggles between idle/thinking icons during pulse

const PULSE_INTERVAL_MS = 500;

// ===========================
// Public API
// ===========================

/**
 * Bind the tray manager to an existing Tray instance.
 * Must be called after tray creation.
 */
export function bindTray(tray: Tray): void {
  trayInstance = tray;
  applyIcon('idle');
}

/**
 * Get the current tray status.
 */
export function getTrayStatus(): TrayStatus {
  return currentStatus;
}

/**
 * Set the tray icon status.
 *
 * - 'idle': Static default icon
 * - 'thinking': Pulses between idle and thinking icons (500ms interval)
 * - 'notification': Static icon with red badge dot
 */
export function setTrayStatus(status: TrayStatus): void {
  if (status === currentStatus) return;

  stopPulse();
  currentStatus = status;

  if (status === 'thinking') {
    startPulse();
  } else {
    applyIcon(status);
  }
}

/**
 * Clean up intervals and references. Call on app quit.
 */
export function destroyTrayManager(): void {
  stopPulse();
  trayInstance = null;
  currentStatus = 'idle';
}

// ===========================
// Internal
// ===========================

function applyIcon(status: TrayStatus): void {
  if (!trayInstance) return;
  trayInstance.setImage(getTrayIcon(status));
}

function startPulse(): void {
  pulsePhase = false;
  applyIcon('thinking');

  pulseInterval = setInterval(() => {
    pulsePhase = !pulsePhase;
    applyIcon(pulsePhase ? 'idle' : 'thinking');
  }, PULSE_INTERVAL_MS);
}

function stopPulse(): void {
  if (pulseInterval) {
    clearInterval(pulseInterval);
    pulseInterval = null;
  }
  pulsePhase = false;
}
