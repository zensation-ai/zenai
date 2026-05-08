/**
 * ChatQuickActions - Kontextabhaengige Schnellaktionen im Chat
 *
 * Zeigt 6-8 Quick-Action-Chips oberhalb des Chat-Eingabefelds.
 * Klick fuellt den Chat-Input mit einem Prompt-Prefix vor.
 *
 * UX-Prinzipien:
 * - Horizontal scrollbar, kein Umbruch (chip-artig)
 * - Kontextabhängig: Actions ändern sich je nach aktivem Kontext
 * - Klappbar via Toggle (minimiert kognitive Last)
 * - Sichtbar bei leerem Chat, ausgeblendet bei aktivem Gespraech
 * - Dezente Erscheinung, nicht konkurrierend mit Chat-Inhalt
 */

import { useState, memo, useCallback } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { cn } from '@/lib/utils';

interface QuickAction {
  icon: string;
  label: string;
  prompt: string;
}

interface ChatQuickActionsProps {
  context: AIContext;
  onAction: (prompt: string) => void;
  /** Hide when conversation is active */
  hasMessages: boolean;
}

/** Context-specific quick actions - curated for most common use cases */
const CONTEXT_ACTIONS: Record<AIContext, QuickAction[]> = {
  operations: [
    { icon: '\u{1F4A1}', label: 'Neue Idee', prompt: 'Neue Idee: ' },
    { icon: '\u{1F50D}', label: 'Suche', prompt: 'Suche nach meinen Gedanken zu ' },
    { icon: '\u{2705}', label: 'Aufgabe', prompt: 'Erstelle eine Aufgabe: ' },
    { icon: '\u{1F4DD}', label: 'Notiz', prompt: 'Notiere dir: ' },
    { icon: '\u{1F4C5}', label: 'Termin', prompt: 'Erstelle einen Termin: ' },
    { icon: '\u{1F9E0}', label: 'Zusammenfassung', prompt: 'Fasse meine letzten Gedanken zusammen' },
  ],
  finance: [
    { icon: '\u{1F4A1}', label: 'Neue Idee', prompt: 'Neue Idee: ' },
    { icon: '\u{2705}', label: 'Aufgabe', prompt: 'Erstelle eine Aufgabe: ' },
    { icon: '\u{1F4C8}', label: 'Business', prompt: 'Zeige mir meine Business-Metriken' },
    { icon: '\u{1F4C5}', label: 'Meeting', prompt: 'Erstelle ein Meeting: ' },
    { icon: '\u{1F50D}', label: 'Recherche', prompt: 'Recherchiere f\u00FCr mich: ' },
    { icon: '\u{1F4DD}', label: 'Entwurf', prompt: 'Erstelle einen Entwurf f\u00FCr: ' },
  ],
  people: [
    { icon: '\u{1F4DA}', label: 'Lernziel', prompt: 'Neues Lernziel: ' },
    { icon: '\u{2753}', label: 'Erkl\u00E4rung', prompt: 'Erkl\u00E4re mir einfach: ' },
    { icon: '\u{1F50D}', label: 'Recherche', prompt: 'Recherchiere: ' },
    { icon: '\u{1F9E9}', label: 'Quiz', prompt: 'Erstelle ein Quiz zu: ' },
    { icon: '\u{1F4DD}', label: 'Zusammenfassung', prompt: 'Fasse zusammen: ' },
    { icon: '\u{1F4A1}', label: 'Neue Idee', prompt: 'Neue Idee: ' },
  ],
  strategy: [
    { icon: '\u{1F4A1}', label: 'Neue Idee', prompt: 'Neue kreative Idee: ' },
    { icon: '\u{2728}', label: 'Brainstorm', prompt: 'Brainstorme mit mir \u00FCber: ' },
    { icon: '\u{1F3A8}', label: 'Konzept', prompt: 'Entwickle ein Konzept f\u00FCr: ' },
    { icon: '\u{1F4DD}', label: 'Geschichte', prompt: 'Schreibe eine Geschichte \u00FCber: ' },
    { icon: '\u{1F517}', label: 'Verbindungen', prompt: 'Finde Verbindungen zwischen meinen Ideen zu: ' },
    { icon: '\u{1F50D}', label: 'Inspiration', prompt: 'Inspiriere mich zum Thema: ' },
  ],
};

function ChatQuickActionsComponent({ context, onAction, hasMessages }: ChatQuickActionsProps) {
  const [collapsed, setCollapsed] = useState(false);

  const toggleCollapsed = useCallback(() => setCollapsed(prev => !prev), []);

  // Auto-hide when conversation is active and user collapsed it
  if (hasMessages && collapsed) return null;

  const actions = CONTEXT_ACTIONS[context];

  return (
    <div
      className={cn(
        'shrink-0 animate-[slideIn_0.3s_ease] motion-reduce:animate-none'
      )}
    >
      <div className="flex items-center justify-between px-4 pt-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Schnellaktionen</span>
        <button
          type="button"
          className={cn(
            'bg-transparent border-none cursor-pointer p-1 text-text-muted rounded-sm',
            'transition-all duration-150 flex items-center justify-center size-5',
            'hover:bg-surface-hover hover:text-text',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          )}
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Schnellaktionen anzeigen' : 'Schnellaktionen ausblenden'}
          aria-expanded={!collapsed}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            {collapsed
              ? <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              : <path d="M2 6.5L5 3.5L8 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            }
          </svg>
        </button>
      </div>
      {!collapsed && (
        <div
          className="flex gap-1.5 px-4 py-2 pb-2.5 overflow-x-auto scrollbar-none"
          role="toolbar"
          aria-label="Schnellaktionen"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={cn(
                'flex items-center gap-1.5 py-1.5 px-3 border border-glass-border rounded-lg',
                'text-[13px] text-text-secondary cursor-pointer whitespace-nowrap shrink-0 font-[inherit]',
                'transition-all duration-150',
                'hover:bg-surface-hover hover:text-text hover:border-glass-border',
                'active:scale-[0.97] active:duration-75',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                'motion-reduce:transition-none'
              )}
              onClick={() => onAction(action.prompt)}
              title={action.prompt}
            >
              <span className="text-sm leading-none" aria-hidden="true">{action.icon}</span>
              <span className="leading-none">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const ChatQuickActions = memo(ChatQuickActionsComponent);
