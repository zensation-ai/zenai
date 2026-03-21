/**
 * Memory Scheduler Service Tests
 *
 * Tests for scheduling, consolidation, decay, stats, focus research,
 * and error recovery in the memory scheduler.
 */

// Mock database
const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (c: string) => ['personal', 'work', 'learning', 'creative'].includes(c),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// Mock long-term memory
const mockLtConsolidate = jest.fn();
const mockLtApplyFactDecay = jest.fn();
const mockLtGetStats = jest.fn();
const mockLtAddFact = jest.fn();
jest.mock('../../../services/memory/long-term-memory', () => ({
  longTermMemory: {
    consolidate: (...args: unknown[]) => mockLtConsolidate(...args),
    applyFactDecay: (...args: unknown[]) => mockLtApplyFactDecay(...args),
    getStats: (...args: unknown[]) => mockLtGetStats(...args),
    addFact: (...args: unknown[]) => mockLtAddFact(...args),
  },
}));

// Mock episodic memory
const mockEpConsolidate = jest.fn();
const mockEpApplyDecay = jest.fn();
const mockEpGetStats = jest.fn();
const mockEpTemporalMerge = jest.fn();
jest.mock('../../../services/memory/episodic-memory', () => ({
  episodicMemory: {
    consolidate: (...args: unknown[]) => mockEpConsolidate(...args),
    applyDecay: (...args: unknown[]) => mockEpApplyDecay(...args),
    getStats: (...args: unknown[]) => mockEpGetStats(...args),
    temporalMerge: (...args: unknown[]) => mockEpTemporalMerge(...args),
  },
}));

// Mock cross-context sharing
jest.mock('../../../services/memory/cross-context-sharing', () => ({
  crossContextSharing: {
    shareAll: jest.fn().mockResolvedValue({ shared: 0 }),
  },
}));

// Mock proactive digest
jest.mock('../../../services/proactive-digest', () => ({
  proactiveDigest: {
    generateDailyDigest: jest.fn().mockResolvedValue(null),
    generateWeeklyDigest: jest.fn().mockResolvedValue(null),
  },
}));

// Mock memory governance
const mockApplyRetention = jest.fn();
jest.mock('../../../services/memory/memory-governance', () => ({
  memoryGovernance: {
    applyRetention: (...args: unknown[]) => mockApplyRetention(...args),
  },
}));

// Mock domain focus
const mockGetAllDomainFocus = jest.fn();
jest.mock('../../../services/domain-focus', () => ({
  getAllDomainFocus: (...args: unknown[]) => mockGetAllDomainFocus(...args),
}));

// Mock proactive intelligence
const mockResearchFocusTopic = jest.fn();
const mockShouldResearchNow = jest.fn();
jest.mock('../../../services/proactive-intelligence', () => ({
  researchFocusTopic: (...args: unknown[]) => mockResearchFocusTopic(...args),
  shouldResearchNow: (...args: unknown[]) => mockShouldResearchNow(...args),
}));

// Mock redis lock - always executes the callback (no lock contention)
jest.mock('../../../services/redis-lock', () => ({
  redisLock: {
    withLock: jest.fn(async (_key: string, callback: () => Promise<unknown>) => {
      return callback();
    }),
  },
}));

import { memoryScheduler } from '../../../services/memory/memory-scheduler';

// ===========================================
// Tests
// ===========================================

describe('MemoryScheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations
    mockLtConsolidate.mockResolvedValue({ patternsAdded: 0, factsAdded: 0, factsUpdated: 0, interactionsStored: 0 });
    mockEpConsolidate.mockResolvedValue({ episodesProcessed: 0, factsExtracted: 0, strongEpisodes: 0 });
    mockEpTemporalMerge.mockResolvedValue({ episodesRemoved: 0 });
    mockEpApplyDecay.mockResolvedValue(0);
    mockLtApplyFactDecay.mockResolvedValue({ decayed: 0, pruned: 0 });
    mockApplyRetention.mockResolvedValue(0);
    mockLtGetStats.mockResolvedValue({ totalFacts: 10 });
    mockEpGetStats.mockResolvedValue({ totalEpisodes: 5 });
    mockQueryContext.mockResolvedValue({ rows: [] });
    mockGetAllDomainFocus.mockResolvedValue([]);
  });

  // -------------------------------------------
  // Scheduler Lifecycle
  // -------------------------------------------

  describe('start/stop lifecycle', () => {
    it('should start the scheduler and register tasks', async () => {
      await memoryScheduler.start();
      const status = memoryScheduler.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.tasks.length).toBeGreaterThanOrEqual(3);
      memoryScheduler.stop();
    });

    it('should stop the scheduler and disable all tasks', () => {
      memoryScheduler.stop();
      const status = memoryScheduler.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it('should include task names in status', async () => {
      await memoryScheduler.start();
      const status = memoryScheduler.getStatus();
      const taskNames = status.tasks.map(t => t.name);
      expect(taskNames).toContain('long-term-consolidation');
      expect(taskNames).toContain('episodic-decay');
      expect(taskNames).toContain('memory-stats');
      memoryScheduler.stop();
    });
  });

  // -------------------------------------------
  // Consolidation
  // -------------------------------------------

  describe('runConsolidation', () => {
    it('should consolidate all 4 contexts', async () => {
      const result = await memoryScheduler.runConsolidation();
      expect(result).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
      // Called once per context (4 contexts)
      expect(mockLtConsolidate).toHaveBeenCalledTimes(4);
      expect(mockEpConsolidate).toHaveBeenCalledTimes(4);
    });

    it('should aggregate consolidation results across contexts', async () => {
      mockLtConsolidate.mockResolvedValue({ patternsAdded: 2, factsAdded: 3, factsUpdated: 1, interactionsStored: 5 });
      mockEpConsolidate.mockResolvedValue({ episodesProcessed: 10, factsExtracted: 4, strongEpisodes: 2 });

      const result = await memoryScheduler.runConsolidation();
      expect(result.longTerm.patternsAdded).toBe(8);  // 2 * 4 contexts
      expect(result.longTerm.factsAdded).toBe(12);     // 3 * 4
      expect(result.episodic.episodesProcessed).toBe(40); // 10 * 4
    });

    it('should continue episodic consolidation if long-term fails', async () => {
      mockLtConsolidate.mockRejectedValue(new Error('LT failed'));
      mockEpConsolidate.mockResolvedValue({ episodesProcessed: 5, factsExtracted: 2, strongEpisodes: 1 });

      const result = await memoryScheduler.runConsolidation();
      // Should still have episodic results
      expect(result.episodic.episodesProcessed).toBe(20); // 5 * 4
      expect(mockEpConsolidate).toHaveBeenCalledTimes(4);
    });

    it('should continue with next context if one context fails completely', async () => {
      mockLtConsolidate
        .mockRejectedValueOnce(new Error('personal failed'))
        .mockResolvedValue({ patternsAdded: 1, factsAdded: 1, factsUpdated: 0, interactionsStored: 0 });
      mockEpConsolidate
        .mockRejectedValueOnce(new Error('personal ep failed'))
        .mockResolvedValue({ episodesProcessed: 2, factsExtracted: 1, strongEpisodes: 0 });

      const result = await memoryScheduler.runConsolidation();
      // 3 remaining contexts succeed
      expect(result.longTerm.factsAdded).toBe(3);
      expect(result.episodic.episodesProcessed).toBe(6);
    });

    it('should record last error on consolidation failure', async () => {
      mockLtConsolidate.mockRejectedValue(new Error('DB connection lost'));

      await memoryScheduler.runConsolidation();
      const status = memoryScheduler.getStatus();
      expect(status.lastError).toBe('DB connection lost');
    });
  });

  // -------------------------------------------
  // Trigger Consolidation (single context)
  // -------------------------------------------

  describe('triggerConsolidation', () => {
    it('should consolidate only specified context', async () => {
      await memoryScheduler.triggerConsolidation('personal');
      expect(mockLtConsolidate).toHaveBeenCalledTimes(1);
      expect(mockLtConsolidate).toHaveBeenCalledWith('personal');
    });

    it('should consolidate all contexts when none specified', async () => {
      await memoryScheduler.triggerConsolidation();
      expect(mockLtConsolidate).toHaveBeenCalledTimes(4);
    });
  });

  // -------------------------------------------
  // Decay
  // -------------------------------------------

  describe('runDecay', () => {
    it('should apply decay for all 4 contexts', async () => {
      const result = await memoryScheduler.runDecay();
      expect(result).toBeDefined();
      expect(mockEpApplyDecay).toHaveBeenCalledTimes(4);
      expect(mockLtApplyFactDecay).toHaveBeenCalledTimes(4);
    });

    it('should aggregate decay results', async () => {
      mockEpApplyDecay.mockResolvedValue(3);
      mockLtApplyFactDecay.mockResolvedValue({ decayed: 2, pruned: 1 });
      mockApplyRetention.mockResolvedValue(0);

      const result = await memoryScheduler.runDecay();
      expect(result.totalAffected).toBe(12); // 3 * 4 contexts
      expect(result.factsDecayed).toBe(8);   // 2 * 4
      expect(result.factsPruned).toBe(4);    // 1 * 4
    });

    it('should continue with next context if episodic decay fails', async () => {
      mockEpApplyDecay
        .mockRejectedValueOnce(new Error('personal failed'))
        .mockResolvedValue(2);

      const result = await memoryScheduler.runDecay();
      // 3 successful contexts
      expect(result.totalAffected).toBe(6);
    });

    it('should apply GDPR retention policies', async () => {
      mockApplyRetention.mockResolvedValue(5);

      const result = await memoryScheduler.runDecay();
      expect(mockApplyRetention).toHaveBeenCalledTimes(4);
      expect(result.totalAffected).toBe(20); // 5 * 4 contexts
    });
  });

  // -------------------------------------------
  // Trigger Decay (single context)
  // -------------------------------------------

  describe('triggerDecay', () => {
    it('should decay only specified context', async () => {
      await memoryScheduler.triggerDecay('work');
      expect(mockEpApplyDecay).toHaveBeenCalledTimes(1);
      expect(mockEpApplyDecay).toHaveBeenCalledWith('work');
    });
  });

  // -------------------------------------------
  // Memory Stats
  // -------------------------------------------

  describe('logMemoryStats', () => {
    it('should collect stats for all 4 contexts', async () => {
      await memoryScheduler.logMemoryStats();
      expect(mockLtGetStats).toHaveBeenCalledTimes(4);
      expect(mockEpGetStats).toHaveBeenCalledTimes(4);
    });

    it('should handle stats failures gracefully', async () => {
      mockLtGetStats.mockRejectedValue(new Error('stats failed'));

      // Should not throw
      await expect(memoryScheduler.logMemoryStats()).resolves.not.toThrow();
    });
  });

  // -------------------------------------------
  // Focus Research
  // -------------------------------------------

  describe('runFocusResearch', () => {
    it('should call getAllDomainFocus for each context', async () => {
      mockGetAllDomainFocus.mockResolvedValue([]);

      const result = await memoryScheduler.runFocusResearch();
      expect(mockGetAllDomainFocus).toHaveBeenCalledTimes(4);
      expect(result.topicsResearched).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should skip topics not due for research', async () => {
      const mockFocus = { id: '1', topic: 'AI' };
      mockGetAllDomainFocus.mockResolvedValue([mockFocus]);
      mockShouldResearchNow.mockReturnValue(false);

      const result = await memoryScheduler.runFocusResearch();
      expect(result.topicsResearched).toBe(0);
      expect(mockResearchFocusTopic).not.toHaveBeenCalled();
    });

    it('should handle research errors and continue', async () => {
      mockGetAllDomainFocus
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValue([]);

      const result = await memoryScheduler.runFocusResearch();
      expect(result).toBeDefined();
      expect(result.topicsResearched).toBe(0);
    });
  });

  // -------------------------------------------
  // Trigger Focus Research
  // -------------------------------------------

  describe('triggerFocusResearch', () => {
    it('should research only specified context', async () => {
      mockGetAllDomainFocus.mockResolvedValue([]);

      await memoryScheduler.triggerFocusResearch('learning');
      expect(mockGetAllDomainFocus).toHaveBeenCalledTimes(1);
      expect(mockGetAllDomainFocus).toHaveBeenCalledWith('learning', true);
    });
  });

  // -------------------------------------------
  // Status & Config
  // -------------------------------------------

  describe('getStatus', () => {
    it('should return scheduler status with totalRuns', async () => {
      const status = memoryScheduler.getStatus();
      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('tasks');
      expect(status).toHaveProperty('totalRuns');
      expect(status).toHaveProperty('lastError');
    });
  });

  describe('getConfig', () => {
    it('should return configuration object', () => {
      const config = memoryScheduler.getConfig();
      expect(config).toHaveProperty('TIMEZONE');
      expect(config).toHaveProperty('CONSOLIDATION_SCHEDULE');
      expect(config).toHaveProperty('DECAY_SCHEDULE');
      expect(config).toHaveProperty('CONTEXTS');
      expect(config.CONTEXTS).toHaveLength(4);
    });
  });
});
