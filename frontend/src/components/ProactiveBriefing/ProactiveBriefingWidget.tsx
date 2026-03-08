/**
 * ProactiveBriefingWidget - Phase 6
 *
 * Dashboard widget showing:
 * - Morning briefing (meetings, tasks, emails, follow-ups)
 * - Smart schedule suggestions
 * - Meeting prep cards
 *
 * API endpoints:
 * - POST /api/proactive/briefing/morning
 * - GET /api/proactive/briefings?unread_only=true
 * - GET /api/proactive/schedule
 * - GET /api/proactive/follow-ups
 */

import { useState, useEffect, useCallback, memo } from 'react';
import axios from 'axios';
import type { Page } from '../../types';
import type { AIContext } from '../ContextSwitcher';
import { logError } from '../../utils/errors';
import './ProactiveBriefingWidget.css';

// ============================================
// Types
// ============================================

interface BriefingSectionItem {
  label: string;
  detail?: string;
  action_type?: string;
  action_id?: string;
  priority?: 'high' | 'medium' | 'low';
}

interface BriefingSection {
  type: 'meetings' | 'tasks' | 'emails' | 'follow_ups' | 'insights' | 'custom';
  title: string;
  items: BriefingSectionItem[];
  priority: 'high' | 'medium' | 'low';
}

interface BriefingContent {
  title: string;
  greeting?: string;
  sections: BriefingSection[];
  summary?: string;
}

interface Briefing {
  id: string;
  briefing_type: string;
  content: BriefingContent;
  generated_at: string;
  read_at: string | null;
}

interface SmartSchedule {
  meetings: Array<{ id: string; title: string; start: string; end: string }>;
  tasks: Array<{ id: string; title: string; priority: string; due_date: string | null }>;
  suggestions: string[];
}

interface FollowUp {
  contact_id: string;
  display_name: string;
  days_since: number | null;
  relationship_type: string | null;
}

// ============================================
// Sub-components
// ============================================

const SECTION_ICONS: Record<string, string> = {
  meetings: '\uD83D\uDCC5',
  tasks: '\u2705',
  emails: '\u2709\uFE0F',
  follow_ups: '\uD83D\uDC64',
  insights: '\uD83D\uDCA1',
  custom: '\u2139\uFE0F',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'var(--danger, #f85149)',
  medium: 'var(--warning, #d29922)',
  low: 'var(--text-secondary, #8b949e)',
};

const ACTION_PAGE_MAP: Record<string, Page> = {
  calendar_event: 'calendar',
  task: 'tasks',
  email: 'email',
  contact: 'contacts',
};

// ============================================
// Main Component
// ============================================

interface ProactiveBriefingWidgetProps {
  context: AIContext;
  onNavigate: (page: Page) => void;
}

const ProactiveBriefingWidgetComponent: React.FC<ProactiveBriefingWidgetProps> = ({ context, onNavigate }) => {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [schedule, setSchedule] = useState<SmartSchedule | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Fetch existing briefing or generate new one
  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    try {
      // Try to get existing unread briefing
      const res = await axios.get('/api/proactive/briefings', {
        params: { context, unread_only: 'true', type: 'morning', limit: 1 },
      });

      const briefings = res.data?.data ?? [];
      if (briefings.length > 0) {
        const b = briefings[0];
        // Parse content if it's a string
        if (typeof b.content === 'string') {
          b.content = JSON.parse(b.content);
        }
        setBriefing(b);
      }
    } catch (err) {
      logError('ProactiveBriefing:fetch', err);
    } finally {
      setLoading(false);
    }
  }, [context]);

  // Fetch smart schedule
  const fetchSchedule = useCallback(async () => {
    try {
      const res = await axios.get('/api/proactive/schedule', { params: { context } });
      if (res.data?.success) {
        setSchedule(res.data.data);
      }
    } catch {
      // Schedule is optional
    }
  }, [context]);

  // Fetch follow-up suggestions
  const fetchFollowUps = useCallback(async () => {
    try {
      const res = await axios.get('/api/proactive/follow-ups', { params: { context, days: 14 } });
      if (res.data?.success) {
        setFollowUps((res.data.data ?? []).slice(0, 3));
      }
    } catch {
      // Follow-ups are optional
    }
  }, [context]);

  // Generate new morning briefing
  const handleGenerateBriefing = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await axios.post('/api/proactive/briefing/morning', { context });
      if (res.data?.success) {
        const b = res.data.data;
        if (typeof b.content === 'string') {
          b.content = JSON.parse(b.content);
        }
        setBriefing(b);
      }
    } catch (err) {
      logError('ProactiveBriefing:generate', err);
    } finally {
      setGenerating(false);
    }
  }, [context]);

  // Dismiss briefing
  const handleDismiss = useCallback(async () => {
    if (!briefing) return;
    try {
      await axios.post(`/api/proactive/briefings/${briefing.id}/dismiss`, { context });
      setBriefing(null);
    } catch (err) {
      logError('ProactiveBriefing:dismiss', err);
    }
  }, [briefing, context]);

  useEffect(() => {
    fetchBriefing();
    fetchSchedule();
    fetchFollowUps();
  }, [fetchBriefing, fetchSchedule, fetchFollowUps]);

  // Don't render if nothing to show
  const hasContent = briefing || (schedule && (schedule.suggestions.length > 0 || schedule.meetings.length > 0)) || followUps.length > 0;
  if (loading) return null;
  if (!hasContent && !loading) {
    return (
      <section className="proactive-briefing-widget proactive-briefing-empty">
        <div className="proactive-briefing-header">
          <h3>Tagesbriefing</h3>
          <button
            type="button"
            className="proactive-generate-btn"
            onClick={handleGenerateBriefing}
            disabled={generating}
          >
            {generating ? 'Wird erstellt...' : 'Briefing erstellen'}
          </button>
        </div>
        <p className="proactive-briefing-hint">Erstelle ein Tagesbriefing fuer eine Uebersicht deiner Termine, Aufgaben und E-Mails.</p>
      </section>
    );
  }

  return (
    <section className="proactive-briefing-widget">
      {/* Header */}
      <div className="proactive-briefing-header">
        <button
          type="button"
          className="proactive-briefing-toggle"
          onClick={() => setCollapsed(c => !c)}
        >
          <span className="proactive-briefing-toggle-icon">{collapsed ? '\u25B6' : '\u25BC'}</span>
          <h3>{briefing?.content.greeting || 'Dein Tag auf einen Blick'}</h3>
        </button>
        <div className="proactive-briefing-actions">
          {!briefing && (
            <button
              type="button"
              className="proactive-generate-btn"
              onClick={handleGenerateBriefing}
              disabled={generating}
            >
              {generating ? 'Wird erstellt...' : 'Briefing erstellen'}
            </button>
          )}
          {briefing && (
            <button type="button" className="proactive-dismiss-btn" onClick={handleDismiss} title="Briefing schliessen">
              ✕
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="proactive-briefing-body">
          {/* Briefing Sections */}
          {briefing?.content.sections.map((section, i) => (
            <div key={i} className={`proactive-section proactive-section-${section.priority}`}>
              <h4 className="proactive-section-title">
                <span aria-hidden="true">{SECTION_ICONS[section.type] || '\u2139\uFE0F'}</span>
                {section.title}
                <span className="proactive-section-count">{section.items.length}</span>
              </h4>
              <ul className="proactive-section-items">
                {section.items.map((item, j) => (
                  <li key={j} className="proactive-section-item">
                    <button
                      type="button"
                      className="proactive-item-btn"
                      onClick={() => {
                        const page = item.action_type ? ACTION_PAGE_MAP[item.action_type] : undefined;
                        if (page) onNavigate(page);
                      }}
                      disabled={!item.action_type || !ACTION_PAGE_MAP[item.action_type]}
                    >
                      <span className="proactive-item-label">
                        {item.priority && (
                          <span className="proactive-item-dot" style={{ background: PRIORITY_COLORS[item.priority] }} />
                        )}
                        {item.label}
                      </span>
                      {item.detail && <span className="proactive-item-detail">{item.detail}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Smart Schedule Suggestions */}
          {schedule && schedule.suggestions.length > 0 && (
            <div className="proactive-section proactive-section-suggestions">
              <h4 className="proactive-section-title">
                <span aria-hidden="true">{'\uD83D\uDCA1'}</span>
                Vorschlaege
              </h4>
              <ul className="proactive-suggestion-list">
                {schedule.suggestions.map((s, i) => (
                  <li key={i} className="proactive-suggestion">{s}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Follow-up Reminders */}
          {followUps.length > 0 && !briefing?.content.sections.some(s => s.type === 'follow_ups') && (
            <div className="proactive-section proactive-section-follow-ups">
              <h4 className="proactive-section-title">
                <span aria-hidden="true">{'\uD83D\uDC64'}</span>
                Follow-ups
              </h4>
              <ul className="proactive-section-items">
                {followUps.map((f) => (
                  <li key={f.contact_id} className="proactive-section-item">
                    <button
                      type="button"
                      className="proactive-item-btn"
                      onClick={() => onNavigate('contacts')}
                    >
                      <span className="proactive-item-label">{f.display_name}</span>
                      <span className="proactive-item-detail">
                        {f.days_since ? `Seit ${f.days_since} Tagen kein Kontakt` : 'Noch kein Kontakt'}
                        {f.relationship_type ? ` \u2022 ${f.relationship_type}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Summary */}
          {briefing?.content.summary && (
            <p className="proactive-briefing-summary">{briefing.content.summary}</p>
          )}
        </div>
      )}
    </section>
  );
};

export const ProactiveBriefingWidget = memo(ProactiveBriefingWidgetComponent);
