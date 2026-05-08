/**
 * Memory Scheduler Service - Extended Tests
 *
 * Additional coverage for untested paths:
 * - Redis lock failures / contention
 * - learnFromActivityLogs with various patterns
 * - pruneOldReflections with different thresholds
 * - logMemoryStats edge cases
 * - runFocusResearch with topics due for research
 * - Decay with retention policy errors
 * - Consolidation sub-steps (temporal merge, cross-context, digests)
 * - getStatus / getConfig detail checks
 * - Cron parsing edge cases (via getNextRunTime export)
 */

// Mock database
const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (c: string) => ['operations', 'finance', 'people', 'strategy'].includes(c),
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
const mockShareAll = jest.fn();
jest.mock('../../../services/memory/cross-context-sharing', () => ({
  crossContextSharing: {
    shareAll: (...args: unknown[]) => mockShareAll(...args),
  },
}));

// Mock proactive digest
const mockGenerateDailyDigest = jest.fn();
const mockGenerateWeeklyDigest = jest.fn();
jest.mock('../../../services/proactive-digest', () => ({
  proactiveDigest: {
    generateDailyDigest: (...args: unknown[]) => mockGenerateDailyDigest(...args),
    generateWeeklyDigest: (...args: unknown[]) => mockGenerateWeeklyDigest(...args),
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

// Mock redis lock - default: always executes the callback
const mockWithLock = jest.fn();
jest.mock('../../../services/redis-lock', () => ({
  redisLock: {
    withLock: (...args: unknown[]) => mockWithLock(...args),
  },
}));

import { memoryScheduler } from '../../../services/memory/memory-scheduler';

// ===========================================
// Extended Tests
// ===========================================

describe('MemoryScheduler (Extended)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: lock always executes callback
    mockWithLock.mockImplementation(async (_key: string, callback: () => Promise<unknown>) => {
      return callback();
    });
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
    mockShareAll.mockResolvedValue({ shared: 0 });
    mockGenerateDailyDigest.mockResolvedValue(null);
    mockGenerateWeeklyDigest.mockResolvedValue(null);
    mockLtAddFact.mockResolvedValue(undefined);
    mockResearchFocusTopic.mockResolvedValue(undefined);
  });

  afterEach(() => {
    memoryScheduler.stop();
  });

  // -------------------------------------------
  // Redis Lock Contention
  // -------------------------------------------

  describe('Redis lock contention', () => {
    it('should return empty consolidation result when lock is not acquired', async () => {
      mockWithLock.mockResolvedValue(null);

      const result = await memoryScheduler.runConsolidation();
      expect(result.longTerm.patternsAdded).toBe(0);
      expect(result.longTerm.factsAdded).toBe(0);
      expect(result.episodic.episodesProcessed).toBe(0);
      expect(result.duration).toBe(0);
      // No actual consolidation should have been called
      expect(mockLtConsolidate).not.toHaveBeenCalled();
    });

    it('should return empty decay result when lock is not acquired', async () => {
      mockWithLock.mockResolvedValue(null);

      const result = await memoryScheduler.runDecay();
      expect(result.totalAffected).toBe(0);
      expect(result.factsDecayed).toBe(0);
      expect(result.factsPruned).toBe(0);
      expect(result.duration).toBe(0);
      expect(mockEpApplyDecay).not.toHaveBeenCalled();
    });

    it('should pass correct lock key and TTL for consolidation', async () => {
      await memoryScheduler.runConsolidation();
      expect(mockWithLock).toHaveBeenCalledWith(
        'memory:consolidation',
        expect.any(Function),
        600
      );
    });

    it('should pass correct lock key and TTL for decay', async () => {
      await memoryScheduler.runDecay();
      expect(mockWithLock).toHaveBeenCalledWith(
        'memory:decay',
        expect.any(Function),
        300
      );
    });
  });

  // -------------------------------------------
  // learnFromActivityLogs
  // -------------------------------------------

  describe('learnFromActivityLogs (via consolidation)', () => {
    it('should detect time-of-day patterns when peak count >= 5', async () => {
      // Return activity data with a clear morning peak
      mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
        if (typeof sql === 'string' && sql.includes('ai_activity_log')) {
          return {
            rows: [
              { activity_type: 'idea_created', count: '6', hour: '9' },
              { activity_type: 'search_performed', count: '2', hour: '14' },
            ],
          };
        }
        // For pruneOldReflections COUNT query
        return { rows: [{ cnt: '0' }] };
      });

      await memoryScheduler.runConsolidation();

      // Should have called addFact for the time-of-day pattern
      expect(mockLtAddFact).toHaveBeenCalled();
      const calls = mockLtAddFact.mock.calls;
      const timePatternCall = calls.find(
        (c: unknown[]) => typeof c[1] === 'object' && c[1] !== null &&
          (c[1] as Record<string, unknown>).factType === 'behavior' &&
          typeof (c[1] as Record<string, unknown>).content === 'string' &&
          ((c[1] as Record<string, unknown>).content as string).includes('morgens')
      );
      expect(timePatternCall).toBeDefined();
    });

    it('should detect afternoon activity with correct label', async () => {
      mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
        if (typeof sql === 'string' && sql.includes('ai_activity_log')) {
          return {
            rows: [
              { activity_type: 'idea_created', count: '8', hour: '14' },
            ],
          };
        }
        return { rows: [{ cnt: '0' }] };
      });

      await memoryScheduler.runConsolidation();

      const calls = mockLtAddFact.mock.calls;
      const afternoonCall = calls.find(
        (c: unknown[]) => typeof c[1] === 'object' && c[1] !== null &&
          typeof (c[1] as Record<string, unknown>).content === 'string' &&
          ((c[1] as Record<string, unknown>).content as string).includes('nachmittags')
      );
      expect(afternoonCall).toBeDefined();
    });

    it('should detect evening activity with correct label', async () => {
      mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
        if (typeof sql === 'string' && sql.includes('ai_activity_log')) {
          return {
            rows: [
              { activity_type: 'idea_created', count: '10', hour: '20' },
            ],
          };
        }
        return { rows: [{ cnt: '0' }] };
      });

      await memoryScheduler.runConsolidation();

      const calls = mockLtAddFact.mock.calls;
      const eveningCall = calls.find(
        (c: unknown[]) => typeof c[1] === 'object' && c[1] !== null &&
          typeof (c[1] as Record<string, unknown>).content === 'string' &&
          ((c[1] as Record<string, unknown>).content as string).includes('abends')
      );
      expect(eveningCall).toBeDefined();
    });

    it('should skip time pattern when peak count < 5', async () => {
      mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
        if (typeof sql === 'string' && sql.includes('ai_activity_log')) {
          return {
            rows: [
              { activity_type: 'idea_created', count: '2', hour: '9' },
            ],
          };
        }
        return { rows: [{ cnt: '0' }] };
      });

      await memoryScheduler.runConsolidation();

      // No time-of-day pattern should be added (only feature patterns possibly)
      const calls = mockLtAddFact.mock.calls;
      const timePatternCall = calls.find(
        (c: unknown[]) => typeof c[1] === 'object' && c[1] !== null &&
          typeof (c[1] as Record<string, unknown>).content === 'string' &&
          ((c[1] as Record<string, unknown>).content as string).includes('aktivsten')
      );
      expect(timePatternCall).toBeUndefined();
    });

    it('should detect feature usage patterns with known labels', async () => {
      mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
        if (typeof sql === 'string' && sql.includes('ai_activity_log')) {
          return {
            rows: [
              { activity_type: 'idea_created', count: '5', hour: '10' },
              { activity_type: 'search_performed', count: '4', hour: '10' },
            ],
          };
        }
        return { rows: [{ cnt: '0' }] };
      });

      await memoryScheduler.runConsolidation();

      const calls = mockLtAddFact.mock.calls;
      const featureCall = calls.find(
        (c: unknown[]) => typeof c[1] === 'object' && c[1] !== null &&
          typeof (c[1] as Record<string, unknown>).content === 'string' &&
          ((c[1] as Record<string, unknown>).content as string).includes('Ideen erstellen')
      );
      expect(featureCall).toBeDefined();
    });

    it('should use raw activity_type as label for unknown features', async () => {
      mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
        if (typeof sql === 'string' && sql.includes('ai_activity_log')) {
          return {
            rows: [
              { activity_type: 'custom_action', count: '10', hour: '10' },
            ],
          };
        }
        return { rows: [{ cnt: '0' }] };
      });

      await memoryScheduler.runConsolidation();

      const calls = mockLtAddFact.mock.calls;
      const customCall = calls.find(
        (c: unknown[]) => typeof c[1] === 'object' && c[1] !== null &&
          typeof (c[1] as Record<string, unknown>).content === 'string' &&
          ((c[1] as Record<string, unknown>).content as string).includes('custom_action')
      );
      expect(customCall).toBeDefined();
    });

    it('should skip feature pattern when count < 3', async () => {
      mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
        if (typeof sql === 'string' && sql.includes('ai_activity_log')) {
          return {
            rows: [
              { activity_type: 'idea_created', count: '2', hour: '10' },
            ],
          };
        }
        return { rows: [{ cnt: '0' }] };
      });

      await memoryScheduler.runConsolidation();

      const calls = mockLtAddFact.mock.calls;
      const featureCall = calls.find(
        (c: unknown[]) => typeof c[1] === 'object' && c[1] !== null &&
          typeof (c[1] as Record<string, unknown>).content === 'string' &&
          ((c[1] as Record<string, unknown>).content as string).includes('haeufig')
      );
      expect(featureCall).toBeUndefined();
    });

    it('should handle activity log query errors gracefully', async () => {
      mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
        if (typeof sql === 'string' && sql.includes('ai_activity_log')) {
          throw new Error('DB timeout');
        }
        return { rows: [{ cnt: '0' }] };
      });

      // Should not throw
      const result = await memoryScheduler.runConsolidation();
      expect(result).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should skip context with empty activity rows', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      const result = await memoryScheduler.runConsolidation();
      // No facts should be added for activity patterns
      const behaviorCalls = mockLtAddFact.mock.calls.filter(
        (c: unknown[]) => typeof c[1] === 'object' && c[1] !== null &&
          (c[1] as Record<string, unknown>).factType === 'behavior'
      );
      expect(behaviorCalls).toHaveLength(0);
      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------
  // pruneOldReflections
  // -------------------------------------------

  describe('pruneOldReflections (via consolidation)', () => {
    it('should prune when reflection count exceeds 200', async () => {
      mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
        if (typeof sql === 'string' && sql.includes('COUNT(*)')) {
          return { rows: [{ cnt: '250' }] };
        }
        if (typeof sql === 'string' && sql.includes('DELETE FROM reflection_insights')) {
          return { rows: [] };
        }
        // For activity log
        return { rows: [] };
      });

      await memoryScheduler.runConsolidation();

      // Should have called DELETE for each of the 4 contexts
      const deleteCalls = mockQueryContext.mock.calls.filter(
        (c: unknown[]) => typeof c[1] === 'string' && (c[1] as string).includes('DELETE FROM reflection_insights')
      );
      expect(deleteCalls.length).toBe(4);
      // Should delete 50 per context (250 - 200)
      for (const call of deleteCalls) {
        expect(call[2]).toContain(50);
      }
    });

    it('should not prune when reflection count is within limit', async () => {
      mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
        if (typeof sql === 'string' && sql.includes('COUNT(*)')) {
          return { rows: [{ cnt: '150' }] };
        }
        return { rows: [] };
      });

      await memoryScheduler.runConsolidation();

      const deleteCalls = mockQueryContext.mock.calls.filter(
        (c: unknown[]) => typeof c[1] === 'string' && (c[1] as string).includes('DELETE FROM reflection_insights')
      );
      expect(deleteCalls.length).toBe(0);
    });

    it('should handle "table does not exist" errors gracefully', async () => {
      mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
        if (typeof sql === 'string' && sql.includes('reflection_insights')) {
          throw new Error('relation "reflection_insights" does not exist');
        }
        return { rows: [] };
      });

      // Should not throw
      const result = await memoryScheduler.runConsolidation();
      expect(result).toBeDefined();
    });

    it('should handle unknown prune errors gracefully', async () => {
      mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
        if (typeof sql === 'string' && sql.includes('COUNT(*)') && sql.includes('reflection_insights')) {
          throw new Error('connection reset');
        }
        return { rows: [] };
      });

      // Should not throw
      const result = await memoryScheduler.runConsolidation();
      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------
  // logMemoryStats edge cases
  // -------------------------------------------

  describe('logMemoryStats edge cases', () => {
    it('should handle episodic stats failure while long-term succeeds', async () => {
      mockLtGetStats.mockResolvedValue({ totalFacts: 42 });
      mockEpGetStats.mockRejectedValue(new Error('episodic DB down'));

      // Should not throw
      await expect(memoryScheduler.logMemoryStats()).resolves.toBeUndefined();
    });

    it('should handle both stats failing for a context', async () => {
      mockLtGetStats.mockRejectedValue(new Error('lt fail'));
      mockEpGetStats.mockRejectedValue(new Error('ep fail'));

      await expect(memoryScheduler.logMemoryStats()).resolves.toBeUndefined();
    });

    it('should call stats for each context independently', async () => {
      // First context fails, rest succeed
      mockLtGetStats
        .mockRejectedValueOnce(new Error('personal fail'))
        .mockResolvedValue({ totalFacts: 5 });
      mockEpGetStats.mockResolvedValue({ totalEpisodes: 3 });

      await memoryScheduler.logMemoryStats();
      // Should still try all 4 contexts
      expect(mockLtGetStats).toHaveBeenCalledTimes(4);
      expect(mockEpGetStats).toHaveBeenCalledTimes(4);
    });
  });

  // -------------------------------------------
  // runFocusResearch with topics
  // -------------------------------------------

  describe('runFocusResearch edge cases', () => {
    it('should research topics that are due', async () => {
      const mockFocus1 = { id: '1', topic: 'AI Safety', lastResearch: null };
      const mockFocus2 = { id: '2', topic: 'Rust', lastResearch: null };
      mockGetAllDomainFocus.mockResolvedValue([mockFocus1, mockFocus2]);
      mockShouldResearchNow.mockReturnValue(true);

      const result = await memoryScheduler.runFocusResearch();
      // 2 topics * 4 contexts = 8
      expect(result.topicsResearched).toBe(8);
      expect(mockResearchFocusTopic).toHaveBeenCalledTimes(8);
    }, 60000);

    it('should handle mixed due/not-due topics', async () => {
      const mockFocus1 = { id: '1', topic: 'AI Safety' };
      const mockFocus2 = { id: '2', topic: 'Rust' };
      mockGetAllDomainFocus.mockResolvedValue([mockFocus1, mockFocus2]);
      mockShouldResearchNow
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const result = await memoryScheduler.runFocusResearch();
      expect(result.topicsResearched).toBe(4); // Only half are due
    }, 60000);

    it('should record error when research fails for a context', async () => {
      mockGetAllDomainFocus.mockRejectedValue(new Error('Focus DB error'));

      const result = await memoryScheduler.runFocusResearch();
      expect(result.topicsResearched).toBe(0);
      const status = memoryScheduler.getStatus();
      expect(status.lastError).toBe('Focus DB error');
    });

    it('should handle researchFocusTopic throwing', async () => {
      const mockFocus = { id: '1', topic: 'AI' };
      mockGetAllDomainFocus.mockResolvedValue([mockFocus]);
      mockShouldResearchNow.mockReturnValue(true);
      mockResearchFocusTopic.mockRejectedValue(new Error('API limit'));

      // The error propagates up and is caught in the context-level catch
      const result = await memoryScheduler.runFocusResearch();
      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------
  // Decay edge cases
  // -------------------------------------------

  describe('runDecay edge cases', () => {
    it('should continue fact decay even when episodic decay fails', async () => {
      mockEpApplyDecay.mockRejectedValue(new Error('episodic fail'));
      mockLtApplyFactDecay.mockResolvedValue({ decayed: 3, pruned: 1 });

      const result = await memoryScheduler.runDecay();
      expect(result.factsDecayed).toBe(12); // 3 * 4
      expect(result.factsPruned).toBe(4);   // 1 * 4
      expect(mockLtApplyFactDecay).toHaveBeenCalledTimes(4);
    });

    it('should continue when fact decay fails but episodic succeeds', async () => {
      mockEpApplyDecay.mockResolvedValue(5);
      mockLtApplyFactDecay.mockRejectedValue(new Error('fact decay fail'));

      const result = await memoryScheduler.runDecay();
      expect(result.totalAffected).toBe(20); // 5 * 4
      expect(result.factsDecayed).toBe(0);
      expect(result.factsPruned).toBe(0);
    });

    it('should handle retention policy errors gracefully', async () => {
      mockApplyRetention.mockRejectedValue(new Error('retention fail'));

      const result = await memoryScheduler.runDecay();
      // Should still return valid result from episodic/fact decay
      expect(result).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should add retention deletions to totalAffected', async () => {
      mockEpApplyDecay.mockResolvedValue(2);
      mockLtApplyFactDecay.mockResolvedValue({ decayed: 1, pruned: 0 });
      mockApplyRetention.mockResolvedValue(3);

      const result = await memoryScheduler.runDecay();
      // episodic: 2*4=8, retention: 3*4=12 => 20
      expect(result.totalAffected).toBe(20);
    });

    it('should track lastError from episodic decay failure', async () => {
      mockEpApplyDecay.mockRejectedValue(new Error('episodic connection lost'));

      await memoryScheduler.runDecay();
      const status = memoryScheduler.getStatus();
      expect(status.lastError).toBe('episodic connection lost');
    });
  });

  // -------------------------------------------
  // Consolidation sub-steps
  // -------------------------------------------

  describe('consolidation sub-steps', () => {
    it('should call temporal merge for each context', async () => {
      await memoryScheduler.runConsolidation();
      expect(mockEpTemporalMerge).toHaveBeenCalledTimes(4);
    });

    it('should handle temporal merge failure gracefully', async () => {
      mockEpTemporalMerge.mockRejectedValue(new Error('merge fail'));

      const result = await memoryScheduler.runConsolidation();
      expect(result).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should call cross-context sharing after consolidation', async () => {
      await memoryScheduler.runConsolidation();
      expect(mockShareAll).toHaveBeenCalledTimes(1);
    });

    it('should handle cross-context sharing failure gracefully', async () => {
      mockShareAll.mockRejectedValue(new Error('sharing fail'));

      const result = await memoryScheduler.runConsolidation();
      expect(result).toBeDefined();
    });

    it('should generate daily digests for all contexts', async () => {
      await memoryScheduler.runConsolidation();
      expect(mockGenerateDailyDigest).toHaveBeenCalledTimes(4);
    });

    it('should handle daily digest failure gracefully', async () => {
      mockGenerateDailyDigest.mockRejectedValue(new Error('digest fail'));

      const result = await memoryScheduler.runConsolidation();
      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------
  // Scheduler lifecycle (extended)
  // -------------------------------------------

  describe('scheduler lifecycle (extended)', () => {
    it('should be idempotent when starting multiple times', async () => {
      await memoryScheduler.start();
      await memoryScheduler.start(); // Second start should be no-op
      const status = memoryScheduler.getStatus();
      expect(status.isRunning).toBe(true);
      memoryScheduler.stop();
    });

    it('should set all tasks to disabled after stop', async () => {
      await memoryScheduler.start();
      memoryScheduler.stop();
      const status = memoryScheduler.getStatus();
      for (const task of status.tasks) {
        expect(task.enabled).toBe(false);
      }
    });

    it('should include focus-topic-research task', async () => {
      await memoryScheduler.start();
      const status = memoryScheduler.getStatus();
      const taskNames = status.tasks.map(t => t.name);
      expect(taskNames).toContain('focus-topic-research');
      memoryScheduler.stop();
    });

    it('should track totalRuns across operations', async () => {
      const statusBefore = memoryScheduler.getStatus();
      const runsBefore = statusBefore.totalRuns;

      await memoryScheduler.runConsolidation();
      await memoryScheduler.runDecay();

      const statusAfter = memoryScheduler.getStatus();
      expect(statusAfter.totalRuns).toBe(runsBefore + 2);
    });
  });

  // -------------------------------------------
  // getConfig details
  // -------------------------------------------

  describe('getConfig details', () => {
    it('should return all config properties', () => {
      const config = memoryScheduler.getConfig();
      expect(config).toHaveProperty('ENABLE_CONSOLIDATION');
      expect(config).toHaveProperty('ENABLE_DECAY');
      expect(config).toHaveProperty('ENABLE_STATS_LOGGING');
      expect(config).toHaveProperty('ENABLE_FOCUS_RESEARCH');
      expect(config).toHaveProperty('STATS_SCHEDULE');
      expect(config).toHaveProperty('FOCUS_RESEARCH_SCHEDULE');
    });

    it('should return a copy (not the original config)', () => {
      const config1 = memoryScheduler.getConfig();
      const config2 = memoryScheduler.getConfig();
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  // -------------------------------------------
  // triggerDecay all contexts
  // -------------------------------------------

  describe('triggerDecay edge cases', () => {
    it('should decay all contexts when none specified', async () => {
      await memoryScheduler.triggerDecay();
      expect(mockEpApplyDecay).toHaveBeenCalledTimes(4);
      expect(mockLtApplyFactDecay).toHaveBeenCalledTimes(4);
    });

    it('should restore original contexts after single-context trigger', async () => {
      await memoryScheduler.triggerDecay('strategy');
      // After trigger, original contexts should be restored
      // Verify by running full consolidation
      await memoryScheduler.runConsolidation();
      expect(mockLtConsolidate).toHaveBeenCalledTimes(4);
    });
  });

  // -------------------------------------------
  // triggerConsolidation edge cases
  // -------------------------------------------

  describe('triggerConsolidation edge cases', () => {
    it('should restore contexts even on error', async () => {
      mockWithLock.mockRejectedValue(new Error('lock error'));

      await expect(memoryScheduler.triggerConsolidation('operations')).rejects.toThrow('lock error');

      // Contexts should be restored - verify by running decay which uses all contexts
      mockWithLock.mockImplementation(async (_key: string, callback: () => Promise<unknown>) => {
        return callback();
      });
      await memoryScheduler.runDecay();
      expect(mockEpApplyDecay).toHaveBeenCalledTimes(4);
    });
  });

  // -------------------------------------------
  // triggerFocusResearch edge cases
  // -------------------------------------------

  describe('triggerFocusResearch edge cases', () => {
    it('should research all contexts when none specified', async () => {
      mockGetAllDomainFocus.mockResolvedValue([]);

      await memoryScheduler.triggerFocusResearch();
      expect(mockGetAllDomainFocus).toHaveBeenCalledTimes(4);
    });

    it('should restore contexts after single-context focus research', async () => {
      mockGetAllDomainFocus.mockResolvedValue([]);

      await memoryScheduler.triggerFocusResearch('finance');
      expect(mockGetAllDomainFocus).toHaveBeenCalledTimes(1);
      expect(mockGetAllDomainFocus).toHaveBeenCalledWith('finance', true);

      // Verify contexts were restored
      jest.clearAllMocks();
      mockGetAllDomainFocus.mockResolvedValue([]);
      await memoryScheduler.runFocusResearch();
      expect(mockGetAllDomainFocus).toHaveBeenCalledTimes(4);
    });
  });
});
