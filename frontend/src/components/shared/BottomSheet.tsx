import { useEffect, useCallback, useRef } from 'react';
import type { ReactNode, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import './BottomSheet.css';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/**
 * BottomSheet — mobile-optimised sheet / desktop modal.
 *
 * < 768px: slides up from the bottom with a drag handle.
 * ≥ 768px: centered modal overlay (matches the design system Modal pattern).
 *
 * Accessibility: aria-modal, role=dialog, Escape key, overlay click to close,
 * focus trap, body scroll lock.
 */
export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Focus trap + scroll lock
  useEffect(() => {
    if (!isOpen) return;
    prevFocusRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => {
      if (!panelRef.current) return;
      const first = panelRef.current.querySelector<HTMLElement>(FOCUSABLE);
      if (first) first.focus();
      else panelRef.current.focus();
    }, 50);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = '';
      prevFocusRef.current?.focus();
    };
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  const sheet = (
    <div
      className="bottom-sheet__overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={panelRef}
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {/* Drag handle — visible on mobile only */}
        <div className="bottom-sheet__handle" aria-hidden="true" />

        {title && (
          <div className="bottom-sheet__header">
            <h2 className="bottom-sheet__title">{title}</h2>
            <button
              type="button"
              className="bottom-sheet__close"
              onClick={onClose}
              aria-label="Schließen"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        <div className="bottom-sheet__body">{children}</div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
