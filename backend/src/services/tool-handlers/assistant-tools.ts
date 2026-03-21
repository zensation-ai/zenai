/**
 * Assistant Tool Handlers
 *
 * Extracted from index.ts (Phase 120) — contains tool handlers for
 * meetings, navigation, app help, calendar events, email drafts, and travel.
 *
 * @module services/tool-handlers/assistant-tools
 */

import { logger } from '../../utils/logger';
import { ToolExecutionContext } from '../claude/tool-use';
import { createMeeting } from '../meetings';
import { createCalendarEvent, getCalendarEvents } from '../calendar';
import { estimateTravelDuration } from '../travel-estimator';
import { getFeatureHelp } from '../assistant-knowledge';

// ===========================================
// Meeting, Navigation, App Help
// ===========================================

export async function handleCreateMeeting(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const title = input.title as string;
  const date = input.date as string;
  const duration_minutes = (input.duration_minutes as number) || 60;
  const participants = input.participants as string[] | undefined;
  const location = input.location as string | undefined;

  if (!title || !date) {
    return 'Fehler: Titel und Datum sind erforderlich.';
  }

  try {
    const meeting = await createMeeting({
      title,
      date,
      duration_minutes,
      participants,
      location,
    });

    const dateFormatted = new Date(meeting.date).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const parts = [`Meeting erstellt: "${meeting.title}" am ${dateFormatted}.`];
    if (participants && participants.length > 0) {
      parts.push(`Teilnehmer: ${participants.join(', ')}.`);
    }
    if (location) {
      parts.push(`Ort: ${location}.`);
    }
    parts.push(`Dauer: ${duration_minutes} Minuten.`);

    return parts.join(' ');
  } catch (error) {
    logger.error('Tool create_meeting failed', error instanceof Error ? error : undefined);
    return `Fehler beim Erstellen des Meetings: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

export async function handleNavigateTo(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const page = input.page as string;
  const reason = (input.reason as string) || '';

  return JSON.stringify({
    action: 'navigate',
    page,
    reason,
    message: `Navigiere zu ${page}. ${reason}`.trim(),
  });
}

export async function handleAppHelp(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const topic = input.topic as string;
  if (!topic) {
    return 'Bitte gib an, zu welchem Feature du Hilfe brauchst.';
  }
  return getFeatureHelp(topic);
}

// ===========================================
// Calendar, Email, Travel Tools
// ===========================================

export async function handleCreateCalendarEvent(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const title = input.title as string;
  const startTime = input.start_time as string;

  if (!title || !startTime) {
    return 'Fehler: Titel und Startzeit sind erforderlich.';
  }

  try {
    const endTime = input.end_time as string | undefined;
    const event = await createCalendarEvent(execContext.aiContext, {
      title,
      start_time: startTime,
      end_time: endTime || new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString(),
      event_type: (input.event_type as 'appointment' | 'reminder' | 'deadline' | 'focus_time') || 'appointment',
      location: input.location as string | undefined,
      participants: input.participants as string[] | undefined,
      description: input.description as string | undefined,
      ai_generated: true,
    });

    const dateFormatted = new Date(event.start_time).toLocaleString('de-DE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const parts = [`Kalender-Eintrag erstellt: "${event.title}" am ${dateFormatted}.`];
    if (event.location) {parts.push(`Ort: ${event.location}.`);}
    if (event.participants.length > 0) {parts.push(`Teilnehmer: ${event.participants.join(', ')}.`);}
    return parts.join(' ');
  } catch (error) {
    logger.error('Tool create_calendar_event failed', error instanceof Error ? error : undefined);
    return `Fehler beim Erstellen des Kalender-Eintrags: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

export async function handleListCalendarEvents(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const start = input.start as string;
  const end = input.end as string;

  if (!start || !end) {
    return 'Fehler: Start- und Enddatum sind erforderlich.';
  }

  try {
    const events = await getCalendarEvents(execContext.aiContext, {
      start,
      end,
      event_type: input.event_type as 'appointment' | 'reminder' | 'deadline' | 'travel_block' | 'focus_time' | undefined,
    });

    if (events.length === 0) {
      return 'Keine Kalender-Eintraege in diesem Zeitraum gefunden.';
    }

    const lines = events.map(e => {
      const date = new Date(e.start_time).toLocaleString('de-DE', {
        weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      });
      const parts = [`- ${date}: ${e.title}`];
      if (e.location) {parts.push(`(${e.location})`);}
      if (e.event_type !== 'appointment') {parts.push(`[${e.event_type}]`);}
      return parts.join(' ');
    });

    return `${events.length} Kalender-Eintraege gefunden:\n${lines.join('\n')}`;
  } catch (error) {
    logger.error('Tool list_calendar_events failed', error instanceof Error ? error : undefined);
    return `Fehler beim Abrufen der Kalender-Eintraege: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

export async function handleDraftEmail(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const keyPoints = input.key_points as string[];
  if (!keyPoints || keyPoints.length === 0) {
    return 'Fehler: Mindestens ein Kernpunkt ist erforderlich.';
  }

  const recipient = (input.recipient as string) || '[Empfaenger]';
  const subject = (input.subject as string) || '';
  const tone = (input.tone as string) || 'formal';

  const greeting = tone === 'formal' ? 'Sehr geehrte/r' : (tone === 'friendly' ? 'Liebe/r' : 'Hallo');
  const closing = tone === 'formal' ? 'Mit freundlichen Gruessen' : (tone === 'friendly' ? 'Herzliche Gruesse' : 'Viele Gruesse');

  const body = keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n');

  const email = `An: ${recipient}
Betreff: ${subject || 'Kein Betreff'}

${greeting} ${recipient},

${body}

${closing}`;

  return `E-Mail-Entwurf erstellt:\n\n${email}\n\n---\nDu kannst den Entwurf kopieren und in deinem Mail-Programm verwenden.`;
}

export async function handleEstimateTravel(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const origin = input.origin as string;
  const destination = input.destination as string;

  if (!origin || !destination) {
    return 'Fehler: Start- und Zielort sind erforderlich.';
  }

  try {
    const mode = (input.mode as 'driving' | 'transit' | 'walking' | 'cycling') || 'driving';
    const estimate = await estimateTravelDuration(origin, destination, mode);

    const hours = Math.floor(estimate.duration_minutes / 60);
    const minutes = estimate.duration_minutes % 60;
    const durationStr = hours > 0 ? `${hours} Stunden ${minutes} Minuten` : `${minutes} Minuten`;
    const modeLabels: Record<string, string> = { driving: 'Auto', transit: 'OEPNV', walking: 'zu Fuss', cycling: 'Fahrrad' };

    return `Reisezeit-Schaetzung:\n- Von: ${estimate.origin}\n- Nach: ${estimate.destination}\n- Dauer: ${durationStr}\n- Entfernung: ${estimate.distance_km} km\n- Transportmittel: ${modeLabels[estimate.mode] || estimate.mode}\n- Quelle: ${estimate.source === 'openrouteservice' ? 'OpenRouteService' : 'Schaetzung'}`;
  } catch (error) {
    logger.error('Tool estimate_travel failed', error instanceof Error ? error : undefined);
    return `Fehler bei der Reisezeit-Schaetzung: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}
