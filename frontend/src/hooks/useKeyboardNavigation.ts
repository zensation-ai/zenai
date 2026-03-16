/**
 * useKeyboardNavigation - Vim-style G+key navigation sequences
 *
 * Enables "G then key" two-step navigation (like Vim's `g` prefix).
 * Example: G then H = go Home, G then I = go Ideas, G then C = go Chat.
 *
 * Automatically disabled when focus is in input/textarea/contenteditable.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Page } from '../types/idea';

/** Map of second-key to page navigation target */
const G_KEY_MAP: Record<string, { page: Page; label: string }> = {
  h: { page: 'home', label: 'Dashboard' },
  c: { page: 'chat', label: 'Chat' },
  i: { page: 'ideas', label: 'Gedanken' },
  w: { page: 'workshop', label: 'Werkstatt' },
  p: { page: 'calendar', label: 'Planer' },
  e: { page: 'email', label: 'E-Mail' },
  d: { page: 'documents', label: 'Wissensbasis' },
  n: { page: 'insights', label: 'Insights' },
  b: { page: 'business', label: 'Business' },
  l: { page: 'learning', label: 'Lernen' },
  a: { page: 'my-ai', label: 'Meine KI' },
  s: { page: 'settings', label: 'Einstellungen' },
  f: { page: 'finance', label: 'Finanzen' },
  k: { page: 'contacts', label: 'Kontakte' },
  r: { page: 'browser', label: 'Browser' },
  t: { page: 'agent-teams', label: 'Agent Teams' },
};

/** Timeout for second key in ms */
const SEQUENCE_TIMEOUT = 1500;

interface UseKeyboardNavigationOptions {
  onNavigate: (page: Page) => void;
  enabled?: boolean;
}

interface UseKeyboardNavigationReturn {
  /** Whether we're waiting for the second key after G */
  isSequenceActive: boolean;
  /** Hint text like "G + ?" to show in the UI */
  sequenceHint: string | null;
}

/**
 * Get the G+key shortcut label for a given page (e.g., "G H" for home).
 * Returns null if no mapping exists.
 */
export function getGKeyLabel(page: Page): string | null {
  for (const [key, mapping] of Object.entries(G_KEY_MAP)) {
    if (mapping.page === page) {
      return `G ${key.toUpperCase()}`;
    }
  }
  return null;
}

/**
 * Returns all G+key mappings (for displaying in help/settings).
 */
export function getAllGKeyMappings(): Array<{ key: string; page: Page; label: string }> {
  return Object.entries(G_KEY_MAP).map(([key, mapping]) => ({
    key: key.toUpperCase(),
    page: mapping.page,
    label: mapping.label,
  }));
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  // Also skip if a dialog/modal is open
  if (el.closest('[role="dialog"]')) return true;
  return false;
}

export function useKeyboardNavigation({
  onNavigate,
  enabled = true,
}: UseKeyboardNavigationOptions): UseKeyboardNavigationReturn {
  const [isSequenceActive, setIsSequenceActive] = useState(false);
  const [sequenceHint, setSequenceHint] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSequence = useCallback(() => {
    setIsSequenceActive(false);
    setSequenceHint(null);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if in input fields
      if (isInputFocused()) return;
      // Skip if any modifier is held
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (isSequenceActive) {
        // We're waiting for the second key
        e.preventDefault();
        const mapping = G_KEY_MAP[e.key.toLowerCase()];
        if (mapping) {
          onNavigate(mapping.page);
        }
        clearSequence();
        return;
      }

      // First key: G (lowercase only, no modifiers)
      if (e.key === 'g' && !e.shiftKey) {
        setIsSequenceActive(true);
        setSequenceHint('G + ...');
        // Auto-cancel after timeout
        timeoutRef.current = setTimeout(clearSequence, SEQUENCE_TIMEOUT);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [enabled, isSequenceActive, onNavigate, clearSequence]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { isSequenceActive, sequenceHint };
}
