import './MeetingCard.css';

export interface Meeting {
  id: string;
  company_id: string;
  title: string;
  date: string;
  duration_minutes?: number;
  participants: string[];
  location?: string;
  meeting_type: 'internal' | 'external' | 'one_on_one' | 'team' | 'client' | 'other';
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
}

interface MeetingCardProps {
  meeting: Meeting;
  onClick?: () => void;
  hasNotes?: boolean;
}

const typeIcons: Record<string, string> = {
  internal: '🏢',
  external: '🌐',
  one_on_one: '👥',
  team: '👨‍👩‍👧‍👦',
  client: '🤝',
  other: '📅',
};

const typeLabels: Record<string, string> = {
  internal: 'Intern',
  external: 'Extern',
  one_on_one: '1:1',
  team: 'Team',
  client: 'Kunde',
  other: 'Sonstiges',
};

const statusColors: Record<string, string> = {
  scheduled: '#3b82f6',
  in_progress: '#f59e0b',
  completed: '#22c55e',
  cancelled: '#64748b',
};

const statusLabels: Record<string, string> = {
  scheduled: 'Geplant',
  in_progress: 'Läuft',
  completed: 'Abgeschlossen',
  cancelled: 'Abgesagt',
};

export function MeetingCard({ meeting, onClick, hasNotes }: MeetingCardProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return null;
    if (minutes < 60) return `${minutes} Min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <div className="meeting-card" onClick={onClick}>
      <div className="meeting-header">
        <span className="meeting-type-icon">{typeIcons[meeting.meeting_type] || '📅'}</span>
        <div className="meeting-title-row">
          <h3 className="meeting-title">{meeting.title}</h3>
          {hasNotes && <span className="has-notes-badge" title="Hat Notizen">📝</span>}
        </div>
        <span
          className="meeting-status"
          style={{ backgroundColor: statusColors[meeting.status] }}
        >
          {statusLabels[meeting.status]}
        </span>
      </div>

      <div className="meeting-info">
        <div className="meeting-date">
          <span className="info-icon">📅</span>
          {formatDate(meeting.date)}
        </div>

        {meeting.duration_minutes && (
          <div className="meeting-duration">
            <span className="info-icon">⏱️</span>
            {formatDuration(meeting.duration_minutes)}
          </div>
        )}

        {meeting.location && (
          <div className="meeting-location">
            <span className="info-icon">📍</span>
            {meeting.location}
          </div>
        )}
      </div>

      {meeting.participants.length > 0 && (
        <div className="meeting-participants">
          <span className="info-icon">👤</span>
          {meeting.participants.length <= 3 ? (
            meeting.participants.join(', ')
          ) : (
            <>
              {meeting.participants.slice(0, 2).join(', ')} +{meeting.participants.length - 2}
            </>
          )}
        </div>
      )}

      <div className="meeting-footer">
        <span className="meeting-type-label">{typeLabels[meeting.meeting_type]}</span>
        {meeting.company_id !== 'personal' && (
          <span className="meeting-company">{meeting.company_id}</span>
        )}
      </div>
    </div>
  );
}
