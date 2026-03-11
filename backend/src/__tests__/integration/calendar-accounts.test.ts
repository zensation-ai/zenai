/**
 * Integration Tests for Calendar Accounts & AI Routes - Phase 40
 *
 * Tests the calendarAccountsRouter endpoints with mocked services.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { calendarAccountsRouter } from '../../routes/calendar-accounts';
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

// Mock validation
jest.mock('../../utils/validation', () => ({
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
  validateContextParam: jest.fn((context: string) => {
    const valid = ['personal', 'work', 'learning', 'creative'];
    if (!valid.includes(context)) {
      const { ValidationError } = jest.requireActual('../../middleware/errorHandler');
      throw new ValidationError('Invalid context');
    }
    return context;
  }),
}));

// Mock encryption
jest.mock('../../utils/encryption', () => ({
  decrypt: jest.fn((text: string) => text.replace('encrypted:', '')),
}));

// Mock CalDAV sync service
var mockCreateAccount = jest.fn();
var mockGetAccounts = jest.fn();
var mockGetAccount = jest.fn();
var mockUpdateAccount = jest.fn();
var mockDeleteAccount = jest.fn();
var mockSyncAccount = jest.fn();

jest.mock('../../services/caldav-sync', () => ({
  createCalendarAccount: (...args: any[]) => mockCreateAccount(...args),
  getCalendarAccounts: (...args: any[]) => mockGetAccounts(...args),
  getCalendarAccount: (...args: any[]) => mockGetAccount(...args),
  updateCalendarAccount: (...args: any[]) => mockUpdateAccount(...args),
  deleteCalendarAccount: (...args: any[]) => mockDeleteAccount(...args),
  syncAccount: (...args: any[]) => mockSyncAccount(...args),
}));

// Mock CalDAV connector
var mockTestConnection = jest.fn();
var mockDiscoverCalendars = jest.fn();

jest.mock('../../services/caldav-connector', () => ({
  testConnection: (...args: any[]) => mockTestConnection(...args),
  discoverCalendars: (...args: any[]) => mockDiscoverCalendars(...args),
}));

// Mock Calendar AI
var mockGenerateBriefing = jest.fn();
var mockSuggestSlots = jest.fn();
var mockDetectConflicts = jest.fn();
var mockCheckConflicts = jest.fn();

jest.mock('../../services/calendar-ai', () => ({
  generateDailyBriefing: (...args: any[]) => mockGenerateBriefing(...args),
  suggestTimeSlots: (...args: any[]) => mockSuggestSlots(...args),
  detectConflicts: (...args: any[]) => mockDetectConflicts(...args),
  checkEventConflicts: (...args: any[]) => mockCheckConflicts(...args),
}));

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api', calendarAccountsRouter);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAccounts.mockReset();
  mockGetAccount.mockReset();
  mockCreateAccount.mockReset();
  mockUpdateAccount.mockReset();
  mockDeleteAccount.mockReset();
  mockSyncAccount.mockReset();
  mockTestConnection.mockReset();
  mockDiscoverCalendars.mockReset();
  mockGenerateBriefing.mockReset();
  mockSuggestSlots.mockReset();
  mockDetectConflicts.mockReset();
  mockCheckConflicts.mockReset();
});

const TEST_UUID = '12345678-1234-1234-1234-123456789012';

var mockAccount = {
  id: TEST_UUID,
  provider: 'icloud',
  username: 'test@icloud.com',
  password_encrypted: 'encrypted:pass',
  display_name: 'iCloud',
  caldav_url: 'https://caldav.icloud.com',
  calendars: [{ url: '/cal/1/', displayName: 'Work', enabled: true }],
  is_enabled: true,
  sync_interval_minutes: 5,
  last_sync_at: null,
  last_sync_error: null,
  sync_token: null,
  context: 'personal',
  metadata: {},
  created_at: '2026-03-08T10:00:00.000Z',
  updated_at: '2026-03-08T10:00:00.000Z',
};

// ============================================================
// Account CRUD Routes
// ============================================================

describe('Calendar Accounts Routes', () => {
  describe('GET /api/:context/calendar/accounts', () => {
    it('returns list of accounts', async () => {
      mockGetAccounts.mockResolvedValueOnce([mockAccount]);

      const res = await request(app).get('/api/personal/calendar/accounts');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.count).toBe(1);
      // Password should NOT be in response
      expect(res.body.data[0].password_encrypted).toBeUndefined();
      expect(res.body.data[0].has_password).toBe(true);
    });

    it('rejects invalid context', async () => {
      const res = await request(app).get('/api/invalid/calendar/accounts');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/calendar/accounts/:id', () => {
    it('returns single account', async () => {
      mockGetAccount.mockResolvedValueOnce(mockAccount);

      const res = await request(app).get(`/api/personal/calendar/accounts/${TEST_UUID}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(TEST_UUID);
      expect(res.body.data.password_encrypted).toBeUndefined();
    });

    it('returns 404 for missing account', async () => {
      mockGetAccount.mockResolvedValueOnce(null);

      const res = await request(app).get(`/api/personal/calendar/accounts/${TEST_UUID}`);
      expect(res.status).toBe(404);
    });

    it('rejects invalid UUID', async () => {
      const res = await request(app).get('/api/personal/calendar/accounts/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/:context/calendar/accounts', () => {
    it('creates account after successful connection test', async () => {
      mockTestConnection.mockResolvedValueOnce({
        success: true,
        message: '2 Kalender gefunden',
        calendars: [
          { url: '/cal/1/', displayName: 'Work', color: '#4A90D9' },
          { url: '/cal/2/', displayName: 'Personal' },
        ],
      });
      mockCreateAccount.mockResolvedValueOnce(mockAccount);
      mockSyncAccount.mockResolvedValueOnce({ created: 5, updated: 0, deleted: 0, errors: 0 });

      const res = await request(app)
        .post('/api/personal/calendar/accounts')
        .send({
          provider: 'icloud',
          username: 'test@icloud.com',
          password: 'app-specific-pass',
          display_name: 'My iCloud',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Kalender gefunden');
      expect(mockTestConnection).toHaveBeenCalledWith({
        serverUrl: 'https://caldav.icloud.com',
        username: 'test@icloud.com',
        password: 'app-specific-pass',
      });
    });

    it('returns 400 if connection test fails', async () => {
      mockTestConnection.mockResolvedValueOnce({
        success: false,
        message: 'Auth failed',
      });

      const res = await request(app)
        .post('/api/personal/calendar/accounts')
        .send({
          provider: 'icloud',
          username: 'test@icloud.com',
          password: 'wrong-pass',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Auth failed');
    });

    it('validates required fields', async () => {
      const res = await request(app)
        .post('/api/personal/calendar/accounts')
        .send({ provider: 'icloud' });

      expect(res.status).toBe(400);
    });

    it('validates provider value', async () => {
      const res = await request(app)
        .post('/api/personal/calendar/accounts')
        .send({ provider: 'outlook', username: 'a', password: 'b' });

      expect(res.status).toBe(400);
    });

    it('requires caldav_url for non-iCloud providers', async () => {
      const res = await request(app)
        .post('/api/personal/calendar/accounts')
        .send({ provider: 'caldav', username: 'a', password: 'b' });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/:context/calendar/accounts/:id', () => {
    it('updates account', async () => {
      mockUpdateAccount.mockResolvedValueOnce({
        ...mockAccount,
        display_name: 'Updated Name',
      });

      const res = await request(app)
        .put(`/api/personal/calendar/accounts/${TEST_UUID}`)
        .send({ display_name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.data.display_name).toBe('Updated Name');
    });

    it('returns 404 when account not found', async () => {
      mockUpdateAccount.mockResolvedValueOnce(null);

      const res = await request(app)
        .put(`/api/personal/calendar/accounts/${TEST_UUID}`)
        .send({ display_name: 'X' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/:context/calendar/accounts/:id', () => {
    it('deletes account', async () => {
      mockDeleteAccount.mockResolvedValueOnce(true);

      const res = await request(app).delete(`/api/personal/calendar/accounts/${TEST_UUID}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('gelöscht');
    });

    it('returns 404 when account not found', async () => {
      mockDeleteAccount.mockResolvedValueOnce(false);

      const res = await request(app).delete(`/api/personal/calendar/accounts/${TEST_UUID}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/:context/calendar/accounts/:id/test', () => {
    it('tests connection for existing account', async () => {
      mockGetAccount.mockResolvedValueOnce(mockAccount);
      mockTestConnection.mockResolvedValueOnce({
        success: true,
        message: 'OK',
        calendars: [],
      });

      const res = await request(app)
        .post(`/api/personal/calendar/accounts/${TEST_UUID}/test`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/:context/calendar/accounts/:id/sync', () => {
    it('triggers manual sync', async () => {
      mockSyncAccount.mockResolvedValueOnce({
        created: 3, updated: 1, deleted: 0, errors: 0,
      });

      const res = await request(app)
        .post(`/api/personal/calendar/accounts/${TEST_UUID}/sync`);

      expect(res.status).toBe(200);
      expect(res.body.data.created).toBe(3);
      expect(res.body.message).toContain('3 neu');
    });
  });

  describe('POST /api/:context/calendar/accounts/:id/discover', () => {
    it('discovers remote calendars', async () => {
      mockGetAccount.mockResolvedValueOnce(mockAccount);
      mockDiscoverCalendars.mockResolvedValueOnce([
        { url: '/cal/1/', displayName: 'Work', color: '#4A90D9' },
        { url: '/cal/2/', displayName: 'Personal' },
      ]);

      const res = await request(app)
        .post(`/api/personal/calendar/accounts/${TEST_UUID}/discover`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.count).toBe(2);
    });
  });
});

// ============================================================
// AI Routes
// ============================================================

describe('Calendar AI Routes', () => {
  describe('GET /api/:context/calendar/ai/briefing', () => {
    it('returns daily briefing', async () => {
      mockGenerateBriefing.mockResolvedValueOnce({
        date: '2026-03-08',
        summary: 'Ein ruhiger Tag.',
        event_count: 2,
        busy_hours: 3,
        free_slots: [],
        events: [],
        tips: ['Fokuszeit nutzen'],
        focus_recommendation: 'Vormittag ist frei.',
      });

      const res = await request(app).get('/api/personal/calendar/ai/briefing');

      expect(res.status).toBe(200);
      expect(res.body.data.summary).toBe('Ein ruhiger Tag.');
      expect(res.body.data.event_count).toBe(2);
    });

    it('accepts date query parameter', async () => {
      mockGenerateBriefing.mockResolvedValueOnce({
        date: '2026-03-10',
        summary: 'Montag',
        event_count: 0,
        busy_hours: 0,
        free_slots: [],
        events: [],
        tips: [],
      });

      const res = await request(app).get('/api/work/calendar/ai/briefing?date=2026-03-10');

      expect(res.status).toBe(200);
      expect(mockGenerateBriefing).toHaveBeenCalledWith('work', '2026-03-10');
    });
  });

  describe('POST /api/:context/calendar/ai/suggest', () => {
    it('returns time slot suggestions', async () => {
      mockSuggestSlots.mockResolvedValueOnce([
        { start_time: '2026-03-09T10:00:00Z', end_time: '2026-03-09T11:00:00Z', score: 85, reason: 'Montag um 10:00' },
        { start_time: '2026-03-09T14:00:00Z', end_time: '2026-03-09T15:00:00Z', score: 72, reason: 'Montag um 14:00' },
      ]);

      const res = await request(app)
        .post('/api/work/calendar/ai/suggest')
        .send({ title: 'Review', duration_minutes: 60 });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.count).toBe(2);
    });

    it('validates required title', async () => {
      const res = await request(app)
        .post('/api/work/calendar/ai/suggest')
        .send({ duration_minutes: 60 });

      expect(res.status).toBe(400);
    });

    it('validates duration_minutes minimum', async () => {
      const res = await request(app)
        .post('/api/work/calendar/ai/suggest')
        .send({ title: 'X', duration_minutes: 2 });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/:context/calendar/ai/conflicts', () => {
    it('returns detected conflicts', async () => {
      mockDetectConflicts.mockResolvedValueOnce([
        {
          type: 'overlap',
          severity: 'error',
          events: [],
          message: 'Overlap detected',
        },
      ]);

      const res = await request(app).get('/api/work/calendar/ai/conflicts');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.has_errors).toBe(true);
    });

    it('passes date range query parameters', async () => {
      mockDetectConflicts.mockResolvedValueOnce([]);

      await request(app).get('/api/work/calendar/ai/conflicts?start=2026-03-08&end=2026-03-15');

      expect(mockDetectConflicts).toHaveBeenCalledWith('work', {
        start: '2026-03-08',
        end: '2026-03-15',
      });
    });

    it('returns has_errors: false when no error conflicts', async () => {
      mockDetectConflicts.mockResolvedValueOnce([
        { type: 'back_to_back', severity: 'warning', events: [], message: 'Warning' },
      ]);

      const res = await request(app).get('/api/work/calendar/ai/conflicts');

      expect(res.body.has_errors).toBe(false);
    });
  });

  describe('POST /api/:context/calendar/ai/check-conflicts', () => {
    it('checks conflicts for a time slot', async () => {
      mockCheckConflicts.mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/api/work/calendar/ai/check-conflicts')
        .send({
          start_time: '2026-03-08T10:00:00Z',
          end_time: '2026-03-08T11:00:00Z',
        });

      expect(res.status).toBe(200);
      expect(res.body.has_conflicts).toBe(false);
    });

    it('validates required fields', async () => {
      const res = await request(app)
        .post('/api/work/calendar/ai/check-conflicts')
        .send({ start_time: '2026-03-08T10:00:00Z' });

      expect(res.status).toBe(400);
    });

    it('passes exclude_event_id', async () => {
      mockCheckConflicts.mockResolvedValueOnce([]);

      await request(app)
        .post('/api/work/calendar/ai/check-conflicts')
        .send({
          start_time: '2026-03-08T10:00:00Z',
          end_time: '2026-03-08T11:00:00Z',
          exclude_event_id: 'event-123',
        });

      expect(mockCheckConflicts).toHaveBeenCalledWith(
        'work',
        '2026-03-08T10:00:00Z',
        '2026-03-08T11:00:00Z',
        'event-123'
      );
    });
  });
});
