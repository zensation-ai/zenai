/**
 * useKeyboardShortcut Hook
 *
 * Reusable keyboard shortcut handler with cross-platform support (Mac/Windows/Linux).
 * Supports modifier keys: Cmd, Ctrl, Shift, Alt/Option.
 */

import { useEffect } from 'react';

/**
 * Hook to register a keyboard shortcut
 *
 * @param shortcut - Shortcut string (e.g. "Cmd+N", "Ctrl+Shift+S")
 * @param callback - Function to call when shortcut is triggered
 * @param enabled - Whether the shortcut is active (default: true)
 */
export function useKeyboardShortcut(
  shortcut: string,
  callback: () => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Parse shortcut string (e.g. "Cmd+N" or "Ctrl+Shift+S")
      const parts = shortcut.toLowerCase().split('+');
      const key = parts[parts.length - 1];

      const needsMeta = parts.includes('cmd') || parts.includes('meta');
      const needsCtrl = parts.includes('ctrl');
      const needsShift = parts.includes('shift');
      const needsAlt = parts.includes('alt') || parts.includes('option');

      const isMac = navigator.platform.toUpperCase().includes('MAC');

      // Check modifiers
      const metaPressed = isMac ? e.metaKey : e.ctrlKey;
      const ctrlPressed = e.ctrlKey;
      const shiftPressed = e.shiftKey;
      const altPressed = e.altKey;

      // Match check
      const modifiersMatch =
        (needsMeta ? metaPressed : true) &&
        (needsCtrl ? ctrlPressed : true) &&
        (needsShift ? shiftPressed : true) &&
        (needsAlt ? altPressed : true);

      const keyMatches = e.key.toLowerCase() === key;

      if (modifiersMatch && keyMatches) {
        e.preventDefault();
        callback();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcut, callback, enabled]);
}

/**
 * Format a shortcut string for display with platform-specific symbols
 *
 * @param shortcut - Shortcut string (e.g. "Cmd+N")
 * @returns Formatted string (e.g. "⌘ N" on Mac, "Ctrl N" on Windows)
 */
export function formatShortcut(shortcut: string): string {
  const isMac = typeof navigator !== 'undefined' &&
    navigator.platform.toUpperCase().includes('MAC');

  return shortcut
    .replace(/Cmd/gi, isMac ? '⌘' : 'Ctrl')
    .replace(/Ctrl/gi, isMac ? '⌃' : 'Ctrl')
    .replace(/Alt/gi, isMac ? '⌥' : 'Alt')
    .replace(/Shift/gi, isMac ? '⇧' : 'Shift')
    .replace(/\+/g, ' ');
}
