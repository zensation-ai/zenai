/**
 * ChatContextBar - Explizite Kontext-Auswahl im Chat
 *
 * 4 Kacheln (Privat, Arbeit, Lernen, Kreativ) die immer sichtbar sind.
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

interface ChatContextBarProps {
  context: AIContext;
  onContextChange: (context: AIContext) => void;
  /** Compact mode for FloatingAssistant (icons only) */
  compact?: boolean;
}

const CONTEXTS: Array<{ id: AIContext; icon: string; label: string; color: string; activeColor: string }> = [
  {
    id: 'personal',
    icon: '\u{1F3E0}',
    label: 'Privat',
    color: 'var(--context-personal-primary, #10b981)',
    activeColor: 'var(--context-personal-bg, rgba(16, 185, 129, 0.12))',
  },
  {
    id: 'work',
    icon: '\u{1F4BC}',
    label: 'Arbeit',
    color: 'var(--context-work-primary, #3b82f6)',
    activeColor: 'var(--context-work-bg, rgba(59, 130, 246, 0.12))',
  },
  {
    id: 'learning',
    icon: '\u{1F4DA}',
    label: 'Lernen',
    color: 'var(--context-learning-primary, #f59e0b)',
    activeColor: 'var(--context-learning-bg, rgba(245, 158, 11, 0.12))',
  },
  {
    id: 'creative',
    icon: '\u{1F3A8}',
    label: 'Kreativ',
    color: 'var(--context-creative-primary, #8b5cf6)',
    activeColor: 'var(--context-creative-bg, rgba(139, 92, 246, 0.12))',
  },
];

function ChatContextBarComponent({ context, onContextChange, compact = false }: ChatContextBarProps) {
  return (
    <div
      className={`chat-context-bar ${compact ? 'chat-context-bar--compact' : ''}`}
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
            className={`chat-context-tile ${isActive ? 'chat-context-tile--active' : ''}`}
            style={{
              '--tile-color': ctx.color,
              '--tile-bg': ctx.activeColor,
            } as React.CSSProperties}
            onClick={() => onContextChange(ctx.id)}
          >
            <span className="chat-context-tile-icon" aria-hidden="true">{ctx.icon}</span>
            {!compact && <span className="chat-context-tile-label">{ctx.label}</span>}
            {isActive && <span className="chat-context-tile-indicator" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

export const ChatContextBar = memo(ChatContextBarComponent);
