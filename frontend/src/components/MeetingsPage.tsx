import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MeetingCard, Meeting } from './MeetingCard';
import { MeetingDetail } from './MeetingDetail';
import { showToast } from './Toast';
import { getRandomReward } from '../utils/aiPersonality';
import './MeetingsPage.css';
import '../neurodesign.css';

// Type-safe error extraction
interface ApiError {
  response?: { data?: { error?: string } };
  message?: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
  const apiError = error as ApiError;
  return apiError.response?.data?.error || apiError.message || fallback;
}

interface ActionItem {
  task: string;
  assignee?: string;
  due_date?: string;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
}

interface FollowUp {
  topic: string;
  responsible?: string;
  deadline?: string;
}

interface MeetingNotes {
  id: string;
  meeting_id: string;
  raw_transcript: string;
  structured_summary: string;
  key_decisions: string[];
  action_items: ActionItem[];
  topics_discussed: string[];
  follow_ups: FollowUp[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  created_at: string;
}

interface MeetingsPageProps {
  onBack: () => void;
}

export function MeetingsPage({ onBack }: MeetingsPageProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<MeetingNotes | null>(null);
  const [meetingNotesMap, setMeetingNotesMap] = useState<Record<string, boolean>>({});
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'completed'>('all');

  // Ref to track mount state and prevent updates after unmount
  const isMountedRef = useRef(true);

  // New meeting form state
  const [newMeeting, setNewMeeting] = useState({
    title: '',
    date: '',
    meeting_type: 'internal' as Meeting['meeting_type'],
    participants: '',
    location: '',
    duration_minutes: 60,
  });

  useEffect(() => {
    isMountedRef.current = true;
    loadMeetings();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadMeetings = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/meetings?limit=50');

      if (!isMountedRef.current) return;
      setMeetings(response.data.meetings);

      // Check which meetings have notes (batch request for better performance)
      // Use Promise.all for parallel requests instead of sequential loop
      const meetingIds = response.data.meetings.map((m: Meeting) => m.id);
      const notesResults = await Promise.allSettled(
        meetingIds.map((id: string) => axios.get(`/api/meetings/${id}/notes`))
      );

      if (!isMountedRef.current) return;

      const notesMap: Record<string, boolean> = {};
      meetingIds.forEach((id: string, index: number) => {
        const result = notesResults[index];
        notesMap[id] = result.status === 'fulfilled' && !!result.value.data.notes;
      });
      setMeetingNotesMap(notesMap);

      setError(null);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        setError(getErrorMessage(err, 'Deine Meetings konnten gerade nicht geladen werden. Versuch es gleich noch mal.'));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleMeetingClick = async (meeting: Meeting) => {
    setSelectedMeeting(meeting);

    try {
      const response = await axios.get(`/api/meetings/${meeting.id}/notes`);
      setSelectedNotes(response.data.notes || null);
    } catch {
      setSelectedNotes(null);
    }
  };

  const handleNotesAdded = (notes: MeetingNotes) => {
    setSelectedNotes(notes);
    setMeetingNotesMap((prev) => ({ ...prev, [notes.meeting_id]: true }));

    // Update meeting status to completed
    setMeetings((prev) =>
      prev.map((m) =>
        m.id === notes.meeting_id ? { ...m, status: 'completed' as const } : m
      )
    );
  };

  const handleCreateMeeting = async () => {
    if (!newMeeting.title || !newMeeting.date) {
      setError('Titel und Datum sind erforderlich');
      return;
    }

    try {
      const response = await axios.post('/api/meetings', {
        ...newMeeting,
        participants: newMeeting.participants
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean),
      });

      setMeetings([response.data.meeting, ...meetings]);
      setShowNewMeeting(false);
      setNewMeeting({
        title: '',
        date: '',
        meeting_type: 'internal',
        participants: '',
        location: '',
        duration_minutes: 60,
      });
      showCreationReward();
    } catch (err: unknown) {
      if (isMountedRef.current) {
        setError(getErrorMessage(err, 'Das Meeting konnte nicht erstellt werden.'));
        showToast('Das Meeting konnte leider nicht erstellt werden. Prüf die Eingaben und versuch es noch mal.', 'error');
      }
    }
  };

  const filteredMeetings = meetings.filter((m) => {
    if (filter === 'all') return true;
    if (filter === 'scheduled') return m.status === 'scheduled' || m.status === 'in_progress';
    if (filter === 'completed') return m.status === 'completed';
    return true;
  });

  // Show reward on successful meeting creation
  const showCreationReward = () => {
    const reward = getRandomReward('ideaCreated');
    showToast(`${reward.emoji} ${reward.message}`, 'success');
  };

  return (
    <div className="meetings-page neuro-page-enter">
      <div className="meetings-header">
        <button
          type="button"
          className="back-button neuro-hover-lift"
          onClick={onBack}
          aria-label="Zurück zur Übersicht"
        >
          ← Zurück
        </button>
        <h1>Meetings</h1>
        <button
          type="button"
          className="new-meeting-btn neuro-button"
          onClick={() => setShowNewMeeting(true)}
          aria-label="Neues Meeting erstellen"
        >
          + Neues Meeting
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Fehlermeldung schließen"
          >
            ×
          </button>
        </div>
      )}

      <div className="meetings-filters" role="group" aria-label="Meeting-Filter">
        <button
          type="button"
          className={`neuro-press-effect ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
          aria-current={filter === 'all' ? 'true' : undefined}
        >
          Alle ({meetings.length})
        </button>
        <button
          type="button"
          className={`neuro-press-effect ${filter === 'scheduled' ? 'active' : ''}`}
          onClick={() => setFilter('scheduled')}
          aria-current={filter === 'scheduled' ? 'true' : undefined}
        >
          Geplant ({meetings.filter((m) => m.status === 'scheduled' || m.status === 'in_progress').length})
        </button>
        <button
          type="button"
          className={`neuro-press-effect ${filter === 'completed' ? 'active' : ''}`}
          onClick={() => setFilter('completed')}
          aria-current={filter === 'completed' ? 'true' : undefined}
        >
          Abgeschlossen ({meetings.filter((m) => m.status === 'completed').length})
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner large" />
          <p>Lade Meetings...</p>
        </div>
      ) : filteredMeetings.length === 0 ? (
        <div className="neuro-empty-state">
          <span className="neuro-empty-icon">📅</span>
          <h3 className="neuro-empty-title">Keine Meetings gefunden</h3>
          <p className="neuro-empty-description">Erstelle dein erstes Meeting mit dem Button oben.</p>
          <p className="neuro-empty-encouragement">Gute Planung ist der erste Schritt zum Erfolg.</p>
        </div>
      ) : (
        <div className="meetings-grid neuro-flow-list">
          {filteredMeetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              onClick={() => handleMeetingClick(meeting)}
              hasNotes={meetingNotesMap[meeting.id]}
            />
          ))}
        </div>
      )}

      {/* Meeting Detail Modal */}
      {selectedMeeting && (
        <MeetingDetail
          meeting={selectedMeeting}
          notes={selectedNotes}
          onClose={() => {
            setSelectedMeeting(null);
            setSelectedNotes(null);
          }}
          onNotesAdded={handleNotesAdded}
        />
      )}

      {/* New Meeting Modal */}
      {showNewMeeting && (
        <div
          className="modal-overlay"
          onClick={() => setShowNewMeeting(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-meeting-title"
        >
          <div className="new-meeting-modal liquid-glass" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="close-button neuro-hover-lift"
              onClick={() => setShowNewMeeting(false)}
              aria-label="Modal schließen"
            >
              ×
            </button>
            <h2 id="new-meeting-title">Neues Meeting</h2>

            <div className="form-group">
              <label htmlFor="meeting-title">Titel *</label>
              <input
                id="meeting-title"
                type="text"
                value={newMeeting.title}
                onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                placeholder="Meeting Titel..."
              />
            </div>

            <div className="form-group">
              <label htmlFor="meeting-date">Datum & Uhrzeit *</label>
              <input
                id="meeting-date"
                type="datetime-local"
                value={newMeeting.date}
                onChange={(e) => setNewMeeting({ ...newMeeting, date: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="meeting-type">Typ</label>
                <select
                  id="meeting-type"
                  value={newMeeting.meeting_type}
                  onChange={(e) =>
                    setNewMeeting({ ...newMeeting, meeting_type: e.target.value as Meeting['meeting_type'] })
                  }
                >
                  <option value="internal">Intern</option>
                  <option value="external">Extern</option>
                  <option value="one_on_one">1:1</option>
                  <option value="team">Team</option>
                  <option value="client">Kunde</option>
                  <option value="other">Sonstiges</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="meeting-duration">Dauer (Min)</label>
                <input
                  id="meeting-duration"
                  type="number"
                  value={newMeeting.duration_minutes}
                  onChange={(e) =>
                    setNewMeeting({ ...newMeeting, duration_minutes: parseInt(e.target.value) || 60 })
                  }
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="meeting-participants">Teilnehmer (kommasepariert)</label>
              <input
                id="meeting-participants"
                type="text"
                value={newMeeting.participants}
                onChange={(e) => setNewMeeting({ ...newMeeting, participants: e.target.value })}
                placeholder="Max, Anna, Tim..."
              />
            </div>

            <div className="form-group">
              <label htmlFor="meeting-location">Ort</label>
              <input
                id="meeting-location"
                type="text"
                value={newMeeting.location}
                onChange={(e) => setNewMeeting({ ...newMeeting, location: e.target.value })}
                placeholder="Büro / Zoom / ..."
              />
            </div>

            <button
              type="button"
              className="create-btn neuro-button"
              onClick={handleCreateMeeting}
              aria-label="Meeting erstellen"
            >
              Meeting erstellen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
