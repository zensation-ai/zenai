/**
 * SuggestionCard - Single smart suggestion card (Phase 69.1)
 *
 * Shows icon, title, description, action button, dismiss and snooze controls.
 */

import { useState, useCallback } from 'react';
import type { SmartSuggestion, SnoozeDuration } from '../../hooks/useSmartSuggestions';
import './SuggestionCard.css';

const TYPE_CONFIG: Record<string, { icon: string; actionLabel: string; color: string }> = {
  connection_discovered: { icon: '\uD83D\uDD17', actionLabel: 'Ansehen', color: '#7c3aed' },
  task_reminder:         { icon: '\u23F0', actionLabel: 'Oeffnen', color: '#f59e0b' },
  email_followup:        { icon: '\u2709\uFE0F', actionLabel: 'Antworten', color: '#3b82f6' },
  knowledge_insight:     { icon: '\uD83E\uDDE0', actionLabel: 'Details', color: '#8b5cf6' },
  context_switch:        { icon: '\uD83D\uDD00', actionLabel: 'Wechseln', color: '#06b6d4' },
  meeting_prep:          { icon: '\uD83D\uDCC5', actionLabel: 'Vorbereiten', color: '#10b981' },
  learning_opportunity:  { icon: '\uD83D\uDCDA', actionLabel: 'Lernen', color: '#f97316' },
  contradiction_alert:   { icon: '\u26A0\uFE0F', actionLabel: 'Pruefen', color: '#ef4444' },
};

interface SuggestionCardProps {
  suggestion: SmartSuggestion;
  onDismiss: (id: string) => void;
  onSnooze: (id: string, duration: SnoozeDuration) => void;
  onAccept: (id: string) => void;
}

export function SuggestionCard({ suggestion, onDismiss, onSnooze, onAccept }: SuggestionCardProps) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  const config = TYPE_CONFIG[suggestion.type] || { icon: '\uD83D\uDCA1', actionLabel: 'Ansehen', color: '#6366f1' };

  const handleDismiss = useCallback(() => {
    onDismiss(suggestion.id);
  }, [onDismiss, suggestion.id]);

  const handleAccept = useCallback(() => {
    onAccept(suggestion.id);
  }, [onAccept, suggestion.id]);

  const handleSnooze = useCallback((duration: SnoozeDuration) => {
    onSnooze(suggestion.id, duration);
    setSnoozeOpen(false);
  }, [onSnooze, suggestion.id]);

  return (
    <div className="ds-suggestion-card" style={{ '--suggestion-accent': config.color } as React.CSSProperties}>
      <button
        type="button"
        className="ds-suggestion-dismiss"
        onClick={handleDismiss}
        aria-label="Vorschlag verwerfen"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <div className="ds-suggestion-icon" aria-hidden="true">
        {config.icon}
      </div>

      <div className="ds-suggestion-body">
        <h4 className="ds-suggestion-title">{suggestion.title}</h4>
        {suggestion.description && (
          <p className="ds-suggestion-desc">{suggestion.description}</p>
        )}
      </div>

      <div className="ds-suggestion-actions">
        <button
          type="button"
          className="ds-suggestion-action-btn"
          onClick={handleAccept}
        >
          {config.actionLabel}
        </button>

        <div className="ds-suggestion-snooze-wrapper">
          <button
            type="button"
            className="ds-suggestion-snooze-btn"
            onClick={() => setSnoozeOpen(prev => !prev)}
            aria-label="Spaeter erinnern"
            aria-expanded={snoozeOpen}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
              <path d="M7 3.5V7l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>

          {snoozeOpen && (
            <div className="ds-suggestion-snooze-dropdown">
              <button type="button" onClick={() => handleSnooze('1h')}>1 Stunde</button>
              <button type="button" onClick={() => handleSnooze('4h')}>4 Stunden</button>
              <button type="button" onClick={() => handleSnooze('tomorrow')}>Morgen</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
