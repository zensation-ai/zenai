/**
 * Agent Teams Route Tests
 *
 * Tests the API endpoints for multi-agent task execution.
 * Phase 45: Added templates, analytics, streaming tests.
 */

import express from 'express';
import request from 'supertest';
import { agentTeamsRouter } from '../../../routes/agent-teams';
import { errorHandler } from '../../../middleware/errorHandler';

// Mock auth middleware
jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock validate-params middleware (UUID validation tested separately)
jest.mock('../../../middleware/validate-params', () => ({
  requireUUID: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock database-context (for queryContext + isValidContext)
var mockQueryContext = jest.fn().mockResolvedValue({ rows: [] });
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: jest.fn().mockReturnValue(true),
}));

// Mock activity-tracker
jest.mock('../../../services/activity-tracker', () => ({
  trackActivity: jest.fn().mockResolvedValue(undefined),
}));

// Mock the orchestrator
jest.mock('../../../services/agent-orchestrator', () => ({
  executeTeamTask: jest.fn().mockResolvedValue({
    teamId: 'test-team-123',
    success: true,
    finalOutput: 'Generated report about AI trends',
    agentResults: [
      {
        role: 'researcher',
        success: true,
        content: 'Research findings',
        toolsUsed: ['search_ideas', 'web_search'],
        tokensUsed: { input: 500, output: 300 },
        executionTimeMs: 2000,
      },
      {
        role: 'writer',
        success: true,
        content: 'Written report',
        toolsUsed: ['create_idea'],
        tokensUsed: { input: 800, output: 600 },
        executionTimeMs: 3000,
      },
    ],
    executionTimeMs: 5500,
    strategy: 'research_write_review',
    totalTokens: { input: 1300, output: 900 },
    memoryStats: {
      totalEntries: 8,
      byAgent: { researcher: 4, writer: 3, orchestrator: 1 },
    },
  }),
  executeTeamTaskStreaming: jest.fn(),
  classifyTeamStrategy: jest.fn().mockReturnValue('research_write_review'),
  AGENT_TEMPLATES: [
    {
      id: 'deep_research',
      name: 'Tiefenrecherche',
      description: 'Gründliche Recherche',
      icon: '🔬',
      strategy: 'research_write_review',
    },
    {
      id: 'code_solution',
      name: 'Code-Lösung',
      description: 'Code generieren',
      icon: '💻',
      strategy: 'code_solve',
    },
  ],
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock validation
jest.mock('../../../utils/validation', () => ({
  toIntBounded: jest.fn().mockImplementation((val, def) => def),
}));

describe('Agent Teams Route', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/agents', agentTeamsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockResolvedValue({ rows: [] });
  });

  describe('POST /api/agents/execute', () => {
    it('should execute a team task successfully', async () => {
      const res = await request(app)
        .post('/api/agents/execute')
        .send({
          task: 'Analysiere meine Marketing-Ideen und erstelle eine Strategie',
          aiContext: 'personal',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.teamId).toBe('test-team-123');
      expect(res.body.finalOutput).toContain('AI trends');
      expect(res.body.agents).toHaveLength(2);
      expect(res.body.stats.executionTimeMs).toBe(5500);
      expect(res.body.stats.totalTokens.input).toBe(1300);
    });

    it('should return 400 for missing task', async () => {
      const res = await request(app)
        .post('/api/agents/execute')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('required');
    });

    it('should return 400 for empty task', async () => {
      const res = await request(app)
        .post('/api/agents/execute')
        .send({ task: '' });

      expect(res.status).toBe(400);
    });

    it('should accept optional parameters', async () => {
      const res = await request(app)
        .post('/api/agents/execute')
        .send({
          task: 'Test task',
          context: 'Additional context',
          aiContext: 'work',
          strategy: 'research_only',
          skipReview: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should include agent details in response', async () => {
      const res = await request(app)
        .post('/api/agents/execute')
        .send({ task: 'Test' });

      const agents = res.body.agents;
      expect(agents[0].role).toBe('researcher');
      expect(agents[0].success).toBe(true);
      expect(agents[0].toolsUsed).toContain('search_ideas');
      expect(agents[0].executionTimeMs).toBe(2000);
    });
  });

  describe('POST /api/agents/classify', () => {
    it('should classify a task strategy', async () => {
      const res = await request(app)
        .post('/api/agents/classify')
        .send({ task: 'Recherchiere und erstelle einen Bericht' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.strategy).toBe('research_write_review');
      expect(res.body.description).toBeDefined();
    });

    it('should return 400 for missing task', async () => {
      const res = await request(app)
        .post('/api/agents/classify')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // Phase 45: Template tests
  describe('GET /api/agents/templates', () => {
    it('should return available templates', async () => {
      const res = await request(app)
        .get('/api/agents/templates');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.templates).toHaveLength(2);
      expect(res.body.templates[0].id).toBe('deep_research');
      expect(res.body.templates[1].id).toBe('code_solution');
    });

    it('should include required fields for each template', async () => {
      const res = await request(app)
        .get('/api/agents/templates');

      for (const template of res.body.templates) {
        expect(template).toHaveProperty('id');
        expect(template).toHaveProperty('name');
        expect(template).toHaveProperty('description');
        expect(template).toHaveProperty('icon');
        expect(template).toHaveProperty('strategy');
      }
    });
  });

  // Phase 45: Analytics tests
  describe('GET /api/agents/analytics', () => {
    it('should return analytics with empty data', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })  // strategy breakdown
        .mockResolvedValueOnce({ rows: [] }); // daily trend

      const res = await request(app)
        .get('/api/agents/analytics')
        .query({ context: 'personal' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totals).toBeDefined();
      expect(res.body.totals.executions).toBe(0);
      expect(res.body.totals.successRate).toBe(0);
      expect(res.body.byStrategy).toEqual([]);
      expect(res.body.dailyTrend).toEqual([]);
    });

    it('should return analytics with data', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{
            strategy: 'research_write_review',
            strategy_count: '5',
            successful: '4',
            failed: '1',
            total_executions: '5',
            avg_execution_time: '3500',
            total_tokens: '10000',
            avg_tokens: '2000',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            date: '2026-03-09',
            executions: '3',
            successful: '2',
            avg_time: '4000',
          }],
        });

      const res = await request(app)
        .get('/api/agents/analytics')
        .query({ context: 'personal', days: 30 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.byStrategy).toHaveLength(1);
      expect(res.body.byStrategy[0].strategy).toBe('research_write_review');
      expect(res.body.byStrategy[0].count).toBe(5);
      expect(res.body.dailyTrend).toHaveLength(1);
    });
  });

  // Phase 45: History tests
  describe('GET /api/agents/history', () => {
    it('should return execution history', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          team_id: 'team-1',
          task_description: 'Test task',
          strategy: 'research_only',
          final_output: 'Research results',
          agent_results: JSON.stringify([{ role: 'researcher', success: true }]),
          execution_time_ms: 2000,
          tokens: JSON.stringify({ input: 500, output: 300 }),
          success: true,
          saved_as_idea_id: null,
          created_at: '2026-03-09T10:00:00Z',
        }],
      });

      const res = await request(app)
        .get('/api/agents/history')
        .query({ context: 'personal' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.executions).toHaveLength(1);
      expect(res.body.executions[0].task).toBe('Test task');
      expect(res.body.executions[0].strategy).toBe('research_only');
    });
  });

  describe('GET /api/agents/history/:id', () => {
    it('should return 404 for non-existent execution', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/agents/history/00000000-0000-4000-8000-000000000000')
        .query({ context: 'personal' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/agents/history/:id/save-as-idea', () => {
    it('should save execution as idea', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{
            id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            task_description: 'Test task',
            final_output: 'Results to save',
            strategy: 'research_only',
          }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'idea-1' }] })
        .mockResolvedValueOnce({ rows: [] }); // update link

      const res = await request(app)
        .post('/api/agents/history/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/save-as-idea')
        .send({ context: 'personal' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.ideaId).toBe('idea-1');
    });

    it('should return 404 for non-existent execution', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/agents/history/00000000-0000-4000-8000-000000000000/save-as-idea')
        .send({ context: 'personal' });

      expect(res.status).toBe(404);
    });
  });
});
