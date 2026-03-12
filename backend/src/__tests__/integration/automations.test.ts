/**
 * Integration Tests for Automations API
 *
 * Tests the Automations router endpoints with mocked services.
 * Uses supertest to simulate HTTP requests.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { automationsRouter } from '../../routes/automations';

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((req, res, next) => {
    req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (req: any, res: any, next: any) => next()),
}));

// Mock validate-params middleware (UUID validation tested separately)
jest.mock('../../middleware/validate-params', () => ({
  requireUUID: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock database context
jest.mock('../../utils/database-context', () => ({
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
  AIContext: {},
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

// Mock automation registry service
jest.mock('../../services/automation-registry', () => ({
  registerAutomation: jest.fn(),
  updateAutomation: jest.fn(),
  deleteAutomation: jest.fn(),
  getAutomation: jest.fn(),
  listAutomations: jest.fn(),
  executeAutomation: jest.fn(),
  generateAutomationSuggestions: jest.fn(),
  acceptSuggestion: jest.fn(),
  dismissSuggestion: jest.fn(),
  getPendingSuggestions: jest.fn(),
  getAutomationStats: jest.fn(),
  getExecutionHistory: jest.fn(),
  TriggerType: {},
}));

import {
  registerAutomation,
  getAutomation,
  listAutomations,
  executeAutomation,
  getPendingSuggestions,
  getAutomationStats,
  getExecutionHistory,
  deleteAutomation,
} from '../../services/automation-registry';
import { errorHandler } from '../../middleware/errorHandler';

var mockRegisterAutomation = registerAutomation as jest.MockedFunction<typeof registerAutomation>;
var mockGetAutomation = getAutomation as jest.MockedFunction<typeof getAutomation>;
var mockListAutomations = listAutomations as jest.MockedFunction<typeof listAutomations>;
var mockExecuteAutomation = executeAutomation as jest.MockedFunction<typeof executeAutomation>;
var mockGetPendingSuggestions = getPendingSuggestions as jest.MockedFunction<typeof getPendingSuggestions>;
var mockGetAutomationStats = getAutomationStats as jest.MockedFunction<typeof getAutomationStats>;
var mockGetExecutionHistory = getExecutionHistory as jest.MockedFunction<typeof getExecutionHistory>;
var mockDeleteAutomation = deleteAutomation as jest.MockedFunction<typeof deleteAutomation>;

describe('Automations API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', automationsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // GET /api/:context/automations/stats
  // ===========================================

  describe('GET /api/:context/automations/stats', () => {
    it('should return automation statistics', async () => {
      const mockStats = {
        total_automations: 15,
        active_automations: 12,
        total_executions: 150,
        successful_executions: 142,
        failed_executions: 8,
        success_rate: 0.95,
        automations_by_trigger: {
          webhook: 5,
          schedule: 4,
          event: 3,
          manual: 2,
          pattern: 1,
        },
        top_automations: [],
        pending_suggestions: 0,
      };

      mockGetAutomationStats.mockResolvedValueOnce(mockStats);

      const response = await request(app)
        .get('/api/personal/automations/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.stats).toEqual(mockStats);
      expect(mockGetAutomationStats).toHaveBeenCalledWith('personal');
    });

    it('should reject invalid context', async () => {
      const response = await request(app)
        .get('/api/invalid/automations/stats')
        .expect(400);

      expect(response.body.error).toContain('context');
    });
  });

  // ===========================================
  // GET /api/:context/automations/suggestions
  // ===========================================

  describe('GET /api/:context/automations/suggestions', () => {
    it('should return pending suggestions', async () => {
      const mockSuggestions = [
        {
          id: 'sug-1',
          context: 'personal' as const,
          name: 'Weekly Review Reminder',
          description: 'Send reminder every Monday',
          trigger: { type: 'schedule' as const, config: { cron: '0 9 * * 1' } },
          actions: [{ type: 'notification' as const, config: { message: 'Review time' }, order: 1 }],
          reasoning: 'Based on usage patterns',
          confidence: 0.85,
          based_on_pattern: 'recurring_task',
          sample_matches: 5,
          status: 'pending' as const,
          created_at: '2026-01-20T10:00:00Z',
        },
        {
          id: 'sug-2',
          context: 'personal' as const,
          name: 'High Priority Alert',
          description: 'Notify when high priority idea is created',
          trigger: { type: 'event' as const, config: { eventName: 'idea.created' } },
          actions: [{ type: 'notification' as const, config: { message: 'High priority' }, order: 1 }],
          reasoning: 'Based on priority patterns',
          confidence: 0.92,
          based_on_pattern: 'category_priority',
          sample_matches: 10,
          status: 'pending' as const,
          created_at: '2026-01-20T10:00:00Z',
        },
      ];

      mockGetPendingSuggestions.mockResolvedValueOnce(mockSuggestions);

      const response = await request(app)
        .get('/api/personal/automations/suggestions')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.suggestions).toHaveLength(2);
      expect(response.body.count).toBe(2);
    });

    it('should respect limit parameter', async () => {
      mockGetPendingSuggestions.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/personal/automations/suggestions')
        .query({ limit: '5' })
        .expect(200);

      expect(mockGetPendingSuggestions).toHaveBeenCalledWith('personal', 5);
    });

    it('should cap limit at 50', async () => {
      mockGetPendingSuggestions.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/personal/automations/suggestions')
        .query({ limit: '100' })
        .expect(200);

      expect(mockGetPendingSuggestions).toHaveBeenCalledWith('personal', 50);
    });
  });

  // ===========================================
  // GET /api/:context/automations
  // ===========================================

  describe('GET /api/:context/automations', () => {
    it('should list all automations', async () => {
      const mockAutomations = [
        {
          id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          context: 'personal' as const,
          name: 'Daily Digest',
          description: 'Sends daily digest',
          trigger: { type: 'schedule' as const, config: { cron: '0 8 * * *' } },
          conditions: [],
          actions: [{ type: 'notification' as const, config: { message: 'Daily digest' }, order: 1 }],
          is_active: true,
          is_system: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          last_run_at: '2026-01-21T08:00:00Z',
          run_count: 30,
          success_count: 30,
          failure_count: 0,
        },
        {
          id: 'auto-2',
          context: 'personal' as const,
          name: 'Idea Backup',
          description: 'Backs up new ideas',
          trigger: { type: 'event' as const, config: { eventName: 'idea.created' } },
          conditions: [],
          actions: [{ type: 'webhook_call' as const, config: { url: 'https://example.com' }, order: 1 }],
          is_active: true,
          is_system: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          last_run_at: '2026-01-21T10:00:00Z',
          run_count: 150,
          success_count: 148,
          failure_count: 2,
        },
      ];

      mockListAutomations.mockResolvedValueOnce(mockAutomations);

      const response = await request(app)
        .get('/api/personal/automations')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.automations).toHaveLength(2);
    });

    it('should filter by active status', async () => {
      mockListAutomations.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/personal/automations')
        .query({ active_only: 'true' })
        .expect(200);

      expect(mockListAutomations).toHaveBeenCalledWith('personal', { active_only: true });
    });
  });

  // ===========================================
  // GET /api/:context/automations/:id
  // ===========================================

  describe('GET /api/:context/automations/:id', () => {
    it('should return a specific automation', async () => {
      const mockAutomation = {
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        context: 'personal' as const,
        name: 'Daily Digest',
        description: 'Sends daily digest email',
        trigger: { type: 'schedule' as const, config: { cron: '0 8 * * *' } },
        conditions: [],
        actions: [{ type: 'notification' as const, config: { template: 'digest' }, order: 1 }],
        is_active: true,
        is_system: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        last_run_at: '2026-01-20T08:00:00Z',
        run_count: 30,
        success_count: 29,
        failure_count: 1,
      };

      mockGetAutomation.mockResolvedValueOnce(mockAutomation);

      const response = await request(app)
        .get('/api/personal/automations/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.automation).toEqual(mockAutomation);
    });

    it('should return 404 for non-existent automation', async () => {
      mockGetAutomation.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/personal/automations/non-existent')
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  // ===========================================
  // POST /api/:context/automations
  // ===========================================

  describe('POST /api/:context/automations', () => {
    it('should create a new automation', async () => {
      const newAutomation = {
        name: 'Test Automation',
        description: 'Test description',
        trigger: { type: 'schedule' as const, config: { cron: '0 9 * * 1' } },
        actions: [{ type: 'notification' as const, config: {}, order: 1 }],
      };

      const createdAutomation = {
        id: 'auto-new',
        context: 'personal' as const,
        name: newAutomation.name,
        description: newAutomation.description,
        trigger: newAutomation.trigger,
        conditions: [],
        actions: newAutomation.actions,
        is_active: true,
        is_system: false,
        created_at: '2026-01-21T10:00:00Z',
        updated_at: '2026-01-21T10:00:00Z',
        last_run_at: null,
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      };

      mockRegisterAutomation.mockResolvedValueOnce(createdAutomation);

      const response = await request(app)
        .post('/api/personal/automations')
        .send(newAutomation)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.automation.id).toBe('auto-new');
    });

    it('should validate required fields', async () => {
      const invalidAutomation = {
        // Missing name and trigger
        actions: [{ type: 'create_digest' }],
      };

      const response = await request(app)
        .post('/api/personal/automations')
        .send(invalidAutomation)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  // ===========================================
  // POST /api/:context/automations/:id/execute
  // ===========================================

  describe('POST /api/:context/automations/:id/execute', () => {
    it('should execute an automation manually', async () => {
      const executionResult = {
        id: 'b1ffcd00-0d1c-5fa9-cc7e-7ccace491b22',
        automation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        trigger_data: {},
        actions_executed: 1,
        success: true,
        error_message: null,
        duration_ms: 150,
        executed_at: '2026-01-21T10:00:00Z',
      };

      mockExecuteAutomation.mockResolvedValueOnce(executionResult);

      const response = await request(app)
        .post('/api/personal/automations/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/execute')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.execution).toEqual(executionResult);
    });

    it('should handle execution failures gracefully', async () => {
      mockExecuteAutomation.mockRejectedValueOnce(new Error('Execution failed'));

      const response = await request(app)
        .post('/api/personal/automations/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/execute')
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });

  // ===========================================
  // DELETE /api/:context/automations/:id
  // ===========================================

  describe('DELETE /api/:context/automations/:id', () => {
    it('should delete an automation', async () => {
      mockDeleteAutomation.mockResolvedValueOnce(true);

      const response = await request(app)
        .delete('/api/personal/automations/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockDeleteAutomation).toHaveBeenCalledWith('personal', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    });

    it('should return 404 if automation does not exist', async () => {
      mockDeleteAutomation.mockResolvedValueOnce(false);

      const response = await request(app)
        .delete('/api/personal/automations/non-existent')
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  // ===========================================
  // GET /api/:context/automations/:id/executions
  // ===========================================

  describe('GET /api/:context/automations/:id/executions', () => {
    it('should return execution history', async () => {
      const mockExecutions = [
        {
          id: 'b1ffcd00-0d1c-5fa9-cc7e-7ccace491b22',
          automation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          trigger_data: {},
          actions_executed: 1,
          success: true,
          error_message: null,
          duration_ms: 120,
          executed_at: '2026-01-21T08:00:00Z',
        },
        {
          id: 'exec-2',
          automation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          trigger_data: {},
          actions_executed: 1,
          success: true,
          error_message: null,
          duration_ms: 115,
          executed_at: '2026-01-20T08:00:00Z',
        },
      ];

      mockGetExecutionHistory.mockResolvedValueOnce(mockExecutions);

      const response = await request(app)
        .get('/api/personal/automations/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/executions')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.executions).toHaveLength(2);
    });

    it('should respect limit parameter for executions', async () => {
      mockGetExecutionHistory.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/personal/automations/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/executions')
        .query({ limit: '5' })
        .expect(200);

      expect(mockGetExecutionHistory).toHaveBeenCalledWith('personal', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 5);
    });
  });

  // ===========================================
  // Context Validation
  // ===========================================

  describe('Context Validation', () => {
    const getEndpoints = [
      '/api/invalid/automations',
      '/api/invalid/automations/stats',
      '/api/invalid/automations/suggestions',
    ];

    getEndpoints.forEach((endpoint) => {
      it(`should reject invalid context for ${endpoint}`, async () => {
        const response = await request(app)
          .get(endpoint)
          .expect(400);

        expect(response.body.error).toContain('context');
      });
    });
  });
});
