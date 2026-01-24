import { memo } from 'react';
import { MEETING_TYPES, MEETING_STATUS } from '../constants/ideaTypes';
import { formatDateWithWeekday, formatDuration } from '../utils/dateUtils';
import './MeetingCard.css';
import '../neurodesign.css';

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

function MeetingCardComponent({ meeting, onClick, hasNotes }: MeetingCardProps) {

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && onClick) {
      e.preventDefault();
      onClick();
    }
  };

  // Use article role for non-clickable, button role for clickable
  const interactiveProps = onClick ? {
    onClick,
    onKeyDown: handleKeyDown,
    role: 'button' as const,
    tabIndex: 0,
  } : {};

  const statusLabel = MEETING_STATUS[meeting.status]?.label || meeting.status;
  const statusColor = MEETING_STATUS[meeting.status]?.color || '#64748b';
  const typeIcon = MEETING_TYPES[meeting.meeting_type]?.icon || '📅';
  const typeLabel = MEETING_TYPES[meeting.meeting_type]?.label || meeting.meeting_type;

  return (
    <div
      className="meeting-card liquid-glass neuro-hover-lift"
      {...interactiveProps}
      aria-label={`Meeting: ${meeting.title}, ${statusLabel}, ${formatDateWithWeekday(meeting.date)}`}
    >
      <div className="meeting-header">
        <span className="meeting-type-icon">{typeIcon}</span>
        <div className="meeting-title-row">
          <h3 className="meeting-title">{meeting.title}</h3>
          {hasNotes && <span className="has-notes-badge neuro-reward-badge" title="Hat Notizen">📝</span>}
        </div>
        <span
          className="meeting-status"
          style={{ backgroundColor: statusColor }}
        >
          {statusLabel}
        </span>
      </div>

      <div className="meeting-info">
        <div className="meeting-date">
          <span className="info-icon">📅</span>
          {formatDateWithWeekday(meeting.date)}
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
        <span className="meeting-type-label">{typeLabel}</span>
        {meeting.company_id && meeting.company_id !== 'personal' && (
          <span className="meeting-company">{meeting.company_id}</span>
        )}
      </div>
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export const MeetingCard = memo(MeetingCardComponent);
