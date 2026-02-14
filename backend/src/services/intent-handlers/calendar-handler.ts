/**
 * Calendar Intent Handler - Phase 35
 *
 * Processes detected calendar intents from voice memos.
 * Creates calendar events from extracted data.
 */

import { AIContext } from '../../utils/database-context';
import { createCalendarEvent } from '../calendar';
import { logger } from '../../utils/logger';
import type { DetectedIntent } from '../intent-detector';
import type { IntentHandlerResult } from './index';

/**
 * Handle a calendar_event intent
 */
export async function handleCalendarIntent(
  context: AIContext,
  intent: DetectedIntent,
  originalText: string
): Promise<IntentHandlerResult> {
  const data = intent.extracted_data;

  // Build start_time from extracted date/time
  const startTime = buildStartTime(data);
  if (!startTime) {
    logger.warn('Calendar intent: could not determine start time', {
      extracted: data,
      operation: 'handleCalendarIntent'
    });
    return {
      success: false,
      intent_type: 'calendar_event',
      error: 'Konnte kein Datum/Uhrzeit aus dem Text extrahieren',
    };
  }

  // Determine event type
  const eventType = determineEventType(data, originalText);

  // Build end_time from duration or default
  const durationMinutes = (data.duration_minutes as number) || 60;
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

  // Extract participants
  const participants = Array.isArray(data.participants)
    ? (data.participants as string[])
    : [];

  try {
    const event = await createCalendarEvent(context, {
      title: (data.title as string) || extractTitle(originalText),
      description: (data.description as string) || originalText,
      event_type: eventType,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      all_day: Boolean(data.all_day),
      location: (data.location as string) || undefined,
      participants,
      reminder_minutes: eventType === 'reminder' ? [0] : [15],
      ai_generated: true,
      ai_confidence: intent.confidence,
    });

    return {
      success: true,
      intent_type: 'calendar_event',
      created_resource: {
        type: 'calendar_event',
        id: event.id,
        summary: `${event.title} am ${formatDate(startTime)}`,
        data: {
          title: event.title,
          start_time: event.start_time,
          end_time: event.end_time,
          location: event.location,
          event_type: event.event_type,
        },
      },
    };
  } catch (err) {
    logger.error('Failed to create calendar event from intent', err instanceof Error ? err : undefined, {
      operation: 'handleCalendarIntent'
    });
    return {
      success: false,
      intent_type: 'calendar_event',
      error: (err as Error).message,
    };
  }
}

// ============================================================
// Helpers
// ============================================================

function buildStartTime(data: Record<string, unknown>): Date | null {
  // Try direct ISO string
  if (data.start_time && typeof data.start_time === 'string') {
    const d = new Date(data.start_time);
    if (!isNaN(d.getTime())) return d;
  }

  // Try date + time combination
  const dateStr = data.date as string;
  const timeStr = data.time as string;

  if (dateStr) {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      if (timeStr) {
        const timeParts = timeStr.match(/(\d{1,2}):?(\d{2})?/);
        if (timeParts) {
          date.setHours(parseInt(timeParts[1], 10), parseInt(timeParts[2] || '0', 10), 0, 0);
        }
      }
      return date;
    }
  }

  // Try relative dates
  if (data.relative_date) {
    const now = new Date();
    const relative = (data.relative_date as string).toLowerCase();

    if (relative === 'morgen' || relative === 'tomorrow') {
      now.setDate(now.getDate() + 1);
    } else if (relative === 'uebermorgen' || relative === 'übermorgen') {
      now.setDate(now.getDate() + 2);
    } else if (relative === 'naechste woche' || relative === 'nächste woche') {
      now.setDate(now.getDate() + 7);
    }

    if (timeStr) {
      const timeParts = timeStr.match(/(\d{1,2}):?(\d{2})?/);
      if (timeParts) {
        now.setHours(parseInt(timeParts[1], 10), parseInt(timeParts[2] || '0', 10), 0, 0);
      }
    }
    return now;
  }

  return null;
}

function determineEventType(
  data: Record<string, unknown>,
  text: string
): 'appointment' | 'reminder' | 'deadline' | 'focus_time' {
  const eventType = data.event_type as string;
  if (eventType) {
    if (['appointment', 'reminder', 'deadline', 'focus_time'].includes(eventType)) {
      return eventType as 'appointment' | 'reminder' | 'deadline' | 'focus_time';
    }
  }

  const lowerText = text.toLowerCase();
  if (/erinner(e|ung|t)?\s+mich/i.test(lowerText)) return 'reminder';
  if (/deadline/i.test(lowerText) || /frist/i.test(lowerText) || /bis\s+spätestens/i.test(lowerText)) return 'deadline';
  if (/fokus|konzentrier/i.test(lowerText)) return 'focus_time';

  return 'appointment';
}

function extractTitle(text: string): string {
  // Take first sentence or first 50 chars
  const firstSentence = text.split(/[.!?]/)[0].trim();
  if (firstSentence.length <= 80) return firstSentence;
  return firstSentence.substring(0, 77) + '...';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
