/**
 * Phase 61: BullMQ Job Queue Tests
 *
 * Tests for queue service: enqueue, stats, shutdown, no-redis fallback.
 */

// Mock BullMQ
const mockAdd = jest.fn().mockResolvedValue({ id: 'job-123' });
const mockGetJobCounts = jest.fn().mockResolvedValue({
  waiting: 5,
  active: 2,
  completed: 100,
  failed: 3,
  delayed: 1,
});
const mockClean = jest.fn().mockResolvedValue(['job-1', 'job-2']);
const mockClose = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockAdd,
    getJobCounts: mockGetJobCounts,
    clean: mockClean,
    close: mockClose,
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}), { virtual: true });

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../services/observability/metrics', () => ({
  recordQueueJob: jest.fn(),
}));

import { getQueueService, resetQueueService, QUEUE_NAMES } from '../../../services/queue/job-queue';
import { recordQueueJob } from '../../../services/observability/metrics';

const mockRecordQueueJob = recordQueueJob as jest.MockedFunction<typeof recordQueueJob>;

describe('QueueService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetQueueService();
  });

  describe('without REDIS_URL', () => {
    const originalRedisUrl = process.env.REDIS_URL;

    beforeEach(() => {
      delete process.env.REDIS_URL;
    });

    afterEach(() => {
      if (originalRedisUrl) {
        process.env.REDIS_URL = originalRedisUrl;
      }
    });

    it('should not crash without REDIS_URL', async () => {
      const service = getQueueService();
      const result = await service.initialize();
      expect(result).toBe(false);
    });

    it('should report as not available', async () => {
      const service = getQueueService();
      await service.initialize();
      expect(service.isAvailable()).toBe(false);
    });

    it('should return null on enqueue when not available', async () => {
      const service = getQueueService();
      await service.initialize();
      const result = await service.enqueue('memory-consolidation', 'test-job', { data: 1 });
      expect(result).toBeNull();
    });

    it('should return empty stats when not available', async () => {
      const service = getQueueService();
      await service.initialize();
      const stats = await service.getQueueStats('memory-consolidation');
      expect(stats).toEqual({
        name: 'memory-consolidation',
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      });
    });

    it('should return empty array for all stats when not available', async () => {
      const service = getQueueService();
      await service.initialize();
      const allStats = await service.getAllStats();
      expect(allStats.length).toBe(4);
      allStats.forEach(s => {
        expect(s.active).toBe(0);
      });
    });

    it('should handle shutdown gracefully when not available', async () => {
      const service = getQueueService();
      await service.initialize();
      await service.shutdown(); // Should not throw
    });
  });

  describe('with REDIS_URL', () => {
    beforeEach(() => {
      process.env.REDIS_URL = 'redis://localhost:6379';
    });

    it('should initialize successfully', async () => {
      const service = getQueueService();
      const result = await service.initialize();
      expect(result).toBe(true);
      expect(service.isAvailable()).toBe(true);
    });

    it('should return true on repeated initialization', async () => {
      const service = getQueueService();
      await service.initialize();
      const result = await service.initialize();
      expect(result).toBe(true);
    });

    it('should create all queues', async () => {
      const service = getQueueService();
      await service.initialize();

      const { Queue } = await import('bullmq');
      expect(Queue).toHaveBeenCalledTimes(4);
    });

    it('should return correct queue names', () => {
      const service = getQueueService();
      expect(service.getQueueNames()).toEqual(QUEUE_NAMES);
      expect(QUEUE_NAMES).toContain('memory-consolidation');
      expect(QUEUE_NAMES).toContain('rag-indexing');
      expect(QUEUE_NAMES).toContain('email-processing');
      expect(QUEUE_NAMES).toContain('graph-indexing');
    });
  });

  describe('enqueue', () => {
    beforeEach(async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const service = getQueueService();
      await service.initialize();
    });

    it('should enqueue a job and return job ID', async () => {
      const service = getQueueService();
      const jobId = await service.enqueue('memory-consolidation', 'consolidate', { context: 'personal' });
      expect(jobId).toBe('job-123');
      expect(mockAdd).toHaveBeenCalledWith('consolidate', { context: 'personal' }, expect.any(Object));
    });

    it('should record queue metric on enqueue', async () => {
      const service = getQueueService();
      await service.enqueue('rag-indexing', 'index', { ideaId: '123' });
      expect(mockRecordQueueJob).toHaveBeenCalledWith('rag-indexing', 'enqueued');
    });

    it('should merge custom job options', async () => {
      const service = getQueueService();
      await service.enqueue('email-processing', 'analyze', { emailId: '456' }, {
        priority: 1,
        delay: 5000,
      });
      expect(mockAdd).toHaveBeenCalledWith('analyze', { emailId: '456' }, expect.objectContaining({
        priority: 1,
        delay: 5000,
      }));
    });

    it('should return null for unknown queue', async () => {
      const service = getQueueService();
      const result = await service.enqueue('unknown-queue' as never, 'test', {});
      expect(result).toBeNull();
    });

    it('should handle enqueue errors gracefully', async () => {
      mockAdd.mockRejectedValueOnce(new Error('Redis connection failed'));
      const service = getQueueService();
      const result = await service.enqueue('memory-consolidation', 'consolidate', {});
      expect(result).toBeNull();
    });
  });

  describe('getQueue', () => {
    beforeEach(async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const service = getQueueService();
      await service.initialize();
    });

    it('should return queue reference by name', () => {
      const service = getQueueService();
      const queue = service.getQueue('memory-consolidation');
      expect(queue).toBeDefined();
    });

    it('should return null for unknown queue', () => {
      const service = getQueueService();
      const queue = service.getQueue('nonexistent' as never);
      expect(queue).toBeNull();
    });
  });

  describe('getQueueStats', () => {
    beforeEach(async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const service = getQueueService();
      await service.initialize();
    });

    it('should return stats for a queue', async () => {
      const service = getQueueService();
      const stats = await service.getQueueStats('memory-consolidation');
      expect(stats).toEqual({
        name: 'memory-consolidation',
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
      });
    });

    it('should return null for unknown queue', async () => {
      const service = getQueueService();
      const stats = await service.getQueueStats('unknown' as never);
      expect(stats).toBeNull();
    });
  });

  describe('getAllStats', () => {
    beforeEach(async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const service = getQueueService();
      await service.initialize();
    });

    it('should return stats for all queues', async () => {
      const service = getQueueService();
      const allStats = await service.getAllStats();
      expect(allStats.length).toBe(4);
      expect(allStats[0].name).toBe('memory-consolidation');
    });
  });

  describe('cleanQueue', () => {
    beforeEach(async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const service = getQueueService();
      await service.initialize();
    });

    it('should clean completed jobs', async () => {
      const service = getQueueService();
      const cleaned = await service.cleanQueue('memory-consolidation', 'completed');
      expect(cleaned).toBe(2);
      expect(mockClean).toHaveBeenCalledWith(3600000, 1000, 'completed');
    });

    it('should return 0 for unknown queue', async () => {
      const service = getQueueService();
      const cleaned = await service.cleanQueue('unknown' as never);
      expect(cleaned).toBe(0);
    });
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const service = getQueueService();
      await service.initialize();
    });

    it('should close all queues', async () => {
      const service = getQueueService();
      await service.shutdown();
      expect(mockClose).toHaveBeenCalled();
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const a = getQueueService();
      const b = getQueueService();
      expect(a).toBe(b);
    });

    it('should return new instance after reset', () => {
      const a = getQueueService();
      resetQueueService();
      const b = getQueueService();
      expect(a).not.toBe(b);
    });
  });
});
