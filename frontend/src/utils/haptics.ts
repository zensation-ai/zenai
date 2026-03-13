/**
 * Haptic Feedback Utility
 *
 * Provides tactile feedback on supported devices using the Vibration API.
 * Falls back gracefully to no-op on unsupported devices.
 *
 * Based on Apple HIG haptic patterns:
 * - Light: selection change, toggle
 * - Medium: successful action, swipe confirm
 * - Heavy: destructive action, error
 */

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [15, 50, 15],    // double-tap feel
  warning: [30, 80, 30],    // attention pattern
  error: [50, 100, 50, 100, 50], // triple-pulse
  selection: 5,              // minimal feedback
};

function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

/**
 * Trigger haptic feedback. No-op on unsupported devices.
 */
export function haptic(pattern: HapticPattern = 'light'): void {
  if (!canVibrate()) return;

  // Respect reduced motion preference
  if (typeof window !== 'undefined') {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
  }

  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Silently ignore - vibration is a nice-to-have
  }
}

/**
 * Cancel any ongoing vibration.
 */
export function hapticCancel(): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(0);
  } catch {
    // ignore
  }
}
