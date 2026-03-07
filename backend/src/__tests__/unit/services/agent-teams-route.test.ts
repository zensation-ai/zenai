/**
 * Agent Teams Route Tests
 *
 * Tests the API endpoints for multi-agent task execution.
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

// Mock database-context (for queryContext + isValidContext)
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn().mockResolvedValue({ rows: [] }),
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
  classifyTeamStrategy: jest.fn().mockReturnValue('research_write_review'),
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

describe('Agent Teams Route', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/agents', agentTeamsRouter);
    app.use(errorHandler);
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
});
