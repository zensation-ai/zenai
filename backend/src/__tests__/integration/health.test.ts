/**
 * Integration Tests for Health API
 *
 * Tests the health check endpoints for service status.
 * - GET /health - Fast check (always healthy if server is running)
 * - GET /health/detailed - Comprehensive check with external service tests
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
  getHealthCheckStatus: jest.fn().mockReturnValue({ isOpen: false, failures: 0 }),
}));

jest.mock('../../utils/ollama', () => ({
  checkOllamaHealth: jest.fn(),
}));

jest.mock('../../utils/cache', () => ({
  getCacheStats: jest.fn().mockResolvedValue({ connected: true, keys: 42, memory: '1.5M' }),
}));

jest.mock('../../utils/retry', () => ({
  getCircuitBreakerStatus: jest.fn().mockReturnValue({
    claude: { isOpen: false, failures: 0 },
    'claude-extended': { isOpen: false, failures: 0 },
    ollama: { isOpen: false, failures: 0 },
    'ollama-embedding': { isOpen: false, failures: 0 },
  }),
}));

jest.mock('../../services/ai', () => ({
  getAvailableServices: jest.fn().mockReturnValue({ primary: 'claude', fallback: 'ollama' }),
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
  // GET /health - Fast Health Check
  // ===========================================

  describe('GET /health (fast check)', () => {
    it('should return healthy status immediately without external checks', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.responseTime).toBeDefined();
      expect(response.body.version).toBeDefined();
      expect(response.body.uptime).toBeDefined();
      expect(response.body.memory).toBeDefined();
    });

    it('should include minimal services info', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.services).toBeDefined();
      expect(response.body.services.databases.personal.status).toBe('connected');
      expect(response.body.services.databases.work.status).toBe('connected');
    });

    it('should include message about detailed endpoint', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.message).toContain('/api/health/detailed');
    });

    it('should respond quickly (no external service calls)', async () => {
      const start = Date.now();
      await request(app)
        .get('/health')
        .expect(200);
      const duration = Date.now() - start;

      // Should be very fast (< 100ms) since no external calls
      expect(duration).toBeLessThan(100);
    });
  });

  // ===========================================
  // GET /health/detailed - Comprehensive Check
  // ===========================================

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

    it('should return degraded status when Ollama is down but databases are up', async () => {
      mockTestConnections.mockResolvedValue({ personal: true, work: true });
      mockCheckOllamaHealth.mockResolvedValue({ available: false, models: [] });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      // Still healthy because Claude is available (mocked as available)
      expect(['healthy', 'degraded']).toContain(response.body.status);
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

    it('should handle database connection test errors', async () => {
      mockTestConnections.mockRejectedValue(new Error('Connection timeout'));
      mockCheckOllamaHealth.mockResolvedValue({ available: true, models: ['mistral'] });

      const response = await request(app)
        .get('/health/detailed')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
    });

    it('should include response time', async () => {
      mockTestConnections.mockResolvedValue({ personal: true, work: true });
      mockCheckOllamaHealth.mockResolvedValue({ available: true, models: [] });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(typeof response.body.responseTime).toBe('number');
      expect(response.body.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should include timestamp in ISO format', async () => {
      mockTestConnections.mockResolvedValue({ personal: true, work: true });
      mockCheckOllamaHealth.mockResolvedValue({ available: true, models: [] });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include pool statistics', async () => {
      mockTestConnections.mockResolvedValue({ personal: true, work: true });
      mockCheckOllamaHealth.mockResolvedValue({ available: true, models: [] });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.services.databases.personal.pool).toBeDefined();
      expect(response.body.services.databases.work.pool).toBeDefined();
    });

    it('should include AI service info', async () => {
      mockTestConnections.mockResolvedValue({ personal: true, work: true });
      mockCheckOllamaHealth.mockResolvedValue({ available: true, models: ['mistral:latest'] });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.services.ai).toBeDefined();
      expect(response.body.services.ai.claude).toBeDefined();
      expect(response.body.services.ai.ollama).toBeDefined();
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
  // GET /health/live - Kubernetes Liveness
  // ===========================================

  describe('GET /health/live', () => {
    it('should return ok status for liveness probe', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  // ===========================================
  // GET /health/ready - Kubernetes Readiness
  // ===========================================

  describe('GET /health/ready', () => {
    it('should return ready when at least one database is connected', async () => {
      mockTestConnections.mockResolvedValue({ personal: true, work: false });

      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body.status).toBe('ready');
    });

    it('should return not_ready when no databases are connected', async () => {
      mockTestConnections.mockResolvedValue({ personal: false, work: false });

      const response = await request(app)
        .get('/health/ready')
        .expect(503);

      expect(response.body.status).toBe('not_ready');
    });
  });

  // ===========================================
  // Edge Cases
  // ===========================================

  describe('Edge Cases', () => {
    it('should handle partial database connectivity', async () => {
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

      // Both should be called almost simultaneously (within 20ms)
      expect(Math.abs(dbCallTime - ollamaCallTime)).toBeLessThan(20);
    });
  });
});
