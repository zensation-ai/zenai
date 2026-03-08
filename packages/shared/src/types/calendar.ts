/**
 * Calendar types shared across frontend and backend
 */

export type EventType = 'appointment' | 'reminder' | 'deadline' | 'travel_block' | 'focus_time';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  event_type: EventType;
  start_time: string;
  end_time: string;
  all_day?: boolean;
  location?: string;
  attendees?: string[];
  recurrence?: string;
  source_calendar_id?: string;
  source_idea_id?: string;
  meeting_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}
