import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';
import { AIContext } from './ContextSwitcher';
const CONTEXT_OPTIONS: { id: AIContext; icon: string; label: string; color: string }[] = [
  { id: 'operations', icon: '\u{2699}\u{FE0F}', label: 'Operativ', color: 'var(--success)' },
  { id: 'finance', icon: '\u{1F4B0}', label: 'Finanzen', color: 'var(--info)' },
  { id: 'people', icon: '\u{1F465}', label: 'Team', color: 'var(--warning)' },
  { id: 'strategy', icon: '\u{1F3AF}', label: 'Strategie', color: 'var(--accent)' },
];

interface ContextPickerDialogProps {
  isOpen: boolean;
  currentContext: AIContext;
  onSelect: (targetContext: AIContext) => void;
  onCancel: () => void;
}

export function ContextPickerDialog({ isOpen, currentContext, onSelect, onCancel }: ContextPickerDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const availableContexts = CONTEXT_OPTIONS.filter(c => c.id !== currentContext);

  return createPortal(
    <div
      className="context-picker-overlay"
      onClick={onCancel}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="context-picker-dialog liquid-glass neuro-human-fade-in"
        role="dialog"
        aria-modal="true"
        aria-label="Kontext w\u00e4hlen"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="context-picker-title">Verschieben nach</h3>
        <div className="context-picker-options">
          {availableContexts.map((ctx) => (
            <button
              key={ctx.id}
              type="button"
              className="context-picker-option neuro-press-effect neuro-focus-ring"
              onClick={() => onSelect(ctx.id)}
              style={{ '--context-color': ctx.color } as React.CSSProperties}
            >
              <span className="context-picker-icon">{ctx.icon}</span>
              <span className="context-picker-label">{ctx.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="context-picker-cancel neuro-press-effect neuro-focus-ring"
          onClick={onCancel}
        >
          Abbrechen
        </button>
      </div>
    </div>,
    document.body
  );
}
