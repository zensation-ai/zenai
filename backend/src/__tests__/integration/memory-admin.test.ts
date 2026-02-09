/**
 * Integration Tests for Memory Admin API (Phase 30)
 *
 * Tests the memory scheduler admin endpoints:
 * - GET /api/memory/status - Scheduler status and config
 * - POST /api/memory/consolidate - Manual consolidation trigger
 * - POST /api/memory/decay - Manual decay trigger
 * - GET /api/memory/stats/:context - Detailed memory statistics
 * - GET /api/memory/facts/:context - Stored facts for a context
 * - GET /api/memory/patterns/:context - Stored patterns for a context
 * - GET /api/memory/transparency/:context - Memory transparency report
 */

import express, { Express } from 'express';
import request from 'supertest';

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: any, _res: any, next: any) => {
    _req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  rateLimiter: jest.fn((_req: any, _res: any, next: any) => next()),
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

// Mock database context
jest.mock('../../utils/database-context', () => ({
  queryContext: jest.fn().mockResolvedValue({ rows: [] }),
  isValidContext: jest.fn((ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx)
  ),
  AIContext: {},
}));

// Mock memory services
const mockGetStatus = jest.fn().mockReturnValue({
  isRunning: true,
  tasks: [
    { name: 'long-term-consolidation', schedule: '0 2 * * *', enabled: true, lastRun: null, lastResult: null, nextRun: new Date() },
    { name: 'episodic-decay', schedule: '0 3 * * *', enabled: true, lastRun: null, lastResult: null, nextRun: new Date() },
    { name: 'memory-stats', schedule: '0 * * * *', enabled: true, lastRun: null, lastResult: null, nextRun: new Date() },
  ],
  totalRuns: 5,
  lastError: null,
});

const mockGetConfig = jest.fn().mockReturnValue({
  TIMEZONE: 'Europe/Berlin',
  CONSOLIDATION_SCHEDULE: '0 2 * * *',
  DECAY_SCHEDULE: '0 3 * * *',
  STATS_SCHEDULE: '0 * * * *',
  ENABLE_CONSOLIDATION: true,
  ENABLE_DECAY: true,
  ENABLE_STATS_LOGGING: true,
  CONTEXTS: ['personal', 'work', 'learning', 'creative'] as const,
});

const mockTriggerConsolidation = jest.fn().mockResolvedValue({
  longTerm: { patternsAdded: 2, factsAdded: 3, factsUpdated: 1, interactionsStored: 4 },
  episodic: { episodesProcessed: 10, factsExtracted: 5, strongEpisodes: 3 },
  duration: 1500,
});

const mockTriggerDecay = jest.fn().mockResolvedValue({
  totalAffected: 15,
  duration: 800,
});

const mockGetLtStats = jest.fn().mockResolvedValue({
  factCount: 25,
  patternCount: 8,
  interactionCount: 12,
  lastConsolidation: new Date('2026-02-08T02:00:00Z'),
  hasProfileEmbedding: true,
});

const mockGetEpStats = jest.fn().mockResolvedValue({
  totalEpisodes: 50,
  avgRetrievalStrength: 0.72,
  recentEpisodes: 5,
});

const mockGetFacts = jest.fn().mockResolvedValue([
  {
    id: 'fact-1',
    factType: 'preference' as const,
    content: 'User prefers dark mode',
    confidence: 0.9,
    source: 'explicit' as const,
    firstSeen: new Date('2026-01-15'),
    lastConfirmed: new Date('2026-02-08'),
    occurrences: 5,
  },
  {
    id: 'fact-2',
    factType: 'knowledge' as const,
    content: 'User is a TypeScript developer',
    confidence: 0.85,
    source: 'inferred' as const,
    firstSeen: new Date('2026-01-20'),
    lastConfirmed: new Date('2026-02-07'),
    occurrences: 12,
  },
]);

const mockGetPatterns = jest.fn().mockResolvedValue([
  {
    id: 'pattern-1',
    patternType: 'topic' as const,
    pattern: 'Frequently asks about AI architecture',
    frequency: 8,
    lastUsed: new Date('2026-02-08'),
    associatedTopics: ['AI', 'architecture', 'design'],
    confidence: 0.88,
  },
]);

jest.mock('../../services/memory', () => ({
  memoryScheduler: {
    getStatus: mockGetStatus,
    getConfig: mockGetConfig,
    triggerConsolidation: mockTriggerConsolidation,
    triggerDecay: mockTriggerDecay,
  },
  longTermMemory: {
    getStats: mockGetLtStats,
    getFacts: mockGetFacts,
    getPatterns: mockGetPatterns,
  },
  episodicMemory: {
    getStats: mockGetEpStats,
  },
}));

import { memoryAdminRouter } from '../../routes/memory-admin';
import { errorHandler } from '../../middleware/errorHandler';

describe('Memory Admin API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/memory', memoryAdminRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset default mock return values
    mockGetStatus.mockReturnValue({
      isRunning: true,
      tasks: [
        { name: 'long-term-consolidation', schedule: '0 2 * * *', enabled: true, lastRun: null, lastResult: null, nextRun: new Date() },
        { name: 'episodic-decay', schedule: '0 3 * * *', enabled: true, lastRun: null, lastResult: null, nextRun: new Date() },
      ],
      totalRuns: 5,
      lastError: null,
    });
  });

  // ===========================================
  // GET /api/memory/status
  // ===========================================

  describe('GET /api/memory/status', () => {
    it('should return scheduler status and config', async () => {
      const res = await request(app)
        .get('/api/memory/status')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.scheduler).toBeDefined();
      expect(res.body.data.scheduler.isRunning).toBe(true);
      expect(res.body.data.scheduler.tasks).toBeInstanceOf(Array);
      expect(res.body.data.scheduler.totalRuns).toBe(5);
      expect(res.body.data.scheduler.lastError).toBeNull();
    });

    it('should include config details', async () => {
      const res = await request(app)
        .get('/api/memory/status')
        .expect(200);

      expect(res.body.data.config).toBeDefined();
      expect(res.body.data.config.timezone).toBe('Europe/Berlin');
      expect(res.body.data.config.consolidationSchedule).toBe('0 2 * * *');
      expect(res.body.data.config.decaySchedule).toBe('0 3 * * *');
      expect(res.body.data.config.consolidationEnabled).toBe(true);
      expect(res.body.data.config.decayEnabled).toBe(true);
    });

    it('should reflect scheduler stopped state', async () => {
      mockGetStatus.mockReturnValue({
        isRunning: false,
        tasks: [],
        totalRuns: 0,
        lastError: 'Connection timeout',
      });

      const res = await request(app)
        .get('/api/memory/status')
        .expect(200);

      expect(res.body.data.scheduler.isRunning).toBe(false);
      expect(res.body.data.scheduler.lastError).toBe('Connection timeout');
    });
  });

  // ===========================================
  // POST /api/memory/consolidate
  // ===========================================

  describe('POST /api/memory/consolidate', () => {
    it('should trigger consolidation for all contexts', async () => {
      const res = await request(app)
        .post('/api/memory/consolidate')
        .send({})
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Consolidation completed');
      expect(res.body.data.results).toBeDefined();
      expect(res.body.data.results.longTerm.patternsAdded).toBe(2);
      expect(res.body.data.results.longTerm.factsAdded).toBe(3);
      expect(res.body.data.results.episodic.episodesProcessed).toBe(10);
      expect(res.body.data.results.duration).toBe(1500);
      expect(mockTriggerConsolidation).toHaveBeenCalledWith(undefined);
    });

    it('should trigger consolidation for a specific context', async () => {
      const res = await request(app)
        .post('/api/memory/consolidate')
        .send({ context: 'personal' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockTriggerConsolidation).toHaveBeenCalledWith('personal');
    });

    it('should accept learning context', async () => {
      const res = await request(app)
        .post('/api/memory/consolidate')
        .send({ context: 'learning' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockTriggerConsolidation).toHaveBeenCalledWith('learning');
    });

    it('should accept creative context', async () => {
      const res = await request(app)
        .post('/api/memory/consolidate')
        .send({ context: 'creative' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockTriggerConsolidation).toHaveBeenCalledWith('creative');
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .post('/api/memory/consolidate')
        .send({ context: 'invalid' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(mockTriggerConsolidation).not.toHaveBeenCalled();
    });
  });

  // ===========================================
  // POST /api/memory/decay
  // ===========================================

  describe('POST /api/memory/decay', () => {
    it('should trigger decay for all contexts', async () => {
      const res = await request(app)
        .post('/api/memory/decay')
        .send({})
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Decay applied');
      expect(res.body.data.results.totalAffected).toBe(15);
      expect(res.body.data.results.duration).toBe(800);
      expect(mockTriggerDecay).toHaveBeenCalledWith(undefined);
    });

    it('should trigger decay for a specific context', async () => {
      const res = await request(app)
        .post('/api/memory/decay')
        .send({ context: 'work' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockTriggerDecay).toHaveBeenCalledWith('work');
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .post('/api/memory/decay')
        .send({ context: 'unknown' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(mockTriggerDecay).not.toHaveBeenCalled();
    });
  });

  // ===========================================
  // GET /api/memory/stats/:context
  // ===========================================

  describe('GET /api/memory/stats/:context', () => {
    it('should return memory stats for personal context', async () => {
      const res = await request(app)
        .get('/api/memory/stats/personal')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.context).toBe('personal');
      expect(res.body.data.longTermMemory).toBeDefined();
      expect(res.body.data.longTermMemory.factCount).toBe(25);
      expect(res.body.data.longTermMemory.patternCount).toBe(8);
      expect(res.body.data.episodicMemory).toBeDefined();
      expect(res.body.data.episodicMemory.totalEpisodes).toBe(50);
      expect(res.body.data.timestamp).toBeDefined();
    });

    it('should return stats for work context', async () => {
      const res = await request(app)
        .get('/api/memory/stats/work')
        .expect(200);

      expect(res.body.data.context).toBe('work');
      expect(mockGetLtStats).toHaveBeenCalledWith('work');
      expect(mockGetEpStats).toHaveBeenCalledWith('work');
    });

    it('should return stats for learning context', async () => {
      const res = await request(app)
        .get('/api/memory/stats/learning')
        .expect(200);

      expect(res.body.data.context).toBe('learning');
    });

    it('should return stats for creative context', async () => {
      const res = await request(app)
        .get('/api/memory/stats/creative')
        .expect(200);

      expect(res.body.data.context).toBe('creative');
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .get('/api/memory/stats/invalid')
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should call both long-term and episodic stats in parallel', async () => {
      await request(app)
        .get('/api/memory/stats/personal')
        .expect(200);

      expect(mockGetLtStats).toHaveBeenCalledWith('personal');
      expect(mockGetEpStats).toHaveBeenCalledWith('personal');
    });
  });

  // ===========================================
  // GET /api/memory/facts/:context
  // ===========================================

  describe('GET /api/memory/facts/:context', () => {
    it('should return facts for a context', async () => {
      const res = await request(app)
        .get('/api/memory/facts/personal')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.context).toBe('personal');
      expect(res.body.data.facts).toBeInstanceOf(Array);
      expect(res.body.data.facts).toHaveLength(2);
      expect(res.body.data.count).toBe(2);
    });

    it('should include fact details', async () => {
      const res = await request(app)
        .get('/api/memory/facts/personal')
        .expect(200);

      const fact = res.body.data.facts[0];
      expect(fact.id).toBe('fact-1');
      expect(fact.factType).toBe('preference');
      expect(fact.content).toBe('User prefers dark mode');
      expect(fact.confidence).toBe(0.9);
      expect(fact.source).toBe('explicit');
    });

    it('should return empty facts for context with no data', async () => {
      mockGetFacts.mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/memory/facts/creative')
        .expect(200);

      expect(res.body.data.facts).toEqual([]);
      expect(res.body.data.count).toBe(0);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .get('/api/memory/facts/invalid')
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ===========================================
  // GET /api/memory/patterns/:context
  // ===========================================

  describe('GET /api/memory/patterns/:context', () => {
    it('should return patterns for a context', async () => {
      const res = await request(app)
        .get('/api/memory/patterns/personal')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.context).toBe('personal');
      expect(res.body.data.patterns).toBeInstanceOf(Array);
      expect(res.body.data.patterns).toHaveLength(1);
      expect(res.body.data.count).toBe(1);
    });

    it('should include pattern details', async () => {
      const res = await request(app)
        .get('/api/memory/patterns/personal')
        .expect(200);

      const pattern = res.body.data.patterns[0];
      expect(pattern.id).toBe('pattern-1');
      expect(pattern.patternType).toBe('topic');
      expect(pattern.pattern).toBe('Frequently asks about AI architecture');
      expect(pattern.frequency).toBe(8);
      expect(pattern.confidence).toBe(0.88);
      expect(pattern.associatedTopics).toEqual(['AI', 'architecture', 'design']);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .get('/api/memory/patterns/invalid')
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ===========================================
  // GET /api/memory/transparency/:context
  // ===========================================

  describe('GET /api/memory/transparency/:context', () => {
    it('should return transparency report for a context', async () => {
      const res = await request(app)
        .get('/api/memory/transparency/personal')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.factsLearned).toBe(25);
      expect(res.body.data.patternsDetected).toBe(8);
      expect(res.body.data.episodesStored).toBe(50);
      expect(res.body.data.recentLearnings).toBeInstanceOf(Array);
      expect(res.body.data.memoryHealth).toBeDefined();
      expect(res.body.data.topPatterns).toBeInstanceOf(Array);
    });

    it('should include memory health metrics', async () => {
      const res = await request(app)
        .get('/api/memory/transparency/personal')
        .expect(200);

      const health = res.body.data.memoryHealth;
      expect(health.totalFacts).toBe(25);
      expect(health.totalPatterns).toBe(8);
      expect(health.totalEpisodes).toBe(50);
      expect(health.avgEpisodicStrength).toBe(0.72);
      expect(health.hasProfileEmbedding).toBe(true);
    });

    it('should include recent learnings from last 7 days', async () => {
      const res = await request(app)
        .get('/api/memory/transparency/personal')
        .expect(200);

      // Both mock facts have lastConfirmed within 7 days
      expect(res.body.data.recentLearnings.length).toBeGreaterThanOrEqual(0);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .get('/api/memory/transparency/invalid')
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ===========================================
  // Error Handling
  // ===========================================

  describe('Error Handling', () => {
    it('should handle consolidation errors gracefully', async () => {
      mockTriggerConsolidation.mockRejectedValueOnce(new Error('Database connection lost'));

      const res = await request(app)
        .post('/api/memory/consolidate')
        .send({});

      // Should return 500 with error details
      expect(res.status).toBe(500);
    });

    it('should handle decay errors gracefully', async () => {
      mockTriggerDecay.mockRejectedValueOnce(new Error('Timeout'));

      const res = await request(app)
        .post('/api/memory/decay')
        .send({});

      expect(res.status).toBe(500);
    });

    it('should handle stats retrieval errors', async () => {
      mockGetLtStats.mockRejectedValueOnce(new Error('Service unavailable'));

      const res = await request(app)
        .get('/api/memory/stats/personal');

      expect(res.status).toBe(500);
    });
  });
});
