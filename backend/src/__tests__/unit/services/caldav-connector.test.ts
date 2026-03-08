/**
 * Unit Tests for CalDAV Connector - Phase 40
 *
 * Tests iCal parsing, generation, and CalDAV operations.
 */

// Mock tsdav
const mockLogin = jest.fn().mockResolvedValue(undefined);
const mockFetchCalendars = jest.fn().mockResolvedValue([]);
const mockFetchCalendarObjects = jest.fn().mockResolvedValue([]);
const mockCreateCalendarObject = jest.fn().mockResolvedValue({ url: '/cal/event.ics', etag: '"etag-1"' });
const mockUpdateCalendarObject = jest.fn().mockResolvedValue({ etag: '"etag-2"' });
const mockDeleteCalendarObject = jest.fn().mockResolvedValue(undefined);
const mockSyncCalendars = jest.fn().mockResolvedValue([]);

jest.mock('tsdav', () => ({
  DAVClient: jest.fn().mockImplementation(() => ({
    login: mockLogin,
    fetchCalendars: mockFetchCalendars,
    fetchCalendarObjects: mockFetchCalendarObjects,
    createCalendarObject: mockCreateCalendarObject,
    updateCalendarObject: mockUpdateCalendarObject,
    deleteCalendarObject: mockDeleteCalendarObject,
    syncCalendars: mockSyncCalendars,
  })),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  createCalDAVClient,
  testConnection,
  discoverCalendars,
  fetchCalendarEvents,
  fetchChangedEvents,
  createRemoteEvent,
  updateRemoteEvent,
  deleteRemoteEvent,
  eventToICal,
  parseICal,
} from '../../../services/caldav-connector';

const testCredentials = {
  serverUrl: 'https://caldav.icloud.com',
  username: 'test@icloud.com',
  password: 'test-password',
};

describe('CalDAV Connector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogin.mockResolvedValue(undefined);
    mockFetchCalendars.mockResolvedValue([]);
  });

  // ============================================================
  // Connection & Client
  // ============================================================

  describe('createCalDAVClient', () => {
    it('creates a client and calls login', async () => {
      const client = await createCalDAVClient(testCredentials);
      expect(client).toBeDefined();
      expect(mockLogin).toHaveBeenCalledTimes(1);
    });

    it('throws if login fails', async () => {
      mockLogin.mockRejectedValueOnce(new Error('401 Unauthorized'));
      await expect(createCalDAVClient(testCredentials)).rejects.toThrow('401 Unauthorized');
    });
  });

  describe('testConnection', () => {
    it('returns success with calendars', async () => {
      mockFetchCalendars.mockResolvedValueOnce([
        { url: '/cal/1/', displayName: 'Work', ctag: 'ctag-1', syncToken: 'token-1' },
        { url: '/cal/2/', displayName: 'Personal', calendarColor: '#FF0000' },
      ]);

      const result = await testConnection(testCredentials);

      expect(result.success).toBe(true);
      expect(result.message).toContain('2 Kalender gefunden');
      expect(result.calendars).toHaveLength(2);
      expect(result.calendars![0].displayName).toBe('Work');
      expect(result.calendars![1].color).toBe('#FF0000');
    });

    it('returns failure on auth error', async () => {
      mockLogin.mockRejectedValueOnce(new Error('401 Unauthorized'));

      const result = await testConnection(testCredentials);

      expect(result.success).toBe(false);
      expect(result.message).toContain('App-spezifisches Passwort');
    });

    it('returns failure on generic connection error', async () => {
      mockLogin.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await testConnection(testCredentials);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Verbindungsfehler');
    });
  });

  describe('discoverCalendars', () => {
    it('returns mapped calendar list', async () => {
      mockFetchCalendars.mockResolvedValueOnce([
        { url: '/cal/home/', displayName: 'Home', description: 'My personal calendar' },
      ]);

      const calendars = await discoverCalendars(testCredentials);

      expect(calendars).toHaveLength(1);
      expect(calendars[0].url).toBe('/cal/home/');
      expect(calendars[0].displayName).toBe('Home');
      expect(calendars[0].description).toBe('My personal calendar');
    });

    it('uses default name for calendars without displayName', async () => {
      mockFetchCalendars.mockResolvedValueOnce([
        { url: '/cal/x/', displayName: undefined },
      ]);

      const calendars = await discoverCalendars(testCredentials);
      expect(calendars[0].displayName).toBe('Unbenannt');
    });

    it('handles displayName as Record (non-string)', async () => {
      mockFetchCalendars.mockResolvedValueOnce([
        { url: '/cal/x/', displayName: { _: 'SomeName' } },
      ]);

      const calendars = await discoverCalendars(testCredentials);
      expect(calendars[0].displayName).toBe('Unbenannt');
    });
  });

  // ============================================================
  // Event Fetching
  // ============================================================

  describe('fetchCalendarEvents', () => {
    it('fetches events from a specific calendar', async () => {
      mockFetchCalendars.mockResolvedValueOnce([
        { url: '/cal/work/' },
      ]);
      mockFetchCalendarObjects.mockResolvedValueOnce([
        {
          url: '/cal/work/event1.ics',
          etag: '"etag-1"',
          data: 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:uid-1\r\nSUMMARY:Meeting\r\nDTSTART:20260308T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR',
        },
      ]);

      const events = await fetchCalendarEvents(testCredentials, '/cal/work/');

      expect(events).toHaveLength(1);
      expect(events[0].uid).toBe('uid-1');
      expect(events[0].etag).toBe('"etag-1"');
    });

    it('throws if calendar not found', async () => {
      mockFetchCalendars.mockResolvedValueOnce([
        { url: '/cal/other/' },
      ]);

      await expect(fetchCalendarEvents(testCredentials, '/cal/missing/')).rejects.toThrow('Calendar not found');
    });

    it('filters out objects without data', async () => {
      mockFetchCalendars.mockResolvedValueOnce([{ url: '/cal/work/' }]);
      mockFetchCalendarObjects.mockResolvedValueOnce([
        { url: '/cal/work/event1.ics', etag: '"e1"', data: 'BEGIN:VCALENDAR\r\nUID:uid-1\r\nEND:VCALENDAR' },
        { url: '/cal/work/event2.ics', etag: '"e2"', data: '' },
        { url: '/cal/work/event3.ics', etag: '"e3"', data: null },
      ]);

      const events = await fetchCalendarEvents(testCredentials, '/cal/work/');
      expect(events).toHaveLength(1);
    });

    it('passes timeRange to fetchCalendarObjects', async () => {
      mockFetchCalendars.mockResolvedValueOnce([{ url: '/cal/work/' }]);
      mockFetchCalendarObjects.mockResolvedValueOnce([]);

      await fetchCalendarEvents(testCredentials, '/cal/work/', {
        start: '2026-03-01T00:00:00Z',
        end: '2026-03-31T23:59:59Z',
      });

      expect(mockFetchCalendarObjects).toHaveBeenCalledWith(
        expect.objectContaining({
          timeRange: { start: '2026-03-01T00:00:00Z', end: '2026-03-31T23:59:59Z' },
        })
      );
    });
  });

  describe('fetchChangedEvents', () => {
    it('falls back to full fetch without sync token', async () => {
      mockFetchCalendars.mockResolvedValueOnce([{ url: '/cal/work/', syncToken: 'new-token' }]);
      mockFetchCalendarObjects.mockResolvedValueOnce([
        { url: '/event.ics', etag: '"e1"', data: 'BEGIN:VCALENDAR\r\nUID:uid-1\r\nEND:VCALENDAR' },
      ]);

      const result = await fetchChangedEvents(testCredentials, '/cal/work/');

      expect(result.events).toHaveLength(1);
      expect(result.newSyncToken).toBe('new-token');
    });
  });

  // ============================================================
  // Remote Event Operations
  // ============================================================

  describe('createRemoteEvent', () => {
    it('creates an event on the remote calendar', async () => {
      mockFetchCalendars.mockResolvedValueOnce([{ url: '/cal/work/' }]);

      const result = await createRemoteEvent(
        testCredentials,
        '/cal/work/',
        'BEGIN:VCALENDAR\r\nEND:VCALENDAR',
        'event-123'
      );

      expect(mockCreateCalendarObject).toHaveBeenCalledWith({
        calendar: { url: '/cal/work/' },
        filename: 'event-123.ics',
        iCalString: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR',
      });
      expect(result.url).toBeDefined();
    });
  });

  describe('updateRemoteEvent', () => {
    it('updates an event on the remote server', async () => {
      const result = await updateRemoteEvent(
        testCredentials,
        '/cal/work/event.ics',
        'BEGIN:VCALENDAR\r\nEND:VCALENDAR',
        '"old-etag"'
      );

      expect(mockUpdateCalendarObject).toHaveBeenCalledWith({
        calendarObject: {
          url: '/cal/work/event.ics',
          data: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR',
          etag: '"old-etag"',
        },
      });
      expect(result.etag).toBeDefined();
    });
  });

  describe('deleteRemoteEvent', () => {
    it('deletes an event from the remote server', async () => {
      const result = await deleteRemoteEvent(
        testCredentials,
        '/cal/work/event.ics',
        '"etag-1"'
      );

      expect(result).toBe(true);
      expect(mockDeleteCalendarObject).toHaveBeenCalled();
    });

    it('returns false on failure', async () => {
      mockDeleteCalendarObject.mockRejectedValueOnce(new Error('404 Not Found'));

      const result = await deleteRemoteEvent(
        testCredentials,
        '/cal/work/event.ics',
        '"etag-1"'
      );

      expect(result).toBe(false);
    });
  });

  // ============================================================
  // iCal Parsing
  // ============================================================

  describe('parseICal', () => {
    it('parses a basic VEVENT', () => {
      const ical = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:uid-123',
        'SUMMARY:Team Meeting',
        'DTSTART:20260308T100000Z',
        'DTEND:20260308T110000Z',
        'DESCRIPTION:Weekly standup',
        'LOCATION:Room A',
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const event = parseICal(ical);

      expect(event).not.toBeNull();
      expect(event!.uid).toBe('uid-123');
      expect(event!.title).toBe('Team Meeting');
      expect(event!.description).toBe('Weekly standup');
      expect(event!.location).toBe('Room A');
      expect(event!.status).toBe('confirmed');
      expect(event!.all_day).toBe(false);
      expect(event!.start_time).toContain('2026-03-08');
      expect(event!.end_time).toContain('2026-03-08');
    });

    it('parses an all-day event', () => {
      const ical = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:uid-allday',
        'SUMMARY:Holiday',
        'DTSTART;VALUE=DATE:20260310',
        'DTEND;VALUE=DATE:20260311',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const event = parseICal(ical);

      expect(event).not.toBeNull();
      expect(event!.all_day).toBe(true);
      expect(event!.title).toBe('Holiday');
    });

    it('parses event with RRULE', () => {
      const ical = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:uid-recurring',
        'SUMMARY:Daily Standup',
        'DTSTART:20260308T090000Z',
        'RRULE:FREQ=DAILY;COUNT=5',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const event = parseICal(ical);

      expect(event).not.toBeNull();
      expect(event!.rrule).toBe('FREQ=DAILY;COUNT=5');
    });

    it('returns null for invalid iCal (no UID)', () => {
      const ical = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:NoUID\r\nEND:VEVENT\r\nEND:VCALENDAR';
      expect(parseICal(ical)).toBeNull();
    });

    it('returns null for invalid iCal (no SUMMARY)', () => {
      const ical = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:uid-1\r\nEND:VEVENT\r\nEND:VCALENDAR';
      expect(parseICal(ical)).toBeNull();
    });

    it('handles escaped characters', () => {
      const ical = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:uid-esc',
        'SUMMARY:Meeting\\, important',
        'DESCRIPTION:Line 1\\nLine 2',
        'DTSTART:20260308T100000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const event = parseICal(ical);
      expect(event!.title).toBe('Meeting, important');
      expect(event!.description).toBe('Line 1\nLine 2');
    });

    it('handles tentative and cancelled status', () => {
      const tentative = parseICal(
        'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:t1\r\nSUMMARY:Maybe\r\nDTSTART:20260308T100000Z\r\nSTATUS:TENTATIVE\r\nEND:VEVENT\r\nEND:VCALENDAR'
      );
      expect(tentative!.status).toBe('tentative');

      const cancelled = parseICal(
        'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:c1\r\nSUMMARY:Nope\r\nDTSTART:20260308T100000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR'
      );
      expect(cancelled!.status).toBe('cancelled');
    });
  });

  // ============================================================
  // iCal Generation
  // ============================================================

  describe('eventToICal', () => {
    it('generates a valid VCALENDAR with VEVENT', () => {
      const ical = eventToICal({
        id: 'event-abc',
        title: 'Team Meeting',
        description: 'Weekly sync',
        start_time: '2026-03-08T10:00:00.000Z',
        end_time: '2026-03-08T11:00:00.000Z',
        location: 'Room A',
        status: 'confirmed',
      });

      expect(ical).toContain('BEGIN:VCALENDAR');
      expect(ical).toContain('END:VCALENDAR');
      expect(ical).toContain('BEGIN:VEVENT');
      expect(ical).toContain('UID:event-abc');
      expect(ical).toContain('SUMMARY:Team Meeting');
      expect(ical).toContain('DESCRIPTION:Weekly sync');
      expect(ical).toContain('LOCATION:Room A');
      expect(ical).toContain('STATUS:CONFIRMED');
      expect(ical).toContain('DTSTART:');
      expect(ical).toContain('DTEND:');
    });

    it('generates all-day event format', () => {
      const ical = eventToICal({
        id: 'allday-1',
        title: 'Holiday',
        start_time: '2026-03-10T00:00:00.000Z',
        end_time: '2026-03-11T00:00:00.000Z',
        all_day: true,
      });

      expect(ical).toContain('DTSTART;VALUE=DATE:20260310');
      expect(ical).toContain('DTEND;VALUE=DATE:20260311');
    });

    it('includes RRULE when provided', () => {
      const ical = eventToICal({
        id: 'rec-1',
        title: 'Daily Standup',
        start_time: '2026-03-08T09:00:00.000Z',
        rrule: 'FREQ=DAILY;COUNT=5',
      });

      expect(ical).toContain('RRULE:FREQ=DAILY;COUNT=5');
    });

    it('escapes special characters in text fields', () => {
      const ical = eventToICal({
        id: 'esc-1',
        title: 'Meeting, important; urgent',
        description: 'Line 1\nLine 2',
        start_time: '2026-03-08T10:00:00.000Z',
      });

      expect(ical).toContain('SUMMARY:Meeting\\, important\\; urgent');
      expect(ical).toContain('DESCRIPTION:Line 1\\nLine 2');
    });

    it('handles event without optional fields', () => {
      const ical = eventToICal({
        id: 'min-1',
        title: 'Quick Chat',
        start_time: '2026-03-08T10:00:00.000Z',
      });

      expect(ical).toContain('UID:min-1');
      expect(ical).toContain('SUMMARY:Quick Chat');
      expect(ical).not.toContain('DESCRIPTION:');
      expect(ical).not.toContain('LOCATION:');
      expect(ical).not.toContain('RRULE:');
    });

    it('maps status values correctly', () => {
      const tentative = eventToICal({
        id: 't1', title: 'Maybe', start_time: '2026-03-08T10:00:00.000Z', status: 'tentative',
      });
      expect(tentative).toContain('STATUS:TENTATIVE');

      const cancelled = eventToICal({
        id: 'c1', title: 'Nope', start_time: '2026-03-08T10:00:00.000Z', status: 'cancelled',
      });
      expect(cancelled).toContain('STATUS:CANCELLED');
    });
  });

  // ============================================================
  // Roundtrip
  // ============================================================

  describe('eventToICal → parseICal roundtrip', () => {
    it('preserves event data through serialization/deserialization', () => {
      const original = {
        id: 'roundtrip-1',
        title: 'Roundtrip Test',
        description: 'Testing serialization',
        start_time: '2026-03-08T10:00:00.000Z',
        end_time: '2026-03-08T11:30:00.000Z',
        location: 'Berlin',
        status: 'confirmed' as const,
      };

      const ical = eventToICal(original);
      const parsed = parseICal(ical);

      expect(parsed).not.toBeNull();
      expect(parsed!.uid).toBe(original.id);
      expect(parsed!.title).toBe(original.title);
      expect(parsed!.description).toBe(original.description);
      expect(parsed!.location).toBe(original.location);
      expect(parsed!.status).toBe(original.status);
      expect(parsed!.all_day).toBe(false);
    });
  });
});
