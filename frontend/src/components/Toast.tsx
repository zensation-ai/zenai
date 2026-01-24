import { useState, useEffect, useRef } from 'react';
import '../neurodesign.css';
import './Toast.css';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  onUndo?: () => void;
  undoLabel?: string;
}

// Simple toast store
let toastListeners: ((toasts: Toast[]) => void)[] = [];
let toasts: Toast[] = [];

const notifyListeners = () => {
  toastListeners.forEach(listener => listener([...toasts]));
};

interface ToastOptions {
  type?: ToastType;
  duration?: number;
  onUndo?: () => void;
  undoLabel?: string;
}

/**
 * Show a toast notification
 * @param message - The message to display
 * @param typeOrOptions - Either a ToastType string or a ToastOptions object
 * @param duration - Duration in ms (default: 4000, use 0 for permanent)
 */
export const showToast = (
  message: string,
  typeOrOptions: ToastType | ToastOptions = 'info',
  duration?: number
): string => {
  const id = Math.random().toString(36).substr(2, 9);

  // Handle both old and new API for backwards compatibility
  let options: ToastOptions;
  if (typeof typeOrOptions === 'string') {
    options = { type: typeOrOptions, duration };
  } else {
    options = typeOrOptions;
  }

  const toast: Toast = {
    id,
    message,
    type: options.type || 'info',
    duration: options.duration ?? 4000,
    onUndo: options.onUndo,
    undoLabel: options.undoLabel || 'Rückgängig',
  };

  toasts = [...toasts, toast];
  notifyListeners();

  // Auto-dismiss - give extra time if there's an undo option
  const effectiveDuration = toast.duration ?? 4000;
  if (effectiveDuration > 0) {
    const dismissTime = toast.onUndo ? effectiveDuration + 2000 : effectiveDuration;
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
      notifyListeners();
    }, dismissTime);
  }

  return id;
};

export const dismissToast = (id: string) => {
  toasts = toasts.filter(t => t.id !== id);
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

// Individual Toast Item with progress bar
function ToastItem({ toast }: { toast: Toast }) {
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
    >
      <span className="toast-icon">
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
}

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
