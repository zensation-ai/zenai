/**
 * Unit Tests for TripleCopyMemory
 *
 * Basel 2024 (Science): Every memory event creates 3 copies with divergent
 * strength dynamics:
 *   - FastCopy   (Redis-like, τ=4h exponential decay) — immediate vivid access
 *   - MediumCopy (DB episodic, τ=14d exponential decay) — session-accessible
 *   - DeepCopy   (LTM/KG, τ=7d logarithmic growth) — permanent essence
 *
 * MediumCopy is created synchronously at store time (NOT deferred to
 * sleep-compute) to prevent data loss if sleep doesn't run within
 * FastCopy's 24h TTL.
 *
 * Part of the Predictive Memory Architecture (PMA).
 */

import {
  TripleCopyMemory,
  TAU_FAST,
  TAU_MEDIUM,
  TAU_DEEP,
  RETRIEVAL_THRESHOLD,
  MemoryCopy,
} from '../../../../services/memory/triple-copy-memory';

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { queryContext } = require('../../../../utils/database-context');
const mockQueryContext = queryContext as jest.Mock;

describe('TripleCopyMemory', () => {
  let tcm: TripleCopyMemory;

  beforeEach(() => {
    tcm = new TripleCopyMemory();
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // =========================================================
  // Store event (5 tests)
  // =========================================================

  describe('store event', () => {
    it('should create a memory_event_id (UUID)', async () => {
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'fast-1' }] });

      const result = await tcm.storeEvent('meeting notes', 'operations', 'user-1');

      expect(result.memoryEventId).toBeDefined();
      expect(result.memoryEventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should create FastCopy entry in memory_copies', async () => {
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'copy-1' }] });

      await tcm.storeEvent('meeting notes', 'operations', 'user-1');

      const firstCall = mockQueryContext.mock.calls[0];
      expect(firstCall[0]).toBe('operations');
      const sql: string = firstCall[1];
      expect(sql).toContain('INSERT INTO memory_copies');
      expect(firstCall[2]).toEqual(
        expect.arrayContaining([expect.stringContaining('fast')]),
      );
    });

    it('should create MediumCopy entry in memory_copies', async () => {
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'copy-2' }] });

      await tcm.storeEvent('meeting notes', 'operations', 'user-1');

      // Second INSERT call is MediumCopy
      const secondCall = mockQueryContext.mock.calls[1];
      expect(secondCall[0]).toBe('operations');
      const sql: string = secondCall[1];
      expect(sql).toContain('INSERT INTO memory_copies');
      expect(secondCall[2]).toEqual(
        expect.arrayContaining([expect.stringContaining('medium')]),
      );
    });

    it('should track both copies with correct copy_type', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ id: 'fast-id' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'medium-id' }] });

      const result = await tcm.storeEvent('meeting notes', 'operations', 'user-1');

      expect(result.fastCopyId).toBe('fast-id');
      expect(result.mediumCopyId).toBe('medium-id');
    });

    it('should store user_id and context correctly', async () => {
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'copy-x' }] });

      await tcm.storeEvent('project plan', 'finance', 'user-42');

      for (const call of mockQueryContext.mock.calls) {
        expect(call[0]).toBe('finance');
        expect(call[2]).toEqual(expect.arrayContaining(['user-42']));
      }
    });
  });

  // =========================================================
  // Strength dynamics (6 tests)
  // =========================================================

  describe('strength dynamics', () => {
    it('FastCopy strength: S0 * exp(-t / TAU_FAST) — decays quickly', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600 * 1000);
      const strength = tcm.computeStrength('fast', oneHourAgo, 1.0, now);
      const expected = Math.exp(-3600_000 / TAU_FAST);
      expect(strength).toBeCloseTo(expected, 5);
    });

    it('MediumCopy strength: S0 * exp(-t / TAU_MEDIUM) — decays slowly', () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
      const strength = tcm.computeStrength('medium', oneDayAgo, 0.8, now);
      const expected = 0.8 * Math.exp(-(24 * 3600_000) / TAU_MEDIUM);
      expect(strength).toBeCloseTo(expected, 5);
    });

    it('DeepCopy strength: Smax * (1 - exp(-t / TAU_DEEP)) — grows', () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
      const strength = tcm.computeStrength('deep', threeDaysAgo, 1.0, now);
      const expected = 1.0 * (1 - Math.exp(-(3 * 24 * 3600_000) / TAU_DEEP));
      expect(strength).toBeCloseTo(expected, 5);
    });

    it('FastCopy at t=4h should be ~37% of initial (1/e)', () => {
      const now = new Date();
      const fourHoursAgo = new Date(now.getTime() - TAU_FAST);
      const strength = tcm.computeStrength('fast', fourHoursAgo, 1.0, now);
      // At t = τ, exp(-1) ≈ 0.3679
      expect(strength).toBeCloseTo(1 / Math.E, 3);
    });

    it('MediumCopy at t=14d should be ~37% of initial (1/e)', () => {
      const now = new Date();
      const fourteenDaysAgo = new Date(now.getTime() - TAU_MEDIUM);
      const strength = tcm.computeStrength('medium', fourteenDaysAgo, 1.0, now);
      expect(strength).toBeCloseTo(1 / Math.E, 3);
    });

    it('DeepCopy at t=7d should be ~63% of max (1 - 1/e)', () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - TAU_DEEP);
      const strength = tcm.computeStrength('deep', sevenDaysAgo, 1.0, now);
      expect(strength).toBeCloseTo(1 - 1 / Math.E, 3);
    });
  });

  // =========================================================
  // Retrieval cascade (5 tests)
  // =========================================================

  describe('retrieval cascade', () => {
    const eventId = 'evt-1';

    function buildCopyRow(
      copyType: string,
      createdAt: Date,
      strength: number,
    ): Record<string, unknown> {
      return {
        id: `${copyType}-id`,
        memory_event_id: eventId,
        copy_type: copyType,
        storage_ref: `${copyType}:${eventId}`,
        strength,
        created_at: createdAt,
        last_accessed: null,
      };
    }

    it('should retrieve FastCopy first if strength > threshold', async () => {
      const now = new Date();
      // FastCopy created just now => strength ≈ 1.0
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [
            buildCopyRow('fast', now, 1.0),
            buildCopyRow('medium', now, 0.8),
          ],
        })
        .mockResolvedValue({ rows: [] }); // update last_accessed

      const result = await tcm.retrieve(eventId, 'operations');

      expect(result).not.toBeNull();
      expect(result!.copy.copyType).toBe('fast');
      expect(result!.suddenRecall).toBe(false);
    });

    it('should fall to MediumCopy if FastCopy below threshold', async () => {
      const now = new Date();
      const longAgo = new Date(now.getTime() - 24 * 3600 * 1000); // 24h ago => fast ≈ 0
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [
            buildCopyRow('fast', longAgo, 1.0),
            buildCopyRow('medium', now, 0.8),
          ],
        })
        .mockResolvedValue({ rows: [] });

      const result = await tcm.retrieve(eventId, 'operations');

      expect(result).not.toBeNull();
      expect(result!.copy.copyType).toBe('medium');
    });

    it('should fall to DeepCopy if MediumCopy below threshold', async () => {
      const now = new Date();
      const veryOld = new Date(now.getTime() - 60 * 24 * 3600 * 1000); // 60 days ago
      const deepCreated = new Date(now.getTime() - 14 * 24 * 3600 * 1000); // 14 days ago
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [
            buildCopyRow('fast', veryOld, 1.0),
            buildCopyRow('medium', veryOld, 0.8),
            buildCopyRow('deep', deepCreated, 1.0),
          ],
        })
        .mockResolvedValue({ rows: [] });

      const result = await tcm.retrieve(eventId, 'operations');

      expect(result).not.toBeNull();
      expect(result!.copy.copyType).toBe('deep');
    });

    it('should return null if all copies below threshold', async () => {
      const now = new Date();
      const veryOld = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
      // Deep copy also created very recently => low growth
      const recentDeep = new Date(now.getTime() - 60 * 1000); // 1 min ago
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          buildCopyRow('fast', veryOld, 1.0),
          buildCopyRow('medium', veryOld, 0.8),
          buildCopyRow('deep', recentDeep, 1.0), // very recent => ~0
        ],
      });

      const result = await tcm.retrieve(eventId, 'operations');

      expect(result).toBeNull();
    });

    it('should return correct copy type in result', async () => {
      const now = new Date();
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [buildCopyRow('medium', now, 0.8)],
        })
        .mockResolvedValue({ rows: [] });

      const result = await tcm.retrieve(eventId, 'operations');

      expect(result).not.toBeNull();
      expect(result!.copy).toEqual(
        expect.objectContaining({
          copyType: 'medium',
          memoryEventId: eventId,
        }),
      );
    });
  });

  // =========================================================
  // "Sudden recall" detection (3 tests)
  // =========================================================

  describe('sudden recall detection', () => {
    const eventId = 'evt-sr';

    function buildCopyRow(
      copyType: string,
      createdAt: Date,
      strength: number,
    ): Record<string, unknown> {
      return {
        id: `${copyType}-id`,
        memory_event_id: eventId,
        copy_type: copyType,
        storage_ref: `${copyType}:${eventId}`,
        strength,
        created_at: createdAt,
        last_accessed: null,
      };
    }

    it('should detect sudden recall when Fast+Medium below 0.3 but Deep above 0.3', async () => {
      const now = new Date();
      const veryOld = new Date(now.getTime() - 60 * 24 * 3600 * 1000);
      const deepCreated = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [
            buildCopyRow('fast', veryOld, 1.0),
            buildCopyRow('medium', veryOld, 0.8),
            buildCopyRow('deep', deepCreated, 1.0),
          ],
        })
        .mockResolvedValue({ rows: [] });

      const result = await tcm.retrieve(eventId, 'operations');

      expect(result).not.toBeNull();
      expect(result!.suddenRecall).toBe(true);
      expect(result!.copy.copyType).toBe('deep');
    });

    it('should return suddenRecall=true in result metadata', async () => {
      const now = new Date();
      const veryOld = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
      const deepCreated = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [
            buildCopyRow('fast', veryOld, 1.0),
            buildCopyRow('medium', veryOld, 0.8),
            buildCopyRow('deep', deepCreated, 1.0),
          ],
        })
        .mockResolvedValue({ rows: [] });

      const result = await tcm.retrieve(eventId, 'operations');

      expect(result).toHaveProperty('suddenRecall', true);
    });

    it('should NOT trigger sudden recall when Fast or Medium is strong', async () => {
      const now = new Date();
      const recent = new Date(now.getTime() - 60 * 1000); // 1 min ago
      const deepCreated = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [
            buildCopyRow('fast', recent, 1.0),   // strength ≈ 1.0
            buildCopyRow('medium', recent, 0.8),  // strength ≈ 0.8
            buildCopyRow('deep', deepCreated, 1.0),
          ],
        })
        .mockResolvedValue({ rows: [] });

      const result = await tcm.retrieve(eventId, 'operations');

      expect(result).not.toBeNull();
      expect(result!.suddenRecall).toBe(false);
    });
  });

  // =========================================================
  // Copy promotion (4 tests)
  // =========================================================

  describe('copy promotion', () => {
    it('should create DeepCopy entry via promoteToDeep', async () => {
      // First call: check MediumCopy exists
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{ id: 'med-id', copy_type: 'medium', memory_event_id: 'evt-p' }],
        })
        // Second call: INSERT deep copy
        .mockResolvedValueOnce({ rows: [{ id: 'deep-id' }] });

      const deepId = await tcm.promoteToDeep('evt-p', 'distilled essence', 'operations');

      expect(deepId).toBe('deep-id');
    });

    it('should store distilled content in promoteToDeep', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{ id: 'med-id', copy_type: 'medium', memory_event_id: 'evt-p2' }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'deep-id-2' }] });

      await tcm.promoteToDeep('evt-p2', 'the core insight', 'finance');

      const insertCall = mockQueryContext.mock.calls[1];
      expect(insertCall[2]).toEqual(expect.arrayContaining(['the core insight']));
    });

    it('should set copy_type to deep in promoteToDeep', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{ id: 'med-id', copy_type: 'medium', memory_event_id: 'evt-p3' }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'deep-id-3' }] });

      await tcm.promoteToDeep('evt-p3', 'compressed info', 'people');

      const insertCall = mockQueryContext.mock.calls[1];
      expect(insertCall[2]).toEqual(expect.arrayContaining(['deep']));
    });

    it('should only promote if MediumCopy exists', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] }); // no MediumCopy

      await expect(
        tcm.promoteToDeep('evt-no-med', 'some content', 'operations'),
      ).rejects.toThrow(/no medium copy/i);
    });
  });

  // =========================================================
  // Copy tracking (4 tests)
  // =========================================================

  describe('copy tracking', () => {
    it('should return all copies for event via getCopies', async () => {
      const now = new Date();
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            id: 'f-1',
            memory_event_id: 'evt-t',
            copy_type: 'fast',
            storage_ref: 'fast:evt-t',
            strength: 1.0,
            created_at: now,
            last_accessed: null,
          },
          {
            id: 'm-1',
            memory_event_id: 'evt-t',
            copy_type: 'medium',
            storage_ref: 'medium:evt-t',
            strength: 0.8,
            created_at: now,
            last_accessed: null,
          },
        ],
      });

      const copies = await tcm.getCopies('evt-t', 'operations');

      expect(copies).toHaveLength(2);
    });

    it('each copy should have correct fields (id, copyType, strength, createdAt)', async () => {
      const now = new Date();
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            id: 'c-1',
            memory_event_id: 'evt-f',
            copy_type: 'fast',
            storage_ref: 'fast:evt-f',
            strength: 0.9,
            created_at: now,
            last_accessed: null,
          },
        ],
      });

      const copies = await tcm.getCopies('evt-f', 'finance');

      expect(copies[0]).toEqual(
        expect.objectContaining({
          id: 'c-1',
          copyType: 'fast',
          strength: 0.9,
          createdAt: now,
        }),
      );
    });

    it('should return sudden recall events via getRediscoveries', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { memory_event_id: 'evt-r1', detected_at: new Date(), deep_strength: 0.6 },
          { memory_event_id: 'evt-r2', detected_at: new Date(), deep_strength: 0.5 },
        ],
      });

      const rediscoveries = await tcm.getRediscoveries('operations', 'user-1', 10);

      expect(rediscoveries).toHaveLength(2);
      expect(rediscoveries[0]).toHaveProperty('memory_event_id', 'evt-r1');
    });

    it('should update last_accessed on retrieval', async () => {
      const now = new Date();
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'fast-la',
              memory_event_id: 'evt-la',
              copy_type: 'fast',
              storage_ref: 'fast:evt-la',
              strength: 1.0,
              created_at: now,
              last_accessed: null,
            },
          ],
        })
        .mockResolvedValue({ rows: [] }); // update call

      await tcm.retrieve('evt-la', 'operations');

      // The second DB call should be the UPDATE for last_accessed
      const updateCall = mockQueryContext.mock.calls[1];
      expect(updateCall[1]).toContain('UPDATE memory_copies');
      expect(updateCall[1]).toContain('last_accessed');
    });
  });

  // =========================================================
  // Ablation (2 tests)
  // =========================================================

  describe('ablation', () => {
    it('disabled: storeEvent still works but skips FastCopy', async () => {
      tcm.setEnabled(false);
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'med-only' }] });

      const result = await tcm.storeEvent('ablation test', 'operations', 'user-1');

      expect(result.memoryEventId).toBeDefined();
      // Only one INSERT (MediumCopy), no FastCopy
      expect(mockQueryContext).toHaveBeenCalledTimes(1);
      const sql: string = mockQueryContext.mock.calls[0][1];
      expect(sql).toContain('INSERT');
      expect(mockQueryContext.mock.calls[0][2]).toEqual(
        expect.arrayContaining([expect.stringContaining('medium')]),
      );
    });

    it('disabled: retrieve only checks MediumCopy', async () => {
      tcm.setEnabled(false);
      const now = new Date();
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'f-abl',
              memory_event_id: 'evt-abl',
              copy_type: 'fast',
              storage_ref: 'fast:evt-abl',
              strength: 1.0,
              created_at: now,
              last_accessed: null,
            },
            {
              id: 'm-abl',
              memory_event_id: 'evt-abl',
              copy_type: 'medium',
              storage_ref: 'medium:evt-abl',
              strength: 0.8,
              created_at: now,
              last_accessed: null,
            },
          ],
        })
        .mockResolvedValue({ rows: [] });

      const result = await tcm.retrieve('evt-abl', 'operations');

      expect(result).not.toBeNull();
      // When disabled, fast copies are skipped — medium is returned
      expect(result!.copy.copyType).toBe('medium');
    });
  });

  // =========================================================
  // Edge cases (6 tests)
  // =========================================================

  describe('edge cases', () => {
    it('store with importance affects initial strength', async () => {
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'imp-1' }] });

      await tcm.storeEvent('important memory', 'operations', 'user-1', 0.5);

      // FastCopy strength should be 0.5 (importance)
      const fastParams = mockQueryContext.mock.calls[0][2];
      expect(fastParams).toEqual(expect.arrayContaining([0.5]));

      // MediumCopy strength should be 0.5 * 0.8 = 0.4
      const medParams = mockQueryContext.mock.calls[1][2];
      expect(medParams).toEqual(expect.arrayContaining([0.4]));
    });

    it('retrieve non-existent event returns null', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await tcm.retrieve('nonexistent', 'operations');

      expect(result).toBeNull();
    });

    it('multiple events tracked independently', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ id: 'f-a' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'm-a' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'f-b' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'm-b' }] });

      const r1 = await tcm.storeEvent('event A', 'operations', 'user-1');
      const r2 = await tcm.storeEvent('event B', 'operations', 'user-1');

      expect(r1.memoryEventId).not.toBe(r2.memoryEventId);
      expect(r1.fastCopyId).not.toBe(r2.fastCopyId);
      expect(r1.mediumCopyId).not.toBe(r2.mediumCopyId);
    });

    it('context isolation between users', async () => {
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'iso-1' }] });

      await tcm.storeEvent('user A data', 'operations', 'user-A');
      await tcm.storeEvent('user B data', 'finance', 'user-B');

      // First event: both calls use 'operations' context
      expect(mockQueryContext.mock.calls[0][0]).toBe('operations');
      expect(mockQueryContext.mock.calls[1][0]).toBe('operations');
      // Second event: both calls use 'finance' context
      expect(mockQueryContext.mock.calls[2][0]).toBe('finance');
      expect(mockQueryContext.mock.calls[3][0]).toBe('finance');

      // User IDs passed correctly
      expect(mockQueryContext.mock.calls[0][2]).toEqual(expect.arrayContaining(['user-A']));
      expect(mockQueryContext.mock.calls[2][2]).toEqual(expect.arrayContaining(['user-B']));
    });

    it('computeStrength returns 0 for negative time deltas', () => {
      const now = new Date();
      const future = new Date(now.getTime() + 60_000);
      // Created in the future relative to now => delta is negative
      expect(tcm.computeStrength('fast', future, 1.0, now)).toBe(0);
    });

    it('computeStrength clamps to [0, 1] range', () => {
      const now = new Date();
      // DeepCopy with very high initial strength
      const longAgo = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
      const strength = tcm.computeStrength('deep', longAgo, 2.0, now);
      expect(strength).toBeLessThanOrEqual(1.0);
      expect(strength).toBeGreaterThanOrEqual(0);
    });
  });
});
