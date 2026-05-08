/**
 * Unit Tests for NeuromodulatorEngine
 *
 * 4-channel neuromodulatory system simulating global memory modulation:
 *   Dopamine (VTA)         — exploration/novelty bias
 *   Norepinephrine (LC)    — learning rate
 *   Serotonin (Raphe)      — consolidation patience
 *   Acetylcholine (BF)     — attention/new-info ratio
 *
 * Opposition dynamics per Stanford 2024 monoamine balance model.
 */

import {
  NeuromodulatorEngine,
  NeuromodulatorState,
  ModulationParams,
  EventType,
  HALF_LIFE_MS,
  TONIC_DECAY,
  TONIC_SIGNAL,
  OPPOSITION_COEFFICIENT,
} from '../../../../services/memory/neuromodulator-engine';

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

describe('NeuromodulatorEngine', () => {
  let engine: NeuromodulatorEngine;

  beforeEach(() => {
    engine = new NeuromodulatorEngine();
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // =========================================================
  // Constants
  // =========================================================

  describe('constants', () => {
    it('should export correct half-life of 5 minutes', () => {
      expect(HALF_LIFE_MS).toBe(5 * 60 * 1000);
    });

    it('should export correct tonic parameters', () => {
      expect(TONIC_DECAY).toBe(0.95);
      expect(TONIC_SIGNAL).toBe(0.05);
    });

    it('should export opposition coefficient of -0.3', () => {
      expect(OPPOSITION_COEFFICIENT).toBe(-0.3);
    });
  });

  // =========================================================
  // Initialization
  // =========================================================

  describe('initialization', () => {
    it('should initialize all 4 channels at 0.5 baseline', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const state = await engine.getState('user-1', 'operations');

      expect(state.dopamine).toBe(0.5);
      expect(state.norepinephrine).toBe(0.5);
      expect(state.serotonin).toBe(0.5);
      expect(state.acetylcholine).toBe(0.5);
    });

    it('should load persisted tonic levels from DB when available', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          dopamine: 0.7,
          norepinephrine: 0.3,
          serotonin: 0.8,
          acetylcholine: 0.6,
          updated_at: new Date('2026-04-05T10:00:00Z'),
        }],
      });

      const state = await engine.getState('user-1', 'operations');

      expect(state.dopamine).toBe(0.7);
      expect(state.norepinephrine).toBe(0.3);
      expect(state.serotonin).toBe(0.8);
      expect(state.acetylcholine).toBe(0.6);
    });
  });

  // =========================================================
  // Channel Updates — Event Emissions
  // =========================================================

  describe('channel updates', () => {
    it('should increase dopamine on novelty event', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('novelty', {
        magnitude: 0.4,
        userId: 'user-1',
        context: 'operations',
      });

      const phasic = await engine.getCurrentPhasicState('user-1', 'operations');
      expect(phasic.dopamine).toBeGreaterThan(0.5);
    });

    it('should increase norepinephrine on prediction error', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('prediction_error', {
        magnitude: 0.6,
        userId: 'user-1',
        context: 'finance',
      });

      const phasic = await engine.getCurrentPhasicState('user-1', 'finance');
      expect(phasic.norepinephrine).toBeGreaterThan(0.5);
    });

    it('should increase serotonin on stable focus', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('stable_focus', {
        magnitude: 0.5,
        userId: 'user-1',
        context: 'people',
      });

      const phasic = await engine.getCurrentPhasicState('user-1', 'people');
      expect(phasic.serotonin).toBeGreaterThan(0.5);
    });

    it('should increase acetylcholine on exploration', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('exploration', {
        magnitude: 0.3,
        userId: 'user-1',
        context: 'strategy',
      });

      const phasic = await engine.getCurrentPhasicState('user-1', 'strategy');
      expect(phasic.acetylcholine).toBeGreaterThan(0.5);
    });
  });

  // =========================================================
  // Opposition Dynamics — Stanford 2024
  // =========================================================

  describe('opposition dynamics', () => {
    it('should dip serotonin when dopamine spikes (DA->5HT opposition)', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('novelty', {
        magnitude: 0.8,
        userId: 'user-1',
        context: 'operations',
      });

      const phasic = await engine.getCurrentPhasicState('user-1', 'operations');
      // novelty: DA += 0.8, 5HT += -0.3 * 0.8 = -0.24
      expect(phasic.serotonin).toBeLessThan(0.5);
    });

    it('should dampen dopamine when serotonin is high (5HT->DA opposition)', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('stable_focus', {
        magnitude: 0.8,
        userId: 'user-1',
        context: 'operations',
      });

      const phasic = await engine.getCurrentPhasicState('user-1', 'operations');
      // stable_focus: 5HT += 0.8, DA += -0.3 * 0.8 = -0.24
      expect(phasic.dopamine).toBeLessThan(0.5);
    });

    it('should use coupling coefficient of -0.3', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('novelty', {
        magnitude: 1.0,
        userId: 'user-1',
        context: 'operations',
      });

      const phasic = await engine.getCurrentPhasicState('user-1', 'operations');
      // DA phasic = 1.0, 5HT phasic = -0.3 * 1.0 = -0.3
      // effective DA = tonic + 1.0 * decay -> clamped to 1.0
      // effective 5HT = tonic + (-0.3) * decay -> below 0.5
      expect(phasic.dopamine).toBeCloseTo(1.0, 1); // clamped at 1.0
      expect(phasic.serotonin).toBeCloseTo(0.5 + (-0.3), 1); // ~0.2
    });
  });

  // =========================================================
  // Temporal Dynamics
  // =========================================================

  describe('temporal dynamics', () => {
    it('should decay phasic component with 5-minute half-life', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      // Use small magnitude to avoid clamping at 1.0
      await engine.emitEvent('prediction_error', {
        magnitude: 0.3,
        userId: 'user-1',
        context: 'operations',
      });

      // Get state immediately — phasic decay factor = 1.0
      const immediate = await engine.getCurrentPhasicState('user-1', 'operations');
      // NE tonic ~0.5, phasic = 0.3, effective ~0.8 (no clamp)

      // Advance 5 minutes (one half-life) — phasic decay factor = 0.5
      engine.advanceTime('user-1', 'operations', HALF_LIFE_MS);
      const afterHalfLife = await engine.getCurrentPhasicState('user-1', 'operations');

      // The effective level should drop as phasic contribution halves
      expect(afterHalfLife.norepinephrine).toBeLessThan(immediate.norepinephrine);

      // Verify the phasic portion (above tonic) roughly halves.
      // Tonic is slightly above 0.5 due to tonic update, but phasic drop should
      // be approximately half the initial phasic contribution (~0.15 of 0.3).
      const drop = immediate.norepinephrine - afterHalfLife.norepinephrine;
      expect(drop).toBeGreaterThan(0.1);
      expect(drop).toBeLessThan(0.25);
    });

    it('should decay tonic toward 0.5 homeostasis: tonic_new = current * 0.95', () => {
      // Direct computation test
      expect(engine.computeTonicDecay(0.8)).toBeCloseTo(0.8 * 0.95, 10);
      expect(engine.computeTonicDecay(0.3)).toBeCloseTo(0.3 * 0.95, 10);
      expect(engine.computeTonicDecay(0.5)).toBeCloseTo(0.5 * 0.95, 10);
    });

    it('should update tonic on event signal: tonic_new = current * 0.95 + signal * 0.05', () => {
      expect(engine.computeTonicUpdate(0.5, 0.8)).toBeCloseTo(0.5 * 0.95 + 0.8 * 0.05, 10);
      expect(engine.computeTonicUpdate(0.7, 1.0)).toBeCloseTo(0.7 * 0.95 + 1.0 * 0.05, 10);
      expect(engine.computeTonicUpdate(0.3, 0.0)).toBeCloseTo(0.3 * 0.95 + 0.0 * 0.05, 10);
    });
  });

  // =========================================================
  // Clamping
  // =========================================================

  describe('clamping', () => {
    it('should clamp effective level to [0, 1]', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      // Fire massive novelty to push DA > 1
      await engine.emitEvent('novelty', {
        magnitude: 2.0,
        userId: 'user-1',
        context: 'operations',
      });

      const phasic = await engine.getCurrentPhasicState('user-1', 'operations');
      expect(phasic.dopamine).toBeLessThanOrEqual(1.0);
      expect(phasic.dopamine).toBeGreaterThanOrEqual(0.0);
      // Serotonin should be pushed negative by opposition but clamped to 0
      expect(phasic.serotonin).toBeGreaterThanOrEqual(0.0);
      expect(phasic.serotonin).toBeLessThanOrEqual(1.0);
    });
  });

  // =========================================================
  // Persistence
  // =========================================================

  describe('persistence', () => {
    it('should persist tonic levels to database via INSERT ON CONFLICT UPDATE', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] }) // getState
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // persist upsert

      await engine.emitEvent('novelty', {
        magnitude: 0.5,
        userId: 'user-1',
        context: 'operations',
      });

      await engine.persistState('user-1', 'operations');

      // Find the persist call (should be an INSERT ... ON CONFLICT)
      const persistCall = mockQueryContext.mock.calls.find(
        (call: unknown[]) => typeof call[1] === 'string' && (call[1] as string).includes('ON CONFLICT'),
      );
      expect(persistCall).toBeDefined();
      expect(persistCall![0]).toBe('operations');
      expect(persistCall![1]).toContain('neuromodulator_state');
      expect(persistCall![1]).toContain('INSERT');
      expect(persistCall![1]).toContain('ON CONFLICT');
    });
  });

  // =========================================================
  // getModulationParams
  // =========================================================

  describe('getModulationParams', () => {
    it('should return learningRate, explorationBias, consolidationPatience, attentionRatio', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      const params = await engine.getModulationParams('user-1', 'operations');

      expect(params).toHaveProperty('learningRate');
      expect(params).toHaveProperty('explorationBias');
      expect(params).toHaveProperty('consolidationPatience');
      expect(params).toHaveProperty('attentionRatio');
      expect(typeof params.learningRate).toBe('number');
      expect(typeof params.explorationBias).toBe('number');
      expect(typeof params.consolidationPatience).toBe('number');
      expect(typeof params.attentionRatio).toBe('number');
    });

    it('should modulate learningRate based on NE level', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      // Baseline params
      const baseline = await engine.getModulationParams('user-1', 'operations');

      // Fire prediction_error to boost NE
      await engine.emitEvent('prediction_error', {
        magnitude: 0.8,
        userId: 'user-2',
        context: 'operations',
      });
      const boosted = await engine.getModulationParams('user-2', 'operations');

      expect(boosted.learningRate).toBeGreaterThan(baseline.learningRate);
    });
  });

  // =========================================================
  // Ablation Flag
  // =========================================================

  describe('ablation flag', () => {
    it('should return baseline 0.5 values for all params when disabled', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      engine.setEnabled(false);

      const params = await engine.getModulationParams('user-1', 'operations');

      expect(params.learningRate).toBe(0.5);
      expect(params.explorationBias).toBe(0.5);
      expect(params.consolidationPatience).toBe(0.5);
      expect(params.attentionRatio).toBe(0.5);

      // Re-enable for other tests
      engine.setEnabled(true);
    });
  });

  // =========================================================
  // All 8 Event Types
  // =========================================================

  describe('all event types', () => {
    const eventTypes: EventType[] = [
      'novelty', 'prediction_error', 'stable_focus', 'exploration',
      'routine', 'confirmation', 'rejection', 'context_switch',
    ];

    it.each(eventTypes)('should process %s event without error', async (eventType) => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await expect(
        engine.emitEvent(eventType, {
          magnitude: 0.5,
          userId: 'user-1',
          context: 'operations',
        }),
      ).resolves.not.toThrow();
    });

    it('should handle routine event: decrease DA, increase 5HT', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('routine', {
        magnitude: 1.0,
        userId: 'user-1',
        context: 'operations',
      });

      const phasic = await engine.getCurrentPhasicState('user-1', 'operations');
      // routine: DA += -0.2 * 1.0, 5HT += 0.2 * 1.0
      expect(phasic.dopamine).toBeLessThan(0.5);
      expect(phasic.serotonin).toBeGreaterThan(0.5);
    });

    it('should handle confirmation event: decrease NE', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('confirmation', {
        magnitude: 1.0,
        userId: 'user-1',
        context: 'operations',
      });

      const phasic = await engine.getCurrentPhasicState('user-1', 'operations');
      // confirmation: NE += -0.1 * 1.0
      expect(phasic.norepinephrine).toBeLessThan(0.5);
    });

    it('should handle rejection event: increase NE, decrease DA', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('rejection', {
        magnitude: 1.0,
        userId: 'user-1',
        context: 'operations',
      });

      const phasic = await engine.getCurrentPhasicState('user-1', 'operations');
      // rejection: NE += 0.5 * 1.0, DA += -0.2 * 1.0
      expect(phasic.norepinephrine).toBeGreaterThan(0.5);
      expect(phasic.dopamine).toBeLessThan(0.5);
    });

    it('should handle context_switch event: decrease 5HT, increase ACh', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('context_switch', {
        magnitude: 1.0,
        userId: 'user-1',
        context: 'operations',
      });

      const phasic = await engine.getCurrentPhasicState('user-1', 'operations');
      // context_switch: 5HT += -0.3 * 1.0, ACh += 0.3 * 1.0
      expect(phasic.serotonin).toBeLessThan(0.5);
      expect(phasic.acetylcholine).toBeGreaterThan(0.5);
    });
  });

  // =========================================================
  // Event Accumulation
  // =========================================================

  describe('event accumulation', () => {
    it('should accumulate multiple events on the same channel', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('novelty', {
        magnitude: 0.3,
        userId: 'user-1',
        context: 'operations',
      });

      const after1 = await engine.getCurrentPhasicState('user-1', 'operations');

      await engine.emitEvent('novelty', {
        magnitude: 0.3,
        userId: 'user-1',
        context: 'operations',
      });

      const after2 = await engine.getCurrentPhasicState('user-1', 'operations');

      expect(after2.dopamine).toBeGreaterThan(after1.dopamine);
    });

    it('should accumulate events across different types', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      // Both novelty and prediction_error boost different channels
      await engine.emitEvent('novelty', {
        magnitude: 0.3,
        userId: 'user-1',
        context: 'operations',
      });
      await engine.emitEvent('prediction_error', {
        magnitude: 0.3,
        userId: 'user-1',
        context: 'operations',
      });

      const phasic = await engine.getCurrentPhasicState('user-1', 'operations');
      expect(phasic.dopamine).toBeGreaterThan(0.5);
      expect(phasic.norepinephrine).toBeGreaterThan(0.5);
    });
  });

  // =========================================================
  // Context Isolation
  // =========================================================

  describe('context isolation', () => {
    it('should not interfere between different users', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('novelty', {
        magnitude: 0.8,
        userId: 'user-A',
        context: 'operations',
      });

      const stateA = await engine.getCurrentPhasicState('user-A', 'operations');
      const stateB = await engine.getCurrentPhasicState('user-B', 'operations');

      expect(stateA.dopamine).toBeGreaterThan(0.5);
      expect(stateB.dopamine).toBe(0.5); // default baseline
    });

    it('should not interfere between different contexts for same user', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('novelty', {
        magnitude: 0.8,
        userId: 'user-1',
        context: 'finance',
      });

      const workState = await engine.getCurrentPhasicState('user-1', 'finance');
      const personalState = await engine.getCurrentPhasicState('user-1', 'operations');

      expect(workState.dopamine).toBeGreaterThan(0.5);
      expect(personalState.dopamine).toBe(0.5);
    });
  });

  // =========================================================
  // Default State
  // =========================================================

  describe('default state', () => {
    it('should return default state for unknown user with no DB record', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const state = await engine.getState('unknown-user', 'operations');

      expect(state.dopamine).toBe(0.5);
      expect(state.norepinephrine).toBe(0.5);
      expect(state.serotonin).toBe(0.5);
      expect(state.acetylcholine).toBe(0.5);
      expect(state.lastUpdated).toBeInstanceOf(Date);
    });

    it('should return tonic state when no phasic events have been emitted', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      const phasic = await engine.getCurrentPhasicState('no-events-user', 'operations');

      expect(phasic.dopamine).toBe(0.5);
      expect(phasic.norepinephrine).toBe(0.5);
      expect(phasic.serotonin).toBe(0.5);
      expect(phasic.acetylcholine).toBe(0.5);
    });
  });

  // =========================================================
  // advanceTime
  // =========================================================

  describe('advanceTime', () => {
    it('should simulate time passing and decay phasic signals', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('novelty', {
        magnitude: 0.8,
        userId: 'user-1',
        context: 'operations',
      });

      const before = await engine.getCurrentPhasicState('user-1', 'operations');
      engine.advanceTime('user-1', 'operations', 10 * 60 * 1000); // 10 minutes (2 half-lives)
      const after = await engine.getCurrentPhasicState('user-1', 'operations');

      // After 2 half-lives, phasic should be ~25% of original
      const beforePhasic = before.dopamine - 0.5;
      const afterPhasic = after.dopamine - 0.5;
      // Allow tolerance for tonic interactions
      expect(afterPhasic).toBeLessThan(beforePhasic * 0.5);
    });

    it('should not change state for zero time advance', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('novelty', {
        magnitude: 0.5,
        userId: 'user-1',
        context: 'operations',
      });

      const before = await engine.getCurrentPhasicState('user-1', 'operations');
      engine.advanceTime('user-1', 'operations', 0);
      const after = await engine.getCurrentPhasicState('user-1', 'operations');

      expect(after.dopamine).toBeCloseTo(before.dopamine, 10);
    });

    it('should fully decay phasic signal after many half-lives', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('novelty', {
        magnitude: 0.8,
        userId: 'user-1',
        context: 'operations',
      });

      // Advance 1 hour (12 half-lives)
      engine.advanceTime('user-1', 'operations', 60 * 60 * 1000);
      const state = await engine.getCurrentPhasicState('user-1', 'operations');

      // Phasic should be essentially zero; effective near tonic
      expect(state.dopamine).toBeCloseTo(0.5, 1);
    });
  });

  // =========================================================
  // ModulationParams Mapping
  // =========================================================

  describe('modulation params mapping', () => {
    it('should map DA to explorationBias', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('novelty', {
        magnitude: 0.8,
        userId: 'user-1',
        context: 'operations',
      });

      const params = await engine.getModulationParams('user-1', 'operations');
      expect(params.explorationBias).toBeGreaterThan(0.5);
    });

    it('should map 5HT to consolidationPatience', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('stable_focus', {
        magnitude: 0.8,
        userId: 'user-1',
        context: 'operations',
      });

      const params = await engine.getModulationParams('user-1', 'operations');
      expect(params.consolidationPatience).toBeGreaterThan(0.5);
    });

    it('should map ACh to attentionRatio', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('exploration', {
        magnitude: 0.8,
        userId: 'user-1',
        context: 'operations',
      });

      const params = await engine.getModulationParams('user-1', 'operations');
      expect(params.attentionRatio).toBeGreaterThan(0.5);
    });
  });

  // =========================================================
  // DB Error Handling
  // =========================================================

  describe('error handling', () => {
    it('should return defaults when DB query fails on getState', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB connection lost'));

      const state = await engine.getState('user-1', 'operations');

      expect(state.dopamine).toBe(0.5);
      expect(state.norepinephrine).toBe(0.5);
      expect(state.serotonin).toBe(0.5);
      expect(state.acetylcholine).toBe(0.5);
    });

    it('should not throw when persist fails', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] }) // getState
        .mockRejectedValueOnce(new Error('DB write failed')); // persist

      await expect(
        engine.persistState('user-1', 'operations'),
      ).resolves.not.toThrow();
    });
  });

  // =========================================================
  // Magnitude Scaling
  // =========================================================

  describe('magnitude scaling', () => {
    it('should scale channel changes proportionally to magnitude', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('novelty', {
        magnitude: 0.2,
        userId: 'user-small',
        context: 'operations',
      });

      await engine.emitEvent('novelty', {
        magnitude: 0.8,
        userId: 'user-large',
        context: 'operations',
      });

      const small = await engine.getCurrentPhasicState('user-small', 'operations');
      const large = await engine.getCurrentPhasicState('user-large', 'operations');

      // Larger magnitude should produce larger DA boost
      expect(large.dopamine - 0.5).toBeGreaterThan(small.dopamine - 0.5);
    });

    it('should handle zero magnitude gracefully', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      await engine.emitEvent('novelty', {
        magnitude: 0,
        userId: 'user-1',
        context: 'operations',
      });

      const phasic = await engine.getCurrentPhasicState('user-1', 'operations');
      expect(phasic.dopamine).toBe(0.5);
    });
  });

  // =========================================================
  // Enabled/Disabled Toggle
  // =========================================================

  describe('enabled toggle', () => {
    it('should return actual modulated values when enabled', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      engine.setEnabled(true);

      await engine.emitEvent('prediction_error', {
        magnitude: 0.8,
        userId: 'user-1',
        context: 'operations',
      });

      const params = await engine.getModulationParams('user-1', 'operations');
      expect(params.learningRate).not.toBe(0.5);
    });

    it('should still track events internally when disabled', async () => {
      mockQueryContext.mockResolvedValue({ rows: [] });

      engine.setEnabled(false);

      await engine.emitEvent('novelty', {
        magnitude: 0.8,
        userId: 'user-1',
        context: 'operations',
      });

      // Params return baseline when disabled
      const paramsDisabled = await engine.getModulationParams('user-1', 'operations');
      expect(paramsDisabled.explorationBias).toBe(0.5);

      // Re-enable and the internal state should reflect the event
      engine.setEnabled(true);
      const paramsEnabled = await engine.getModulationParams('user-1', 'operations');
      expect(paramsEnabled.explorationBias).toBeGreaterThan(0.5);
    });
  });
});
