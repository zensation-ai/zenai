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
        setError(getErrorMessage(err, 'Laden fehlgeschlagen'));
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
        setError(getErrorMessage(err, 'Meeting erstellen fehlgeschlagen'));
        showToast('Meeting konnte nicht erstellt werden', 'error');
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
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <h1>Meetings</h1>
        <button className="new-meeting-btn" onClick={() => setShowNewMeeting(true)}>
          + Neues Meeting
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="meetings-filters">
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          Alle ({meetings.length})
        </button>
        <button
          className={filter === 'scheduled' ? 'active' : ''}
          onClick={() => setFilter('scheduled')}
        >
          Geplant ({meetings.filter((m) => m.status === 'scheduled' || m.status === 'in_progress').length})
        </button>
        <button
          className={filter === 'completed' ? 'active' : ''}
          onClick={() => setFilter('completed')}
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
        <div className="modal-overlay" onClick={() => setShowNewMeeting(false)}>
          <div className="new-meeting-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setShowNewMeeting(false)}>
              ×
            </button>
            <h2>Neues Meeting</h2>

            <div className="form-group">
              <label>Titel *</label>
              <input
                type="text"
                value={newMeeting.title}
                onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                placeholder="Meeting Titel..."
              />
            </div>

            <div className="form-group">
              <label>Datum & Uhrzeit *</label>
              <input
                type="datetime-local"
                value={newMeeting.date}
                onChange={(e) => setNewMeeting({ ...newMeeting, date: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Typ</label>
                <select
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
                <label>Dauer (Min)</label>
                <input
                  type="number"
                  value={newMeeting.duration_minutes}
                  onChange={(e) =>
                    setNewMeeting({ ...newMeeting, duration_minutes: parseInt(e.target.value) || 60 })
                  }
                />
              </div>
            </div>

            <div className="form-group">
              <label>Teilnehmer (kommasepariert)</label>
              <input
                type="text"
                value={newMeeting.participants}
                onChange={(e) => setNewMeeting({ ...newMeeting, participants: e.target.value })}
                placeholder="Max, Anna, Tim..."
              />
            </div>

            <div className="form-group">
              <label>Ort</label>
              <input
                type="text"
                value={newMeeting.location}
                onChange={(e) => setNewMeeting({ ...newMeeting, location: e.target.value })}
                placeholder="Büro / Zoom / ..."
              />
            </div>

            <button className="create-btn" onClick={handleCreateMeeting}>
              Meeting erstellen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
