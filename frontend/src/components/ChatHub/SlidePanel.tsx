/**
 * SlidePanel — 400px right-side panel framework (Phase 104)
 *
 * Desktop: slides in from right, 400px wide, glass backdrop over chat
 * Mobile: full-screen bottom sheet (85vh)
 * Closes on: X button, Escape, backdrop click
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import './SlidePanel.css';

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function SlidePanel({ open, onClose, title, children }: SlidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Focus the panel when opened
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  return (
    <div className={`slide-panel-wrapper ${open ? 'slide-panel--open' : ''}`}>
      {/* Glass backdrop */}
      {open && (
        <div
          className="slide-panel__backdrop"
          data-testid="slide-panel-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        className="slide-panel"
        role="dialog"
        aria-label={title}
        aria-modal="true"
        tabIndex={-1}
      >
        <header className="slide-panel__header">
          <h2 className="slide-panel__title">{title}</h2>
          <button
            className="slide-panel__close"
            onClick={onClose}
            aria-label="Panel schliessen"
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        <div className="slide-panel__content">
          {children}
        </div>
      </div>
    </div>
  );
}
