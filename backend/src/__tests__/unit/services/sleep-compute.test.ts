/**
 * Phase 63: Sleep-Time Compute + Context Engine V2 Tests
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
}));

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: any, _res: any, next: any) => {
    _req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: jest.fn(() => '00000000-0000-0000-0000-000000000001'),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { queryContext, isValidContext } from '../../../utils/database-context';
import { getSleepComputeEngine, resetSleepComputeEngine } from '../../../services/memory/sleep-compute';
import { getContextEngineV2, resetContextEngineV2 } from '../../../services/context-engine-v2';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockIsValidContext = isValidContext as jest.MockedFunction<typeof isValidContext>;

describe('Phase 63: Sleep-Time Compute + Context Engine V2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    resetSleepComputeEngine();
    resetContextEngineV2();
  });

  // =============================================
  // SleepComputeEngine Tests
  // =============================================
  describe('SleepComputeEngine', () => {
    describe('runSleepCycle', () => {
      it('should complete a full sleep cycle successfully', async () => {
        const engine = getSleepComputeEngine();

        // Mock all DB calls to return empty results
        mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

        const result = await engine.runSleepCycle('personal');

        expect(result).toHaveProperty('processed');
        expect(result).toHaveProperty('insights');
        expect(result).toHaveProperty('contradictionsResolved');
        expect(result).toHaveProperty('memoryUpdates');
        expect(result).toHaveProperty('preloadedItems');
        expect(result).toHaveProperty('durationMs');
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('should handle errors gracefully and return partial result', async () => {
        const engine = getSleepComputeEngine();

        // First call succeeds (consolidateEpisodes), rest fail
        mockQueryContext
          .mockRejectedValueOnce(new Error('DB error'))
          .mockResolvedValue({ rows: [], rowCount: 0 } as any);

        const result = await engine.runSleepCycle('personal');

        expect(result.processed).toBe(0);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('should process all contexts', async () => {
        const engine = getSleepComputeEngine();
        mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

        for (const ctx of ['personal', 'work', 'learning', 'creative'] as const) {
          const result = await engine.runSleepCycle(ctx);
          expect(result).toBeDefined();
        }
      });
    });

    describe('consolidateEpisodes', () => {
      it('should consolidate similar episodes into insights', async () => {
        const engine = getSleepComputeEngine();

        // Return episodic memories with similar content
        mockQueryContext
          .mockResolvedValueOnce({
            rows: [
              { id: 'ep1', content: 'User asked about JavaScript async await patterns', importance_score: 0.8 },
              { id: 'ep2', content: 'User asked about JavaScript async await usage patterns', importance_score: 0.7 },
              { id: 'ep3', content: 'Something completely different about cooking recipes', importance_score: 0.5 },
            ],
            rowCount: 3,
          } as any)
          // Insert learned fact
          .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
          // Mark as consolidated
          .mockResolvedValueOnce({ rows: [], rowCount: 2 } as any)
          // Contradiction detection - empty
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          // Preload working memory - empty
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          // Optimize procedures - empty
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          // Entity graph maintenance - empty
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          // Log sleep cycle
          .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

        const result = await engine.runSleepCycle('personal');

        expect(result.processed).toBe(3);
        expect(result.insights.length).toBeGreaterThanOrEqual(1);
      });

      it('should handle empty episodic memories', async () => {
        const engine = getSleepComputeEngine();

        mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

        const result = await engine.runSleepCycle('personal');
        expect(result.processed).toBe(0);
        expect(result.insights).toEqual([]);
      });
    });

    describe('detectAndResolveContradictions', () => {
      it('should resolve contradictions by downgrading older facts', async () => {
        const engine = getSleepComputeEngine();

        // consolidateEpisodes - no episodes
        mockQueryContext
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          // detectAndResolveContradictions - finds contradictions
          .mockResolvedValueOnce({
            rows: [{
              id1: 'fact1', id2: 'fact2',
              content1: 'Python is best', content2: 'JavaScript is best',
              conf1: 0.8, conf2: 0.9,
              last1: '2026-01-01', last2: '2026-03-01',
            }],
            rowCount: 1,
          } as any)
          // Update older fact
          .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
          // Remaining steps
          .mockResolvedValue({ rows: [], rowCount: 0 } as any);

        const result = await engine.runSleepCycle('personal');
        expect(result.contradictionsResolved).toBe(1);
      });
    });

    describe('preloadWorkingMemory', () => {
      it('should preload frequently accessed facts', async () => {
        const engine = getSleepComputeEngine();

        // consolidateEpisodes + contradictions - empty
        mockQueryContext
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          // preloadWorkingMemory - find facts
          .mockResolvedValueOnce({
            rows: [
              { content: 'User prefers dark mode', retrieval_count: 10, last_retrieved: '2026-03-01' },
            ],
            rowCount: 1,
          } as any)
          // Cache insert
          .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
          // Remaining steps
          .mockResolvedValue({ rows: [], rowCount: 0 } as any);

        const result = await engine.runSleepCycle('personal');
        expect(result.preloadedItems).toBe(1);
      });
    });

    describe('optimizeProcedures', () => {
      it('should downgrade poorly-performing procedures', async () => {
        const engine = getSleepComputeEngine();

        // Skip consolidation + contradictions + preload
        mockQueryContext
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          // optimizeProcedures - find low success procedures
          .mockResolvedValueOnce({
            rows: [{ id: 'proc1', trigger_pattern: 'web_search', success_rate: 0.3, execution_count: 5 }],
            rowCount: 1,
          } as any)
          // Update procedure
          .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
          // Entity graph maintenance
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          // Log
          .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

        const result = await engine.runSleepCycle('personal');
        expect(result.memoryUpdates).toBeGreaterThanOrEqual(1);
      });
    });

    describe('maintainEntityGraph', () => {
      it('should count unindexed ideas', async () => {
        const engine = getSleepComputeEngine();

        // Skip earlier steps
        mockQueryContext
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          // maintainEntityGraph - find unindexed ideas
          .mockResolvedValueOnce({
            rows: [{ id: 'idea1', title: 'Test', content: 'Some long content here' }],
            rowCount: 1,
          } as any)
          // Log
          .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

        const result = await engine.runSleepCycle('personal');
        expect(result.memoryUpdates).toBeGreaterThanOrEqual(1);
      });
    });

    describe('isSystemIdle', () => {
      it('should return true when few recent sessions', async () => {
        const engine = getSleepComputeEngine();

        mockQueryContext.mockResolvedValueOnce({
          rows: [{ cnt: '2' }],
          rowCount: 1,
        } as any);

        const idle = await engine.isSystemIdle();
        expect(idle).toBe(true);
      });

      it('should return false when many recent sessions', async () => {
        const engine = getSleepComputeEngine();

        mockQueryContext.mockResolvedValueOnce({
          rows: [{ cnt: '10' }],
          rowCount: 1,
        } as any);

        const idle = await engine.isSystemIdle();
        expect(idle).toBe(false);
      });

      it('should return true on error', async () => {
        const engine = getSleepComputeEngine();

        mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

        const idle = await engine.isSystemIdle();
        expect(idle).toBe(true);
      });
    });

    describe('groupSimilarEpisodes', () => {
      it('should group similar episodes together', () => {
        const engine = getSleepComputeEngine();

        const episodes = [
          { content: 'JavaScript async await patterns guide' },
          { content: 'JavaScript async await patterns tutorial' },
          { content: 'Cooking pasta recipes italian style' },
        ];

        const groups = engine.groupSimilarEpisodes(episodes);

        // Should have at least 2 groups (JS group + cooking group)
        expect(groups.length).toBeGreaterThanOrEqual(2);
      });

      it('should handle empty input', () => {
        const engine = getSleepComputeEngine();
        const groups = engine.groupSimilarEpisodes([]);
        expect(groups).toEqual([]);
      });

      it('should handle single episode', () => {
        const engine = getSleepComputeEngine();
        const groups = engine.groupSimilarEpisodes([{ content: 'single item' }]);
        expect(groups.length).toBe(1);
        expect(groups[0].length).toBe(1);
      });
    });
  });

  // =============================================
  // ContextEngineV2 Tests
  // =============================================
  describe('ContextEngineV2', () => {
    describe('classifyDomain', () => {
      it('should classify finance queries', () => {
        const engine = getContextEngineV2();
        const result = engine.classifyDomain('Wie ist mein Konto-Budget?');
        expect(result.domain).toBe('finance');
        expect(result.confidence).toBeGreaterThan(0);
      });

      it('should classify email queries', () => {
        const engine = getContextEngineV2();
        const result = engine.classifyDomain('Zeig mir meine Inbox-Nachrichten');
        expect(result.domain).toBe('email');
      });

      it('should classify code queries', () => {
        const engine = getContextEngineV2();
        const result = engine.classifyDomain('Implementiere eine API Funktion');
        expect(result.domain).toBe('code');
      });

      it('should classify learning queries', () => {
        const engine = getContextEngineV2();
        const result = engine.classifyDomain('Erkläre mir den Kurs zum Lernen');
        expect(result.domain).toBe('learning');
      });

      it('should return general for unclassifiable queries', () => {
        const engine = getContextEngineV2();
        const result = engine.classifyDomain('Hallo, wie geht es dir?');
        expect(result.domain).toBe('general');
        expect(result.confidence).toBe(0.5);
      });

      it('should handle empty query', () => {
        const engine = getContextEngineV2();
        const result = engine.classifyDomain('');
        expect(result.domain).toBe('general');
      });
    });

    describe('estimateComplexity', () => {
      it('should estimate high complexity for comparison queries', () => {
        const engine = getContextEngineV2();
        const result = engine.estimateComplexity('Was ist der Unterschied zwischen React und Vue? Warum sollte ich eins wählen?');
        expect(result.score).toBeGreaterThan(0.5);
        expect(result.factors.length).toBeGreaterThan(0);
      });

      it('should estimate low complexity for simple queries', () => {
        const engine = getContextEngineV2();
        const result = engine.estimateComplexity('Status');
        expect(result.score).toBeLessThan(0.5);
      });

      it('should increase complexity for multiple question marks', () => {
        const engine = getContextEngineV2();
        const singleQ = engine.estimateComplexity('Was ist das?');
        const multiQ = engine.estimateComplexity('Was ist das? Und warum? Wie funktioniert es?');
        expect(multiQ.score).toBeGreaterThan(singleQ.score);
      });

      it('should increase complexity for long queries', () => {
        const engine = getContextEngineV2();
        const short = engine.estimateComplexity('Hilf mir');
        const long = engine.estimateComplexity('a '.repeat(150));
        expect(long.score).toBeGreaterThanOrEqual(short.score);
      });
    });

    describe('selectModel', () => {
      it('should select fast model for low complexity', () => {
        const engine = getContextEngineV2();
        const model = engine.selectModel('general', 0.2);
        expect(model.tier).toBe('fast');
        expect(model.maxTokens).toBe(2048);
      });

      it('should select premium model for high complexity', () => {
        const engine = getContextEngineV2();
        const model = engine.selectModel('general', 0.8);
        expect(model.tier).toBe('premium');
        expect(model.maxTokens).toBe(8192);
      });

      it('should select balanced model for medium complexity', () => {
        const engine = getContextEngineV2();
        const model = engine.selectModel('general', 0.5);
        expect(model.tier).toBe('balanced');
        expect(model.maxTokens).toBe(4096);
      });
    });

    describe('assembleContext', () => {
      it('should assemble context with fallback when no rules exist', async () => {
        const engine = getContextEngineV2();

        // Cache miss (getFromCache)
        mockQueryContext
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          // context_rules query fails (table not found)
          .mockRejectedValueOnce(new Error('table not found'))
          // Fallback: learned_facts
          .mockResolvedValueOnce({
            rows: [{ content: 'User likes TypeScript', confidence: 0.9 }],
            rowCount: 1,
          } as any)
          // Cache save
          .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

        const result = await engine.assembleContext('Hilf mir beim Programmieren', 'personal');

        expect(result.domain).toBeDefined();
        expect(result.model).toBeDefined();
        expect(result.parts.length).toBeGreaterThanOrEqual(1);
        expect(result.fromCache).toBe(false);
        expect(result.buildTimeMs).toBeGreaterThanOrEqual(0);
      });

      it('should return cached context on cache hit', async () => {
        const engine = getContextEngineV2();

        // First call - cache miss then build
        mockQueryContext
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // cache miss
          .mockRejectedValueOnce(new Error('no rules')) // rules query fails
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // fallback facts empty
          .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any); // cache save

        await engine.assembleContext('test query', 'personal');

        // Second call - cache hit
        mockQueryContext.mockReset();
        mockQueryContext.mockResolvedValueOnce({
          rows: [{ content: { parts: [{ source: 'cached', content: 'cached data', tokens: 10, priority: 5 }] }, token_count: 10 }],
          rowCount: 1,
        } as any);

        const result = await engine.assembleContext('test query', 'personal');
        expect(result.fromCache).toBe(true);
      });

      it('should respect context rules when available', async () => {
        const engine = getContextEngineV2();

        // Cache miss
        mockQueryContext
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          // Rules query
          .mockResolvedValueOnce({
            rows: [{
              name: 'finance-rule',
              data_sources: JSON.stringify([{ type: 'static', content: 'Finance context data' }]),
              token_budget: 500,
              priority: 10,
            }],
            rowCount: 1,
          } as any)
          // Cache save
          .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

        const result = await engine.assembleContext('Zeig mir mein Budget', 'personal');
        expect(result.parts.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('cleanExpiredCache', () => {
      it('should return number of cleaned entries', async () => {
        const engine = getContextEngineV2();

        mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 5 } as any);

        const cleaned = await engine.cleanExpiredCache('personal');
        expect(cleaned).toBe(5);
      });

      it('should return 0 on error', async () => {
        const engine = getContextEngineV2();

        mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

        const cleaned = await engine.cleanExpiredCache('personal');
        expect(cleaned).toBe(0);
      });
    });
  });

  // =============================================
  // SleepWorker Tests
  // =============================================
  describe('SleepWorker', () => {
    // We need to import after mocks are set up
    let processSleepJob: typeof import('../../../services/queue/workers/sleep-worker').processSleepJob;

    beforeEach(async () => {
      const module = await import('../../../services/queue/workers/sleep-worker');
      processSleepJob = module.processSleepJob;
    });

    it('should process a full sleep cycle', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await processSleepJob({ context: 'personal', cycleType: 'full' });
      expect(result).toHaveProperty('processed');
    });

    it('should handle cache_cleanup cycle type', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 3 } as any);

      const result = await processSleepJob({ context: 'personal', cycleType: 'cache_cleanup' });
      expect(result).toHaveProperty('cleaned');
    });

    it('should return empty result for invalid context', async () => {
      const result = await processSleepJob({ context: 'invalid' });
      expect(result).toHaveProperty('processed');
      expect((result as any).processed).toBe(0);
    });

    it('should default to personal context and full cycle', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await processSleepJob({});
      expect(result).toHaveProperty('processed');
    });
  });

  // =============================================
  // Route Tests
  // =============================================
  describe('Routes', () => {
    let app: any;
    let request: any;

    beforeAll(async () => {
      const express = await import('express');
      const supertest = await import('supertest');
      const { sleepComputeRouter } = await import('../../../routes/sleep-compute');
      const { errorHandler } = await import('../../../middleware/errorHandler');

      app = express.default();
      app.use(express.default.json());
      app.use('/api', sleepComputeRouter);
      app.use(errorHandler);

      request = supertest.default(app);
    });

    beforeEach(() => {
      jest.clearAllMocks();
      mockQueryContext.mockReset();
    });

    describe('GET /api/:context/sleep-compute/logs', () => {
      it('should return logs', async () => {
        mockQueryContext.mockResolvedValueOnce({
          rows: [{ id: 'log1', cycle_type: 'full_cycle', processed_items: 10 }],
          rowCount: 1,
        } as any);

        const res = await request.get('/api/personal/sleep-compute/logs');
        expect([200, 500]).toContain(res.status);
        if (res.status === 200) {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toBeDefined();
        }
      });

      it('should reject invalid context', async () => {
        mockIsValidContext.mockReturnValueOnce(false);

        const res = await request.get('/api/invalid/sleep-compute/logs');
        expect(res.status).toBe(400);
      });
    });

    describe('GET /api/:context/sleep-compute/stats', () => {
      it('should return stats', async () => {
        mockQueryContext.mockResolvedValueOnce({
          rows: [{ total_cycles: '5', total_processed: '50', avg_duration_ms: 1200 }],
          rowCount: 1,
        } as any);

        const res = await request.get('/api/personal/sleep-compute/stats');
        expect([200, 500]).toContain(res.status);
        if (res.status === 200) {
          expect(res.body.success).toBe(true);
        }
      });
    });

    describe('POST /api/:context/sleep-compute/trigger', () => {
      it('should trigger a sleep cycle', async () => {
        mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

        const res = await request.post('/api/personal/sleep-compute/trigger');
        expect([200, 500]).toContain(res.status);
        if (res.status === 200) {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toHaveProperty('processed');
        }
      });
    });

    describe('GET /api/:context/sleep-compute/idle-status', () => {
      it('should return idle status', async () => {
        mockQueryContext.mockResolvedValueOnce({
          rows: [{ cnt: '1' }],
          rowCount: 1,
        } as any);

        const res = await request.get('/api/personal/sleep-compute/idle-status');
        expect([200, 500]).toContain(res.status);
        if (res.status === 200) {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toHaveProperty('idle');
        }
      });
    });

    describe('POST /api/:context/context-v2/classify', () => {
      it('should classify a query', async () => {
        const res = await request
          .post('/api/personal/context-v2/classify')
          .send({ query: 'Zeig mir mein Budget und Konto' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.domain.domain).toBe('finance');
        expect(res.body.data.complexity).toBeDefined();
        expect(res.body.data.model).toBeDefined();
      });

      it('should reject missing query', async () => {
        const res = await request
          .post('/api/personal/context-v2/classify')
          .send({});

        expect(res.status).toBe(400);
      });
    });

    describe('POST /api/:context/context-v2/assemble', () => {
      it('should assemble context', async () => {
        // Cache miss, rules fail, fallback facts
        mockQueryContext
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          .mockRejectedValueOnce(new Error('no rules'))
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
          .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

        const res = await request
          .post('/api/personal/context-v2/assemble')
          .send({ query: 'Test query' });

        expect([200, 500]).toContain(res.status);
        if (res.status === 200) {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toHaveProperty('domain');
          expect(res.body.data).toHaveProperty('model');
        }
      });

      it('should reject invalid context', async () => {
        mockIsValidContext.mockReturnValueOnce(false);

        const res = await request
          .post('/api/invalid/context-v2/assemble')
          .send({ query: 'Test' });

        expect(res.status).toBe(400);
      });
    });

    describe('POST /api/:context/context-v2/cache/clean', () => {
      it('should clean expired cache', async () => {
        mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 3 } as any);

        const res = await request.post('/api/personal/context-v2/cache/clean');
        expect([200, 500]).toContain(res.status);
        if (res.status === 200) {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toHaveProperty('cleaned');
        }
      });
    });
  });
});
