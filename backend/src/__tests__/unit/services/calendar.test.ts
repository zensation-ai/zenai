/**
 * Unit Tests for Calendar Service - Phase 35
 *
 * Tests CRUD operations, recurring event expansion, and reminders.
 */

// Mock database context
var mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: any[]) => mockQueryContext(...args),
  isValidContext: jest.fn((ctx: string) => ['operations', 'finance', 'people', 'strategy'].includes(ctx)),
  AIContext: {},
}));

// Mock embedding/ollama
jest.mock('../../../utils/ollama', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../utils/embedding', () => ({
  formatForPgVector: jest.fn().mockReturnValue('[0.1,0.2]'),
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

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-1234'),
}));

// Mock episodic memory bridge (Stufe 7.1)
var mockEpisodicStore = jest.fn<any, any[]>();
jest.mock('../../../services/memory/episodic-memory', () => ({
  episodicMemory: { store: (...args: any[]) => mockEpisodicStore(...args) },
}));

var mockEmitSystemEvent = jest.fn<any, any[]>();
jest.mock('../../../services/event-system', () => ({
  emitSystemEvent: (...args: any[]) => mockEmitSystemEvent(...args),
}));

import {
  createCalendarEvent,
  getCalendarEvents,
  getCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getUpcomingEvents,
  searchCalendarEvents,
  expandRecurringEvent,
  getPendingReminders,
  markReminderSent,
} from '../../../services/calendar';

describe('Calendar Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    mockEpisodicStore.mockReset();
    mockEmitSystemEvent.mockReset();
    mockEpisodicStore.mockResolvedValue({ id: 'ep-1' });
    mockEmitSystemEvent.mockResolvedValue('evt-1');
  });

  const mockEventRow = {
    id: 'event-1',
    title: 'Team Meeting',
    description: 'Weekly standup',
    event_type: 'appointment',
    start_time: new Date('2026-02-15T10:00:00Z'),
    end_time: new Date('2026-02-15T11:00:00Z'),
    all_day: false,
    location: 'Room A',
    participants: '["Alice","Bob"]',
    rrule: null,
    recurrence_parent_id: null,
    recurrence_exception: false,
    source_idea_id: null,
    source_voice_memo_id: null,
    travel_duration_minutes: null,
    travel_origin: null,
    travel_destination: null,
    status: 'confirmed',
    color: null,
    context: 'finance',
    reminder_minutes: '[15]',
    notes: null,
    metadata: '{}',
    ai_generated: false,
    ai_confidence: null,
    created_at: new Date('2026-02-14T08:00:00Z'),
    updated_at: new Date('2026-02-14T08:00:00Z'),
  };

  describe('createCalendarEvent', () => {
    it('should create an event and return mapped result', async () => {
      // INSERT for event + INSERT for reminder
      mockQueryContext
        .mockResolvedValueOnce({ rows: [mockEventRow] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const result = await createCalendarEvent('finance', {
        title: 'Team Meeting',
        start_time: '2026-02-15T10:00:00Z',
        end_time: '2026-02-15T11:00:00Z',
        location: 'Room A',
        participants: ['Alice', 'Bob'],
      });

      expect(result.id).toBe('event-1');
      expect(result.title).toBe('Team Meeting');
      expect(result.participants).toEqual(['Alice', 'Bob']);
      expect(result.location).toBe('Room A');
      expect(mockQueryContext).toHaveBeenCalledWith('finance', expect.stringContaining('INSERT INTO calendar_events'), expect.any(Array));
    });

    it('should use default values for optional fields', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ ...mockEventRow, participants: '[]', reminder_minutes: '[15]' }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const result = await createCalendarEvent('operations', {
        title: 'Quick Note',
        start_time: '2026-02-15T10:00:00Z',
      });

      expect(result.event_type).toBe('appointment');
      expect(result.status).toBe('confirmed');
    });

    it('should handle ai_generated flag', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ ...mockEventRow, ai_generated: true, ai_confidence: 0.85 }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const result = await createCalendarEvent('operations', {
        title: 'AI-Created Event',
        start_time: '2026-02-15T10:00:00Z',
        ai_generated: true,
        ai_confidence: 0.85,
      });

      expect(result.ai_generated).toBe(true);
      expect(result.ai_confidence).toBe(0.85);
    });
  });

  describe('getCalendarEvents', () => {
    it('should return events filtered by date range', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockEventRow] } as any);

      const result = await getCalendarEvents('finance', {
        start: '2026-02-01T00:00:00Z',
        end: '2026-02-28T23:59:59Z',
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Team Meeting');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'finance',
        expect.stringContaining('start_time >='),
        expect.any(Array)
      );
    });

    it('should filter by event_type', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await getCalendarEvents('operations', {
        event_type: 'reminder',
      });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining("event_type = "),
        expect.arrayContaining(['reminder'])
      );
    });

    it('should respect limit and offset', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await getCalendarEvents('operations', { limit: 50, offset: 10 });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.any(String),
        expect.arrayContaining([50, 10])
      );
    });

    it('should cap limit at 500', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await getCalendarEvents('operations', { limit: 1000 });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.any(String),
        expect.arrayContaining([500])
      );
    });
  });

  describe('getCalendarEvent', () => {
    it('should return single event by id', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockEventRow] } as any);

      const result = await getCalendarEvent('finance', 'event-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('event-1');
    });

    it('should return null for non-existent event', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await getCalendarEvent('finance', 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateCalendarEvent', () => {
    it('should update specified fields', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...mockEventRow, title: 'Updated Title' }] } as any);

      const result = await updateCalendarEvent('finance', 'event-1', {
        title: 'Updated Title',
      });

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Updated Title');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'finance',
        expect.stringContaining('UPDATE calendar_events'),
        expect.any(Array)
      );
    });

    it('should return null when no fields to update', async () => {
      const result = await updateCalendarEvent('finance', 'event-1', {});

      expect(result).toBeNull();
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('should return null for non-existent event', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await updateCalendarEvent('finance', 'non-existent', { title: 'New' });

      expect(result).toBeNull();
    });

    it('should regenerate reminders when start_time changes', async () => {
      // UPDATE + DELETE old reminders + INSERT new reminder
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ ...mockEventRow, start_time: new Date('2026-03-01T10:00:00Z') }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await updateCalendarEvent('finance', 'event-1', {
        start_time: '2026-03-01T10:00:00Z',
      });

      // Should have: UPDATE + DELETE reminders = 2 calls (no INSERT because mock event has no reminder_minutes)
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteCalendarEvent', () => {
    it('should soft-delete by setting status to cancelled', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }] } as any) // UPDATE
        .mockResolvedValueOnce({ rows: [] } as any); // Mark reminders

      const result = await deleteCalendarEvent('finance', 'event-1');

      expect(result).toBe(true);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'finance',
        expect.stringContaining("status = 'cancelled'"),
        ['event-1']
      );
    });

    it('should return false for non-existent event', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await deleteCalendarEvent('finance', 'non-existent');

      expect(result).toBe(false);
    });
  });

  describe('getUpcomingEvents', () => {
    it('should return events within time window', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockEventRow] } as any);

      const result = await getUpcomingEvents('operations', 48);

      expect(result).toHaveLength(1);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('start_time >='),
        expect.any(Array)
      );
    });

    it('should default to 24 hours', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await getUpcomingEvents('operations');

      expect(mockQueryContext).toHaveBeenCalled();
    });
  });

  describe('searchCalendarEvents', () => {
    it('should fall back to text search when embedding fails', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockEventRow] } as any);

      const result = await searchCalendarEvents('finance', 'meeting');

      expect(result).toHaveLength(1);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'finance',
        expect.stringContaining('ILIKE'),
        expect.arrayContaining(['%meeting%'])
      );
    });
  });

  describe('expandRecurringEvent', () => {
    it('should return single event if no rrule', () => {
      const event = {
        id: 'e1',
        title: 'Single',
        start_time: '2026-02-15T10:00:00Z',
        end_time: '2026-02-15T11:00:00Z',
        rrule: undefined,
      } as any;

      const result = expandRecurringEvent(event, new Date('2026-02-01'), new Date('2026-02-28'));

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('e1');
    });

    it('should expand weekly recurring events', () => {
      const event = {
        id: 'e1',
        title: 'Weekly Standup',
        start_time: '2026-02-02T09:00:00Z',
        end_time: '2026-02-02T09:30:00Z',
        rrule: 'DTSTART:20260202T090000Z\nRRULE:FREQ=WEEKLY;COUNT=10',
      } as any;

      const result = expandRecurringEvent(
        event,
        new Date('2026-02-01T00:00:00Z'),
        new Date('2026-02-28T23:59:59Z')
      );

      expect(result.length).toBeGreaterThan(1);
      result.forEach((instance, idx) => {
        expect(instance.id).toBe(`e1_${idx}`);
        expect(instance.recurrence_parent_id).toBe('e1');
      });
    });

    it('should handle invalid rrule gracefully', () => {
      const event = {
        id: 'e1',
        title: 'Bad Rule',
        start_time: '2026-02-15T10:00:00Z',
        rrule: 'INVALID_RRULE',
      } as any;

      const result = expandRecurringEvent(event, new Date('2026-02-01'), new Date('2026-02-28'));

      // Should return original event as fallback
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('e1');
    });
  });

  describe('getPendingReminders', () => {
    it('should return unsent reminders', async () => {
      const mockReminder = {
        id: 'rem-1',
        event_id: 'event-1',
        remind_at: new Date().toISOString(),
        type: 'push',
        sent: false,
        sent_at: null,
        context: 'operations',
        created_at: new Date().toISOString(),
        event_title: 'Meeting',
        event_start_time: new Date().toISOString(),
      };
      mockQueryContext.mockResolvedValueOnce({ rows: [mockReminder] } as any);

      const result = await getPendingReminders('operations');

      expect(result).toHaveLength(1);
      expect(result[0].event_title).toBe('Meeting');
    });
  });

  describe('markReminderSent', () => {
    it('should mark reminder as sent', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await markReminderSent('operations', 'rem-1');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('SET sent = TRUE'),
        ['rem-1']
      );
    });
  });

  // ========================================
  // Episodic Memory Bridge (Stufe 7.1)
  // ========================================
  describe('episodic memory bridge', () => {
    const mockEventRow = {
      id: 'test-uuid-1234',
      title: 'Team Planning Meeting',
      description: 'Wöchentliches Team Planning',
      event_type: 'appointment',
      start_time: '2026-04-14T09:00:00Z',
      end_time: '2026-04-14T10:00:00Z',
      all_day: false,
      location: 'Zoom',
      participants: JSON.stringify(['Max Mustermann', 'Anna Schmidt']),
      rrule: null,
      source_idea_id: null,
      source_voice_memo_id: null,
      travel_duration_minutes: null,
      travel_origin: null,
      travel_destination: null,
      status: 'confirmed',
      color: null,
      context: 'finance',
      reminder_minutes: JSON.stringify([15]),
      notes: null,
      metadata: JSON.stringify({}),
      ai_generated: false,
      ai_confidence: null,
      embedding: null,
      created_at: '2026-04-07T00:00:00Z',
      updated_at: '2026-04-07T00:00:00Z',
      user_id: null,
      meeting_id: null,
    };

    it('should store calendar event as episodic memory', async () => {
      // INSERT event + INSERT reminders
      mockQueryContext
        .mockResolvedValueOnce({ rows: [mockEventRow] } as any) // INSERT event
        .mockResolvedValue({ rows: [] } as any); // reminders

      await createCalendarEvent('finance', {
        title: 'Team Planning Meeting',
        description: 'Wöchentliches Team Planning',
        start_time: '2026-04-14T09:00:00Z',
        end_time: '2026-04-14T10:00:00Z',
        location: 'Zoom',
        participants: ['Max Mustermann', 'Anna Schmidt'],
      });

      // Wait for async bridge to execute
      await new Promise(r => setTimeout(r, 50));

      expect(mockEpisodicStore).toHaveBeenCalled();
      const [trigger, response, sessionId, context] = mockEpisodicStore.mock.calls[0];
      expect(trigger).toContain('Team Planning Meeting');
      expect(trigger).toContain('Zoom');
      expect(response).toContain('Max Mustermann');
      expect(response).toContain('Anna Schmidt');
      expect(sessionId).toContain('calendar-');
      expect(context).toBe('finance');
    });

    it('should not fail event creation when episodic bridge fails', async () => {
      mockEpisodicStore.mockRejectedValue(new Error('Memory unavailable'));

      mockQueryContext
        .mockResolvedValueOnce({ rows: [mockEventRow] } as any)
        .mockResolvedValue({ rows: [] } as any);

      const event = await createCalendarEvent('finance', {
        title: 'Team Planning Meeting',
        start_time: '2026-04-14T09:00:00Z',
      });

      // Event should be created despite memory bridge failure
      expect(event).toBeDefined();
      expect(event.title).toBe('Team Planning Meeting');
    });
  });
});
