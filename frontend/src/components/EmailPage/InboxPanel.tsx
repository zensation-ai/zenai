/**
 * InboxPanel - Slide-out panel for email detail/compose/reply
 *
 * Fixed position, 440px width, slides in from right.
 * Follows the same pattern as IdeaPanel from Phase 107.
 */
import { useEffect } from 'react';
import { X } from 'lucide-react';
import './InboxPanel.css';

interface InboxPanelProps {
  open: boolean;
  emailId: string | null;
  mode: 'detail' | 'compose' | 'reply';
  onClose: () => void;
  context: string;
}

export function InboxPanel({ open, emailId, mode: _mode, onClose, context: _context }: InboxPanelProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          className="inbox-panel__backdrop"
          onClick={onClose}
          data-testid="inbox-panel-backdrop"
          aria-hidden="true"
        />
      )}
      <aside
        className={`inbox-panel ${open ? 'inbox-panel--open' : ''}`}
        role="complementary"
        aria-label="E-Mail-Details"
      >
        <div className="inbox-panel__header">
          <button
            className="inbox-panel__close"
            onClick={onClose}
            aria-label="Schliessen"
          >
            <X size={20} />
          </button>
        </div>
        <div className="inbox-panel__content">
          {open && emailId && (
            <div className="inbox-panel__placeholder">
              E-Mail: {emailId}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
