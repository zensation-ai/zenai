/**
 * Phase 8: Unified Inbox Component
 *
 * Shows all actionable items across ZenAI in one view:
 * - Unread emails, due tasks, upcoming meetings
 * - Follow-up reminders, budget alerts, AI briefings
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { AIContext } from '../ContextSwitcher';
import { logError } from '../../utils/errors';
import './UnifiedInbox.css';

// ===========================================
// Types
// ===========================================

type InboxItemType =
  | 'email'
  | 'task_due'
  | 'meeting_soon'
  | 'follow_up'
  | 'budget_alert'
  | 'proactive_suggestion'
  | 'briefing';

type InboxPriority = 'high' | 'medium' | 'low';

interface InboxItem {
  id: string;
  type: InboxItemType;
  title: string;
  subtitle: string;
  priority: InboxPriority;
  timestamp: string;
  source_id: string;
  metadata: Record<string, unknown>;
  is_actionable: boolean;
  action_label?: string;
  action_page?: string;
}

interface UnifiedInboxResult {
  items: InboxItem[];
  counts: Record<string, number>;
  total: number;
  generated_at: string;
}

interface UnifiedInboxProps {
  context: AIContext;
  onNavigate?: (page: string) => void;
}

// ===========================================
// Constants
// ===========================================

const TYPE_CONFIG: Record<InboxItemType, { icon: string; label: string; color: string }> = {
  email: { icon: '✉️', label: 'E-Mail', color: '#3b82f6' },
  task_due: { icon: '✅', label: 'Aufgabe', color: '#f59e0b' },
  meeting_soon: { icon: '📅', label: 'Termin', color: '#8b5cf6' },
  follow_up: { icon: '👤', label: 'Follow-up', color: '#06b6d4' },
  budget_alert: { icon: '💰', label: 'Budget', color: '#ef4444' },
  proactive_suggestion: { icon: '✨', label: 'KI-Vorschlag', color: '#10b981' },
  briefing: { icon: '☀️', label: 'Briefing', color: '#f97316' },
};

const PRIORITY_CONFIG: Record<InboxPriority, { label: string; className: string }> = {
  high: { label: 'Hoch', className: 'inbox-priority-high' },
  medium: { label: 'Mittel', className: 'inbox-priority-medium' },
  low: { label: 'Niedrig', className: 'inbox-priority-low' },
};

const FILTER_OPTIONS: { value: InboxItemType | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: 'Alle', icon: '📥' },
  { value: 'email', label: 'E-Mails', icon: '✉️' },
  { value: 'task_due', label: 'Aufgaben', icon: '✅' },
  { value: 'meeting_soon', label: 'Termine', icon: '📅' },
  { value: 'follow_up', label: 'Follow-ups', icon: '👤' },
  { value: 'budget_alert', label: 'Budget', icon: '💰' },
  { value: 'briefing', label: 'Briefings', icon: '☀️' },
];

// ===========================================
// Component
// ===========================================

export function UnifiedInbox({ context, onNavigate }: UnifiedInboxProps) {
  const [data, setData] = useState<UnifiedInboxResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<InboxItemType | 'all'>('all');

  const loadInbox = useCallback(async () => {
    setLoading(true);
    try {
      const params = activeFilter !== 'all' ? { types: activeFilter } : {};
      const res = await axios.get(`/api/${context}/inbox`, { params });
      setData(res.data.data);
      setError(null);
    } catch (err) {
      logError('UnifiedInbox:load', err instanceof Error ? err : new Error(String(err)));
      setError('Inbox konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [context, activeFilter]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.round(diffMs / 60000);
    const diffHrs = Math.round(diffMs / 3600000);

    if (diffMin < 0) {
      // Future (meetings)
      const absMin = Math.abs(diffMin);
      if (absMin < 60) return `in ${absMin} Min`;
      return `in ${Math.round(absMin / 60)} Std`;
    }
    if (diffMin < 1) return 'Gerade eben';
    if (diffMin < 60) return `vor ${diffMin} Min`;
    if (diffHrs < 24) return `vor ${diffHrs} Std`;
    return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  };

  const handleAction = (item: InboxItem) => {
    if (item.action_page && onNavigate) {
      onNavigate(item.action_page);
    }
  };

  const filteredItems = data?.items ?? [];
  const totalCounts = data?.counts ?? {};

  return (
    <div className="unified-inbox">
      <div className="inbox-header">
        <div className="inbox-header-left">
          <h3>Unified Inbox</h3>
          {data && <span className="inbox-total-badge">{data.total}</span>}
        </div>
        <button
          type="button"
          className="inbox-refresh-btn"
          onClick={loadInbox}
          disabled={loading}
          aria-label="Inbox aktualisieren"
        >
          {loading ? '...' : '↻'}
        </button>
      </div>

      <div className="inbox-filters">
        {FILTER_OPTIONS.map(f => (
          <button
            key={f.value}
            type="button"
            className={`inbox-filter-chip ${activeFilter === f.value ? 'active' : ''}`}
            onClick={() => setActiveFilter(f.value)}
          >
            <span className="inbox-filter-icon">{f.icon}</span>
            {f.label}
            {f.value !== 'all' && totalCounts[f.value] ? (
              <span className="inbox-filter-count">{totalCounts[f.value]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {error && (
        <div className="inbox-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={loadInbox}>Erneut versuchen</button>
        </div>
      )}

      {loading && !data && (
        <div className="inbox-loading">
          <div className="neuro-loading-spinner" />
          <p>Lade Inbox...</p>
        </div>
      )}

      {!loading && filteredItems.length === 0 && (
        <div className="inbox-empty">
          <span className="inbox-empty-icon">✨</span>
          <p>Alles erledigt! Keine offenen Punkte.</p>
        </div>
      )}

      <div className="inbox-items">
        {filteredItems.map(item => {
          const typeInfo = TYPE_CONFIG[item.type];
          const priInfo = PRIORITY_CONFIG[item.priority];
          return (
            <div
              key={item.id}
              className={`inbox-item ${priInfo.className}`}
              onClick={() => handleAction(item)}
              role={item.is_actionable ? 'button' : undefined}
              tabIndex={item.is_actionable ? 0 : undefined}
              onKeyDown={e => {
                if (e.key === 'Enter' && item.is_actionable) handleAction(item);
              }}
            >
              <div className="inbox-item-icon" style={{ color: typeInfo.color }}>
                {typeInfo.icon}
              </div>
              <div className="inbox-item-content">
                <div className="inbox-item-title">{item.title}</div>
                <div className="inbox-item-subtitle">{item.subtitle}</div>
              </div>
              <div className="inbox-item-meta">
                <span className="inbox-item-time">{formatTimestamp(item.timestamp)}</span>
                <span className={`inbox-item-type-badge`} style={{ backgroundColor: `${typeInfo.color}20`, color: typeInfo.color }}>
                  {typeInfo.label}
                </span>
              </div>
              {item.is_actionable && item.action_label && (
                <div className="inbox-item-action">
                  <span className="inbox-action-arrow">→</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
