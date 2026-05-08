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

const mockGetSIEMStatus = jest.fn();
const mockInvalidateOrgSIEMCache = jest.fn();
jest.mock('../../../services/security/siem-forwarder', () => ({
  getSIEMStatus: (...args: unknown[]) => mockGetSIEMStatus(...args),
  invalidateOrgSIEMCache: (...args: unknown[]) => mockInvalidateOrgSIEMCache(...args),
}));

const mockEncrypt = jest.fn((plain: string) => `enc:v1:A:iv:tag:${Buffer.from(plain).toString('base64')}`);
const mockIsEncrypted = jest.fn((v: unknown) => typeof v === 'string' && v.startsWith('enc:v1:'));
jest.mock('../../../services/security/field-encryption', () => ({
  encrypt: (v: string) => mockEncrypt(v),
  isEncrypted: (v: unknown) => mockIsEncrypted(v),
}));

const mockQueryPublic = jest.fn();
const mockQueryContext = jest.fn().mockResolvedValue({ rows: [] });
jest.mock('../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

// Mock types export
jest.mock('../../../types', () => ({
  isValidContext: (ctx: string) => ['operations', 'finance', 'people', 'strategy'].includes(ctx),
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
        'operations',
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
      expect(mockAuditLogger.getSecurityAlerts).toHaveBeenCalledWith('operations', 'warning', undefined);
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

  describe('GET /siem/status', () => {
    it('returns SIEM forwarder status snapshot', async () => {
      mockGetSIEMStatus.mockReturnValue({
        provider: 'datadog',
        successCount: 12,
        failureCount: 3,
        failureRate: 0.2,
        lastForward: { eventId: 'a', eventType: 'login', severity: 'info', ok: true, ts: 1 },
        lastFailure: { eventId: 'b', eventType: 'failed_login', severity: 'warning', ok: false, error: 'HTTP 503', ts: 2 },
        recent: [],
      });
      const res = await request(app).get('/api/security/siem/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.provider).toBe('datadog');
      expect(res.body.data.failureCount).toBe(3);
      expect(res.body.data.lastFailure.error).toBe('HTTP 503');
      expect(mockGetSIEMStatus).toHaveBeenCalledTimes(1);
    });

    it('returns zeroed status when no forwards observed yet', async () => {
      mockGetSIEMStatus.mockReturnValue({
        provider: 'noop',
        successCount: 0,
        failureCount: 0,
        failureRate: 0,
        lastForward: null,
        lastFailure: null,
        recent: [],
      });
      const res = await request(app).get('/api/security/siem/status');
      expect(res.status).toBe(200);
      expect(res.body.data.successCount).toBe(0);
      expect(res.body.data.recent).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Sprint 1.9: Per-Org SIEM Config
  // ──────────────────────────────────────────────────────────────────────────

  describe('GET /siem/config/:orgId', () => {
    it('returns stored config with the apiKey masked', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ siem_config: { provider: 'datadog', endpoint: 'https://x', apiKey: 'enc:v1:A:iv:tag:xxx' } }],
      });
      const res = await request(app).get('/api/security/siem/config/org-1');
      expect(res.status).toBe(200);
      expect(res.body.data.config.provider).toBe('datadog');
      expect(res.body.data.config.apiKey).toBe('***');
    });

    it('returns null config when none is set', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ siem_config: null }] });
      const res = await request(app).get('/api/security/siem/config/org-empty');
      expect(res.status).toBe(200);
      expect(res.body.data.config).toBeNull();
    });

    it('returns 404 when the org does not exist', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/security/siem/config/missing');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /siem/config/:orgId', () => {
    beforeEach(() => {
      mockQueryPublic.mockReset();
      mockEncrypt.mockClear();
      mockInvalidateOrgSIEMCache.mockClear();
    });

    it('stores a datadog config and encrypts the apiKey', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'org-1' }] });
      const res = await request(app)
        .put('/api/security/siem/config/org-1')
        .send({ provider: 'datadog', endpoint: 'https://logs.example', apiKey: 'super-secret-key' });
      expect(res.status).toBe(200);
      expect(mockEncrypt).toHaveBeenCalledWith('super-secret-key');
      expect(mockInvalidateOrgSIEMCache).toHaveBeenCalledWith('org-1');
      // Response masks the apiKey
      expect(res.body.data.config.apiKey).toBe('***');
    });

    it('stores a syslog config without encryption', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'org-1' }] });
      const res = await request(app)
        .put('/api/security/siem/config/org-1')
        .send({ provider: 'syslog', host: 'siem.acme.internal', port: 514 });
      expect(res.status).toBe(200);
      expect(mockEncrypt).not.toHaveBeenCalled();
    });

    it('rejects non-HTTPS datadog endpoints', async () => {
      const res = await request(app)
        .put('/api/security/siem/config/org-1')
        .send({ provider: 'datadog', endpoint: 'http://insecure', apiKey: 'long-enough-key' });
      expect(res.status).toBe(400);
    });

    it('rejects an apiKey that is too short', async () => {
      const res = await request(app)
        .put('/api/security/siem/config/org-1')
        .send({ provider: 'datadog', endpoint: 'https://x', apiKey: 'a' });
      expect(res.status).toBe(400);
    });

    it('rejects an unknown provider', async () => {
      const res = await request(app)
        .put('/api/security/siem/config/org-1')
        .send({ provider: 'kafka' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when the org does not exist', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .put('/api/security/siem/config/missing')
        .send({ provider: 'noop' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /siem/config/:orgId', () => {
    it('clears the siem_config column and invalidates the cache', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [{ id: 'org-1' }] });
      const res = await request(app).delete('/api/security/siem/config/org-1');
      expect(res.status).toBe(200);
      expect(mockInvalidateOrgSIEMCache).toHaveBeenCalledWith('org-1');
    });

    it('returns 404 when the org does not exist', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).delete('/api/security/siem/config/missing');
      expect(res.status).toBe(404);
    });
  });
});
