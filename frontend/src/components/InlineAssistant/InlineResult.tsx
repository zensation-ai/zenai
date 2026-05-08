/**
 * InlineResult — displays the streaming AI result in the InlineAssistant popover.
 * Shows the result text with copy and close actions.
 */

import { Copy, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InlineResultProps {
  result: string;
  onCopy: () => void;
  onDismiss: () => void;
}

export function InlineResult({ result, onCopy, onDismiss }: InlineResultProps) {
  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-sm text-white/90 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
        {result}
      </p>
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/10">
        <button
          onClick={onCopy}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
            'text-white/70 hover:text-white hover:bg-white/10 transition-colors',
          )}
        >
          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
          Kopieren
        </button>
        <button
          onClick={onDismiss}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
            'text-white/50 hover:text-white hover:bg-white/10 transition-colors',
          )}
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
          Schließen
        </button>
      </div>
    </div>
  );
}
