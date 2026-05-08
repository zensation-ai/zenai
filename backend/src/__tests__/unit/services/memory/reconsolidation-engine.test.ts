/**
 * Unit Tests for ReconsolidationEngine
 *
 * PE-gated memory reconsolidation with lability windows (Nader 2000).
 *
 * When a memory is retrieved it enters a labile state. During this window,
 * new information can trigger reconsolidation -- updating or creating new
 * memories based on the Prediction Error (PE) between existing and new content.
 *
 * NE amplifies PE (lowers threshold); Serotonin dampens PE (raises threshold).
 *
 * Part of the Predictive Memory Architecture (PMA).
 */

import {
  ReconsolidationEngine,
  LABILITY_TTL_MS,
  UPDATE_RESISTANCE,
} from '../../../../services/memory/reconsolidation-engine';

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

describe('ReconsolidationEngine', () => {
  let engine: ReconsolidationEngine;

  beforeEach(() => {
    engine = new ReconsolidationEngine();
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // =========================================================
  // Lability Window Management (8 tests)
  // =========================================================

  describe('lability window management', () => {
    it('should open a lability window when markLabile is called', () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'original content');
      expect(engine.isLabile('mem-1')).toBe(true);
    });

    it('should return true for isLabile during window', () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'some content');
      expect(engine.isLabile('mem-1')).toBe(true);
    });

    it('should return false for isLabile after window expires', () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'some content');

      // Simulate time past the TTL (composite key: memoryId:context)
      const windows = (engine as any).labilityWindows as Map<string, any>;
      const entry = windows.get('mem-1:operations');
      entry.expiresAt = Date.now() - 1;

      expect(engine.isLabile('mem-1')).toBe(false);
    });

    it('should support multiple labile memories simultaneously', () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'content 1');
      engine.markLabile('mem-2', 'episodic', 'finance', 'content 2');
      engine.markLabile('mem-3', 'preference', 'people', 'content 3');

      expect(engine.isLabile('mem-1')).toBe(true);
      expect(engine.isLabile('mem-2')).toBe(true);
      expect(engine.isLabile('mem-3')).toBe(true);
    });

    it('should return all labile memories for a given context via getActiveWindows', () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'content 1');
      engine.markLabile('mem-2', 'episodic', 'operations', 'content 2');
      engine.markLabile('mem-3', 'semantic', 'finance', 'content 3');

      const personalWindows = engine.getActiveWindows('operations');
      expect(personalWindows).toHaveLength(2);
      expect(personalWindows.map(w => w.memoryId)).toEqual(
        expect.arrayContaining(['mem-1', 'mem-2']),
      );

      const workWindows = engine.getActiveWindows('finance');
      expect(workWindows).toHaveLength(1);
      expect(workWindows[0].memoryId).toBe('mem-3');
    });

    it('should clean up expired windows', () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'content 1');
      engine.markLabile('mem-2', 'episodic', 'operations', 'content 2');

      // Expire mem-1 (composite key: memoryId:context)
      const windows = (engine as any).labilityWindows as Map<string, any>;
      const entry = windows.get('mem-1:operations');
      entry.expiresAt = Date.now() - 1;

      const cleaned = engine.cleanupExpired();
      expect(cleaned).toBe(1);
      expect(engine.isLabile('mem-1')).toBe(false);
      expect(engine.isLabile('mem-2')).toBe(true);
    });

    it('should extend window when same memory is re-marked', () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'original content');

      const windows = (engine as any).labilityWindows as Map<string, any>;
      const firstExpiry = windows.get('mem-1:operations').expiresAt;

      // Advance slightly and re-mark
      const laterTime = firstExpiry + 1000;
      jest.spyOn(Date, 'now').mockReturnValue(laterTime);
      engine.markLabile('mem-1', 'semantic', 'operations', 'updated content');

      const secondExpiry = windows.get('mem-1:operations').expiresAt;
      expect(secondExpiry).toBeGreaterThan(firstExpiry);

      jest.restoreAllMocks();
    });

    it('should track different contexts independently', () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'personal content');
      engine.markLabile('mem-1', 'semantic', 'finance', 'work content');

      // Both should be tracked (same memoryId, different context key)
      const personalWindows = engine.getActiveWindows('operations');
      const workWindows = engine.getActiveWindows('finance');

      expect(personalWindows).toHaveLength(1);
      expect(workWindows).toHaveLength(1);
    });
  });

  // =========================================================
  // PE Computation (8 tests)
  // =========================================================

  describe('PE computation', () => {
    it('should return 0 for identical content', () => {
      const pe = engine.computePE('the cat sat on the mat', 'the cat sat on the mat');
      expect(pe).toBe(0);
    });

    it('should return high value for contradictory content', () => {
      const pe = engine.computePE(
        'The project deadline is Friday March 15',
        'The project was cancelled and will not proceed at all',
      );
      expect(pe).toBeGreaterThan(0.5);
    });

    it('should add contradiction bonus (+0.2) when contradictionDetected=true', () => {
      const basePE = engine.computePE('some content', 'different content');
      const withContradiction = engine.computePE('some content', 'different content', {
        contradictionDetected: true,
      });
      expect(withContradiction).toBeCloseTo(Math.min(basePE + 0.2, 1.0), 5);
    });

    it('should return PE=1.0 when userCorrected=true', () => {
      const pe = engine.computePE('any content', 'any other content', {
        userCorrected: true,
      });
      expect(pe).toBe(1.0);
    });

    it('should clamp PE to [0, 1]', () => {
      // Even with contradiction bonus, should not exceed 1.0
      const pe = engine.computePE(
        'completely different text',
        'entirely unrelated new information that shares no words whatsoever',
        { contradictionDetected: true },
      );
      expect(pe).toBeGreaterThanOrEqual(0);
      expect(pe).toBeLessThanOrEqual(1);
    });

    it('should modulate effective PE by neuromodulator state', () => {
      const rawPE = 0.5;

      // High NE, low serotonin -> amplified PE
      const highNE = engine.computeEffectivePE(rawPE, {
        norepinephrine: 0.9,
        serotonin: 0.1,
      });

      // Low NE, high serotonin -> dampened PE
      const highSerotonin = engine.computeEffectivePE(rawPE, {
        norepinephrine: 0.1,
        serotonin: 0.9,
      });

      expect(highNE).toBeGreaterThan(highSerotonin);
    });

    it('should apply effectivePE formula: clamp(rawPE * (1 + 0.3*NE - 0.2*5HT), 0, 1)', () => {
      const rawPE = 0.5;
      const ne = 0.8;
      const serotonin = 0.3;

      const expected = Math.max(0, Math.min(1, rawPE * (1 + 0.3 * ne - 0.2 * serotonin)));
      const actual = engine.computeEffectivePE(rawPE, {
        norepinephrine: ne,
        serotonin: serotonin,
      });

      expect(actual).toBeCloseTo(expected, 10);
    });

    it('should amplify PE with high NE and dampen with high serotonin', () => {
      const rawPE = 0.4;

      // Pure NE amplification
      const neBoost = engine.computeEffectivePE(rawPE, {
        norepinephrine: 1.0,
        serotonin: 0.0,
      });
      // 0.4 * (1 + 0.3*1.0 - 0.2*0.0) = 0.4 * 1.3 = 0.52
      expect(neBoost).toBeCloseTo(0.52, 5);

      // Pure serotonin dampening
      const seroDampen = engine.computeEffectivePE(rawPE, {
        norepinephrine: 0.0,
        serotonin: 1.0,
      });
      // 0.4 * (1 + 0.3*0.0 - 0.2*1.0) = 0.4 * 0.8 = 0.32
      expect(seroDampen).toBeCloseTo(0.32, 5);
    });
  });

  // =========================================================
  // Update Mode Selection (6 tests)
  // =========================================================

  describe('update mode selection', () => {
    it('should return confirmed for PE < 0.1', () => {
      expect(engine.selectUpdateMode(0.05)).toBe('confirmed');
      expect(engine.selectUpdateMode(0.0)).toBe('confirmed');
    });

    it('should return selective_edit for 0.1 <= PE < 0.3', () => {
      expect(engine.selectUpdateMode(0.15)).toBe('selective_edit');
      expect(engine.selectUpdateMode(0.25)).toBe('selective_edit');
    });

    it('should return integration for 0.3 <= PE < 0.7', () => {
      expect(engine.selectUpdateMode(0.4)).toBe('integration');
      expect(engine.selectUpdateMode(0.5)).toBe('integration');
      expect(engine.selectUpdateMode(0.65)).toBe('integration');
    });

    it('should return new_episode for PE >= 0.7', () => {
      expect(engine.selectUpdateMode(0.8)).toBe('new_episode');
      expect(engine.selectUpdateMode(0.95)).toBe('new_episode');
      expect(engine.selectUpdateMode(1.0)).toBe('new_episode');
    });

    it('should handle boundary values exactly (0.1, 0.3, 0.7)', () => {
      expect(engine.selectUpdateMode(0.1)).toBe('selective_edit');
      expect(engine.selectUpdateMode(0.3)).toBe('integration');
      expect(engine.selectUpdateMode(0.7)).toBe('new_episode');
    });

    it('should return modes matching reconsolidation_events CHECK constraint', () => {
      const validModes = ['confirmed', 'selective_edit', 'integration', 'new_episode'];
      for (const pe of [0.05, 0.15, 0.5, 0.85]) {
        const mode = engine.selectUpdateMode(pe);
        expect(validModes).toContain(mode);
      }
    });
  });

  // =========================================================
  // Context-Dependent Gating (6 tests)
  // =========================================================

  describe('context-dependent gating', () => {
    it('should allow full reconsolidation for same context + same session', async () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'original', 'session-A');
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'evt-1' }] });

      const result = await engine.reconsolidate(
        'mem-1',
        'slightly modified original',
        'operations',
        'session-A',
      );

      expect(result.blocked).toBeFalsy();
    });

    it('should elevate PE threshold by +0.1 for same context + different session', async () => {
      // Mark labile with session-A, reconsolidate with session-B
      engine.markLabile('mem-1', 'semantic', 'operations', 'the quick brown fox', 'session-A');
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'evt-1' }] });

      const result = await engine.reconsolidate(
        'mem-1',
        'the quick brown fox jumps',
        'operations',
        'session-B',
      );

      expect(result.blocked).toBeFalsy();
      // The session penalty increases the effective threshold
      expect(result.sessionPenalty).toBe(0.1);
    });

    it('should block reconsolidation across different contexts', async () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'original content', 'session-A');

      const result = await engine.reconsolidate(
        'mem-1',
        'new information',
        'finance', // different context
        'session-A',
      );

      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('cross_context');
    });

    it('should recommend new episode in current context for cross-context attempts', async () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'original content', 'session-A');

      const result = await engine.reconsolidate(
        'mem-1',
        'new information',
        'finance',
        'session-A',
      );

      expect(result.blocked).toBe(true);
      expect(result.recommendation).toBe('create_new_episode_in_current_context');
    });

    it('should treat null sessionId as new session', async () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'the quick brown fox', 'session-A');
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'evt-1' }] });

      const result = await engine.reconsolidate(
        'mem-1',
        'the quick brown fox jumps',
        'operations',
        undefined, // null session
      );

      expect(result.blocked).toBeFalsy();
      expect(result.sessionPenalty).toBe(0.1);
    });

    it('should validate context parameter', async () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'content');

      const result = await engine.reconsolidate(
        'mem-1',
        'new info',
        'invalid' as any,
      );

      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('context');
    });
  });

  // =========================================================
  // Implicit/Explicit Differentiation (5 tests)
  // =========================================================

  describe('implicit/explicit differentiation', () => {
    it('should allow semantic facts with single PE event (minPE: 0.0, requiredSignals: 1)', () => {
      const resistance = UPDATE_RESISTANCE.semantic;
      expect(resistance.minPE).toBe(0.0);
      expect(resistance.requiredSignals).toBe(1);
      expect(resistance.windowDays).toBe(0);
    });

    it('should require PE > 0.3 for episodic memories (minPE: 0.3, requiredSignals: 1)', () => {
      const resistance = UPDATE_RESISTANCE.episodic;
      expect(resistance.minPE).toBe(0.3);
      expect(resistance.requiredSignals).toBe(1);
      expect(resistance.windowDays).toBe(0);
    });

    it('should require 3+ consistent signals within 7 days for preferences (minPE: 0.2, requiredSignals: 3)', () => {
      const resistance = UPDATE_RESISTANCE.preference;
      expect(resistance.minPE).toBe(0.2);
      expect(resistance.requiredSignals).toBe(3);
      expect(resistance.windowDays).toBe(7);
    });

    it('should require 5+ consistent signals within 14 days for behavioral patterns (minPE: 0.2, requiredSignals: 5)', () => {
      const resistance = UPDATE_RESISTANCE.behavioral;
      expect(resistance.minPE).toBe(0.2);
      expect(resistance.requiredSignals).toBe(5);
      expect(resistance.windowDays).toBe(14);
    });

    it('should require 3+ successful executions within 30 days for procedural memory (minPE: 0.3, requiredSignals: 3)', () => {
      const resistance = UPDATE_RESISTANCE.procedural;
      expect(resistance.minPE).toBe(0.3);
      expect(resistance.requiredSignals).toBe(3);
      expect(resistance.windowDays).toBe(30);
    });
  });

  // =========================================================
  // Rollback (4 tests)
  // =========================================================

  describe('rollback', () => {
    it('should restore original content from snapshot', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{
            id: 'evt-1',
            memory_id: 'mem-1',
            original_snapshot: JSON.stringify({ content: 'original' }),
            rolled_back: false,
          }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'evt-1' }] }); // update event

      await engine.rollback('evt-1', 'operations');

      // Verify the update query was called
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
      const updateCall = mockQueryContext.mock.calls[1];
      expect(updateCall[0]).toBe('operations');
      expect(updateCall[1]).toContain('rolled_back');
    });

    it('should mark event as rolled_back=true with timestamp', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{
            id: 'evt-1',
            memory_id: 'mem-1',
            original_snapshot: JSON.stringify({ content: 'original' }),
            rolled_back: false,
          }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'evt-1' }] }); // update

      await engine.rollback('evt-1', 'operations');

      const updateCall = mockQueryContext.mock.calls[1];
      expect(updateCall[1]).toContain('rolled_back = true');
      expect(updateCall[1]).toContain('rolled_back_at');
    });

    it('should throw for non-existent event', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await expect(engine.rollback('nonexistent', 'operations')).rejects.toThrow(
        'Reconsolidation event not found',
      );
    });

    it('should be idempotent for double rollback', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [{
          id: 'evt-1',
          memory_id: 'mem-1',
          original_snapshot: JSON.stringify({ content: 'original' }),
          rolled_back: true,
        }],
      });

      // Should not throw; already rolled back
      await expect(engine.rollback('evt-1', 'operations')).resolves.not.toThrow();
    });
  });

  // =========================================================
  // Full Reconsolidate Flow (6 tests)
  // =========================================================

  describe('full reconsolidate flow', () => {
    it('should return result with mode, PE, and eventId', async () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'the capital of France is Berlin', 'sess-1');
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'evt-1' }] });

      const result = await engine.reconsolidate(
        'mem-1',
        'the capital of France is Paris',
        'operations',
        'sess-1',
      );

      expect(result.blocked).toBeFalsy();
      expect(result).toHaveProperty('mode');
      expect(result).toHaveProperty('rawPE');
      expect(result).toHaveProperty('effectivePE');
      expect(result).toHaveProperty('eventId');
      expect(['confirmed', 'selective_edit', 'integration', 'new_episode']).toContain(result.mode);
    });

    it('should store original_snapshot JSONB before update', async () => {
      const originalContent = 'original memory content';
      engine.markLabile('mem-1', 'semantic', 'operations', originalContent, 'sess-1');
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'evt-1' }] });

      await engine.reconsolidate(
        'mem-1',
        'updated memory content',
        'operations',
        'sess-1',
      );

      // Check that the INSERT into reconsolidation_events includes original_snapshot
      const insertCall = mockQueryContext.mock.calls.find(
        (call: unknown[]) => typeof call[1] === 'string' && (call[1] as string).includes('reconsolidation_events'),
      );
      expect(insertCall).toBeDefined();
      // The params should contain the original content as JSON
      const params = insertCall![2] as unknown[];
      const snapshotParam = params.find(
        (p: unknown) => typeof p === 'string' && (p as string).includes(originalContent),
      );
      expect(snapshotParam).toBeDefined();
    });

    it('should store neuromodulator_snapshot at time of reconsolidation', async () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'original', 'sess-1');
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'evt-1' }] });

      const neuroState = { norepinephrine: 0.8, serotonin: 0.3 };
      await engine.reconsolidate(
        'mem-1',
        'new information',
        'operations',
        'sess-1',
        neuroState,
      );

      const insertCall = mockQueryContext.mock.calls.find(
        (call: unknown[]) => typeof call[1] === 'string' && (call[1] as string).includes('reconsolidation_events'),
      );
      expect(insertCall).toBeDefined();
      const params = insertCall![2] as unknown[];
      // Should contain neuromodulator snapshot as JSON
      const neuroParam = params.find(
        (p: unknown) => typeof p === 'string' && (p as string).includes('norepinephrine'),
      );
      expect(neuroParam).toBeDefined();
    });

    it('should skip non-labile memory', async () => {
      // Do NOT mark labile
      const result = await engine.reconsolidate(
        'mem-1',
        'new information',
        'operations',
        'sess-1',
      );

      expect(result.skipped).toBe(true);
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('should return as-is when engine is disabled', async () => {
      engine.setEnabled(false);
      engine.markLabile('mem-1', 'semantic', 'operations', 'original', 'sess-1');

      const result = await engine.reconsolidate(
        'mem-1',
        'new information',
        'operations',
        'sess-1',
      );

      expect(result.skipped).toBe(true);
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('should log reconsolidation event to reconsolidation_events table', async () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'original content', 'sess-1');
      mockQueryContext.mockResolvedValue({ rows: [{ id: 'evt-1' }] });

      await engine.reconsolidate(
        'mem-1',
        'brand new different content entirely',
        'operations',
        'sess-1',
      );

      const insertCall = mockQueryContext.mock.calls.find(
        (call: unknown[]) =>
          typeof call[1] === 'string' &&
          (call[1] as string).includes('INSERT') &&
          (call[1] as string).includes('reconsolidation_events'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![0]).toBe('operations');
    });
  });

  // =========================================================
  // Persistence / History (5 tests)
  // =========================================================

  describe('persistence', () => {
    it('should return recent events with pagination via getHistory', async () => {
      const mockEvents = [
        { id: 'evt-1', memory_id: 'mem-1', mode: 'integration', raw_pe: 0.5, effective_pe: 0.55, created_at: new Date() },
        { id: 'evt-2', memory_id: 'mem-2', mode: 'confirmed', raw_pe: 0.05, effective_pe: 0.05, created_at: new Date() },
      ];
      mockQueryContext.mockResolvedValueOnce({ rows: mockEvents });

      const history = await engine.getHistory('operations', 10);

      expect(history).toHaveLength(2);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('reconsolidation_events'),
        expect.arrayContaining([10]),
      );
    });

    it('should return currently labile memories via getActiveWindows', () => {
      engine.markLabile('mem-1', 'semantic', 'operations', 'content 1');
      engine.markLabile('mem-2', 'episodic', 'operations', 'content 2');

      const windows = engine.getActiveWindows('operations');

      expect(windows).toHaveLength(2);
      expect(windows[0]).toHaveProperty('memoryId');
      expect(windows[0]).toHaveProperty('memoryType');
      expect(windows[0]).toHaveProperty('context');
      expect(windows[0]).toHaveProperty('expiresAt');
    });

    it('should include all required fields in events', async () => {
      const mockEvent = {
        id: 'evt-1',
        memory_id: 'mem-1',
        memory_type: 'semantic',
        mode: 'integration',
        raw_pe: 0.5,
        effective_pe: 0.55,
        original_snapshot: '{}',
        neuromodulator_snapshot: '{}',
        rolled_back: false,
        created_at: new Date(),
      };
      mockQueryContext.mockResolvedValueOnce({ rows: [mockEvent] });

      const history = await engine.getHistory('operations');

      expect(history[0]).toHaveProperty('id');
      expect(history[0]).toHaveProperty('memoryId');
      expect(history[0]).toHaveProperty('mode');
      expect(history[0]).toHaveProperty('rawPE');
      expect(history[0]).toHaveProperty('effectivePE');
    });

    it('should query the correct context schema', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await engine.getHistory('finance', 5);

      expect(mockQueryContext).toHaveBeenCalledWith(
        'finance',
        expect.any(String),
        expect.any(Array),
      );
    });

    it('should default limit to 50 when not specified', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await engine.getHistory('operations');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'operations',
        expect.any(String),
        [50],
      );
    });
  });

  // =========================================================
  // Constants & Config (2 tests)
  // =========================================================

  describe('constants', () => {
    it('should export LABILITY_TTL_MS as 10 minutes', () => {
      expect(LABILITY_TTL_MS).toBe(10 * 60 * 1000);
    });

    it('should export UPDATE_RESISTANCE with all 5 memory types', () => {
      expect(Object.keys(UPDATE_RESISTANCE)).toEqual(
        expect.arrayContaining(['semantic', 'episodic', 'preference', 'behavioral', 'procedural']),
      );
    });
  });

  // =========================================================
  // Edge Cases (2 tests)
  // =========================================================

  describe('edge cases', () => {
    it('should return false for isLabile on unknown memory', () => {
      expect(engine.isLabile('nonexistent')).toBe(false);
    });

    it('should handle empty getActiveWindows for context with no labile memories', () => {
      const windows = engine.getActiveWindows('strategy');
      expect(windows).toHaveLength(0);
    });
  });
});
