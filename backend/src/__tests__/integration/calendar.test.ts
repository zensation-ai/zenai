/**
 * Integration Tests for Calendar Routes - Phase 35
 *
 * Tests the Calendar router endpoints with mocked services.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { calendarRouter } from '../../routes/calendar';
import { errorHandler } from '../../middleware/errorHandler';

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: any, _res: any, next: any) => {
    _req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

// Mock database context
jest.mock('../../utils/database-context', () => ({
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock calendar service
var mockCreateEvent = jest.fn();
var mockGetEvents = jest.fn();
var mockGetEvent = jest.fn();
var mockUpdateEvent = jest.fn();
var mockDeleteEvent = jest.fn();
var mockGetUpcoming = jest.fn();
var mockSearchEvents = jest.fn();

jest.mock('../../services/calendar', () => ({
  createCalendarEvent: (...args: any[]) => mockCreateEvent(...args),
  getCalendarEvents: (...args: any[]) => mockGetEvents(...args),
  getCalendarEvent: (...args: any[]) => mockGetEvent(...args),
  updateCalendarEvent: (...args: any[]) => mockUpdateEvent(...args),
  deleteCalendarEvent: (...args: any[]) => mockDeleteEvent(...args),
  getUpcomingEvents: (...args: any[]) => mockGetUpcoming(...args),
  searchCalendarEvents: (...args: any[]) => mockSearchEvents(...args),
}));

// Mock validation
jest.mock('../../utils/validation', () => ({
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
  validateContextParam: jest.fn((context: string) => {
    const valid = ['personal', 'work', 'learning', 'creative'];
    if (!valid.includes(context)) {
      const { ValidationError } = jest.requireActual('../../middleware/errorHandler');
      throw new ValidationError('Invalid context. Use "personal", "work", "learning", or "creative".');
    }
    return context;
  }),
}));

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api', calendarRouter);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateEvent.mockReset();
  mockGetEvents.mockReset();
  mockGetEvent.mockReset();
  mockUpdateEvent.mockReset();
  mockDeleteEvent.mockReset();
  mockGetUpcoming.mockReset();
  mockSearchEvents.mockReset();
});

var mockEvent = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Test Event',
  description: 'A test event',
  event_type: 'appointment' as const,
  start_time: '2026-02-15T10:00:00.000Z',
  end_time: '2026-02-15T11:00:00.000Z',
  all_day: false,
  location: 'Office',
  participants: ['Alice'],
  status: 'confirmed' as const,
  context: 'personal',
  reminder_minutes: [15],
  metadata: {},
  ai_generated: false,
  created_at: '2026-02-14T08:00:00.000Z',
  updated_at: '2026-02-14T08:00:00.000Z',
};

describe('Calendar Routes', () => {
  describe('POST /api/:context/calendar/events', () => {
    it('should create a calendar event', async () => {
      mockCreateEvent.mockResolvedValue(mockEvent);

      const res = await request(app)
        .post('/api/personal/calendar/events')
        .send({
          title: 'Test Event',
          start_time: '2026-02-15T10:00:00Z',
          end_time: '2026-02-15T11:00:00Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Test Event');
      expect(mockCreateEvent).toHaveBeenCalledWith('personal', expect.objectContaining({
        title: 'Test Event',
      }));
    });

    it('should reject missing title', async () => {
      const res = await request(app)
        .post('/api/personal/calendar/events')
        .send({
          start_time: '2026-02-15T10:00:00Z',
        });

      expect(res.status).toBe(400);
    });

    it('should reject missing start_time', async () => {
      const res = await request(app)
        .post('/api/personal/calendar/events')
        .send({
          title: 'Test Event',
        });

      expect(res.status).toBe(400);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .post('/api/invalid/calendar/events')
        .send({
          title: 'Test Event',
          start_time: '2026-02-15T10:00:00Z',
        });

      expect(res.status).toBe(400);
    });

    it('should work with all 4 contexts', async () => {
      mockCreateEvent.mockResolvedValue(mockEvent);

      for (const ctx of ['personal', 'work', 'learning', 'creative']) {
        const res = await request(app)
          .post(`/api/${ctx}/calendar/events`)
          .send({
            title: 'Test Event',
            start_time: '2026-02-15T10:00:00Z',
          });

        expect(res.status).toBe(201);
      }
    });
  });

  describe('GET /api/:context/calendar/events', () => {
    it('should list events', async () => {
      mockGetEvents.mockResolvedValue([mockEvent]);

      const res = await request(app)
        .get('/api/personal/calendar/events')
        .query({ start: '2026-02-01', end: '2026-02-28' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.count).toBe(1);
    });

    it('should return empty array when no events', async () => {
      mockGetEvents.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/personal/calendar/events');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('should reject invalid date format', async () => {
      const res = await request(app)
        .get('/api/personal/calendar/events')
        .query({ start: 'not-a-date' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/calendar/events/:id', () => {
    it('should return single event', async () => {
      mockGetEvent.mockResolvedValue(mockEvent);

      const res = await request(app)
        .get('/api/personal/calendar/events/11111111-1111-1111-1111-111111111111');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(mockEvent.id);
    });

    it('should return 404 for non-existent event', async () => {
      mockGetEvent.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/personal/calendar/events/22222222-2222-2222-2222-222222222222');

      expect(res.status).toBe(404);
    });

    it('should reject invalid UUID', async () => {
      const res = await request(app)
        .get('/api/personal/calendar/events/not-a-uuid');

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/:context/calendar/events/:id', () => {
    it('should update event', async () => {
      mockUpdateEvent.mockResolvedValue({ ...mockEvent, title: 'Updated' });

      const res = await request(app)
        .put('/api/personal/calendar/events/11111111-1111-1111-1111-111111111111')
        .send({ title: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated');
    });

    it('should return 404 for non-existent event', async () => {
      mockUpdateEvent.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/personal/calendar/events/22222222-2222-2222-2222-222222222222')
        .send({ title: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/:context/calendar/events/:id', () => {
    it('should cancel event', async () => {
      mockDeleteEvent.mockResolvedValue(true);

      const res = await request(app)
        .delete('/api/personal/calendar/events/11111111-1111-1111-1111-111111111111');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Event cancelled');
    });

    it('should return 404 for non-existent event', async () => {
      mockDeleteEvent.mockResolvedValue(false);

      const res = await request(app)
        .delete('/api/personal/calendar/events/22222222-2222-2222-2222-222222222222');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/:context/calendar/upcoming', () => {
    it('should return upcoming events', async () => {
      mockGetUpcoming.mockResolvedValue([mockEvent]);

      const res = await request(app)
        .get('/api/personal/calendar/upcoming');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('should accept hours parameter', async () => {
      mockGetUpcoming.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/personal/calendar/upcoming')
        .query({ hours: 48 });

      expect(res.status).toBe(200);
      expect(mockGetUpcoming).toHaveBeenCalledWith('personal', 48, 10);
    });

    it('should cap hours at 168', async () => {
      mockGetUpcoming.mockResolvedValue([]);

      await request(app)
        .get('/api/personal/calendar/upcoming')
        .query({ hours: 500 });

      expect(mockGetUpcoming).toHaveBeenCalledWith('personal', 168, 10);
    });
  });

  describe('POST /api/:context/calendar/events/search', () => {
    it('should search events', async () => {
      mockSearchEvents.mockResolvedValue([mockEvent]);

      const res = await request(app)
        .post('/api/personal/calendar/events/search')
        .send({ query: 'meeting' });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('should reject empty query', async () => {
      const res = await request(app)
        .post('/api/personal/calendar/events/search')
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
