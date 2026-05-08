/**
 * SlidePanel — Right-side panel (Phase 104)
 *
 * Desktop: slides in from right, 400px wide
 * Mobile: full-screen bottom sheet
 * Closes on: X button, Escape, backdrop click
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function SlidePanel({ open, onClose, title, children }: SlidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-drawer"
        onClick={onClose}
        aria-hidden="true"
        data-testid="slide-panel-backdrop"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 bottom-0 w-[400px] max-w-full bg-surface border-l border-border z-drawer shadow-lg flex flex-col animate-slide-in-right max-md:top-auto max-md:left-0 max-md:w-full max-md:h-[85vh] max-md:rounded-t-xl max-md:border-t max-md:border-l-0"
        role="dialog"
        aria-label={title}
        aria-modal="true"
        tabIndex={-1}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-text m-0">{title}</h2>
          <button
            className="flex items-center justify-center size-8 rounded-md bg-transparent border-none text-text-muted cursor-pointer transition-colors hover:bg-surface-hover hover:text-text"
            onClick={onClose}
            aria-label="Panel schließen"
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </>
  );
}
