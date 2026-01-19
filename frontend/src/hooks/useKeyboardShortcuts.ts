import { useEffect, useCallback } from 'react';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
  enabled?: boolean;
}

/**
 * Hook for managing keyboard shortcuts
 * Supports Cmd/Ctrl + Key combinations
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' ||
                   target.tagName === 'TEXTAREA' ||
                   target.isContentEditable;

    // Allow Cmd+Enter in textareas
    const isSubmitShortcut = (event.metaKey || event.ctrlKey) && event.key === 'Enter';

    for (const shortcut of shortcuts) {
      if (shortcut.enabled === false) continue;

      const metaMatch = (event.metaKey || event.ctrlKey) === (shortcut.meta || shortcut.ctrl || false);
      const shiftMatch = event.shiftKey === (shortcut.shift || false);
      const altMatch = event.altKey === (shortcut.alt || false);
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

      if (metaMatch && shiftMatch && altMatch && keyMatch) {
        // Skip if in input and not the submit shortcut
        if (isInput && !isSubmitShortcut) continue;

        event.preventDefault();
        shortcut.action();
        return;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Get display string for a shortcut
 */
export function getShortcutDisplay(shortcut: Omit<ShortcutConfig, 'action' | 'description'>): string {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const parts: string[] = [];

  if (shortcut.ctrl || shortcut.meta) {
    parts.push(isMac ? '⌘' : 'Ctrl');
  }
  if (shortcut.shift) {
    parts.push(isMac ? '⇧' : 'Shift');
  }
  if (shortcut.alt) {
    parts.push(isMac ? '⌥' : 'Alt');
  }

  // Format the key
  let key = shortcut.key;
  if (key === 'Enter') key = '↵';
  if (key === 'Escape') key = 'Esc';
  if (key === ' ') key = 'Space';
  if (key.length === 1) key = key.toUpperCase();

  parts.push(key);

  return parts.join(isMac ? '' : '+');
}

/**
 * Common app shortcuts
 */
export const APP_SHORTCUTS = {
  search: { key: 'k', meta: true, description: 'Suche öffnen' },
  submit: { key: 'Enter', meta: true, description: 'Absenden' },
  escape: { key: 'Escape', description: 'Schließen/Abbrechen' },
  newIdea: { key: 'n', meta: true, description: 'Neuer Gedanke' },
  toggleView: { key: 'v', meta: true, shift: true, description: 'Ansicht wechseln' },
};
