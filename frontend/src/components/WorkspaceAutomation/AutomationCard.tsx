/**
 * AutomationCard — Individual automation display card.
 */

import React, { useState } from 'react';
import type { AIContext } from '../ContextSwitcher';

export interface AutomationData {
  id: string;
  name: string;
  description: string | null;
  trigger_type: 'time' | 'event' | 'condition' | 'manual';
  trigger_config: Record<string, unknown>;
  conditions: Array<Record<string, unknown>>;
  actions: Array<Record<string, unknown>>;
  enabled: boolean;
  template_id: string | null;
  last_run_at: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

interface AutomationCardProps {
  automation: AutomationData;
  context: AIContext;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (automation: AutomationData) => void;
  onDelete: (id: string) => void;
  onExecute: (id: string) => void;
}

const TRIGGER_ICONS: Record<string, string> = {
  time: '\u{1F551}',    // clock
  event: '\u{1F4E8}',   // envelope
  condition: '\u{1F527}', // wrench
  manual: '\u{1F449}',  // pointer
};

const TRIGGER_LABELS: Record<string, string> = {
  time: 'Zeitgesteuert',
  event: 'Ereignis',
  condition: 'Bedingung',
  manual: 'Manuell',
};

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Nie';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const diffD = Math.floor(diffH / 24);
  return `vor ${diffD} Tag${diffD > 1 ? 'en' : ''}`;
}

export const AutomationCard: React.FC<AutomationCardProps> = ({
  automation,
  onToggle,
  onEdit,
  onDelete,
  onExecute,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const triggerIcon = TRIGGER_ICONS[automation.trigger_type] ?? '\u{2699}';
  const triggerLabel = TRIGGER_LABELS[automation.trigger_type] ?? automation.trigger_type;

  return (
    <div className={`wa-card ${automation.enabled ? '' : 'wa-card--disabled'}`}>
      <div className="wa-card__header">
        <div className="wa-card__icon">{triggerIcon}</div>
        <div className="wa-card__info">
          <h3 className="wa-card__name">{automation.name}</h3>
          {automation.description && (
            <p className="wa-card__desc">{automation.description}</p>
          )}
        </div>
        <label className="wa-card__toggle" title={automation.enabled ? 'Deaktivieren' : 'Aktivieren'}>
          <input
            type="checkbox"
            checked={automation.enabled}
            onChange={() => onToggle(automation.id, !automation.enabled)}
          />
          <span className="wa-card__toggle-slider" />
        </label>
      </div>

      <div className="wa-card__meta">
        <span className="wa-card__badge wa-card__badge--trigger">{triggerLabel}</span>
        {automation.template_id && (
          <span className="wa-card__badge wa-card__badge--template">Vorlage</span>
        )}
        <span className="wa-card__stat" title="Anzahl Ausführungen">
          {automation.run_count}x
        </span>
        <span className="wa-card__stat" title="Letzte Ausführung">
          {formatRelativeTime(automation.last_run_at)}
        </span>
      </div>

      <div className="wa-card__actions">
        <button
          className="wa-card__action-btn wa-card__action-btn--run"
          onClick={() => onExecute(automation.id)}
          title="Jetzt ausführen"
        >
          Ausführen
        </button>
        <button
          className="wa-card__action-btn"
          onClick={() => setIsExpanded(!isExpanded)}
          title="Details"
        >
          {isExpanded ? 'Weniger' : 'Details'}
        </button>
        <button
          className="wa-card__action-btn"
          onClick={() => onEdit(automation)}
          title="Bearbeiten"
        >
          Bearbeiten
        </button>
        <button
          className="wa-card__action-btn wa-card__action-btn--danger"
          onClick={() => onDelete(automation.id)}
          title="Löschen"
        >
          Löschen
        </button>
      </div>

      {isExpanded && (
        <div className="wa-card__details">
          <div className="wa-card__detail-section">
            <strong>Aktionen ({automation.actions.length}):</strong>
            <ul>
              {automation.actions.map((action, i) => (
                <li key={i}>
                  {String(action.type)} → {String(action.target)}
                </li>
              ))}
            </ul>
          </div>
          {automation.conditions.length > 0 && (
            <div className="wa-card__detail-section">
              <strong>Bedingungen ({automation.conditions.length}):</strong>
              <ul>
                {automation.conditions.map((cond, i) => (
                  <li key={i}>
                    {String(cond.field)} {String(cond.operator)} {String(cond.value)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AutomationCard;
