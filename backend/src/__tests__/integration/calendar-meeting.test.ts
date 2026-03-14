/**
 * Integration Tests for Calendar Meeting-Link Endpoints - Phase 37
 *
 * Tests the new meeting-related calendar endpoints:
 * - POST /api/:context/calendar/events/:id/start-meeting
 * - GET /api/:context/calendar/events/:id/meeting
 * - POST /api/:context/calendar/events/:id/meeting/notes
 */

import express, { Express } from 'express';
import request from 'supertest';
import { calendarRouter } from '../../routes/calendar';

// Mock calendar service
jest.mock('../../services/calendar', () => ({
  createCalendarEvent: jest.fn(),
  getCalendarEvents: jest.fn(),
  getCalendarEvent: jest.fn(),
  updateCalendarEvent: jest.fn(),
  deleteCalendarEvent: jest.fn(),
  getUpcomingEvents: jest.fn(),
  searchCalendarEvents: jest.fn(),
  linkMeetingToEvent: jest.fn(),
  getEventMeetingId: jest.fn(),
}));

// Mock meetings service
jest.mock('../../services/meetings', () => ({
  createMeeting: jest.fn(),
  getMeeting: jest.fn(),
  getMeetingNotes: jest.fn(),
  processMeetingNotes: jest.fn(),
}));

jest.mock('../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((req: any, _res: any, next: any) => {
    req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  getCalendarEvent,
  linkMeetingToEvent,
  getEventMeetingId,
} from '../../services/calendar';
import { createMeeting, getMeeting, getMeetingNotes, processMeetingNotes } from '../../services/meetings';
import { errorHandler } from '../../middleware/errorHandler';

var mockGetCalendarEvent = getCalendarEvent as jest.MockedFunction<typeof getCalendarEvent>;
var mockLinkMeetingToEvent = linkMeetingToEvent as jest.MockedFunction<typeof linkMeetingToEvent>;
var mockGetEventMeetingId = getEventMeetingId as jest.MockedFunction<typeof getEventMeetingId>;
var mockCreateMeeting = createMeeting as jest.MockedFunction<typeof createMeeting>;
var mockGetMeeting = getMeeting as jest.MockedFunction<typeof getMeeting>;
var mockGetMeetingNotes = getMeetingNotes as jest.MockedFunction<typeof getMeetingNotes>;
var mockProcessMeetingNotes = processMeetingNotes as jest.MockedFunction<typeof processMeetingNotes>;

const UUID_EVENT = '550e8400-e29b-41d4-a716-446655440001';
const UUID_MEETING = '550e8400-e29b-41d4-a716-446655440002';

const sampleEvent = {
  id: UUID_EVENT,
  title: 'Sprint Review',
  description: 'Weekly sprint review',
  event_type: 'appointment',
  start_time: '2026-02-12T14:00:00Z',
  end_time: '2026-02-12T15:00:00Z',
  all_day: false,
  location: 'Conference Room',
  participants: ['Alice', 'Bob'],
  status: 'confirmed',
  context: 'work',
  meeting_id: null as string | null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const sampleMeeting = {
  id: UUID_MEETING,
  title: 'Sprint Review',
  date: '2026-02-12T14:00:00Z',
  duration_minutes: 60,
  participants: ['Alice', 'Bob'],
  location: 'Conference Room',
  meeting_type: 'other',
  status: 'scheduled',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const sampleNotes = {
  id: '550e8400-e29b-41d4-a716-446655440003',
  meeting_id: UUID_MEETING,
  summary: 'Sprint goals discussed',
  decisions: ['Prioritize bug fixes'],
  action_items: [{ task: 'Fix login bug', assignee: 'Bob', deadline: '2026-02-14' }],
  follow_ups: ['Check deployment'],
  sentiment: 'positive',
  created_at: new Date().toISOString(),
};

describe('Calendar Meeting-Link Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', calendarRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // POST /api/:context/calendar/events/:id/start-meeting
  // ===========================================

  describe('POST /api/:context/calendar/events/:id/start-meeting', () => {
    it('should create meeting from event and link them', async () => {
      mockGetCalendarEvent.mockResolvedValueOnce(sampleEvent as any);
      mockCreateMeeting.mockResolvedValueOnce(sampleMeeting as any);
      mockLinkMeetingToEvent.mockResolvedValueOnce(undefined as any);

      const res = await request(app)
        .post(`/api/work/calendar/events/${UUID_EVENT}/start-meeting`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(UUID_MEETING);
      expect(mockCreateMeeting).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Sprint Review',
        duration_minutes: 60,
      }));
      expect(mockLinkMeetingToEvent).toHaveBeenCalledWith('work', UUID_EVENT, UUID_MEETING, '00000000-0000-0000-0000-000000000001');
    });

    it('should return existing meeting if already linked', async () => {
      const eventWithMeeting = { ...sampleEvent, meeting_id: UUID_MEETING };
      mockGetCalendarEvent.mockResolvedValueOnce(eventWithMeeting as any);
      mockGetMeeting.mockResolvedValueOnce(sampleMeeting as any);

      const res = await request(app)
        .post(`/api/work/calendar/events/${UUID_EVENT}/start-meeting`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('already linked');
      expect(mockCreateMeeting).not.toHaveBeenCalled();
    });

    it('should return 404 when event not found', async () => {
      mockGetCalendarEvent.mockResolvedValueOnce(null as any);

      const res = await request(app)
        .post(`/api/work/calendar/events/${UUID_EVENT}/start-meeting`);

      expect(res.status).toBe(404);
    });

    it('should reject invalid event UUID', async () => {
      const res = await request(app)
        .post('/api/work/calendar/events/bad-id/start-meeting');

      expect(res.status).toBe(400);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .post(`/api/invalid/calendar/events/${UUID_EVENT}/start-meeting`);

      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // GET /api/:context/calendar/events/:id/meeting
  // ===========================================

  describe('GET /api/:context/calendar/events/:id/meeting', () => {
    it('should return meeting + notes for event', async () => {
      mockGetEventMeetingId.mockResolvedValueOnce(UUID_MEETING as any);
      mockGetMeeting.mockResolvedValueOnce(sampleMeeting as any);
      mockGetMeetingNotes.mockResolvedValueOnce([sampleNotes] as any);

      const res = await request(app)
        .get(`/api/work/calendar/events/${UUID_EVENT}/meeting`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.meeting.id).toBe(UUID_MEETING);
      expect(res.body.data.notes).toHaveLength(1);
    });

    it('should return null when no meeting linked', async () => {
      mockGetEventMeetingId.mockResolvedValueOnce(null as any);

      const res = await request(app)
        .get(`/api/work/calendar/events/${UUID_EVENT}/meeting`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
      expect(res.body.message).toContain('No meeting');
    });

    it('should reject invalid event UUID', async () => {
      const res = await request(app)
        .get('/api/work/calendar/events/bad/meeting');

      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // POST /api/:context/calendar/events/:id/meeting/notes
  // ===========================================

  describe('POST /api/:context/calendar/events/:id/meeting/notes', () => {
    it('should process transcript and return structured notes', async () => {
      mockGetEventMeetingId.mockResolvedValueOnce(UUID_MEETING as any);
      mockProcessMeetingNotes.mockResolvedValueOnce(sampleNotes as any);

      const res = await request(app)
        .post(`/api/work/calendar/events/${UUID_EVENT}/meeting/notes`)
        .send({ transcript: 'We discussed the sprint goals and decided to prioritize bug fixes.' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBe('Sprint goals discussed');
      expect(mockProcessMeetingNotes).toHaveBeenCalledWith(
        UUID_MEETING,
        'We discussed the sprint goals and decided to prioritize bug fixes.'
      );
    });

    it('should return 404 when no meeting linked', async () => {
      mockGetEventMeetingId.mockResolvedValueOnce(null as any);

      const res = await request(app)
        .post(`/api/work/calendar/events/${UUID_EVENT}/meeting/notes`)
        .send({ transcript: 'Some notes' });

      expect(res.status).toBe(404);
    });

    it('should require transcript', async () => {
      mockGetEventMeetingId.mockResolvedValueOnce(UUID_MEETING as any);

      const res = await request(app)
        .post(`/api/work/calendar/events/${UUID_EVENT}/meeting/notes`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject empty transcript', async () => {
      mockGetEventMeetingId.mockResolvedValueOnce(UUID_MEETING as any);

      const res = await request(app)
        .post(`/api/work/calendar/events/${UUID_EVENT}/meeting/notes`)
        .send({ transcript: '   ' });

      expect(res.status).toBe(400);
    });

    it('should trim transcript whitespace', async () => {
      mockGetEventMeetingId.mockResolvedValueOnce(UUID_MEETING as any);
      mockProcessMeetingNotes.mockResolvedValueOnce(sampleNotes as any);

      await request(app)
        .post(`/api/work/calendar/events/${UUID_EVENT}/meeting/notes`)
        .send({ transcript: '  Some notes here  ' });

      expect(mockProcessMeetingNotes).toHaveBeenCalledWith(UUID_MEETING, 'Some notes here');
    });

    it('should reject invalid event UUID', async () => {
      const res = await request(app)
        .post('/api/work/calendar/events/bad/meeting/notes')
        .send({ transcript: 'Notes' });

      expect(res.status).toBe(400);
    });
  });

  // ===========================================
  // Context validation
  // ===========================================

  describe('Context validation for meeting endpoints', () => {
    it.each(['personal', 'work', 'learning', 'creative'])('should accept context "%s"', async (ctx) => {
      mockGetEventMeetingId.mockResolvedValueOnce(null as any);

      const res = await request(app).get(`/api/${ctx}/calendar/events/${UUID_EVENT}/meeting`);
      expect(res.status).toBe(200);
    });
  });
});
