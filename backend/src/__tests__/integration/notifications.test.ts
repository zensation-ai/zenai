/**
 * Integration Tests for Notifications API
 *
 * Tests notification history, device registration, preferences, and push endpoints.
 */

import express, { Express } from 'express';
import request from 'supertest';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

// Mock dependencies BEFORE imports
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireScope: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../middleware/validate-params', () => ({
  requireUUID: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockQueryContext = jest.fn();

jest.mock('../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
}));

const mockRegisterDeviceToken = jest.fn();
const mockUnregisterDeviceToken = jest.fn();
const mockGetActiveDeviceTokens = jest.fn();
const mockGetPrefs = jest.fn();
const mockUpdatePrefs = jest.fn();
const mockSendNotification = jest.fn();
const mockGetNotificationStats = jest.fn();
const mockRecordNotificationOpened = jest.fn();
const mockGetPushNotificationsStatus = jest.fn();

jest.mock('../../services/push-notifications', () => ({
  registerDeviceToken: (...args: unknown[]) => mockRegisterDeviceToken(...args),
  unregisterDeviceToken: (...args: unknown[]) => mockUnregisterDeviceToken(...args),
  getActiveDeviceTokens: (...args: unknown[]) => mockGetActiveDeviceTokens(...args),
  getNotificationPreferences: (...args: unknown[]) => mockGetPrefs(...args),
  updateNotificationPreferences: (...args: unknown[]) => mockUpdatePrefs(...args),
  sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  getNotificationStats: (...args: unknown[]) => mockGetNotificationStats(...args),
  recordNotificationOpened: (...args: unknown[]) => mockRecordNotificationOpened(...args),
  getPushNotificationsStatus: (...args: unknown[]) => mockGetPushNotificationsStatus(...args),
}));

import { notificationsRouter } from '../../routes/notifications';
import { errorHandler } from '../../middleware/errorHandler';

describe('Notifications API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', notificationsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ============================================================
  // GET /:context/notifications/history
  // ============================================================

  describe('GET /:context/notifications/history', () => {
    it('should return notification history', async () => {
      const notifications = [
        { id: '1', type: 'cluster_ready', title: 'Cluster ready', body: 'Test', sent_at: '2026-01-01', status: 'sent' },
      ];
      mockQueryContext.mockResolvedValueOnce({ rows: notifications });

      const res = await request(app)
        .get('/api/personal/notifications/history')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.notifications).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('should respect limit parameter (capped at 100)', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await request(app)
        .get('/api/personal/notifications/history?limit=200')
        .expect(200);

      const params = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(params[0]).toBe(100);
    });

    it('should return empty array when table does not exist', async () => {
      mockQueryContext
        .mockRejectedValueOnce(new Error('relation does not exist'))
        .mockRejectedValueOnce(new Error('still does not exist'));

      const res = await request(app)
        .get('/api/personal/notifications/history')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.notifications).toHaveLength(0);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .get('/api/invalid/notifications/history')
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /:context/notifications/device
  // ============================================================

  describe('POST /:context/notifications/device', () => {
    it('should register device token', async () => {
      mockRegisterDeviceToken.mockResolvedValueOnce({ success: true, tokenId: 'tok_1' });

      const res = await request(app)
        .post('/api/personal/notifications/device')
        .send({ deviceToken: 'abcdef123456', deviceId: 'device-1', deviceName: 'iPhone' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.tokenId).toBe('tok_1');
    });

    it('should reject missing deviceToken', async () => {
      const res = await request(app)
        .post('/api/personal/notifications/device')
        .send({ deviceId: 'device-1' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject missing deviceId', async () => {
      const res = await request(app)
        .post('/api/personal/notifications/device')
        .send({ deviceToken: 'abcdef123456' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /:context/notifications/stats
  // ============================================================

  describe('GET /:context/notifications/stats', () => {
    it('should return notification stats', async () => {
      mockGetNotificationStats.mockResolvedValueOnce({
        totalSent: 100,
        opened: 75,
        openRate: 0.75,
        byType: [{ type: 'draft_ready', count: 50 }],
      });

      const res = await request(app)
        .get('/api/personal/notifications/stats')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.total_sent).toBe(100);
      expect(res.body.total_opened).toBe(75);
      expect(res.body.open_rate).toBe(0.75);
    });

    it('should return zeros when no stats', async () => {
      mockGetNotificationStats.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/personal/notifications/stats')
        .expect(200);

      expect(res.body.total_sent).toBe(0);
      expect(res.body.total_opened).toBe(0);
    });
  });

  // ============================================================
  // POST /:context/notifications/:notificationId/opened
  // ============================================================

  describe('POST /:context/notifications/:notificationId/opened', () => {
    it('should mark notification as opened', async () => {
      mockRecordNotificationOpened.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post(`/api/personal/notifications/${VALID_UUID}/opened`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('opened');
    });
  });

  // ============================================================
  // GET /:context/notifications/status
  // ============================================================

  describe('GET /:context/notifications/status', () => {
    it('should return push notification status', async () => {
      mockGetPushNotificationsStatus.mockReturnValueOnce({ configured: true, environment: 'production' });
      mockGetActiveDeviceTokens.mockResolvedValueOnce([{ id: '1' }, { id: '2' }]);

      const res = await request(app)
        .get('/api/personal/notifications/status')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.configured).toBe(true);
      expect(res.body.active_devices).toBe(2);
    });
  });

  // ============================================================
  // POST /notifications/register (legacy)
  // ============================================================

  describe('POST /notifications/register (legacy)', () => {
    it('should register new token', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] }) // no existing
        .mockResolvedValueOnce({ rows: [{ id: 'tok_1' }] }); // insert

      const res = await request(app)
        .post('/api/notifications/register')
        .send({ token: 'abc123', platform: 'ios' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('should update existing token', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ id: 'tok_1' }] }) // existing
        .mockResolvedValueOnce({ rows: [] }); // update

      const res = await request(app)
        .post('/api/notifications/register')
        .send({ token: 'abc123', platform: 'ios' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('updated');
    });

    it('should reject missing token', async () => {
      const res = await request(app)
        .post('/api/notifications/register')
        .send({ platform: 'ios' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /:context/notifications/push
  // ============================================================

  describe('POST /:context/notifications/push', () => {
    it('should send push notification', async () => {
      mockSendNotification.mockResolvedValueOnce({ success: true, sent: 2, failed: 0, results: [] });

      const res = await request(app)
        .post('/api/personal/notifications/push')
        .send({ type: 'draft_ready', title: 'Draft Ready', body: 'Your draft is ready' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.sent).toBe(2);
    });

    it('should reject invalid notification type', async () => {
      const res = await request(app)
        .post('/api/personal/notifications/push')
        .send({ type: 'invalid_type', title: 'Test', body: 'Test' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/personal/notifications/push')
        .send({ type: 'draft_ready' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });
});
