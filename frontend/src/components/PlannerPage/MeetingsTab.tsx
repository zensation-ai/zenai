/**
 * MeetingsTab - Phase 37
 *
 * Meetings list for the Planner page.
 * Reuses existing meetings API (public schema).
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { MeetingProtocol } from './MeetingProtocol';
import './MeetingsTab.css';

interface Meeting {
  id: string;
  title: string;
  date: string;
  duration_minutes?: number;
  participants: string[];
  location?: string;
  meeting_type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface MeetingsTabProps {
  context: string;
}

export function MeetingsTab({ context }: MeetingsTabProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/${context}/meetings`, { params: { limit: 50, status: 'all' } });
      if (res.data.success) {
        setMeetings(res.data.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Meetings');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'scheduled': return 'Geplant';
      case 'in_progress': return 'Laufend';
      case 'completed': return 'Abgeschlossen';
      case 'cancelled': return 'Abgesagt';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return '#4A90D9';
      case 'in_progress': return '#E8A838';
      case 'completed': return '#4CAF50';
      case 'cancelled': return '#8B8B8B';
      default: return '#8B8B8B';
    }
  };

  if (loading) {
    return <div className="meetings-tab__loading">Lade Meetings...</div>;
  }

  if (error) {
    return (
      <div className="meetings-tab__error">
        <p>{error}</p>
        <button onClick={fetchMeetings}>Erneut versuchen</button>
      </div>
    );
  }

  if (selectedMeeting) {
    return (
      <div className="meetings-tab">
        <button
          className="meetings-tab__back"
          onClick={() => setSelectedMeeting(null)}
        >
          &larr; Zurück zur Liste
        </button>
        <MeetingProtocol
          meetingId={selectedMeeting.id}
          meetingTitle={selectedMeeting.title}
          context={context}
        />
      </div>
    );
  }

  return (
    <div className="meetings-tab">
      <div className="meetings-tab__header">
        <h3>Meetings</h3>
        <span className="meetings-tab__count">{meetings.length} Meetings</span>
      </div>

      {meetings.length === 0 ? (
        <div className="meetings-tab__empty">
          <span className="meetings-tab__empty-icon">{'\uD83C\uDF99\uFE0F'}</span>
          <p>Noch keine Meetings</p>
          <p className="meetings-tab__hint">
            Starte ein Meeting direkt aus einem Kalender-Termin heraus.
          </p>
        </div>
      ) : (
        <div className="meetings-tab__list">
          {meetings.map(meeting => (
            <div
              key={meeting.id}
              className="meetings-tab__item"
              onClick={() => setSelectedMeeting(meeting)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setSelectedMeeting(meeting)}
            >
              <div className="meetings-tab__item-header">
                <h4 className="meetings-tab__item-title">{meeting.title}</h4>
                <span
                  className="meetings-tab__item-status"
                  style={{ color: getStatusColor(meeting.status) }}
                >
                  {getStatusLabel(meeting.status)}
                </span>
              </div>

              <div className="meetings-tab__item-meta">
                <span className="meetings-tab__item-date">
                  {new Date(meeting.date).toLocaleDateString('de-DE', {
                    weekday: 'short',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {meeting.duration_minutes && (
                  <span className="meetings-tab__item-duration">
                    {meeting.duration_minutes} Min.
                  </span>
                )}
                {meeting.participants.length > 0 && (
                  <span className="meetings-tab__item-participants">
                    {meeting.participants.length} Teilnehmer
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
