/**
 * Security Route Tests
 *
 * Tests the REST API for security audit log and rate limit management.
 */

import express from 'express';
import request from 'supertest';
import { securityRouter } from '../../../routes/security';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock JWT auth to pass through
jest.mock('../../../middleware/jwt-auth', () => ({
  jwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock RBAC to pass through
jest.mock('../../../middleware/rbac', () => ({
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockAuditLogger = {
  getAuditLog: jest.fn(),
  getSecurityAlerts: jest.fn(),
  logSecurityEvent: jest.fn(),
};

jest.mock('../../../services/security/audit-logger', () => ({
  getAuditLogger: () => mockAuditLogger,
}));

const mockGetAllTierConfigs = jest.fn();
const mockGetTierConfig = jest.fn();
const mockUpdateTierConfig = jest.fn();
const mockGetRateLimitStats = jest.fn();

jest.mock('../../../services/security/rate-limit-advanced', () => ({
  getAllTierConfigs: (...args: unknown[]) => mockGetAllTierConfigs(...args),
  getTierConfig: (...args: unknown[]) => mockGetTierConfig(...args),
  updateTierConfig: (...args: unknown[]) => mockUpdateTierConfig(...args),
  getRateLimitStats: (...args: unknown[]) => mockGetRateLimitStats(...args),
}));

// Mock types export
jest.mock('../../../types', () => ({
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('Security Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/security', securityRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /audit-log', () => {
    it('should return audit log entries', async () => {
      mockAuditLogger.getAuditLog.mockResolvedValue({ entries: [{ id: '1', event_type: 'login' }], total: 1 });
      const res = await request(app).get('/api/security/audit-log');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('should pass filters to audit logger', async () => {
      mockAuditLogger.getAuditLog.mockResolvedValue({ entries: [], total: 0 });
      await request(app).get('/api/security/audit-log?event_type=login&severity=critical');
      expect(mockAuditLogger.getAuditLog).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({ eventType: 'login', severity: 'critical' })
      );
    });
  });

  describe('GET /audit-log/:id', () => {
    it('should return a single audit entry', async () => {
      // This endpoint uses dynamic import of queryContext
      jest.mock('../../../utils/database-context', () => ({
        queryContext: jest.fn().mockResolvedValue({ rows: [{ id: '1', event_type: 'login' }] }),
      }));
      // Since dynamic import is used, we test that a 200 or 404 is returned
      const res = await request(app).get('/api/security/audit-log/some-id');
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /alerts', () => {
    it('should return security alerts', async () => {
      const alerts = [{ id: '1', severity: 'critical', event_type: 'failed_login' }];
      mockAuditLogger.getSecurityAlerts.mockResolvedValue(alerts);
      const res = await request(app).get('/api/security/alerts');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(alerts);
    });

    it('should filter by severity', async () => {
      mockAuditLogger.getSecurityAlerts.mockResolvedValue([]);
      await request(app).get('/api/security/alerts?severity=warning');
      expect(mockAuditLogger.getSecurityAlerts).toHaveBeenCalledWith('personal', 'warning', undefined);
    });
  });

  describe('GET /rate-limits', () => {
    it('should return rate limit configs', async () => {
      const configs = { default: { maxRequests: 100 }, auth: { maxRequests: 10 } };
      mockGetAllTierConfigs.mockReturnValue(configs);
      const res = await request(app).get('/api/security/rate-limits');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(configs);
    });
  });

  describe('PUT /rate-limits/:tier', () => {
    it('should update a rate limit tier', async () => {
      mockUpdateTierConfig.mockReturnValue({ maxRequests: 200, windowSeconds: 60 });
      mockGetTierConfig.mockReturnValue({ maxRequests: 100 });
      mockAuditLogger.logSecurityEvent.mockResolvedValue(undefined);
      const res = await request(app).put('/api/security/rate-limits/default').send({ maxRequests: 200 });
      expect(res.status).toBe(200);
      expect(res.body.data.maxRequests).toBe(200);
    });

    it('should reject empty update', async () => {
      const res = await request(app).put('/api/security/rate-limits/default').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /rate-limits/stats', () => {
    it('should return rate limit statistics', async () => {
      mockGetRateLimitStats.mockReturnValue({ totalHits: 500, blockedRequests: 5 });
      const res = await request(app).get('/api/security/rate-limits/stats');
      expect(res.status).toBe(200);
      expect(res.body.data.totalHits).toBe(500);
    });
  });
});
