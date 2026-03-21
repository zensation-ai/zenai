/**
 * Integration Tests for Agent Teams API - Extended Coverage
 *
 * Supplements existing agent-teams-route.test.ts with additional tests:
 * - POST /api/agents/execute       - Execute task (edge cases)
 * - POST /api/agents/classify      - Strategy classification
 * - GET  /api/agents/templates     - Agent templates
 * - GET  /api/agents/history       - Execution history
 * - GET  /api/agents/history/:id   - Single execution
 * - GET  /api/agents/analytics     - Execution analytics
 * - POST /api/agents/history/:id/save-as-idea - Save as idea
 * - POST /api/agents/executions/:id/pause     - Pause execution
 *
 * Phase 122 - Worker 2
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

jest.mock('../../utils/validation', () => ({
  toIntBounded: jest.fn((val: string, def: number, min: number, max: number) => {
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) return def;
    return Math.max(min, Math.min(max, parsed));
  }),
}));

const mockExecuteTeamTask = jest.fn();
const mockExecuteTeamTaskStreaming = jest.fn();
const mockClassifyTeamStrategy = jest.fn();

jest.mock('../../services/agent-orchestrator', () => ({
  executeTeamTask: (...args: unknown[]) => mockExecuteTeamTask(...args),
  executeTeamTaskStreaming: (...args: unknown[]) => mockExecuteTeamTaskStreaming(...args),
  classifyTeamStrategy: (...args: unknown[]) => mockClassifyTeamStrategy(...args),
  AGENT_TEMPLATES: [
    { id: 'deep-research', name: 'Deep Research', strategy: 'research_only', skipReview: false },
    { id: 'blog-article', name: 'Blog Article', strategy: 'research_write_review', skipReview: false },
  ],
  TeamTask: {},
}));

jest.mock('../../services/activity-tracker', () => ({
  trackActivity: jest.fn().mockResolvedValue(undefined),
}));

const mockLoadCheckpoint = jest.fn();
const mockListCheckpoints = jest.fn();
const mockUpdateExecutionStatus = jest.fn();
const mockGetExecutionStatus = jest.fn();

jest.mock('../../services/agent-checkpoints', () => ({
  loadCheckpoint: (...args: unknown[]) => mockLoadCheckpoint(...args),
  listCheckpoints: (...args: unknown[]) => mockListCheckpoints(...args),
  updateExecutionStatus: (...args: unknown[]) => mockUpdateExecutionStatus(...args),
  getExecutionStatus: (...args: unknown[]) => mockGetExecutionStatus(...args),
}));

jest.mock('../../services/security/rate-limit-advanced', () => ({
  advancedRateLimiter: {
    ai: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
}));

import { agentTeamsRouter } from '../../routes/agent-teams';
import { errorHandler } from '../../middleware/errorHandler';

describe('Agent Teams Extended Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/agents', agentTeamsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // POST /api/agents/execute
  // ============================================================

  describe('POST /api/agents/execute', () => {
    it('should execute a team task and return result', async () => {
      const result = {
        teamId: 'team-1',
        strategy: 'research_only',
        success: true,
        finalOutput: 'Research results...',
        agentResults: [{ role: 'researcher', success: true, toolsUsed: ['web_search'], executionTimeMs: 1500 }],
        executionTimeMs: 2000,
        totalTokens: { input: 500, output: 300 },
        memoryStats: { totalEntries: 3 },
      };
      mockExecuteTeamTask.mockResolvedValueOnce(result);
      mockQueryContext.mockResolvedValueOnce({ rows: [] }); // persist call

      const res = await request(app)
        .post('/api/agents/execute')
        .send({ task: 'Research TypeScript best practices' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.teamId).toBe('team-1');
      expect(res.body.finalOutput).toBe('Research results...');
      expect(res.body.agents).toHaveLength(1);
    });

    it('should return 400 for empty task string', async () => {
      const res = await request(app)
        .post('/api/agents/execute')
        .send({ task: '   ' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('required');
    });

    it('should return 400 for invalid aiContext', async () => {
      const res = await request(app)
        .post('/api/agents/execute')
        .send({ task: 'Test', aiContext: 'invalid' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /api/agents/classify
  // ============================================================

  describe('POST /api/agents/classify', () => {
    it('should classify a task strategy', async () => {
      mockClassifyTeamStrategy.mockReturnValueOnce('research_write_review');

      const res = await request(app)
        .post('/api/agents/classify')
        .send({ task: 'Write a blog post about AI' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.strategy).toBe('research_write_review');
      expect(res.body.description).toBeTruthy();
    });

    it('should return 400 for missing task', async () => {
      const res = await request(app)
        .post('/api/agents/classify')
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /api/agents/templates
  // ============================================================

  describe('GET /api/agents/templates', () => {
    it('should return available templates', async () => {
      const res = await request(app)
        .get('/api/agents/templates')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.templates).toHaveLength(2);
      expect(res.body.templates[0]).toHaveProperty('id');
      expect(res.body.templates[0]).toHaveProperty('name');
      expect(res.body.templates[0]).toHaveProperty('strategy');
    });
  });

  // ============================================================
  // GET /api/agents/history
  // ============================================================

  describe('GET /api/agents/history', () => {
    it('should return execution history', async () => {
      const rows = [
        {
          id: VALID_UUID,
          team_id: 'team-1',
          task_description: 'Test task',
          strategy: 'research_only',
          final_output: 'Output',
          agent_results: JSON.stringify([{ role: 'researcher' }]),
          execution_time_ms: 2000,
          tokens: JSON.stringify({ input: 500 }),
          success: true,
          saved_as_idea_id: null,
          created_at: '2026-03-20',
        },
      ];
      mockQueryContext.mockResolvedValueOnce({ rows });

      const res = await request(app)
        .get('/api/agents/history')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.executions).toHaveLength(1);
      expect(res.body.executions[0].task).toBe('Test task');
      expect(res.body.count).toBe(1);
    });

    it('should reject invalid context', async () => {
      const res = await request(app)
        .get('/api/agents/history?context=invalid')
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /api/agents/history/:id
  // ============================================================

  describe('GET /api/agents/history/:id', () => {
    it('should return 404 for non-existent execution', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get(`/api/agents/history/${VALID_UUID}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /api/agents/analytics
  // ============================================================

  describe('GET /api/agents/analytics', () => {
    it('should return analytics with strategy breakdown', async () => {
      const strategyRows = [
        {
          strategy: 'research_only',
          strategy_count: '5',
          total_executions: '5',
          successful: '4',
          failed: '1',
          avg_execution_time: '2500.0',
          total_tokens: '5000',
          avg_tokens: '1000.0',
        },
      ];
      const trendRows = [
        { date: '2026-03-20', executions: '3', successful: '3', avg_time: '2000.0' },
      ];
      mockQueryContext
        .mockResolvedValueOnce({ rows: strategyRows })
        .mockResolvedValueOnce({ rows: trendRows });

      const res = await request(app)
        .get('/api/agents/analytics')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.totals).toHaveProperty('executions');
      expect(res.body.totals).toHaveProperty('successRate');
      expect(res.body.byStrategy).toHaveLength(1);
      expect(res.body.dailyTrend).toHaveLength(1);
    });

    it('should handle empty analytics', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/agents/analytics')
        .expect(200);

      expect(res.body.totals.executions).toBe(0);
      expect(res.body.totals.successRate).toBe(0);
    });
  });

  // ============================================================
  // POST /api/agents/executions/:id/pause
  // ============================================================

  describe('POST /api/agents/executions/:id/pause', () => {
    it('should return 404 for non-existent execution', async () => {
      mockGetExecutionStatus.mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/api/agents/executions/${VALID_UUID}/pause`)
        .send({})
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });
});
