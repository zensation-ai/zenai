/**
 * SuggestionCard - Single smart suggestion card (Phase 69.1, enhanced Phase 6.1)
 *
 * Shows icon, title, description, action button, dismiss and snooze controls.
 * Supports a special "morning_briefing" variant with sunrise gradient.
 * Includes pulse-on-appear, dismiss slide-out, and snooze shrink animations.
 */

import { useState, useCallback, useRef } from 'react';
import type { SmartSuggestion, SnoozeDuration } from '../../hooks/useSmartSuggestions';
import { animations } from '../../design-system';
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
  morning_briefing:      { icon: '\u2600\uFE0F', actionLabel: 'Uebersicht', color: '#f59e0b' },
};

interface MorningBriefingMeta {
  tasksDueToday?: number;
  unreadEmails?: number;
  upcomingEvents?: number;
  greeting?: string;
}

interface SuggestionCardProps {
  suggestion: SmartSuggestion;
  onDismiss: (id: string) => void;
  onSnooze: (id: string, duration: SnoozeDuration) => void;
  onAccept: (id: string) => void;
}

export function SuggestionCard({ suggestion, onDismiss, onSnooze, onAccept }: SuggestionCardProps) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [exitAnimation, setExitAnimation] = useState<'dismiss' | 'snooze' | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const isBriefing = suggestion.type === 'morning_briefing';
  const config = TYPE_CONFIG[suggestion.type] || { icon: '\uD83D\uDCA1', actionLabel: 'Ansehen', color: '#6366f1' };

  const runExitAnimation = useCallback((type: 'dismiss' | 'snooze', cb: () => void) => {
    setExitAnimation(type);
    // Wait for the CSS animation to finish before calling the callback
    setTimeout(cb, animations.duration.layout);
  }, []);

  const handleDismiss = useCallback(() => {
    runExitAnimation('dismiss', () => onDismiss(suggestion.id));
  }, [onDismiss, suggestion.id, runExitAnimation]);

  const handleAccept = useCallback(() => {
    onAccept(suggestion.id);
  }, [onAccept, suggestion.id]);

  const handleSnooze = useCallback((duration: SnoozeDuration) => {
    setSnoozeOpen(false);
    runExitAnimation('snooze', () => onSnooze(suggestion.id, duration));
  }, [onSnooze, suggestion.id, runExitAnimation]);

  function getExitClass(): string {
    switch (exitAnimation) {
      case 'dismiss': return 'ds-suggestion-card--exit-dismiss';
      case 'snooze': return 'ds-suggestion-card--exit-snooze';
      default: return '';
    }
  }
  const exitClass = getExitClass();

  // Morning Briefing: special wide card
  if (isBriefing) {
    const meta = (suggestion.metadata || {}) as MorningBriefingMeta;
    return (
      <div
        ref={cardRef}
        className={`ds-suggestion-card ds-suggestion-card--briefing ds-suggestion-card--pulse ${exitClass}`}
      >
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

        <div className="ds-briefing-header">
          <span className="ds-briefing-icon" aria-hidden="true">{config.icon}</span>
          <h4 className="ds-briefing-greeting">
            {meta.greeting || 'Guten Morgen'}
          </h4>
        </div>

        {suggestion.description && (
          <p className="ds-briefing-overview">{suggestion.description}</p>
        )}

        <div className="ds-briefing-stats">
          {typeof meta.tasksDueToday === 'number' && (
            <div className="ds-briefing-stat">
              <span className="ds-briefing-stat-value">{meta.tasksDueToday}</span>
              <span className="ds-briefing-stat-label">Aufgaben heute</span>
            </div>
          )}
          {typeof meta.unreadEmails === 'number' && (
            <div className="ds-briefing-stat">
              <span className="ds-briefing-stat-value">{meta.unreadEmails}</span>
              <span className="ds-briefing-stat-label">Ungelesene E-Mails</span>
            </div>
          )}
          {typeof meta.upcomingEvents === 'number' && (
            <div className="ds-briefing-stat">
              <span className="ds-briefing-stat-value">{meta.upcomingEvents}</span>
              <span className="ds-briefing-stat-label">Termine</span>
            </div>
          )}
        </div>

        <div className="ds-briefing-actions">
          <button
            type="button"
            className="ds-suggestion-action-btn ds-briefing-action-btn"
            onClick={handleAccept}
          >
            {config.actionLabel}
          </button>
        </div>
      </div>
    );
  }

  // Default suggestion card
  return (
    <div
      ref={cardRef}
      className={`ds-suggestion-card ds-suggestion-card--pulse ${exitClass}`}
      style={{ '--suggestion-accent': config.color } as React.CSSProperties}
    >
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
