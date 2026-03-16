/**
 * Phase 87: Prospective Memory + Metamemory Tests
 *
 * Tests for prospective memory CRUD, trigger checking, status transitions,
 * metamemory stats, knowledge gaps, confidence distribution, and conflicts.
 */

import express from 'express';
import request from 'supertest';
import { queryContext } from '../../../utils/database-context';
import {
  createProspectiveMemory,
  checkTimeBasedTriggers,
  checkActivityTriggers,
  checkContextTriggers,
  fireMemory,
  dismissMemory,
  listPending,
  getExpiredAndCleanup,
} from '../../../services/memory/prospective-memory';
import {
  getMetamemoryStats,
  getKnowledgeGaps,
  getConfidenceDistribution,
  findConflicts,
} from '../../../services/memory/metamemory';

// ===========================================
// Mocks
// ===========================================

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: () => 'test-user-001',
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

// ===========================================
// Mock Data
// ===========================================

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

const mockProspectiveRow = {
  id: 'pm-001',
  user_id: SYSTEM_USER_ID,
  trigger_type: 'time' as const,
  trigger_condition: { time: '2026-03-17T09:00:00Z' },
  memory_content: 'Remember to send weekly report',
  priority: 'high' as const,
  status: 'pending' as const,
  fired_at: null,
  expires_at: '2026-03-18T00:00:00Z',
  created_at: '2026-03-16T10:00:00Z',
  updated_at: '2026-03-16T10:00:00Z',
};

const mockActivityRow = {
  ...mockProspectiveRow,
  id: 'pm-002',
  trigger_type: 'activity' as const,
  trigger_condition: { page: 'finance' },
  memory_content: 'Check Q1 budget when on finance page',
};

const mockContextRow = {
  ...mockProspectiveRow,
  id: 'pm-003',
  trigger_type: 'context' as const,
  trigger_condition: { context: 'work' },
  memory_content: 'Follow up with client during work context',
};

// ===========================================
// Prospective Memory Service Tests
// ===========================================

describe('ProspectiveMemory Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('createProspectiveMemory', () => {
    it('should create a time-based prospective memory', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockProspectiveRow], rowCount: 1 } as any);

      const result = await createProspectiveMemory('personal', SYSTEM_USER_ID, {
        triggerType: 'time',
        triggerCondition: { time: '2026-03-17T09:00:00Z' },
        memoryContent: 'Remember to send weekly report',
        priority: 'high',
        expiresAt: '2026-03-18T00:00:00Z',
      });

      expect(result.id).toBe('pm-001');
      expect(result.triggerType).toBe('time');
      expect(result.memoryContent).toBe('Remember to send weekly report');
      expect(result.priority).toBe('high');
      expect(result.status).toBe('pending');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO prospective_memories'),
        expect.arrayContaining([SYSTEM_USER_ID, 'time'])
      );
    });

    it('should create with default priority medium', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...mockProspectiveRow, priority: 'medium' }],
        rowCount: 1,
      } as any);

      const result = await createProspectiveMemory('work', SYSTEM_USER_ID, {
        triggerType: 'activity',
        triggerCondition: { page: 'dashboard' },
        memoryContent: 'Check notifications',
      });

      expect(result.priority).toBe('medium');
    });

    it('should create an activity-based prospective memory', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockActivityRow], rowCount: 1 } as any);

      const result = await createProspectiveMemory('personal', SYSTEM_USER_ID, {
        triggerType: 'activity',
        triggerCondition: { page: 'finance' },
        memoryContent: 'Check Q1 budget when on finance page',
      });

      expect(result.triggerType).toBe('activity');
      expect(result.triggerCondition).toEqual({ page: 'finance' });
    });

    it('should create a context-based prospective memory', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockContextRow], rowCount: 1 } as any);

      const result = await createProspectiveMemory('work', SYSTEM_USER_ID, {
        triggerType: 'context',
        triggerCondition: { context: 'work' },
        memoryContent: 'Follow up with client during work context',
      });

      expect(result.triggerType).toBe('context');
    });

    it('should pass null for expiresAt when not provided', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...mockProspectiveRow, expires_at: null }],
        rowCount: 1,
      } as any);

      await createProspectiveMemory('personal', SYSTEM_USER_ID, {
        triggerType: 'time',
        triggerCondition: { time: '2026-03-17T09:00:00Z' },
        memoryContent: 'Test',
      });

      const callArgs = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(callArgs[5]).toBeNull(); // expiresAt
    });
  });

  describe('checkTimeBasedTriggers', () => {
    it('should return time-based memories whose trigger time has passed', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockProspectiveRow], rowCount: 1 } as any);

      const results = await checkTimeBasedTriggers('personal');

      expect(results).toHaveLength(1);
      expect(results[0].triggerType).toBe('time');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("trigger_type = 'time'"),
        []
      );
    });

    it('should return empty array when no triggers are due', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const results = await checkTimeBasedTriggers('work');

      expect(results).toHaveLength(0);
    });
  });

  describe('checkActivityTriggers', () => {
    it('should return memories matching the current page', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockActivityRow], rowCount: 1 } as any);

      const results = await checkActivityTriggers('personal', SYSTEM_USER_ID, 'finance');

      expect(results).toHaveLength(1);
      expect(results[0].memoryContent).toBe('Check Q1 budget when on finance page');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("trigger_type = 'activity'"),
        [SYSTEM_USER_ID, 'finance']
      );
    });

    it('should return empty when no activity matches', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const results = await checkActivityTriggers('personal', SYSTEM_USER_ID, 'settings');

      expect(results).toHaveLength(0);
    });
  });

  describe('checkContextTriggers', () => {
    it('should return memories matching the current context', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockContextRow], rowCount: 1 } as any);

      const results = await checkContextTriggers('work', SYSTEM_USER_ID);

      expect(results).toHaveLength(1);
      expect(results[0].triggerCondition).toEqual({ context: 'work' });
    });

    it('should return empty when no context matches', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const results = await checkContextTriggers('learning', SYSTEM_USER_ID);

      expect(results).toHaveLength(0);
    });
  });

  describe('fireMemory', () => {
    it('should fire a pending memory', async () => {
      const firedRow = {
        ...mockProspectiveRow,
        status: 'fired',
        fired_at: '2026-03-17T09:05:00Z',
      };
      mockQueryContext.mockResolvedValueOnce({ rows: [firedRow], rowCount: 1 } as any);

      const result = await fireMemory('personal', 'pm-001');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('fired');
      expect(result!.firedAt).toBeTruthy();
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("status = 'fired'"),
        ['pm-001']
      );
    });

    it('should return null when memory not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await fireMemory('personal', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when memory is not pending', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await fireMemory('personal', 'pm-already-fired');

      expect(result).toBeNull();
    });
  });

  describe('dismissMemory', () => {
    it('should dismiss a pending memory', async () => {
      const dismissedRow = { ...mockProspectiveRow, status: 'dismissed' };
      mockQueryContext.mockResolvedValueOnce({ rows: [dismissedRow], rowCount: 1 } as any);

      const result = await dismissMemory('personal', 'pm-001');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('dismissed');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("status = 'dismissed'"),
        ['pm-001']
      );
    });

    it('should return null when memory not found or not pending', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await dismissMemory('personal', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listPending', () => {
    it('should list all pending memories for a user sorted by priority', async () => {
      const highPriority = { ...mockProspectiveRow, priority: 'high' };
      const lowPriority = { ...mockProspectiveRow, id: 'pm-004', priority: 'low' };
      mockQueryContext.mockResolvedValueOnce({
        rows: [highPriority, lowPriority],
        rowCount: 2,
      } as any);

      const results = await listPending('personal', SYSTEM_USER_ID);

      expect(results).toHaveLength(2);
      expect(results[0].priority).toBe('high');
      expect(results[1].priority).toBe('low');
    });

    it('should return empty array when no pending memories', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const results = await listPending('work', SYSTEM_USER_ID);

      expect(results).toHaveLength(0);
    });
  });

  describe('getExpiredAndCleanup', () => {
    it('should expire and count old memories', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 3 } as any);

      const count = await getExpiredAndCleanup('personal');

      expect(count).toBe(3);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("status = 'expired'"),
        []
      );
    });

    it('should return 0 when nothing to expire', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const count = await getExpiredAndCleanup('work');

      expect(count).toBe(0);
    });
  });
});

// ===========================================
// Metamemory Service Tests
// ===========================================

describe('Metamemory Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('getMetamemoryStats', () => {
    it('should return aggregated stats', async () => {
      // Stats query
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          total: '42',
          high_confidence: '25',
          medium_confidence: '12',
          low_confidence: '5',
          avg_confidence: '0.782',
        }],
        rowCount: 1,
      } as any);

      // Categories query
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { category: 'technology', count: '15' },
          { category: 'science', count: '10' },
        ],
        rowCount: 2,
      } as any);

      // Gaps query
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { category: 'art', count: '2' },
          { category: 'music', count: '1' },
        ],
        rowCount: 2,
      } as any);

      const stats = await getMetamemoryStats('personal', SYSTEM_USER_ID);

      expect(stats.totalFacts).toBe(42);
      expect(stats.highConfidence).toBe(25);
      expect(stats.mediumConfidence).toBe(12);
      expect(stats.lowConfidence).toBe(5);
      expect(stats.averageConfidence).toBe(0.782);
      expect(stats.topCategories).toHaveLength(2);
      expect(stats.topCategories[0].category).toBe('technology');
      expect(stats.knowledgeGaps).toContain('art');
      expect(stats.knowledgeGaps).toContain('music');
    });

    it('should handle zero facts', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          total: '0',
          high_confidence: '0',
          medium_confidence: '0',
          low_confidence: '0',
          avg_confidence: '0',
        }],
        rowCount: 1,
      } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const stats = await getMetamemoryStats('personal', SYSTEM_USER_ID);

      expect(stats.totalFacts).toBe(0);
      expect(stats.topCategories).toHaveLength(0);
      expect(stats.knowledgeGaps).toHaveLength(0);
    });
  });

  describe('getKnowledgeGaps', () => {
    it('should return categories with few facts', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { category: 'philosophy', count: '2' },
          { category: 'cooking', count: '1' },
        ],
        rowCount: 2,
      } as any);

      const gaps = await getKnowledgeGaps('personal', SYSTEM_USER_ID);

      expect(gaps).toHaveLength(2);
      expect(gaps[0].category).toBe('philosophy');
      expect(gaps[0].count).toBe(2);
      expect(gaps[0].suggestion).toContain('philosophy');
    });

    it('should return empty when no gaps', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const gaps = await getKnowledgeGaps('work', SYSTEM_USER_ID);

      expect(gaps).toHaveLength(0);
    });
  });

  describe('getConfidenceDistribution', () => {
    it('should return histogram buckets', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { range: '0.9-1.0', count: '15' },
          { range: '0.8-0.9', count: '10' },
          { range: '0.5-0.6', count: '3' },
        ],
        rowCount: 3,
      } as any);

      const dist = await getConfidenceDistribution('personal', SYSTEM_USER_ID);

      expect(dist).toHaveLength(3);
      expect(dist[0].range).toBe('0.9-1.0');
      expect(dist[0].count).toBe(15);
    });
  });

  describe('findConflicts', () => {
    it('should find similar facts', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          fact1_id: 'f-001',
          fact1_content: 'React uses a virtual DOM',
          fact2_id: 'f-002',
          fact2_content: 'React does not use a virtual DOM',
          sim: 0.75,
        }],
        rowCount: 1,
      } as any);

      const conflicts = await findConflicts('personal', SYSTEM_USER_ID, 0.4);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].fact1Id).toBe('f-001');
      expect(conflicts[0].fact2Id).toBe('f-002');
      expect(conflicts[0].similarity).toBe(0.75);
    });

    it('should return empty when no conflicts found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const conflicts = await findConflicts('personal', SYSTEM_USER_ID);

      expect(conflicts).toHaveLength(0);
    });

    it('should gracefully handle pg_trgm not being available', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('function similarity(text, text) does not exist'));

      const conflicts = await findConflicts('personal', SYSTEM_USER_ID);

      expect(conflicts).toHaveLength(0);
    });
  });
});

// ===========================================
// Route Integration Tests
// ===========================================

describe('Prospective Memory Routes', () => {
  let app: express.Application;

  beforeAll(async () => {
    const { prospectiveMemoryRouter } = await import('../../../routes/prospective-memory');
    const { errorHandler } = await import('../../../middleware/errorHandler');
    app = express();
    app.use(express.json());
    app.use('/api', prospectiveMemoryRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('GET /api/:context/memory/prospective', () => {
    it('should list pending memories', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockProspectiveRow],
        rowCount: 1,
      } as any);

      const res = await request(app).get('/api/personal/memory/prospective');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should reject invalid context', async () => {
      const res = await request(app).get('/api/invalid/memory/prospective');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/:context/memory/prospective', () => {
    it('should create a prospective memory', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [mockProspectiveRow],
        rowCount: 1,
      } as any);

      const res = await request(app)
        .post('/api/personal/memory/prospective')
        .send({
          triggerType: 'time',
          triggerCondition: { time: '2026-03-17T09:00:00Z' },
          memoryContent: 'Remember to send weekly report',
          priority: 'high',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.triggerType).toBe('time');
    });

    it('should reject invalid triggerType', async () => {
      const res = await request(app)
        .post('/api/personal/memory/prospective')
        .send({
          triggerType: 'invalid',
          triggerCondition: {},
          memoryContent: 'Test',
        });

      expect(res.status).toBe(400);
    });

    it('should reject missing memoryContent', async () => {
      const res = await request(app)
        .post('/api/personal/memory/prospective')
        .send({
          triggerType: 'time',
          triggerCondition: { time: '2026-03-17' },
        });

      expect(res.status).toBe(400);
    });

    it('should reject invalid priority', async () => {
      const res = await request(app)
        .post('/api/personal/memory/prospective')
        .send({
          triggerType: 'time',
          triggerCondition: { time: '2026-03-17' },
          memoryContent: 'Test',
          priority: 'urgent',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/:context/memory/prospective/:id/fire', () => {
    it('should fire a memory', async () => {
      const firedRow = { ...mockProspectiveRow, status: 'fired', fired_at: '2026-03-17T09:05:00Z' };
      mockQueryContext.mockResolvedValueOnce({ rows: [firedRow], rowCount: 1 } as any);

      const res = await request(app).post('/api/personal/memory/prospective/pm-001/fire');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('fired');
    });

    it('should return 404 for nonexistent memory', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await request(app).post('/api/personal/memory/prospective/nonexistent/fire');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/:context/memory/prospective/:id/dismiss', () => {
    it('should dismiss a memory', async () => {
      const dismissedRow = { ...mockProspectiveRow, status: 'dismissed' };
      mockQueryContext.mockResolvedValueOnce({ rows: [dismissedRow], rowCount: 1 } as any);

      const res = await request(app).post('/api/personal/memory/prospective/pm-001/dismiss');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('dismissed');
    });

    it('should return 404 for nonexistent memory', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await request(app).post('/api/personal/memory/prospective/nonexistent/dismiss');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/:context/memory/metamemory/stats', () => {
    it('should return metamemory stats', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ total: '10', high_confidence: '5', medium_confidence: '3', low_confidence: '2', avg_confidence: '0.75' }],
        rowCount: 1,
      } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ category: 'tech', count: '5' }], rowCount: 1 } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ category: 'art', count: '2' }], rowCount: 1 } as any);

      const res = await request(app).get('/api/personal/memory/metamemory/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalFacts).toBe(10);
    });
  });

  describe('GET /api/:context/memory/metamemory/gaps', () => {
    it('should return knowledge gaps', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ category: 'history', count: '2' }],
        rowCount: 1,
      } as any);

      const res = await request(app).get('/api/personal/memory/metamemory/gaps');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].category).toBe('history');
    });
  });

  describe('GET /api/:context/memory/metamemory/conflicts', () => {
    it('should return conflicts', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          fact1_id: 'f1',
          fact1_content: 'A is true',
          fact2_id: 'f2',
          fact2_content: 'A is false',
          sim: 0.6,
        }],
        rowCount: 1,
      } as any);

      const res = await request(app).get('/api/personal/memory/metamemory/conflicts');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].similarity).toBe(0.6);
    });

    it('should accept custom threshold', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await request(app).get('/api/personal/memory/metamemory/conflicts?threshold=0.8');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });
});
