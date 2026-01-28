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

// Mock database context
jest.mock('../../utils/database-context', () => ({
  isValidContext: jest.fn((ctx: string) => ctx === 'personal' || ctx === 'work'),
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

const mockRegisterAutomation = registerAutomation as jest.MockedFunction<typeof registerAutomation>;
const mockGetAutomation = getAutomation as jest.MockedFunction<typeof getAutomation>;
const mockListAutomations = listAutomations as jest.MockedFunction<typeof listAutomations>;
const mockExecuteAutomation = executeAutomation as jest.MockedFunction<typeof executeAutomation>;
const mockGetPendingSuggestions = getPendingSuggestions as jest.MockedFunction<typeof getPendingSuggestions>;
const mockGetAutomationStats = getAutomationStats as jest.MockedFunction<typeof getAutomationStats>;
const mockGetExecutionHistory = getExecutionHistory as jest.MockedFunction<typeof getExecutionHistory>;
const mockDeleteAutomation = deleteAutomation as jest.MockedFunction<typeof deleteAutomation>;

describe('Automations API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', automationsRouter);
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
          time_based: 5,
          event_based: 7,
          condition_based: 3,
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
          name: 'Weekly Review Reminder',
          description: 'Send reminder every Monday',
          trigger: { type: 'time_based', schedule: '0 9 * * 1' },
          confidence: 0.85,
        },
        {
          id: 'sug-2',
          name: 'High Priority Alert',
          description: 'Notify when high priority idea is created',
          trigger: { type: 'event_based', event: 'idea.created' },
          confidence: 0.92,
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
          id: 'auto-1',
          name: 'Daily Digest',
          trigger: { type: 'time_based', schedule: '0 8 * * *' },
          isActive: true,
          executionCount: 30,
        },
        {
          id: 'auto-2',
          name: 'Idea Backup',
          trigger: { type: 'event_based', event: 'idea.created' },
          isActive: true,
          executionCount: 150,
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
        .query({ active: 'true' })
        .expect(200);

      expect(mockListAutomations).toHaveBeenCalledWith('personal', { active: true });
    });
  });

  // ===========================================
  // GET /api/:context/automations/:id
  // ===========================================

  describe('GET /api/:context/automations/:id', () => {
    it('should return a specific automation', async () => {
      const mockAutomation = {
        id: 'auto-1',
        name: 'Daily Digest',
        description: 'Sends daily digest email',
        trigger: { type: 'time_based', schedule: '0 8 * * *' },
        actions: [{ type: 'send_email', template: 'digest' }],
        isActive: true,
        executionCount: 30,
        lastExecuted: '2026-01-20T08:00:00Z',
      };

      mockGetAutomation.mockResolvedValueOnce(mockAutomation);

      const response = await request(app)
        .get('/api/personal/automations/auto-1')
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
        trigger: { type: 'time_based', schedule: '0 9 * * 1' },
        actions: [{ type: 'create_digest' }],
      };

      const createdAutomation = {
        id: 'auto-new',
        ...newAutomation,
        isActive: true,
        executionCount: 0,
        createdAt: '2026-01-21T10:00:00Z',
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
        success: true,
        executionId: 'exec-123',
        duration: 150,
        results: [{ action: 'create_digest', success: true }],
      };

      mockExecuteAutomation.mockResolvedValueOnce(executionResult);

      const response = await request(app)
        .post('/api/personal/automations/auto-1/execute')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.execution).toEqual(executionResult);
    });

    it('should handle execution failures gracefully', async () => {
      mockExecuteAutomation.mockRejectedValueOnce(new Error('Execution failed'));

      const response = await request(app)
        .post('/api/personal/automations/auto-1/execute')
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
        .delete('/api/personal/automations/auto-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockDeleteAutomation).toHaveBeenCalledWith('personal', 'auto-1');
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
  // GET /api/:context/automations/:id/history
  // ===========================================

  describe('GET /api/:context/automations/:id/history', () => {
    it('should return execution history', async () => {
      const mockHistory = [
        {
          id: 'exec-1',
          automationId: 'auto-1',
          executedAt: '2026-01-21T08:00:00Z',
          success: true,
          duration: 120,
        },
        {
          id: 'exec-2',
          automationId: 'auto-1',
          executedAt: '2026-01-20T08:00:00Z',
          success: true,
          duration: 115,
        },
      ];

      mockGetExecutionHistory.mockResolvedValueOnce(mockHistory);

      const response = await request(app)
        .get('/api/personal/automations/auto-1/history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.history).toHaveLength(2);
    });

    it('should respect limit parameter for history', async () => {
      mockGetExecutionHistory.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/personal/automations/auto-1/history')
        .query({ limit: '5' })
        .expect(200);

      expect(mockGetExecutionHistory).toHaveBeenCalledWith('personal', 'auto-1', 5);
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
