/**
 * CalendarBriefing - Phase 40
 *
 * AI-powered daily briefing panel with summary, tips,
 * free slots, and conflict warnings.
 */

import { useEffect } from 'react';
import type { DailyBriefing, ConflictInfo } from './useCalendarAI';
import './CalendarBriefing.css';

interface Props {
  briefing: DailyBriefing | null;
  briefingLoading: boolean;
  conflicts: ConflictInfo[];
  conflictsLoading: boolean;
  onFetchBriefing: (date?: string) => void;
  onFetchConflicts: (start?: string, end?: string) => void;
  currentDate: Date;
}

export function CalendarBriefing({
  briefing,
  briefingLoading,
  conflicts,
  onFetchBriefing,
  onFetchConflicts,
  currentDate,
}: Props) {
  useEffect(() => {
    const dateStr = currentDate.toISOString().split('T')[0];
    onFetchBriefing(dateStr);

    const weekEnd = new Date(currentDate);
    weekEnd.setDate(weekEnd.getDate() + 7);
    onFetchConflicts(currentDate.toISOString(), weekEnd.toISOString());
  }, [currentDate.toISOString().split('T')[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const errorConflicts = conflicts.filter(c => c.severity === 'error');
  const warningConflicts = conflicts.filter(c => c.severity === 'warning');

  return (
    <div className="cal-briefing">
      {/* Conflicts Banner */}
      {errorConflicts.length > 0 && (
        <div className="cal-briefing__conflicts cal-briefing__conflicts--error">
          <div className="cal-briefing__conflicts-icon">!</div>
          <div>
            <strong>{errorConflicts.length} Konflikt{errorConflicts.length > 1 ? 'e' : ''}</strong>
            {errorConflicts.map((c, i) => (
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
          <div className="cal-briefing__conflicts-icon">i</div>
          <div>
            <strong>{warningConflicts.length} Hinweis{warningConflicts.length > 1 ? 'e' : ''}</strong>
            {warningConflicts.slice(0, 3).map((c, i) => (
              <div key={i} className="cal-briefing__conflict-item">{c.message}</div>
            ))}
            {warningConflicts.length > 3 && (
              <div className="cal-briefing__conflict-more">
                +{warningConflicts.length - 3} weitere
              </div>
            )}
          </div>
        </div>
      )}

      {/* Daily Briefing */}
      {briefingLoading ? (
        <div className="cal-briefing__loading">KI-Briefing wird erstellt...</div>
      ) : briefing ? (
        <div className="cal-briefing__content">
          <div className="cal-briefing__header">
            <span className="cal-briefing__badge">KI-Briefing</span>
            <span className="cal-briefing__stats">
              {briefing.event_count} Termine &middot; {briefing.busy_hours}h gebucht
            </span>
          </div>

          <p className="cal-briefing__summary">{briefing.summary}</p>

          {briefing.free_slots.length > 0 && (
            <div className="cal-briefing__slots">
              <span className="cal-briefing__slots-label">Freie Zeiten:</span>
              {briefing.free_slots.slice(0, 3).map((slot, i) => (
                <span key={i} className="cal-briefing__slot-chip">
                  {new Date(slot.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  -
                  {new Date(slot.end).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  <span className="cal-briefing__slot-duration">{slot.duration_minutes}m</span>
                </span>
              ))}
            </div>
          )}

          {briefing.tips.length > 0 && (
            <div className="cal-briefing__tips">
              {briefing.tips.slice(0, 3).map((tip, i) => (
                <div key={i} className="cal-briefing__tip">{tip}</div>
              ))}
            </div>
          )}

          {briefing.focus_recommendation && (
            <div className="cal-briefing__focus">
              {briefing.focus_recommendation}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
