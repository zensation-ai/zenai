/**
 * ChatContextBar - Explizite Kontext-Auswahl im Chat
 *
 * 4 Kacheln (Operativ, Finanzen, Team, Strategie) die immer sichtbar sind.
 * Der aktive Kontext ist visuell hervorgehoben.
 * Ein Klick wechselt sofort den Kontext - keine Ambiguitaet.
 *
 * UX-Prinzipien:
 * - Sichtbar aber nicht aufdringlich (schmale Leiste, dezente Farben)
 * - Sofortiges visuelles Feedback beim Wechsel
 * - Touch-optimierte Kacheln (min 44px Hoehe)
 * - Kontext-Farben konsistent mit dem Rest der App
 * - Reduzierte Motion fuer a11y
 */

import { memo } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { cn } from '@/lib/utils';

interface ChatContextBarProps {
  context: AIContext;
  onContextChange: (context: AIContext) => void;
  /** Compact mode for FloatingAssistant (icons only) */
  compact?: boolean;
}

const CONTEXTS: Array<{ id: AIContext; icon: string; label: string; color: string; activeColor: string }> = [
  {
    id: 'operations',
    icon: '\u{2699}\u{FE0F}',
    label: 'Operativ',
    color: 'var(--context-operations-primary, #10b981)',
    activeColor: 'var(--context-operations-bg, rgba(16, 185, 129, 0.12))',
  },
  {
    id: 'finance',
    icon: '\u{1F4B0}',
    label: 'Finanzen',
    color: 'var(--context-finance-primary, #3b82f6)',
    activeColor: 'var(--context-finance-bg, rgba(59, 130, 246, 0.12))',
  },
  {
    id: 'people',
    icon: '\u{1F465}',
    label: 'Team',
    color: 'var(--context-people-primary, #f59e0b)',
    activeColor: 'var(--context-people-bg, rgba(245, 158, 11, 0.12))',
  },
  {
    id: 'strategy',
    icon: '\u{1F3AF}',
    label: 'Strategie',
    color: 'var(--context-strategy-primary, #1a6b7a)',
    activeColor: 'var(--context-strategy-bg, rgba(139, 92, 246, 0.12))',
  },
];

function ChatContextBarComponent({ context, onContextChange, compact = false }: ChatContextBarProps) {
  return (
    <div
      className={cn(
        'flex gap-1.5 px-4 py-2.5 shrink-0 border-b border-glass-border bg-surface/40',
        compact && 'gap-1 px-2.5 py-1.5 justify-center'
      )}
      role="radiogroup"
      aria-label="Kontext ausw\u00E4hlen"
    >
      {CONTEXTS.map((ctx) => {
        const isActive = context === ctx.id;
        return (
          <button
            key={ctx.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`${ctx.label}-Kontext${isActive ? ' (aktiv)' : ''}`}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-1.5 border-[1.5px] border-glass-border rounded-[10px]',
              'bg-transparent text-text-secondary text-[0.82rem] font-medium cursor-pointer',
              'transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
              'relative whitespace-nowrap flex-1 justify-center min-h-[38px] font-[inherit]',
              'hover:not-[.active]:border-[var(--tile-color)] hover:not-[.active]:bg-[color-mix(in_srgb,var(--tile-color)_6%,transparent)]',
              'active:scale-[0.97] active:duration-75',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tile-color,var(--primary))]',
              isActive && 'bg-[var(--tile-bg)] border-[var(--tile-color)] text-[var(--tile-color)] font-semibold shadow-sm',
              compact && 'px-2 py-1.5 min-h-[32px] flex-none rounded-sm',
              'motion-reduce:transition-none motion-reduce:animate-none'
            )}
            style={{
              '--tile-color': ctx.color,
              '--tile-bg': ctx.activeColor,
            } as React.CSSProperties}
            onClick={() => onContextChange(ctx.id)}
          >
            <span className={cn('text-base leading-none shrink-0', compact && 'text-[0.9rem]')} aria-hidden="true">{ctx.icon}</span>
            {!compact && <span className="text-[0.8rem] leading-none">{ctx.label}</span>}
            {isActive && (
              <span
                className={cn(
                  'absolute -bottom-px left-1/2 -translate-x-1/2 w-4 h-[3px] rounded-t-sm bg-[var(--tile-color)]',
                  'animate-[tileIndicatorIn_0.2s_ease] motion-reduce:animate-none',
                  compact && 'w-2.5 h-0.5'
                )}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export const ChatContextBar = memo(ChatContextBarComponent);
