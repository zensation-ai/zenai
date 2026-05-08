/**
 * InlineAssistant — portal-based popover that appears on text selection.
 * Shows action buttons, dispatches a quick-chat request, then renders the result.
 */

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTextSelection } from '@/hooks/useTextSelection';
import { InlineActionsBar, type InlineAction } from './InlineActions';
import { InlineResult } from './InlineResult';
import { showToast } from '../Toast';

interface InlineAssistantProps {
  context: string;
}

type Phase = 'actions' | 'loading' | 'result';

export function InlineAssistant({ context }: InlineAssistantProps) {
  const { text, rect, isVisible, dismiss } = useTextSelection();
  const [phase, setPhase] = useState<Phase>('actions');
  const [result, setResult] = useState('');

  // Reset to actions phase whenever a new selection appears
  useEffect(() => {
    if (isVisible) {
      setPhase('actions');
      setResult('');
    }
  }, [isVisible, text]);

  const handleAction = useCallback(
    async (action: InlineAction) => {
      if (!text) return;
      setPhase('loading');
      setResult('');

      try {
        const res = await fetch(`/api/${context}/chat/quick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: action.prompt(text) }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as { response?: string };
        setResult(data.response ?? '');
        setPhase('result');
      } catch {
        setPhase('actions');
        showToast('Inline-Assistent konnte die Anfrage nicht verarbeiten.', { type: 'error' });
      }
    },
    [text, context],
  );

  const handleCopy = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(result).then(() => {
      showToast('In Zwischenablage kopiert', 'success');
    }).catch(() => {
      showToast('Kopieren fehlgeschlagen', { type: 'error' });
    });
  }, [result]);

  if (!isVisible || !rect) return null;

  // Position: horizontally centred above the selection, clamped to viewport
  const POPOVER_WIDTH = 420;
  const OFFSET_Y = 8; // gap between selection top and popover bottom

  const top = rect.top + window.scrollY - OFFSET_Y;
  const centreX = rect.left + rect.width / 2 + window.scrollX;
  const left = Math.max(8, Math.min(centreX - POPOVER_WIDTH / 2, window.innerWidth - POPOVER_WIDTH - 8));

  const popover = (
    <div
      role="dialog"
      aria-label="Inline-Assistent"
      className={cn(
        'absolute [transform:translateY(-100%)] [z-index:9999] top-[var(--pt)] left-[var(--pl)] w-[var(--pw)]',
        'bg-[#0d1117]/95 backdrop-blur-xl border border-white/10',
        'rounded-xl shadow-2xl overflow-hidden',
        'animate-in fade-in-0 zoom-in-95 duration-150',
      )}
      style={{ '--pt': `${top}px`, '--pl': `${left}px`, '--pw': `${POPOVER_WIDTH}px` } as CSSProperties}
      // Prevent mousedown from collapsing selection before onClick fires
      onMouseDown={(e) => e.preventDefault()}
    >
      {phase === 'actions' && (
        <InlineActionsBar onSelect={handleAction} />
      )}

      {phase === 'loading' && (
        <div className="flex items-center gap-2 px-4 py-3 text-white/60 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <span>Wird verarbeitet…</span>
        </div>
      )}

      {phase === 'result' && (
        <InlineResult result={result} onCopy={handleCopy} onDismiss={dismiss} />
      )}
    </div>
  );

  return createPortal(popover, document.body);
}
