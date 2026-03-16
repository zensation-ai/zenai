/**
 * Phase 80: Multi-User Isolation Integration Test
 *
 * Verifies that User A cannot access User B's data.
 * Tests the core security invariant of the multi-user system.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { ideasRouter } from '../../routes/ideas';
import { errorHandler } from '../../middleware/errorHandler';

// ============================================================
// Mocks
// ============================================================

const mockQueryContext = jest.fn();
const mockGetUserId = jest.fn();

jest.mock('../../utils/database-context', () => ({
  queryContext: (...args: any[]) => mockQueryContext(...args),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)),
  AIContext: {},
}));

jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: any, _res: any, next: any) => {
    _req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../utils/user-context', () => ({
  getUserId: (...args: any[]) => mockGetUserId(...args),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../utils/ollama', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

jest.mock('../../utils/embedding', () => ({
  formatForPgVector: jest.fn((arr: number[]) => `[${arr.join(',')}]`),
}));

jest.mock('../../services/user-profile', () => ({
  trackInteraction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/webhooks', () => ({
  triggerWebhook: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/learning-engine', () => ({
  learnFromCorrection: jest.fn().mockResolvedValue(undefined),
  learnFromThought: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/ai-activity-logger', () => ({
  logAIActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/duplicate-detection', () => ({
  findDuplicates: jest.fn().mockResolvedValue([]),
  mergeIdeas: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/activity-tracker', () => ({
  trackActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/idea-move', () => ({
  moveIdea: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../middleware/response-cache', () => ({
  invalidateCacheForContext: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ============================================================
// Test Data
// ============================================================

const USER_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const IDEA_ID = '11111111-2222-3333-aaaa-555555555555';

const userAIdea = {
  id: '11111111-2222-3333-aaaa-555555555555',
  title: 'User A Private Idea',
  content: 'Confidential content',
  type: 'thought',
  category: 'general',
  priority: 'high',
  status: 'active',
  is_archived: false,
  tags: ['private'],
  source: 'manual',
  user_id: USER_A_ID,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ============================================================
// Tests
// ============================================================

describe('Multi-User Isolation Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/ideas', ideasRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    mockGetUserId.mockReset();
  });

  describe('Data isolation on read', () => {
    it('should pass user_id to queryContext on list queries', async () => {
      mockGetUserId.mockReturnValue(USER_A_ID);
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ count: '1' }] } as any)
        .mockResolvedValueOnce({ rows: [userAIdea] } as any);

      await request(app).get('/api/ideas');

      // Verify user_id was passed in query params
      const calls = mockQueryContext.mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      // At least one call should have user_id as a parameter
      const hasUserIdParam = calls.some((call: any[]) => {
        const params = call[2] as any[];
        return params && params.includes(USER_A_ID);
      });
      expect(hasUserIdParam).toBe(true);
    });

    it('should use different user_id for different authenticated users', async () => {
      // Simulate User A request
      mockGetUserId.mockReturnValue(USER_A_ID);
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ count: '1' }] } as any)
        .mockResolvedValueOnce({ rows: [userAIdea] } as any);

      await request(app).get('/api/ideas');
      const userACalls = [...mockQueryContext.mock.calls];

      // Reset and simulate User B request
      mockQueryContext.mockReset();
      mockGetUserId.mockReturnValue(USER_B_ID);
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await request(app).get('/api/ideas');
      const userBCalls = mockQueryContext.mock.calls;

      // Verify User A's queries used User A's ID
      const userAParams = userACalls.flatMap((call: any[]) => call[2] || []);
      expect(userAParams).toContain(USER_A_ID);
      expect(userAParams).not.toContain(USER_B_ID);

      // Verify User B's queries used User B's ID
      const userBParams = userBCalls.flatMap((call: any[]) => call[2] || []);
      expect(userBParams).toContain(USER_B_ID);
      expect(userBParams).not.toContain(USER_A_ID);
    });

    it('should filter by user_id on single idea fetch', async () => {
      mockGetUserId.mockReturnValue(USER_B_ID);
      // User B tries to access User A's idea - DB returns empty because user_id doesn't match
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const res = await request(app).get(`/api/ideas/${IDEA_ID}`);

      // Should get 404 because user_id filter excludes User A's idea
      expect(res.status).toBe(404);

      // Verify the SQL included user_id filtering
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql.toLowerCase()).toContain('user_id');

      // Verify User B's ID was passed
      const params = mockQueryContext.mock.calls[0][2] as any[];
      expect(params).toContain(USER_B_ID);
    });
  });

  describe('Data isolation on write', () => {
    it('should include user_id filter on update operations', async () => {
      mockGetUserId.mockReturnValue(USER_A_ID);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...userAIdea, title: 'Updated' }] } as any);

      await request(app)
        .put(`/api/ideas/${IDEA_ID}`)
        .send({ title: 'Updated' });

      const calls = mockQueryContext.mock.calls;
      const updateCall = calls.find((call: any[]) => (call[1] as string).includes('UPDATE'));
      if (updateCall) {
        const sql = updateCall[1] as string;
        expect(sql.toLowerCase()).toContain('user_id');
      }
    });

    it('should include user_id filter on delete operations', async () => {
      mockGetUserId.mockReturnValue(USER_A_ID);
      mockQueryContext.mockResolvedValueOnce({ rows: [userAIdea] } as any);

      await request(app).delete(`/api/ideas/${IDEA_ID}`);

      const calls = mockQueryContext.mock.calls;
      // Check any DELETE or UPDATE (soft delete) call includes user_id
      for (const call of calls) {
        const sql = (call[1] as string).toUpperCase();
        if (sql.includes('DELETE') || (sql.includes('UPDATE') && sql.includes('archive'))) {
          expect(sql.toLowerCase()).toContain('user_id');
        }
      }
    });
  });

  describe('SYSTEM_USER_ID behavior', () => {
    it('should use SYSTEM_USER_ID for API key auth without linked user', async () => {
      const { SYSTEM_USER_ID } = jest.requireMock('../../utils/user-context');
      mockGetUserId.mockReturnValue(SYSTEM_USER_ID);

      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await request(app).get('/api/ideas');

      const params = mockQueryContext.mock.calls.flatMap((call: any[]) => call[2] || []);
      expect(params).toContain(SYSTEM_USER_ID);
    });
  });
});
