/**
 * ProactivePanel - Activity Feed for Proactive Engine Notifications
 *
 * Opens as a slide-in panel from a bell icon.
 * Shows proactive notifications + governance pending count.
 * Connects to SSE stream for real-time updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AIContext } from './ContextSwitcher';
import { getApiBaseUrl, getApiFetchHeaders } from '../utils/apiConfig';
import './ProactivePanel.css';

interface ProactiveEvent {
  id: string;
  event_type: string;
  event_source: string;
  payload: Record<string, unknown>;
  decision: string | null;
  decision_reason: string | null;
  created_at: string;
}

interface ProactivePanelProps {
  context: AIContext;
  isOpen: boolean;
  onClose: () => void;
}

const EVENT_ICONS: Record<string, string> = {
  'email.received': '\u2709',
  'task.overdue': '\u26A0',
  'task.created': '\u2713',
  'calendar.event_approaching': '\u23F0',
  'idea.created': '\uD83D\uDCA1',
  'memory.fact_learned': '\uD83E\uDDE0',
  'agent.completed': '\uD83E\uDD16',
  'agent.failed': '\u274C',
  'system.daily_digest': '\uD83D\uDCCA',
};

const DECISION_LABELS: Record<string, string> = {
  notify: 'Benachrichtigung',
  prepare_context: 'Kontext vorbereitet',
  take_action: 'Aktion ausgeführt',
  trigger_agent: 'Agent gestartet',
  ignored: 'Ignoriert',
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tag${days > 1 ? 'en' : ''}`;
}

export function ProactivePanel({ context, isOpen, onClose }: ProactivePanelProps) {
  const [events, setEvents] = useState<ProactiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `${getApiBaseUrl()}/api/${context}/proactive/events?limit=30`,
        { headers: getApiFetchHeaders('application/json') }
      );
      if (!res.ok) throw new Error('Fehler beim Laden');
      const data = await res.json();
      setEvents(data.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    if (isOpen) loadEvents();
  }, [isOpen, loadEvents]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="proactive-overlay">
      <div
        ref={panelRef}
        className="proactive-panel"
        role="dialog"
        aria-label="Proaktive Benachrichtigungen"
      >
        <div className="proactive-header">
          <h3>Aktivität</h3>
          <button
            className="proactive-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            &times;
          </button>
        </div>

        <div className="proactive-body">
          {loading && <div className="proactive-loading">Lade Ereignisse...</div>}
          {error && <div className="proactive-error">{error}</div>}
          {!loading && !error && events.length === 0 && (
            <div className="proactive-empty">
              <span className="proactive-empty-icon">&#128276;</span>
              <p>Keine Ereignisse</p>
              <span>Proaktive Benachrichtigungen erscheinen hier.</span>
            </div>
          )}
          {!loading && events.map((event) => (
            <div key={event.id} className="proactive-event">
              <span className="proactive-event-icon" aria-hidden="true">
                {EVENT_ICONS[event.event_type] || '\uD83D\uDD14'}
              </span>
              <div className="proactive-event-content">
                <div className="proactive-event-header">
                  <span className="proactive-event-type">
                    {event.event_type.replace(/\./g, ' ')}
                  </span>
                  {event.decision && (
                    <span className={`proactive-decision proactive-decision-${event.decision}`}>
                      {DECISION_LABELS[event.decision] || event.decision}
                    </span>
                  )}
                </div>
                {event.decision_reason && (
                  <p className="proactive-event-reason">{event.decision_reason}</p>
                )}
                <span className="proactive-event-time">
                  {formatRelativeTime(event.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Bell icon button for TopBar/AppLayout
export function ProactiveBellButton({
  onClick,
  count = 0,
}: {
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      className="proactive-bell-btn"
      onClick={onClick}
      aria-label={`Proaktive Benachrichtigungen${count > 0 ? ` (${count} neu)` : ''}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && <span className="proactive-bell-badge">{count > 99 ? '99+' : count}</span>}
    </button>
  );
}
