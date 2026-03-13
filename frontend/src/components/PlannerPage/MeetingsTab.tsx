/**
 * MeetingsTab - Meeting list with search, create, and detail view.
 * Uses context-aware API endpoints.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { MeetingSearchBar } from './MeetingSearchBar';
import { MeetingProtocol } from './MeetingProtocol';
import { logError } from '../../utils/errors';
import type { AIContext } from '../ContextSwitcher';
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
  has_audio?: boolean;
  created_at: string;
  updated_at: string;
}

interface MeetingsTabProps {
  context: AIContext;
}

interface SearchFilters {
  status?: string;
  hasAudio?: boolean;
}

export function MeetingsTab({ context }: MeetingsTabProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDate, setCreateDate] = useState('');
  const [createType, setCreateType] = useState('standup');
  const [creating, setCreating] = useState(false);

  const fetchMeetings = useCallback(async (query?: string, filterOverride?: SearchFilters) => {
    setLoading(true);
    setError(null);
    const activeFilters = filterOverride ?? filters;
    try {
      let data: Meeting[];

      if (query && query.trim().length > 0) {
        // Search mode
        const res = await axios.post(`/api/${context}/meetings/search`, {
          query: query.trim(),
          mode: 'hybrid',
          limit: 20,
        });
        data = res.data.success ? (res.data.data || []) : [];
      } else {
        // List mode
        const params: Record<string, string | number | boolean> = { limit: 50 };
        if (activeFilters.status) params.status = activeFilters.status;
        if (activeFilters.hasAudio) params.has_audio = true;

        const res = await axios.get(`/api/${context}/meetings`, { params });
        data = res.data.success ? (res.data.data || []) : [];
      }

      setMeetings(data);
    } catch (err) {
      logError('MeetingsTab:fetchMeetings', err);
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Meetings');
    } finally {
      setLoading(false);
    }
  }, [context, filters]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const handleSearch = useCallback((query: string, newFilters: SearchFilters) => {
    setSearchQuery(query);
    setFilters(newFilters);
    fetchMeetings(query, newFilters);
  }, [fetchMeetings]);

  const handleCreate = async () => {
    if (!createTitle.trim() || !createDate) return;
    setCreating(true);
    try {
      const res = await axios.post(`/api/${context}/meetings`, {
        title: createTitle.trim(),
        date: createDate,
        meeting_type: createType,
      });
      if (res.data.success && res.data.data) {
        setMeetings(prev => [res.data.data, ...prev]);
        setCreateTitle('');
        setCreateDate('');
        setCreateType('standup');
        setShowCreateForm(false);
      }
    } catch (err) {
      logError('MeetingsTab:create', err);
      setError('Meeting konnte nicht erstellt werden.');
    } finally {
      setCreating(false);
    }
  };

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

  // Detail view
  if (selectedMeeting) {
    return (
      <div className="meetings-tab">
        <button
          className="meetings-tab__back"
          onClick={() => { setSelectedMeeting(null); fetchMeetings(searchQuery); }}
        >
          &larr; Zur&uuml;ck zur Liste
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

      {/* Toolbar: search + create button */}
      <div className="meetings-tab__toolbar">
        <MeetingSearchBar onSearch={handleSearch} />
        <button
          className="meetings-tab__create-btn"
          onClick={() => setShowCreateForm(f => !f)}
        >
          {showCreateForm ? 'Abbrechen' : '+ Neues Meeting'}
        </button>
      </div>

      {searchQuery && (
        <div className="meetings-tab__search-info">
          Suchergebnisse f&uuml;r &ldquo;{searchQuery}&rdquo;
        </div>
      )}

      {/* Inline create form */}
      {showCreateForm && (
        <div className="meetings-tab__create-form">
          <input
            type="text"
            placeholder="Meeting-Titel"
            value={createTitle}
            onChange={e => setCreateTitle(e.target.value)}
          />
          <input
            type="datetime-local"
            value={createDate}
            onChange={e => setCreateDate(e.target.value)}
          />
          <select value={createType} onChange={e => setCreateType(e.target.value)}>
            <option value="standup">Standup</option>
            <option value="planning">Planung</option>
            <option value="retrospective">Retrospektive</option>
            <option value="workshop">Workshop</option>
            <option value="one_on_one">1:1</option>
            <option value="other">Sonstiges</option>
          </select>
          <button
            className="meetings-tab__create-btn"
            onClick={handleCreate}
            disabled={creating || !createTitle.trim() || !createDate}
          >
            {creating ? 'Erstelle...' : 'Meeting erstellen'}
          </button>
        </div>
      )}

      {loading && <div className="meetings-tab__loading">Lade Meetings...</div>}

      {error && !loading && (
        <div className="meetings-tab__error">
          <p>{error}</p>
          <button onClick={() => fetchMeetings(searchQuery)}>Erneut versuchen</button>
        </div>
      )}

      {!loading && !error && meetings.length === 0 && (
        <div className="meetings-tab__empty">
          <span className="meetings-tab__empty-icon">{'\uD83C\uDF99\uFE0F'}</span>
          <p>Noch keine Meetings</p>
          <p className="meetings-tab__hint">
            Erstelle ein neues Meeting oder starte eines aus einem Kalender-Termin.
          </p>
        </div>
      )}

      {!loading && !error && meetings.length > 0 && (
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
                <h4 className="meetings-tab__item-title">
                  {meeting.title}
                  {meeting.has_audio && (
                    <span className="meetings-tab__audio-badge">Audio</span>
                  )}
                </h4>
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
                {meeting.participants && meeting.participants.length > 0 && (
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
