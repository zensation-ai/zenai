import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IdeaDetail } from '../IdeaDetail';
import type { Idea } from '../IdeaDetailTypes';
import type { StructuredIdea } from '../../types';
import type { AIContext } from '../ContextSwitcher';
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss';

interface IdeaPanelProps {
  open: boolean;
  idea: StructuredIdea | null;
  onClose: () => void;
  context: AIContext;
}

export function IdeaPanel({ open, idea, onClose, context: _context }: IdeaPanelProps) {
  const { dragProps, resetDrag } = useSwipeDismiss({ onDismiss: onClose });

  useEffect(() => {
    if (!open) return;
    // Reset drag position when panel opens
    resetDrag();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, resetDrag]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/35 backdrop-blur-sm z-[200] animate-in fade-in duration-200"
          onClick={onClose}
          data-testid="idea-panel-backdrop"
          aria-hidden="true"
        />
      )}
      <motion.aside
        {...dragProps}
        className={cn(
          'fixed top-0 right-0 h-dvh w-[440px] max-sm:w-screen bg-surface border-l border-glass-border shadow-lg z-[201] flex flex-col overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none touch-pan-x',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        role="complementary"
        aria-label="Idee-Details"
        aria-hidden={!open}
        {...(!open ? { inert: '' as unknown as boolean } : {})}
      >
        {/* Swipe handle — visible on mobile only */}
        <div className="hidden max-sm:flex justify-center pt-2 pb-1 shrink-0 cursor-grab active:cursor-grabbing touch-none" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-glass-border" />
        </div>
        <div className="flex items-center justify-end px-4 py-3 border-b border-glass-border shrink-0">
          <button
            className="flex items-center justify-center min-w-[44px] min-h-[44px] border-none bg-transparent rounded-md cursor-pointer text-text-secondary transition-colors duration-150 hover:bg-surface-hover"
            onClick={onClose}
            aria-label="Schließen"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {open && idea && (
            <IdeaDetail idea={idea as unknown as Idea} onClose={onClose} />
          )}
        </div>
      </motion.aside>
    </>
  );
}
