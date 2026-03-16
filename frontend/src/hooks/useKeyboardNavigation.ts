/**
 * useKeyboardNavigation - Vim-Style Key Sequence Navigation
 *
 * Supports G+key sequences for global navigation:
 *   G then D = Dashboard
 *   G then C = Chat
 *   G then I = Ideas
 *   G then E = Email
 *   G then T = Tasks (Planner)
 *   G then S = Settings
 *   G then K = Contacts
 *   G then F = Finance
 *   G then B = Business
 *   G then W = Workshop
 *   G then N = Notifications
 *   G then L = Learning
 *
 * Also handles:
 *   J/K for list navigation
 *   Escape hierarchy
 *
 * Phase 82: Keyboard-First & Command System
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Page } from '../types';

// ============================================
// Navigation Map
// ============================================

const G_KEY_NAV_MAP: Record<string, Page> = {
  d: 'home',
  c: 'chat',
  i: 'ideas',
  e: 'email',
  t: 'calendar',
  s: 'settings',
  k: 'contacts',
  f: 'finance',
  b: 'business',
  w: 'workshop',
  n: 'notifications',
  l: 'learning',
  m: 'my-ai',
  o: 'documents',
  p: 'insights',
  r: 'browser',
};

// ============================================
// Types
// ============================================

interface UseKeyboardNavigationOptions {
  onNavigate: (page: Page) => void;
  /** Whether keyboard navigation is enabled (disabled when modals/inputs are focused) */
  enabled?: boolean;
}

interface KeyboardNavigationState {
  /** Current pending key in a sequence (e.g., 'g' waiting for second key) */
  pendingKey: string | null;
  /** Visual indicator text for the pending sequence */
  sequenceHint: string | null;
}

// ============================================
// Hook
// ============================================

export function useKeyboardNavigation({
  onNavigate,
  enabled = true,
}: UseKeyboardNavigationOptions): KeyboardNavigationState {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [sequenceHint, setSequenceHint] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    setPendingKey(null);
    setSequenceHint(null);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when typing in input fields, textareas, or contenteditable elements
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Skip if any modifier key is pressed (except shift for uppercase)
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      const key = e.key.toLowerCase();

      // Handle pending G sequence
      if (pendingKey === 'g') {
        const targetPage = G_KEY_NAV_MAP[key];
        if (targetPage) {
          e.preventDefault();
          onNavigate(targetPage);
        }
        clearPending();
        return;
      }

      // Start G sequence
      if (key === 'g' && !e.shiftKey) {
        e.preventDefault();
        setPendingKey('g');
        setSequenceHint('g...');

        // Auto-clear after 1.5 seconds
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(clearPending, 1500);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [enabled, pendingKey, onNavigate, clearPending]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { pendingKey, sequenceHint };
}

/**
 * Get a display label for a G+key navigation shortcut
 */
export function getGKeyLabel(page: Page): string | undefined {
  for (const [key, target] of Object.entries(G_KEY_NAV_MAP)) {
    if (target === page) {
      return `G ${key.toUpperCase()}`;
    }
  }
  return undefined;
}

/**
 * Get all G-key navigation mappings for display
 */
export function getAllGKeyMappings(): Array<{ key: string; page: Page; label: string }> {
  return Object.entries(G_KEY_NAV_MAP).map(([key, page]) => ({
    key: key.toUpperCase(),
    page,
    label: `G dann ${key.toUpperCase()}`,
  }));
}
