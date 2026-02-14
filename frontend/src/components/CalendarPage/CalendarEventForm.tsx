/**
 * CalendarEventForm - Phase 35
 *
 * Modal form for creating/editing calendar events.
 */

import { useState, useCallback, useEffect } from 'react';
import type { CalendarEvent, CreateEventInput, EventType } from './types';
import { EVENT_TYPE_LABELS } from './types';

interface CalendarEventFormProps {
  event: CalendarEvent | null;
  prefilledStart: Date | null;
  onSave: (input: CreateEventInput) => Promise<CalendarEvent | null>;
  onDelete?: () => Promise<boolean>;
  onClose: () => void;
}

function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CalendarEventForm({ event, prefilledStart, onSave, onDelete, onClose }: CalendarEventFormProps) {
  const isEditing = Boolean(event);

  const defaultStart = prefilledStart || new Date();
  const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);

  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [eventType, setEventType] = useState<EventType>(event?.event_type || 'appointment');
  const [startTime, setStartTime] = useState(
    event ? toLocalDatetimeString(new Date(event.start_time)) : toLocalDatetimeString(defaultStart)
  );
  const [endTime, setEndTime] = useState(
    event?.end_time ? toLocalDatetimeString(new Date(event.end_time)) : toLocalDatetimeString(defaultEnd)
  );
  const [allDay, setAllDay] = useState(event?.all_day || false);
  const [location, setLocation] = useState(event?.location || '');
  const [notes, setNotes] = useState(event?.notes || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    try {
      const input: CreateEventInput = {
        title: title.trim(),
        description: description.trim() || undefined,
        event_type: eventType,
        start_time: new Date(startTime).toISOString(),
        end_time: allDay ? undefined : new Date(endTime).toISOString(),
        all_day: allDay,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      await onSave(input);
    } finally {
      setSaving(false);
    }
  }, [title, description, eventType, startTime, endTime, allDay, location, notes, onSave]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }, [onDelete]);

  return (
    <div className="calendar-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="calendar-form" onSubmit={handleSubmit}>
        <div className="calendar-form__header">
          <h3>{isEditing ? 'Termin bearbeiten' : 'Neuer Termin'}</h3>
          <button type="button" className="calendar-btn calendar-btn--icon" onClick={onClose} aria-label="Schließen">
            &times;
          </button>
        </div>

        <div className="calendar-form__body">
          {/* Title */}
          <div className="calendar-form__field">
            <label htmlFor="event-title">Titel *</label>
            <input
              id="event-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Termin-Titel"
              required
              autoFocus
            />
          </div>

          {/* Event Type */}
          <div className="calendar-form__field">
            <label htmlFor="event-type">Typ</label>
            <select
              id="event-type"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as EventType)}
            >
              {(Object.entries(EVENT_TYPE_LABELS) as [EventType, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* All Day */}
          <div className="calendar-form__field calendar-form__field--checkbox">
            <label>
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              Ganztaegig
            </label>
          </div>

          {/* Start Time */}
          <div className="calendar-form__field">
            <label htmlFor="event-start">Beginn *</label>
            <input
              id="event-start"
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? startTime.split('T')[0] : startTime}
              onChange={(e) => setStartTime(allDay ? `${e.target.value}T00:00` : e.target.value)}
              required
            />
          </div>

          {/* End Time */}
          {!allDay && (
            <div className="calendar-form__field">
              <label htmlFor="event-end">Ende</label>
              <input
                id="event-end"
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          )}

          {/* Location */}
          <div className="calendar-form__field">
            <label htmlFor="event-location">Ort</label>
            <input
              id="event-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="z.B. Buero, Zoom, ..."
            />
          </div>

          {/* Description */}
          <div className="calendar-form__field">
            <label htmlFor="event-description">Beschreibung</label>
            <textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optionale Details..."
              rows={3}
            />
          </div>

          {/* Notes */}
          <div className="calendar-form__field">
            <label htmlFor="event-notes">Notizen</label>
            <textarea
              id="event-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Interne Notizen..."
              rows={2}
            />
          </div>

          {/* AI Badge */}
          {event?.ai_generated && (
            <div className="calendar-event-ai-badge">
              KI-generiert (Konfidenz: {Math.round((event.ai_confidence || 0) * 100)}%)
            </div>
          )}
        </div>

        <div className="calendar-form__actions">
          {onDelete && (
            <button
              type="button"
              className="calendar-btn calendar-btn--danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Wird gelöscht...' : 'Löschen'}
            </button>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
            <button type="button" className="calendar-btn" onClick={onClose}>
              Abbrechen
            </button>
            <button
              type="submit"
              className="calendar-btn calendar-btn--primary"
              disabled={saving || !title.trim()}
            >
              {saving ? 'Wird gespeichert...' : isEditing ? 'Speichern' : 'Erstellen'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
