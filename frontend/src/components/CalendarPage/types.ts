/**
 * Calendar Types - Phase 35
 */

export type EventType = 'appointment' | 'reminder' | 'deadline' | 'travel_block' | 'focus_time';
export type EventStatus = 'tentative' | 'confirmed' | 'cancelled';
export type CalendarView = 'month' | 'week' | 'day';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  event_type: EventType;
  start_time: string;
  end_time?: string;
  all_day: boolean;
  location?: string;
  participants: string[];
  rrule?: string;
  source_idea_id?: string;
  travel_duration_minutes?: number;
  travel_origin?: string;
  travel_destination?: string;
  status: EventStatus;
  color?: string;
  context: string;
  reminder_minutes: number[];
  notes?: string;
  ai_generated: boolean;
  ai_confidence?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  event_type?: EventType;
  start_time: string;
  end_time?: string;
  all_day?: boolean;
  location?: string;
  participants?: string[];
  reminder_minutes?: number[];
  rrule?: string;
  color?: string;
  notes?: string;
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  appointment: 'Termin',
  reminder: 'Erinnerung',
  deadline: 'Deadline',
  travel_block: 'Anreise',
  focus_time: 'Fokuszeit',
};

export const EVENT_TYPE_ICONS: Record<EventType, string> = {
  appointment: '\uD83D\uDCC5',
  reminder: '\u23F0',
  deadline: '\u26A0\uFE0F',
  travel_block: '\uD83D\uDE97',
  focus_time: '\uD83C\uDFAF',
};

export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  appointment: '#4A90D9',
  reminder: '#E8A838',
  deadline: '#D94A4A',
  travel_block: '#6B8E7B',
  focus_time: '#9B6BD9',
};
