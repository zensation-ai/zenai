/**
 * Phase 62: Security Routes Tests
 */

// Mock dependencies before imports
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../services/auth/jwt-service', () => ({
  verifyAccessToken: jest.fn().mockReturnValue({
    sub: 'user-1',
    email: 'admin@test.com',
    role: 'admin',
  }),
}));

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../../services/event-system', () => ({
  emitSystemEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../middleware/jwt-auth', () => ({
  jwtAuth: jest.fn((_req: any, _res: any, next: any) => next()),
}));

import express from 'express';
import request from 'supertest';
import { queryContext } from '../../../utils/database-context';
import { errorHandler } from '../../../middleware/errorHandler';
import { securityRouter } from '../../../routes/security';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

describe('Security Routes', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Simulate JWT auth middleware setting jwtUser
    app.use((req, _res, next) => {
      req.jwtUser = { id: 'user-1', email: 'admin@test.com', role: 'admin' };
      req.apiKey = { id: 'jwt:user-1', name: 'JWT:admin@test.com', scopes: ['read', 'write', 'admin'], rateLimit: 1000 };
      next();
    });

    app.use('/api/security', securityRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ===========================================
  // GET /api/security/audit-log
  // ===========================================

  describe('GET /api/security/audit-log', () => {
    it('should return audit log entries', async () => {
      const mockEntries = [
        { id: '1', event_type: 'login', user_id: 'user-1', severity: 'info' },
        { id: '2', event_type: 'logout', user_id: 'user-1', severity: 'info' },
      ];
      mockQueryContext
        .mockResolvedValueOnce({ rows: mockEntries, rowCount: 2 } as any)
        .mockResolvedValueOnce({ rows: [{ total: '2' }], rowCount: 1 } as any);

      const res = await request(app).get('/api/security/audit-log');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('should support event_type filter', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 } as any);

      const res = await request(app)
        .get('/api/security/audit-log?event_type=login');

      expect(res.status).toBe(200);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('event_type = $1'),
        expect.any(Array)
      );
    });

    it('should support context parameter', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 } as any);

      const res = await request(app)
        .get('/api/security/audit-log?context=work');

      expect(res.status).toBe(200);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.any(String),
        expect.any(Array)
      );
    });
  });

  // ===========================================
  // GET /api/security/audit-log/:id
  // ===========================================

  describe('GET /api/security/audit-log/:id', () => {
    it('should return a single audit entry', async () => {
      const mockEntry = { id: 'evt-1', event_type: 'login', user_id: 'user-1' };
      mockQueryContext.mockResolvedValueOnce({ rows: [mockEntry], rowCount: 1 } as any);

      const res = await request(app).get('/api/security/audit-log/evt-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('evt-1');
    });

    it('should return 404 for non-existent entry', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await request(app).get('/api/security/audit-log/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ===========================================
  // GET /api/security/alerts
  // ===========================================

  describe('GET /api/security/alerts', () => {
    it('should return security alerts', async () => {
      const mockAlerts = [
        { id: '1', event_type: 'failed_login', severity: 'warning' },
      ];
      mockQueryContext.mockResolvedValueOnce({ rows: mockAlerts, rowCount: 1 } as any);

      const res = await request(app).get('/api/security/alerts');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should support severity filter', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await request(app)
        .get('/api/security/alerts?severity=critical');

      expect(res.status).toBe(200);
    });
  });

  // ===========================================
  // Rate limit endpoints
  // ===========================================

  describe('GET /api/security/rate-limits', () => {
    it('should return rate limit configurations', async () => {
      const res = await request(app).get('/api/security/rate-limits');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('default');
      expect(res.body.data).toHaveProperty('auth');
      expect(res.body.data).toHaveProperty('ai');
    });
  });

  describe('PUT /api/security/rate-limits/:tier', () => {
    it('should update tier configuration', async () => {
      // Mock the audit log insert
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 } as any);

      const res = await request(app)
        .put('/api/security/rate-limits/default')
        .send({ maxRequests: 200 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.maxRequests).toBe(200);
    });

    it('should reject empty update', async () => {
      const res = await request(app)
        .put('/api/security/rate-limits/default')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/security/rate-limits/stats', () => {
    it('should return rate limit statistics', async () => {
      const res = await request(app).get('/api/security/rate-limits/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('activeKeys');
      expect(res.body.data).toHaveProperty('redisAvailable');
    });
  });

  // ===========================================
  // Admin-only access
  // ===========================================

  describe('admin-only access', () => {
    it('should deny non-admin users', async () => {
      const nonAdminApp = express();
      nonAdminApp.use(express.json());
      nonAdminApp.use((req, _res, next) => {
        req.jwtUser = { id: 'user-2', email: 'viewer@test.com', role: 'viewer' };
        next();
      });
      nonAdminApp.use('/api/security', securityRouter);
      nonAdminApp.use(errorHandler);

      const res = await request(nonAdminApp).get('/api/security/audit-log');

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });
});
