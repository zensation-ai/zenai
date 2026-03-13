/**
 * CalDAV Connector - Phase 40
 *
 * Connects to iCloud (and other CalDAV servers) via tsdav.
 * Supports calendar discovery, event fetch, create, update, delete.
 */

import { DAVClient, getBasicAuthHeaders, type DAVCalendar, type DAVObject } from 'tsdav';
import { logger } from '../utils/logger';

export interface CalDAVCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

export interface CalDAVCalendarInfo {
  url: string;
  displayName: string;
  ctag?: string;
  syncToken?: string;
  color?: string;
  description?: string;
}

export interface CalDAVEventData {
  url: string;
  etag: string;
  data: string; // Raw iCal data
  uid?: string;
}

/**
 * Create a CalDAV client for iCloud or other CalDAV servers
 */
export async function createCalDAVClient(credentials: CalDAVCredentials): Promise<DAVClient> {
  // Use Custom auth to set explicit Accept-Language header.
  // Apple iCloud servers reject the default "Accept-Language: *" that tsdav sends,
  // returning 500 instead of PROPFIND response → "cannot find homeUrl" error.
  const client = new DAVClient({
    serverUrl: credentials.serverUrl,
    credentials: {
      username: credentials.username,
      password: credentials.password,
    },
    authMethod: 'Custom',
    authFunction: async (creds) => ({
      ...getBasicAuthHeaders(creds),
      'accept-language': 'en-US,en;q=0.9',
    }),
    defaultAccountType: 'caldav',
  });

  await client.login();

  logger.info('CalDAV client created', {
    serverUrl: credentials.serverUrl,
    username: credentials.username,
    operation: 'createCalDAVClient',
  });

  return client;
}

/**
 * Test CalDAV connection
 */
export async function testConnection(credentials: CalDAVCredentials): Promise<{
  success: boolean;
  message: string;
  calendars?: CalDAVCalendarInfo[];
}> {
  try {
    const client = await createCalDAVClient(credentials);
    const calendars = await client.fetchCalendars();

    const calendarInfos: CalDAVCalendarInfo[] = calendars.map(mapCalendar);

    logger.info('CalDAV connection test successful', {
      serverUrl: credentials.serverUrl,
      calendarCount: calendarInfos.length,
      operation: 'testConnection',
    });

    return {
      success: true,
      message: `Verbunden. ${calendarInfos.length} Kalender gefunden.`,
      calendars: calendarInfos,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('CalDAV connection test failed', {
      serverUrl: credentials.serverUrl,
      error: message,
      operation: 'testConnection',
    });

    return {
      success: false,
      message: message.includes('401')
        ? 'Authentifizierung fehlgeschlagen. Bitte App-spezifisches Passwort prüfen.'
        : `Verbindungsfehler: ${message}`,
    };
  }
}

/**
 * Discover available calendars
 */
export async function discoverCalendars(
  credentials: CalDAVCredentials
): Promise<CalDAVCalendarInfo[]> {
  const client = await createCalDAVClient(credentials);
  const calendars = await client.fetchCalendars();
  return calendars.map(mapCalendar);
}

/**
 * Fetch all events from a specific calendar
 */
export async function fetchCalendarEvents(
  credentials: CalDAVCredentials,
  calendarUrl: string,
  timeRange?: { start: string; end: string }
): Promise<CalDAVEventData[]> {
  const client = await createCalDAVClient(credentials);
  const calendars = await client.fetchCalendars();
  const calendar = calendars.find(c => c.url === calendarUrl);

  if (!calendar) {
    throw new Error(`Calendar not found: ${calendarUrl}`);
  }

  const fetchParams: Parameters<typeof client.fetchCalendarObjects>[0] = {
    calendar,
  };

  if (timeRange) {
    fetchParams.timeRange = {
      start: timeRange.start,
      end: timeRange.end,
    };
  }

  const objects = await client.fetchCalendarObjects(fetchParams);

  return objects
    .filter((obj): obj is DAVObject & { data: string; etag: string } =>
      typeof obj.data === 'string' && obj.data.length > 0
    )
    .map(obj => ({
      url: obj.url,
      etag: obj.etag || '',
      data: obj.data,
      uid: extractUIDFromICal(obj.data),
    }));
}

/**
 * Fetch events that changed since last sync (using sync token or ctag)
 */
export async function fetchChangedEvents(
  credentials: CalDAVCredentials,
  calendarUrl: string,
  syncToken?: string
): Promise<{ events: CalDAVEventData[]; newSyncToken?: string }> {
  const client = await createCalDAVClient(credentials);
  const calendars = await client.fetchCalendars();
  const calendar = calendars.find(c => c.url === calendarUrl);

  if (!calendar) {
    throw new Error(`Calendar not found: ${calendarUrl}`);
  }

  // If we have a sync token, use sync-collection
  if (syncToken) {
    try {
      const syncResult = await (client.syncCalendars as Function)({
        oldCalendars: [calendar],
        detailedResult: true,
      }) as { created: DAVCalendar[]; updated: DAVCalendar[]; deleted: DAVCalendar[] };

      const events: CalDAVEventData[] = [];
      const syncedCalendars = (syncResult as { calendars?: DAVCalendar[] })?.calendars || [];
      for (const cal of syncedCalendars) {
        if (cal.url === calendarUrl && cal.objects) {
          for (const obj of cal.objects) {
            if (typeof obj.data === 'string' && obj.data.length > 0) {
              events.push({
                url: obj.url,
                etag: obj.etag || '',
                data: obj.data,
                uid: extractUIDFromICal(obj.data),
              });
            }
          }
        }
      }

      return {
        events,
        newSyncToken: calendar.syncToken || undefined,
      };
    } catch {
      logger.warn('Sync token fetch failed, falling back to full fetch', { calendarUrl });
    }
  }

  // Full fetch fallback
  const objects = await client.fetchCalendarObjects({ calendar });
  const events = objects
    .filter((obj): obj is DAVObject & { data: string } =>
      typeof obj.data === 'string' && obj.data.length > 0
    )
    .map(obj => ({
      url: obj.url,
      etag: obj.etag || '',
      data: obj.data,
      uid: extractUIDFromICal(obj.data),
    }));

  return {
    events,
    newSyncToken: calendar.syncToken || undefined,
  };
}

/**
 * Create an event on the CalDAV server
 */
export async function createRemoteEvent(
  credentials: CalDAVCredentials,
  calendarUrl: string,
  icalData: string,
  filename: string
): Promise<{ url: string; etag: string }> {
  const client = await createCalDAVClient(credentials);
  const calendars = await client.fetchCalendars();
  const calendar = calendars.find(c => c.url === calendarUrl);

  if (!calendar) {
    throw new Error(`Calendar not found: ${calendarUrl}`);
  }

  const result = await client.createCalendarObject({
    calendar,
    filename: `${filename}.ics`,
    iCalString: icalData,
  });

  return {
    url: typeof result === 'object' && result && 'url' in result ? (result as { url: string }).url : `${calendarUrl}${filename}.ics`,
    etag: typeof result === 'object' && result && 'etag' in result ? (result as { etag: string }).etag : '',
  };
}

/**
 * Update an event on the CalDAV server
 */
export async function updateRemoteEvent(
  credentials: CalDAVCredentials,
  eventUrl: string,
  icalData: string,
  etag: string
): Promise<{ etag: string }> {
  const client = await createCalDAVClient(credentials);

  const result = await client.updateCalendarObject({
    calendarObject: {
      url: eventUrl,
      data: icalData,
      etag,
    },
  });

  return {
    etag: typeof result === 'object' && result && 'etag' in result ? (result as { etag: string }).etag : '',
  };
}

/**
 * Delete an event on the CalDAV server
 */
export async function deleteRemoteEvent(
  credentials: CalDAVCredentials,
  eventUrl: string,
  etag: string
): Promise<boolean> {
  try {
    const client = await createCalDAVClient(credentials);

    await client.deleteCalendarObject({
      calendarObject: {
        url: eventUrl,
        etag,
      },
    });

    return true;
  } catch (err) {
    logger.warn('Failed to delete remote event', {
      eventUrl,
      error: err instanceof Error ? err.message : String(err),
      operation: 'deleteRemoteEvent',
    });
    return false;
  }
}

// ============================================================
// iCal Helpers
// ============================================================

/**
 * Extract UID from iCal data
 */
function extractUIDFromICal(ical: string): string | undefined {
  const match = ical.match(/UID:(.+)/);
  return match ? match[1].trim() : undefined;
}

/**
 * Map tsdav calendar to our simplified type
 */
function mapCalendar(cal: DAVCalendar): CalDAVCalendarInfo {
  return {
    url: cal.url,
    displayName: (typeof cal.displayName === 'string' ? cal.displayName : undefined) || 'Unbenannt',
    ctag: cal.ctag || undefined,
    syncToken: cal.syncToken || undefined,
    color: cal.calendarColor || extractColorFromProps(cal),
    description: typeof cal.description === 'string' ? cal.description : undefined,
  };
}

/**
 * Extract color from CalDAV calendar properties
 */
function extractColorFromProps(cal: DAVCalendar): string | undefined {
  // Check projectedProps for color info from CalDAV PROPFIND
  const projected = cal.projectedProps;
  if (projected && typeof projected === 'object') {
    if (typeof projected['calendar-color'] === 'string') {
      return projected['calendar-color'];
    }
    if (typeof projected.calendarColor === 'string') {
      return projected.calendarColor;
    }
  }
  return undefined;
}

/**
 * Convert a ZenAI CalendarEvent to iCal format
 */
export function eventToICal(event: {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  all_day?: boolean;
  location?: string;
  status?: string;
  rrule?: string;
}): string {
  const uid = event.id;
  const now = formatICalDate(new Date());
  const dtStart = event.all_day
    ? formatICalDateOnly(new Date(event.start_time))
    : formatICalDate(new Date(event.start_time));
  const dtEnd = event.end_time
    ? (event.all_day
        ? formatICalDateOnly(new Date(event.end_time))
        : formatICalDate(new Date(event.end_time)))
    : undefined;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ZenAI//Calendar//DE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
  ];

  if (event.all_day) {
    lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
    if (dtEnd) {lines.push(`DTEND;VALUE=DATE:${dtEnd}`);}
  } else {
    lines.push(`DTSTART:${dtStart}`);
    if (dtEnd) {lines.push(`DTEND:${dtEnd}`);}
  }

  lines.push(`SUMMARY:${escapeICal(event.title)}`);

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICal(event.description)}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeICal(event.location)}`);
  }
  if (event.status) {
    const statusMap: Record<string, string> = {
      confirmed: 'CONFIRMED',
      tentative: 'TENTATIVE',
      cancelled: 'CANCELLED',
    };
    lines.push(`STATUS:${statusMap[event.status] || 'CONFIRMED'}`);
  }
  if (event.rrule) {
    lines.push(`RRULE:${event.rrule}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Parse iCal data into a simplified event object
 */
export function parseICal(icalData: string): {
  uid: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  all_day: boolean;
  location?: string;
  status?: string;
  rrule?: string;
} | null {
  try {
    const uid = extractField(icalData, 'UID');
    const summary = extractField(icalData, 'SUMMARY');
    if (!uid || !summary) {return null;}

    const dtStartRaw = extractField(icalData, 'DTSTART');
    const dtEndRaw = extractField(icalData, 'DTEND');
    const description = extractField(icalData, 'DESCRIPTION');
    const location = extractField(icalData, 'LOCATION');
    const status = extractField(icalData, 'STATUS');
    const rrule = extractField(icalData, 'RRULE');

    // Check for all-day events
    const allDay = icalData.includes('DTSTART;VALUE=DATE:') || (dtStartRaw?.length === 8);

    const startTime = dtStartRaw ? parseICalDate(dtStartRaw, allDay) : null;
    const endTime = dtEndRaw ? parseICalDate(dtEndRaw, allDay) : null;

    if (!startTime) {return null;}

    const statusMap: Record<string, string> = {
      CONFIRMED: 'confirmed',
      TENTATIVE: 'tentative',
      CANCELLED: 'cancelled',
    };

    return {
      uid,
      title: unescapeICal(summary),
      description: description ? unescapeICal(description) : undefined,
      start_time: startTime,
      end_time: endTime || undefined,
      all_day: allDay,
      location: location ? unescapeICal(location) : undefined,
      status: status ? statusMap[status.toUpperCase()] || 'confirmed' : 'confirmed',
      rrule: rrule || undefined,
    };
  } catch (err) {
    logger.warn('Failed to parse iCal data', {
      error: err instanceof Error ? err.message : String(err),
      dataPreview: icalData.substring(0, 200),
    });
    return null;
  }
}

function extractField(ical: string, field: string): string | null {
  // Match the field line including any continuation lines (folded lines start with space/tab)
  // eslint-disable-next-line security/detect-non-literal-regexp -- field is hardcoded iCal field name, not user input
  const foldRegex = new RegExp(`^${field}[;:][^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*`, 'm');
  const foldMatch = ical.match(foldRegex);
  if (!foldMatch) {return null;}

  // Unfold continuation lines
  const line = foldMatch[0].replace(/\r?\n[ \t]/g, '');

  // Strip the field name and get everything after the first colon
  // e.g. "DTSTART;VALUE=DATE:20260308" -> "VALUE=DATE:20260308"
  // e.g. "UID:some-uid" -> "some-uid"
  const firstColon = line.indexOf(':');
  if (firstColon === -1) {return null;}

  let value: string;
  // Check if there are parameters (semicolon before the first colon)
  const semiIdx = line.indexOf(';');
  if (semiIdx !== -1 && semiIdx < firstColon && field !== 'RRULE') {
    // Has parameters - value is after the last colon in the params section
    // e.g. "DTSTART;VALUE=DATE:20260308" -> "20260308"
    value = line.substring(firstColon + 1);
  } else {
    // No parameters - value is everything after "FIELD:"
    value = line.substring(field.length + 1);
  }

  return value.trim();
}

function parseICalDate(raw: string, allDay: boolean): string | null {
  if (!raw) {return null;}

  if (allDay && raw.length === 8) {
    // YYYYMMDD
    const y = raw.substring(0, 4);
    const m = raw.substring(4, 6);
    const d = raw.substring(6, 8);
    return `${y}-${m}-${d}T00:00:00.000Z`;
  }

  // Full datetime: 20260308T143000Z or 20260308T143000
  const cleaned = raw.replace(/[^0-9TZ]/g, '');
  if (cleaned.length >= 15) {
    const y = cleaned.substring(0, 4);
    const m = cleaned.substring(4, 6);
    const d = cleaned.substring(6, 8);
    const h = cleaned.substring(9, 11);
    const min = cleaned.substring(11, 13);
    const s = cleaned.substring(13, 15);
    const isUtc = cleaned.endsWith('Z');
    return `${y}-${m}-${d}T${h}:${min}:${s}.000${isUtc ? 'Z' : ''}`;
  }

  return null;
}

function formatICalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function formatICalDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function escapeICal(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function unescapeICal(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}
