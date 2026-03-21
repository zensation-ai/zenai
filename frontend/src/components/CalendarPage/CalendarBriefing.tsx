/**
 * CalendarBriefing - Phase 40
 *
 * AI-powered daily briefing panel with summary, tips,
 * free slots, conflict warnings, and focus recommendation.
 */

import { useEffect, useState } from 'react';
import type { DailyBriefing, ConflictInfo } from './useCalendarAI';
import './CalendarBriefing.css';

interface Props {
  briefing: DailyBriefing | null;
  briefingLoading: boolean;
  conflicts: ConflictInfo[];
  conflictsLoading: boolean;
  onFetchBriefing: (date?: string) => void;
  onFetchConflicts: (start?: string, end?: string) => void;
  onClose: () => void;
  currentDate: Date;
}

export function CalendarBriefing({
  briefing,
  briefingLoading,
  conflicts,
  onFetchBriefing,
  onFetchConflicts,
  onClose,
  currentDate,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const dateStr = currentDate.toISOString().split('T')[0];
    onFetchBriefing(dateStr);

    const weekEnd = new Date(currentDate);
    weekEnd.setDate(weekEnd.getDate() + 7);
    onFetchConflicts(currentDate.toISOString(), weekEnd.toISOString());
  // Intentionally use date string as dep — only re-fetch when calendar day changes, not on prop identity
  }, [currentDate.toISOString().split('T')[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const errorConflicts = conflicts.filter(c => c.severity === 'error');
  const warningConflicts = conflicts.filter(c => c.severity === 'warning');
  const hasConflicts = errorConflicts.length > 0 || warningConflicts.length > 0;

  const dateLabel = currentDate.toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const handleRefresh = () => {
    const dateStr = currentDate.toISOString().split('T')[0];
    onFetchBriefing(dateStr);
    const weekEnd = new Date(currentDate);
    weekEnd.setDate(weekEnd.getDate() + 7);
    onFetchConflicts(currentDate.toISOString(), weekEnd.toISOString());
  };

  return (
    <div className={`cal-briefing ${collapsed ? 'cal-briefing--collapsed' : ''}`}>
      {/* Header Bar */}
      <div className="cal-briefing__bar">
        <button className="cal-briefing__toggle" onClick={() => setCollapsed(prev => !prev)}>
          <span className="cal-briefing__toggle-icon">{collapsed ? '▸' : '▾'}</span>
          <span className="cal-briefing__badge">✨ KI-Briefing</span>
          <span className="cal-briefing__date-label">{dateLabel}</span>
          {briefing && !collapsed && (
            <span className="cal-briefing__quick-stats">
              {briefing.event_count} Termine · {briefing.busy_hours}h
            </span>
          )}
        </button>
        <div className="cal-briefing__bar-actions">
          {hasConflicts && (
            <span className="cal-briefing__conflict-badge" title={`${errorConflicts.length} Konflikte, ${warningConflicts.length} Hinweise`}>
              {errorConflicts.length > 0 ? '⚠' : 'ℹ'} {errorConflicts.length + warningConflicts.length}
            </span>
          )}
          <button className="cal-briefing__bar-btn" onClick={handleRefresh} title="Aktualisieren" disabled={briefingLoading}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className={briefingLoading ? 'cal-briefing__spinning' : ''}>
              <path d="M1.75 7C1.75 4.1 4.1 1.75 7 1.75c1.7 0 3.2.82 4.15 2.08M12.25 7c0 2.9-2.35 5.25-5.25 5.25-1.7 0-3.2-.82-4.15-2.08" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M10.5 1.75v2.33h-2.33M3.5 12.25V9.92h2.33" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="cal-briefing__bar-btn" onClick={onClose} title="Schließen">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Collapsed = only show header */}
      {collapsed && null}

      {/* Expanded Content */}
      {!collapsed && (
        <div className="cal-briefing__expanded">
          {/* Conflicts Banner */}
          {errorConflicts.length > 0 && (
            <div className="cal-briefing__conflicts cal-briefing__conflicts--error">
              <div className="cal-briefing__conflicts-icon">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1L1 12h12L7 1z" fill="currentColor"/>
                  <path d="M7 5.5v3M7 10v.01" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="cal-briefing__conflicts-body">
                <strong>{errorConflicts.length} Konflikt{errorConflicts.length > 1 ? 'e' : ''}</strong>
                {errorConflicts.slice(0, 3).map((c, i) => (
                  <div key={i} className="cal-briefing__conflict-item">
                    {c.message}
                    {c.suggestion && <span className="cal-briefing__suggestion"> — {c.suggestion}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {warningConflicts.length > 0 && (
            <div className="cal-briefing__conflicts cal-briefing__conflicts--warning">
              <div className="cal-briefing__conflicts-icon">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" fill="currentColor"/>
                  <path d="M7 4.5v3M7 9.5v.01" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="cal-briefing__conflicts-body">
                <strong>{warningConflicts.length} Hinweis{warningConflicts.length > 1 ? 'e' : ''}</strong>
                {warningConflicts.slice(0, 2).map((c, i) => (
                  <div key={i} className="cal-briefing__conflict-item">{c.message}</div>
                ))}
                {warningConflicts.length > 2 && (
                  <div className="cal-briefing__conflict-more">
                    +{warningConflicts.length - 2} weitere
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Briefing Content */}
          {briefingLoading ? (
            <div className="cal-briefing__loading">
              <div className="cal-briefing__loading-dots">
                <span /><span /><span />
              </div>
              <span>KI-Briefing wird erstellt...</span>
            </div>
          ) : briefing ? (
            <div className="cal-briefing__content">
              {/* Summary */}
              <p className="cal-briefing__summary">{briefing.summary}</p>

              {/* Metrics Row */}
              <div className="cal-briefing__metrics">
                <div className="cal-briefing__metric">
                  <span className="cal-briefing__metric-value">{briefing.event_count}</span>
                  <span className="cal-briefing__metric-label">Termine</span>
                </div>
                <div className="cal-briefing__metric">
                  <span className="cal-briefing__metric-value">{briefing.busy_hours}h</span>
                  <span className="cal-briefing__metric-label">Gebucht</span>
                </div>
                <div className="cal-briefing__metric">
                  <span className="cal-briefing__metric-value">{briefing.free_slots.length}</span>
                  <span className="cal-briefing__metric-label">Freie Slots</span>
                </div>
              </div>

              {/* Free Slots */}
              {briefing.free_slots.length > 0 && (
                <div className="cal-briefing__section">
                  <div className="cal-briefing__section-label">Freie Zeiten</div>
                  <div className="cal-briefing__slots">
                    {briefing.free_slots.slice(0, 4).map((slot, i) => (
                      <div key={i} className="cal-briefing__slot">
                        <span className="cal-briefing__slot-time">
                          {new Date(slot.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                          {' - '}
                          {new Date(slot.end).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="cal-briefing__slot-duration">{slot.duration_minutes} Min.</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tips */}
              {briefing.tips.length > 0 && (
                <div className="cal-briefing__section">
                  <div className="cal-briefing__section-label">Tipps</div>
                  <div className="cal-briefing__tips">
                    {briefing.tips.slice(0, 3).map((tip, i) => (
                      <div key={i} className="cal-briefing__tip">
                        <span className="cal-briefing__tip-bullet">→</span>
                        {tip}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Focus Recommendation */}
              {briefing.focus_recommendation && (
                <div className="cal-briefing__focus">
                  <span className="cal-briefing__focus-icon">🎯</span>
                  {briefing.focus_recommendation}
                </div>
              )}
            </div>
          ) : (
            /* Empty State */
            <div className="cal-briefing__empty">
              <span className="cal-briefing__empty-icon">📅</span>
              <span className="cal-briefing__empty-text">
                Keine Briefing-Daten für diesen Tag.
              </span>
              <button className="cal-briefing__empty-btn" onClick={handleRefresh}>
                Briefing generieren
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
