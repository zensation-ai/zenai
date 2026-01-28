/**
 * Integration Tests for Health API
 *
 * Tests the health check endpoint for service status.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { healthRouter } from '../../routes/health';

// Mock dependencies
jest.mock('../../utils/database-context', () => ({
  testConnections: jest.fn(),
  getPoolStats: jest.fn().mockReturnValue({
    personal: { poolSize: 5, idleCount: 3, waitingCount: 0, queryCount: 100, avgQueryTime: 5 },
    work: { poolSize: 5, idleCount: 3, waitingCount: 0, queryCount: 50, avgQueryTime: 6 },
  }),
  getHealthCheckStatus: jest.fn().mockReturnValue({ lastCheck: new Date().toISOString(), status: 'ok' }),
}));

jest.mock('../../utils/ollama', () => ({
  checkOllamaHealth: jest.fn(),
}));

jest.mock('../../utils/cache', () => ({
  getCacheStats: jest.fn().mockResolvedValue({ connected: true, keys: 42, memory: '1.5M' }),
}));

jest.mock('../../services/ai', () => ({
  getAvailableServices: jest.fn().mockReturnValue({ primary: 'claude', fallback: 'ollama' }),
}));

jest.mock('../../utils/retry', () => ({
  getCircuitBreakerStatus: jest.fn().mockReturnValue({
    'claude': { isOpen: false, failures: 0, lastFailure: null },
    'claude-extended': { isOpen: false, failures: 0, lastFailure: null },
    'ollama': { isOpen: false, failures: 0, lastFailure: null },
    'ollama-embedding': { isOpen: false, failures: 0, lastFailure: null },
  }),
}));

jest.mock('../../services/claude', () => ({
  isClaudeAvailable: jest.fn().mockReturnValue(true),
  generateClaudeResponse: jest.fn().mockResolvedValue('OK'),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { testConnections } from '../../utils/database-context';
import { checkOllamaHealth } from '../../utils/ollama';

const mockTestConnections = testConnections as jest.MockedFunction<typeof testConnections>;
const mockCheckOllamaHealth = checkOllamaHealth as jest.MockedFunction<typeof checkOllamaHealth>;

describe('Health API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use('/health', healthRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // GET /health - Health Check
  // ===========================================

  describe('GET /health (fast endpoint)', () => {
    it('should return healthy status with minimal info', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.responseTime).toBeDefined();
      // Fast endpoint doesn't do active health checks
      expect(response.body.services.databases.personal.status).toBe('connected');
      expect(response.body.services.databases.work.status).toBe('connected');
    });

    it('should include response time', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(typeof response.body.responseTime).toBe('number');
      expect(response.body.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should include timestamp in ISO format', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('GET /health/detailed', () => {
    it('should return healthy status when all services are up', async () => {
      mockTestConnections.mockResolvedValue({ personal: true, work: true });
      mockCheckOllamaHealth.mockResolvedValue({ available: true, models: ['mistral', 'nomic-embed-text'] });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.responseTime).toBeDefined();
      expect(response.body.services.databases.personal.status).toBe('connected');
      expect(response.body.services.databases.work.status).toBe('connected');
      expect(response.body.services.ai.ollama.status).toBe('connected');
      expect(response.body.services.ai.ollama.models).toContain('mistral');
    });

    it('should return degraded status when one database is down', async () => {
      mockTestConnections.mockResolvedValue({ personal: true, work: false });
      mockCheckOllamaHealth.mockResolvedValue({ available: true, models: ['mistral'] });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.status).toBe('degraded');
      expect(response.body.services.databases.personal.status).toBe('connected');
      expect(response.body.services.databases.work.status).toBe('disconnected');
    });

    it('should return healthy status when Ollama is down but Claude is available', async () => {
      mockTestConnections.mockResolvedValue({ personal: true, work: true });
      mockCheckOllamaHealth.mockResolvedValue({ available: false, models: [] });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      // System is healthy because Claude (primary AI) is still available
      expect(response.body.status).toBe('healthy');
      expect(response.body.services.ai.ollama.status).toBe('disconnected');
    });

    it('should return unhealthy status when all databases are down', async () => {
      mockTestConnections.mockResolvedValue({ personal: false, work: false });
      mockCheckOllamaHealth.mockResolvedValue({ available: true, models: ['mistral'] });

      const response = await request(app)
        .get('/health/detailed')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.databases.personal.status).toBe('disconnected');
      expect(response.body.services.databases.work.status).toBe('disconnected');
    });

    it('should return unhealthy status when all services are down', async () => {
      mockTestConnections.mockResolvedValue({ personal: false, work: false });
      mockCheckOllamaHealth.mockResolvedValue({ available: false, models: [] });

      const response = await request(app)
        .get('/health/detailed')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
    });

    it('should handle database connection test errors', async () => {
      mockTestConnections.mockRejectedValue(new Error('Connection timeout'));
      mockCheckOllamaHealth.mockResolvedValue({ available: true, models: ['mistral'] });

      const response = await request(app)
        .get('/health/detailed')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.services.databases.personal.status).toBe('disconnected');
      expect(response.body.services.databases.work.status).toBe('disconnected');
    });

    it('should include Ollama service info', async () => {
      mockTestConnections.mockResolvedValue({ personal: true, work: true });
      mockCheckOllamaHealth.mockResolvedValue({ available: true, models: [] });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.services.ai.ollama).toBeDefined();
      expect(response.body.services.ai.ollama.status).toBe('connected');
    });

    it('should list available Ollama models', async () => {
      mockTestConnections.mockResolvedValue({ personal: true, work: true });
      mockCheckOllamaHealth.mockResolvedValue({
        available: true,
        models: ['mistral:latest', 'nomic-embed-text:latest', 'llama2:7b'],
      });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.services.ai.ollama.models).toHaveLength(3);
      expect(response.body.services.ai.ollama.models).toContain('mistral:latest');
    });
  });

  // ===========================================
  // Edge Cases
  // ===========================================

  describe('Edge Cases', () => {
    it('should handle partial database connectivity', async () => {
      // Only personal DB is up
      mockTestConnections.mockResolvedValue({ personal: true, work: false });
      mockCheckOllamaHealth.mockResolvedValue({ available: false, models: [] });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      // Should be degraded since at least one DB is working
      expect(response.body.status).toBe('degraded');
    });

    it('should run health checks in parallel', async () => {
      let dbCallTime = 0;
      let ollamaCallTime = 0;

      mockTestConnections.mockImplementation(async () => {
        dbCallTime = Date.now();
        await new Promise(resolve => setTimeout(resolve, 50));
        return { personal: true, work: true };
      });

      mockCheckOllamaHealth.mockImplementation(async () => {
        ollamaCallTime = Date.now();
        await new Promise(resolve => setTimeout(resolve, 50));
        return { available: true, models: [] };
      });

      await request(app)
        .get('/health/detailed')
        .expect(200);

      // Both should be called almost simultaneously (within 10ms)
      expect(Math.abs(dbCallTime - ollamaCallTime)).toBeLessThan(10);
    });
  });
});
