/**
 * ShortcutHint - Progressive Shortcut Discovery (Superhuman-pattern)
 *
 * Tracks mouse actions in localStorage. After the user performs the same
 * mouse action 3+ times, shows a toast-like hint revealing the keyboard
 * shortcut for that action. Auto-dismisses after 3 seconds.
 *
 * Usage:
 *   <ShortcutHintProvider>
 *     <App />
 *   </ShortcutHintProvider>
 *
 *   const { trackAction } = useShortcutHint();
 *   trackAction('navigate-ideas', 'G I');
 */

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { safeLocalStorage } from '../utils/storage';
import './ShortcutHint.css';

// ============================================
// Types
// ============================================

interface ShortcutHintContextValue {
  /** Track a mouse action. If threshold reached, shows hint. */
  trackAction: (actionId: string, shortcutLabel: string, actionDescription?: string) => void;
}

interface ActiveHint {
  id: string;
  shortcutLabel: string;
  description: string;
}

// ============================================
// Constants
// ============================================

const STORAGE_KEY = 'zenai_shortcut_hint_counts';
const THRESHOLD = 3;
const DISMISS_MS = 3000;
const COOLDOWN_MS = 60_000; // Don't show same hint within 60s

// ============================================
// Context
// ============================================

const ShortcutHintContext = createContext<ShortcutHintContextValue>({
  trackAction: () => {},
});

export function useShortcutHint() {
  return useContext(ShortcutHintContext);
}

// ============================================
// Provider
// ============================================

export function ShortcutHintProvider({ children }: { children: ReactNode }) {
  const [activeHint, setActiveHint] = useState<ActiveHint | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShownRef = useRef<Map<string, number>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const trackAction = useCallback((actionId: string, shortcutLabel: string, actionDescription?: string) => {
    // Cooldown check
    const lastShown = lastShownRef.current.get(actionId) ?? 0;
    if (Date.now() - lastShown < COOLDOWN_MS) return;

    // Read counts from localStorage
    let counts: Record<string, number> = {};
    try {
      const stored = safeLocalStorage('get', STORAGE_KEY);
      if (stored) counts = JSON.parse(stored);
    } catch {
      counts = {};
    }

    // Increment
    counts[actionId] = (counts[actionId] ?? 0) + 1;

    // Persist
    try {
      safeLocalStorage('set', STORAGE_KEY, JSON.stringify(counts));
    } catch {
      // Ignore storage errors
    }

    // Show hint if threshold reached
    if (counts[actionId] === THRESHOLD) {
      // Clear previous timer
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);

      const description = actionDescription ?? actionId.replace(/-/g, ' ');
      setActiveHint({ id: actionId, shortcutLabel, description });
      lastShownRef.current.set(actionId, Date.now());

      // Auto-dismiss
      dismissTimerRef.current = setTimeout(() => {
        setActiveHint(null);
        dismissTimerRef.current = null;
      }, DISMISS_MS);
    }
  }, []);

  return (
    <ShortcutHintContext.Provider value={{ trackAction }}>
      {children}
      {activeHint && (
        <ShortcutHintToast
          hint={activeHint}
          onDismiss={() => {
            setActiveHint(null);
            if (dismissTimerRef.current) {
              clearTimeout(dismissTimerRef.current);
              dismissTimerRef.current = null;
            }
          }}
        />
      )}
    </ShortcutHintContext.Provider>
  );
}

// ============================================
// Toast Component
// ============================================

function ShortcutHintToast({ hint, onDismiss }: { hint: ActiveHint; onDismiss: () => void }) {
  return (
    <div
      className="shortcut-hint-toast"
      role="status"
      aria-live="polite"
      onClick={onDismiss}
    >
      <span className="shortcut-hint-toast-text">
        Tipp: <strong>{hint.description}</strong> geht schneller mit
      </span>
      <kbd className="shortcut-hint-toast-key">{hint.shortcutLabel}</kbd>
    </div>
  );
}
