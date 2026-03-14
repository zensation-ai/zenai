import { useState, useEffect, useRef, memo, useCallback } from 'react';
import './Toast.css';

export type DSToastType = 'success' | 'error' | 'warning' | 'info';

interface DSToast {
  id: string;
  message: string;
  type: DSToastType;
  duration: number;
  dismissable: boolean;
  createdAt: number;
}

/* ---------- Store ---------- */

let listeners: ((toasts: DSToast[]) => void)[] = [];
let toasts: DSToast[] = [];
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const recent = new Map<string, number>();
const DEDUPE_MS = 2000;

const notify = () => listeners.forEach((fn) => fn([...toasts]));

const genId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().substring(0, 9)
    : Math.random().toString(36).substring(2, 11);

export interface DSToastOptions {
  type?: DSToastType;
  duration?: number;
  dismissable?: boolean;
}

/**
 * Show a design-system toast.
 * Returns the toast id, or null if deduplicated.
 */
export function dsShowToast(
  message: string,
  options: DSToastOptions = {}
): string | null {
  const now = Date.now();
  if ((recent.get(message) ?? 0) + DEDUPE_MS > now) return null;
  recent.set(message, now);

  // Cleanup stale entries
  for (const [m, t] of recent) {
    if (now - t > DEDUPE_MS * 2) recent.delete(m);
  }

  const id = genId();
  const duration = options.duration ?? 5000;

  const toast: DSToast = {
    id,
    message,
    type: options.type ?? 'info',
    duration,
    dismissable: options.dismissable ?? true,
    createdAt: now,
  };

  toasts = [...toasts, toast];
  notify();

  if (duration > 0) {
    const timer = setTimeout(() => {
      timers.delete(id);
      toasts = toasts.filter((t) => t.id !== id);
      notify();
    }, duration);
    timers.set(id, timer);
  }

  return id;
}

export function dsDismissToast(id: string) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

export function dsClearAllToasts() {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  recent.clear();
  toasts = [];
  notify();
}

/* ---------- Hook ---------- */

export function useDSToasts() {
  const [local, setLocal] = useState<DSToast[]>([]);

  useEffect(() => {
    listeners.push(setLocal);
    return () => {
      listeners = listeners.filter((l) => l !== setLocal);
    };
  }, []);

  return local;
}

/* ---------- Toast Item ---------- */

const ICONS: Record<DSToastType, string> = {
  success: '\u2713',
  error: '\u2715',
  warning: '\u26A0',
  info: '\u2139',
};

const DSToastItem = memo(function DSToastItem({ toast }: { toast: DSToast }) {
  const [progress, setProgress] = useState(100);
  const startRef = useRef(Date.now());
  const dur = toast.duration;

  useEffect(() => {
    if (dur <= 0) return;
    const interval = setInterval(() => {
      const pct = Math.max(0, 100 - ((Date.now() - startRef.current) / dur) * 100);
      setProgress(pct);
      if (pct <= 0) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [dur]);

  const handleDismiss = useCallback(() => dsDismissToast(toast.id), [toast.id]);

  return (
    <div className={`ds-toast ds-toast--${toast.type}`} role="status" aria-live="polite">
      <span className="ds-toast__icon" aria-hidden="true">
        {ICONS[toast.type]}
      </span>
      <span className="ds-toast__message">{toast.message}</span>
      {toast.dismissable && (
        <button
          type="button"
          className="ds-toast__close"
          onClick={handleDismiss}
          aria-label="Schlie\u00dfen"
        >
          \u00D7
        </button>
      )}
      {dur > 0 && (
        <div className="ds-toast__progress" style={{ width: `${progress}%` }} aria-hidden="true" />
      )}
    </div>
  );
});

/* ---------- Container ---------- */

export function DSToastContainer() {
  const list = useDSToasts();

  return (
    <div
      className="ds-toast-container"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="Benachrichtigungen"
    >
      {list.map((t) => (
        <DSToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
