/**
 * ChatQuickActions - Kontextabhaengige Schnellaktionen im Chat
 *
 * Zeigt 6-8 Quick-Action-Chips oberhalb des Chat-Eingabefelds.
 * Klick fuellt den Chat-Input mit einem Prompt-Prefix vor.
 *
 * UX-Prinzipien:
 * - Horizontal scrollbar, kein Umbruch (chip-artig)
 * - Kontextabhaengig: Actions aendern sich je nach aktivem Kontext
 * - Klappbar via Toggle (minimiert kognitive Last)
 * - Sichtbar bei leerem Chat, ausgeblendet bei aktivem Gespraech
 * - Dezente Erscheinung, nicht konkurrierend mit Chat-Inhalt
 */

import { useState, memo, useCallback } from 'react';
import type { AIContext } from '../ContextSwitcher';

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
  personal: [
    { icon: '\u{1F4A1}', label: 'Neue Idee', prompt: 'Neue Idee: ' },
    { icon: '\u{1F50D}', label: 'Suche', prompt: 'Suche nach meinen Gedanken zu ' },
    { icon: '\u{2705}', label: 'Aufgabe', prompt: 'Erstelle eine Aufgabe: ' },
    { icon: '\u{1F4DD}', label: 'Notiz', prompt: 'Notiere dir: ' },
    { icon: '\u{1F4C5}', label: 'Termin', prompt: 'Erstelle einen Termin: ' },
    { icon: '\u{1F9E0}', label: 'Zusammenfassung', prompt: 'Fasse meine letzten Gedanken zusammen' },
  ],
  work: [
    { icon: '\u{1F4A1}', label: 'Neue Idee', prompt: 'Neue Idee: ' },
    { icon: '\u{2705}', label: 'Aufgabe', prompt: 'Erstelle eine Aufgabe: ' },
    { icon: '\u{1F4C8}', label: 'Business', prompt: 'Zeige mir meine Business-Metriken' },
    { icon: '\u{1F4C5}', label: 'Meeting', prompt: 'Erstelle ein Meeting: ' },
    { icon: '\u{1F50D}', label: 'Recherche', prompt: 'Recherchiere f\u00FCr mich: ' },
    { icon: '\u{1F4DD}', label: 'Entwurf', prompt: 'Erstelle einen Entwurf f\u00FCr: ' },
  ],
  learning: [
    { icon: '\u{1F4DA}', label: 'Lernziel', prompt: 'Neues Lernziel: ' },
    { icon: '\u{2753}', label: 'Erkl\u00E4rung', prompt: 'Erkl\u00E4re mir einfach: ' },
    { icon: '\u{1F50D}', label: 'Recherche', prompt: 'Recherchiere: ' },
    { icon: '\u{1F9E9}', label: 'Quiz', prompt: 'Erstelle ein Quiz zu: ' },
    { icon: '\u{1F4DD}', label: 'Zusammenfassung', prompt: 'Fasse zusammen: ' },
    { icon: '\u{1F4A1}', label: 'Neue Idee', prompt: 'Neue Idee: ' },
  ],
  creative: [
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
    <div className={`chat-quick-actions ${collapsed ? 'chat-quick-actions--collapsed' : ''}`}>
      <div className="chat-quick-actions-header">
        <span className="chat-quick-actions-title">Schnellaktionen</span>
        <button
          type="button"
          className="chat-quick-actions-toggle"
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
        <div className="chat-quick-actions-chips" role="toolbar" aria-label="Schnellaktionen">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="chat-quick-action-chip"
              onClick={() => onAction(action.prompt)}
              title={action.prompt}
            >
              <span className="chat-quick-action-chip-icon" aria-hidden="true">{action.icon}</span>
              <span className="chat-quick-action-chip-label">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const ChatQuickActions = memo(ChatQuickActionsComponent);
