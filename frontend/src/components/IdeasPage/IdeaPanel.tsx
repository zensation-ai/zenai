import { useEffect } from 'react';
import { X } from 'lucide-react';
import { IdeaDetail } from '../IdeaDetail';
import type { StructuredIdea } from '../../types';
import type { AIContext } from '../ContextSwitcher';
import './IdeaPanel.css';

interface IdeaPanelProps {
  open: boolean;
  idea: StructuredIdea | null;
  onClose: () => void;
  context: AIContext;
}

export function IdeaPanel({ open, idea, onClose, context: _context }: IdeaPanelProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          className="idea-panel__backdrop"
          onClick={onClose}
          data-testid="idea-panel-backdrop"
          aria-hidden="true"
        />
      )}
      <aside
        className={`idea-panel ${open ? 'idea-panel--open' : ''}`}
        role="complementary"
        aria-label="Idee-Details"
      >
        <div className="idea-panel__header">
          <button
            className="idea-panel__close"
            onClick={onClose}
            aria-label="Schliessen"
          >
            <X size={20} />
          </button>
        </div>
        <div className="idea-panel__content">
          {open && idea && (
            <IdeaDetail idea={idea as any} onClose={onClose} />
          )}
        </div>
      </aside>
    </>
  );
}
