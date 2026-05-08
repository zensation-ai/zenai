/**
 * MeetingsTab - Meeting list with search, create, and detail view.
 * Uses context-aware API endpoints.
 */

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import axios from 'axios';
import { MeetingSearchBar } from './MeetingSearchBar';
import { MeetingProtocol } from './MeetingProtocol';
import { MeetingRecorder } from '../MeetingRecorder/MeetingRecorder';
import { logError } from '../../utils/errors';
import type { AIContext } from '../ContextSwitcher';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';

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
  const [showRecorder, setShowRecorder] = useState(false);

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
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => { setSelectedMeeting(null); fetchMeetings(searchQuery); }}
        >
          ← Zurück zur Liste
        </Button>
        <MeetingProtocol
          meetingId={selectedMeeting.id}
          meetingTitle={selectedMeeting.title}
          context={context}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="m-0 text-lg font-semibold text-text">Meetings</h3>
        <span className="text-[0.8rem] text-text-secondary px-2.5 py-0.5 bg-bg-secondary rounded-full">{meetings.length} Meetings</span>
      </div>

      {/* Toolbar: search + create button */}
      <div className="flex flex-row gap-3 items-center mb-4 flex-wrap max-md:flex-col max-md:items-stretch">
        <div className="flex-1 [&>.flex]:mb-0">
          <MeetingSearchBar onSearch={handleSearch} />
        </div>
        <Button
          variant="outline"
          onClick={() => setShowRecorder(r => !r)}
          className="whitespace-nowrap"
        >
          {showRecorder ? 'Recorder schließen' : '🎙️ Live Transkription'}
        </Button>
        <Button
          onClick={() => setShowCreateForm(f => !f)}
          className="whitespace-nowrap"
        >
          {showCreateForm ? 'Abbrechen' : '+ Neues Meeting'}
        </Button>
      </div>

      {showRecorder && (
        <MeetingRecorder context={context} />
      )}

      {searchQuery && (
        <div className="text-[0.85rem] text-text-muted mb-2">
          Suchergebnisse für „{searchQuery}"
        </div>
      )}

      {/* Inline create form */}
      {showCreateForm && (
        <div className="p-4 rounded-lg bg-surface border border-glass-border mb-4 flex flex-col gap-2">
          <Input
            type="text"
            placeholder="Meeting-Titel"
            value={createTitle}
            onChange={e => setCreateTitle(e.target.value)}
          />
          <Input
            type="datetime-local"
            value={createDate}
            onChange={e => setCreateDate(e.target.value)}
          />
          <select
            className="w-full px-2 py-2 rounded-md border border-glass-border bg-surface text-text text-[0.9rem]"
            value={createType}
            onChange={e => setCreateType(e.target.value)}
          >
            <option value="standup">Standup</option>
            <option value="planning">Planung</option>
            <option value="retrospective">Retrospektive</option>
            <option value="workshop">Workshop</option>
            <option value="one_on_one">1:1</option>
            <option value="other">Sonstiges</option>
          </select>
          <Button
            onClick={handleCreate}
            disabled={creating || !createTitle.trim() || !createDate}
          >
            {creating ? 'Erstelle...' : 'Meeting erstellen'}
          </Button>
        </div>
      )}

      {loading && <div className="flex items-center justify-center p-12 text-text-secondary text-[0.9rem]">Lade Meetings...</div>}

      {error && !loading && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-danger">
          <span>⚠️</span>
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" onClick={() => fetchMeetings(searchQuery)}>Erneut versuchen</Button>
        </div>
      )}

      {!loading && !error && meetings.length === 0 && (
        <EmptyState
          icon="🎙️"
          title="Noch keine Meetings"
          description="Erstelle ein neues Meeting oder starte eines aus einem Kalender-Termin."
        />
      )}

      {!loading && !error && meetings.length > 0 && (
        <div className="flex flex-col gap-2">
          {meetings.map(meeting => (
            <div
              key={meeting.id}
              className="bg-glass-bg border border-glass-border rounded-lg px-4 py-3.5 cursor-pointer transition-all hover:bg-surface-hover hover:border-glass-border hover:shadow-sm focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
              onClick={() => setSelectedMeeting(meeting)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setSelectedMeeting(meeting)}
            >
              <div className="flex items-center justify-between mb-1.5 max-md:flex-col max-md:items-start max-md:gap-1">
                <h4 className="m-0 text-[0.95rem] font-medium text-text">
                  {meeting.title}
                  {meeting.has_audio && (
                    <Badge variant="outline" className="ml-2 text-[0.75rem] bg-green-50 text-green-700 align-middle">Audio</Badge>
                  )}
                </h4>
                <span
                  className="text-xs font-semibold uppercase tracking-wide text-[var(--c)]"
                  style={{ '--c': getStatusColor(meeting.status) } as CSSProperties}
                >
                  {getStatusLabel(meeting.status)}
                </span>
              </div>

              <div className="flex flex-wrap gap-3 text-[0.8rem] text-text-secondary">
                <span className="inline-flex items-center gap-1">
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
                  <span className="inline-flex items-center gap-1">
                    {meeting.duration_minutes} Min.
                  </span>
                )}
                {meeting.participants && meeting.participants.length > 0 && (
                  <span className="inline-flex items-center gap-1">
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
