import { useState, useEffect, useRef, memo } from 'react';
import '../neurodesign.css';
import './Toast.css';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** Default toast duration in milliseconds */
const DEFAULT_DURATION = 5000;
/** Extra time added when undo option is present */
const UNDO_EXTRA_TIME = 2000;

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  onUndo?: () => void;
  undoLabel?: string;
  createdAt: number;
}

// Simple toast store with cleanup tracking
let toastListeners: ((toasts: Toast[]) => void)[] = [];
let toasts: Toast[] = [];
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Deduplication: Track recent messages to prevent duplicates
const recentMessages = new Map<string, number>();
const DEDUPE_WINDOW_MS = 2000; // 2 seconds window for deduplication

const notifyListeners = () => {
  toastListeners.forEach(listener => listener([...toasts]));
};

/** Clean up timer for a specific toast */
const clearDismissTimer = (id: string) => {
  const timer = dismissTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    dismissTimers.delete(id);
  }
};

interface ToastOptions {
  type?: ToastType;
  duration?: number;
  onUndo?: () => void;
  undoLabel?: string;
}

/**
 * Generate a unique ID using crypto API with fallback
 */
const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().substring(0, 9);
  }
  return Math.random().toString(36).substring(2, 11);
};

/**
 * Show a toast notification
 * @param message - The message to display
 * @param typeOrOptions - Either a ToastType string or a ToastOptions object
 * @param duration - Duration in ms (default: 5000, use 0 for permanent)
 * @returns The toast ID for programmatic dismissal, or null if deduplicated
 */
export const showToast = (
  message: string,
  typeOrOptions: ToastType | ToastOptions = 'info',
  duration?: number
): string | null => {
  // Deduplication: Check if same message was shown recently
  const now = Date.now();
  const lastShown = recentMessages.get(message);
  if (lastShown && (now - lastShown) < DEDUPE_WINDOW_MS) {
    return null; // Skip duplicate message
  }

  // Track this message
  recentMessages.set(message, now);

  // Cleanup old entries (older than 2x dedupe window)
  for (const [msg, time] of recentMessages) {
    if (now - time > DEDUPE_WINDOW_MS * 2) {
      recentMessages.delete(msg);
    }
  }

  const id = generateId();

  // Handle both old and new API for backwards compatibility
  const options: ToastOptions = typeof typeOrOptions === 'string'
    ? { type: typeOrOptions, duration }
    : typeOrOptions;

  const toast: Toast = {
    id,
    message,
    type: options.type || 'info',
    duration: options.duration ?? DEFAULT_DURATION,
    onUndo: options.onUndo,
    undoLabel: options.undoLabel || 'Rückgängig',
    createdAt: Date.now(),
  };

  toasts = [...toasts, toast];
  notifyListeners();

  // Auto-dismiss - give extra time if there's an undo option
  if (toast.duration > 0) {
    const dismissTime = toast.onUndo ? toast.duration + UNDO_EXTRA_TIME : toast.duration;
    const timer = setTimeout(() => {
      dismissTimers.delete(id);
      toasts = toasts.filter(t => t.id !== id);
      notifyListeners();
    }, dismissTime);
    dismissTimers.set(id, timer);
  }

  return id;
};

export const dismissToast = (id: string) => {
  // Clear any pending auto-dismiss timer
  clearDismissTimer(id);
  toasts = toasts.filter(t => t.id !== id);
  notifyListeners();
};

/**
 * Clear all toasts and clean up timers
 * Call this when unmounting the app or during cleanup
 */
export const clearAllToasts = () => {
  // Clear all pending timers
  dismissTimers.forEach((timer) => clearTimeout(timer));
  dismissTimers.clear();
  toasts = [];
  // Also clear deduplication tracking
  recentMessages.clear();
  notifyListeners();
};

// Hook for components to subscribe to toasts
export function useToasts() {
  const [localToasts, setLocalToasts] = useState<Toast[]>([]);

  useEffect(() => {
    toastListeners.push(setLocalToasts);
    return () => {
      toastListeners = toastListeners.filter(l => l !== setLocalToasts);
    };
  }, []);

  return localToasts;
}

// Individual Toast Item with progress bar - memoized to prevent unnecessary re-renders
const ToastItem = memo(function ToastItem({ toast }: { toast: Toast }) {
  const [progress, setProgress] = useState(100);
  const startTimeRef = useRef(Date.now());
  const duration = toast.onUndo
    ? (toast.duration ?? 4000) + 2000
    : toast.duration ?? 4000;

  useEffect(() => {
    if (duration <= 0) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration]);

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (toast.onUndo) {
      toast.onUndo();
      dismissToast(toast.id);
    }
  };

  return (
    <div
      className={`toast toast-${toast.type} neuro-hover-lift`}
      onClick={() => dismissToast(toast.id)}
      role="status"
      aria-live="polite"
    >
      <span className="toast-icon" aria-hidden="true">
        {toast.type === 'success' && '✓'}
        {toast.type === 'error' && '✕'}
        {toast.type === 'warning' && '⚠'}
        {toast.type === 'info' && 'ℹ'}
      </span>
      <span className="toast-message">{toast.message}</span>
      {toast.onUndo && (
        <button
          type="button"
          className="toast-undo neuro-press-effect neuro-focus-ring"
          onClick={handleUndo}
          aria-label={`${toast.undoLabel}: ${toast.message}`}
        >
          {toast.undoLabel}
        </button>
      )}
      <button
        type="button"
        className="toast-close neuro-press-effect neuro-focus-ring"
        onClick={(e) => {
          e.stopPropagation();
          dismissToast(toast.id);
        }}
        aria-label="Schließen"
      >
        ×
      </button>
      {duration > 0 && (
        <div
          className="toast-progress"
          style={{ width: `${progress}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
});

// Toast container component
export function ToastContainer() {
  const toastList = useToasts();

  if (toastList.length === 0) return null;

  return (
    <div className="toast-container" role="alert" aria-live="polite">
      {toastList.map(toast => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
