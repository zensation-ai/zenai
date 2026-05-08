/**
 * Tray Icon Variants
 *
 * Generates 16x16 PNG icons for each tray status using raw pixel buffers.
 * Three variants: idle (gray), thinking (purple pulse), notification (red dot badge).
 *
 * Uses nativeImage.createFromBuffer — no Canvas or external dependencies.
 */

import { nativeImage, NativeImage } from 'electron';

export type TrayStatus = 'idle' | 'thinking' | 'notification';

// Base64-encoded 16x16 PNG icons for each status
// These are pre-rendered to avoid runtime Canvas dependency

/** Default gray ZenAI spark icon */
const ICON_IDLE =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADgSURBVDiN1ZMxCsJAEEX/7hqwUKzEwsZCbATBwsrK3kN4Aa/gQTyBZ/AGNjbewMI7KIhEENFCi6yskmhi1sUPw8B882dmB0KI/5bK80CShEqJmLGNjCNsHbDW4OaAXSCL8dqAZcK8BXfNfgOKEi8S1hBqH3D1Uf3IAI7+0JuaUgImpqQC+wm3v3k+8q3o0BuAL8Al0E643Pq8AEXJ5gI+P3aKxoBFGSsNFcJabMEAqwfcY7gZoJMB0j4Ab4IzlNOKXYETAkrA03XDO8B+Bwh2rz3QKOcNbvI/n58v4i/5Q0Ur36xBbpFDAAAAABJRU5ErkJggg==';

/** Purple-tinted variant for "thinking" state */
const ICON_THINKING =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADxSURBVDiN1ZKxCsIwEIb/u1awkCK4uOjgoIggODg5+R4+gK/gQ/gEPoM3OLr5BjrrAxREFEVxsJOtpq2NUfwhhPv+u8sFQoj/lsz1QJqGRmmUcY6cE2wddNbkZoFdIE/w2oFlxnwEd8P+AIoKLzPWMOoccfVR/cQAjv7Rm5tSIqYWpIKHCXe/+T7yrRjQO4AvwFXQ3vlc+rwCRelmAj4/dorGgGUFKw1VxnpmwQBvR5xlvJsg0wOSfoBvgguV04pdixMBy4LVNcN7AL4niHZvLdBIZ/0+kJ8vEi/5Q0Ur3a1PfJFKBQAAAABJRU5ErkJggg==';

/** Icon with small red notification dot in top-right corner */
const ICON_NOTIFICATION =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEESURBVDiN1ZMxCsJAEEX/7hqwUKzEwsZCbATBwsrK3kN4Aa/gQTyBZ/AGNjbewMI7KIhEENFCi6yskmhi1sUPw8B882dmB0KI/5bK80CShEqJmLGNjCNsHbDW4OaAXSCL8dqAZcK8BXfNfgOKEi8S1hBqH3D1Uf3IAI7+0JuaUgImpqQC+wm3v3k+8q3o0BuAL8Al0E643Pq8AEXJ5gI+P3aKxoBFGSsNFcJabMEAqwfcY7gZoJMB0j4Ab4IzlNOKXYETAkrA03XDO8B+Bwh2rz3QKOcNTuAgYHd/AH+eHy+SH/ljSQvdrEFekUoF7A/Rj//gGEqVe7ABkiYAAAAASUVORK5CYII=';

const iconCache = new Map<TrayStatus, NativeImage>();

/**
 * Get the tray icon for a given status.
 * Icons are cached after first creation.
 */
export function getTrayIcon(status: TrayStatus): NativeImage {
  const cached = iconCache.get(status);
  if (cached) return cached;

  let base64: string;
  switch (status) {
    case 'thinking':
      base64 = ICON_THINKING;
      break;
    case 'notification':
      base64 = ICON_NOTIFICATION;
      break;
    case 'idle':
    default:
      base64 = ICON_IDLE;
      break;
  }

  const icon = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'));
  iconCache.set(status, icon);
  return icon;
}

/**
 * Clear the icon cache (useful for tests).
 */
export function clearIconCache(): void {
  iconCache.clear();
}
