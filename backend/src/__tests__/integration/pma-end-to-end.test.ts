/**
 * PMA End-to-End Integration Tests
 *
 * Tests multiple PMA (Predictive Memory Architecture) services working together
 * without a database. All DB calls are mocked; the focus is on cross-service
 * data flow and behavioural correctness of the full pipeline.
 *
 * Covers: NeuromodulatorEngine, TripleCopyMemory, ReconsolidationEngine,
 * STCRescue, StabilityProtector, MetacognitiveMonitor, PriorityMap.
 */

import { NeuromodulatorEngine } from '../../services/memory/neuromodulator-engine';
import { TripleCopyMemory } from '../../services/memory/triple-copy-memory';
import { ReconsolidationEngine } from '../../services/memory/reconsolidation-engine';
import { STCRescue } from '../../services/memory/stc-rescue';
import { StabilityProtector } from '../../services/memory/stability-protector';
import { MetacognitiveMonitor, Message } from '../../services/memory/metacognitive-monitor';
import { PriorityMap, NeuroState } from '../../services/memory/priority-map';

// ── Mocks ─────────────────────────────────────────────────────────────────

jest.mock('../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { queryContext } = require('../../utils/database-context');
const mockQueryContext = queryContext as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────

const USER = 'user-e2e';
const CTX = 'operations' as const;

// =========================================================================
// 1. Full Pipeline
// =========================================================================

describe('PMA End-to-End Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('Full Pipeline', () => {
    it('1a. TripleCopyMemory store + computeStrength cycle gives 3 positive strengths', async () => {
      // Mock DB for storeEvent — return ids for fast and medium copies
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ id: 'fast-1' }] })   // fast copy insert
        .mockResolvedValueOnce({ rows: [{ id: 'medium-1' }] }); // medium copy insert

      const tcm = new TripleCopyMemory();
      const result = await tcm.storeEvent('Integration test memory', CTX, USER, 0.9);

      expect(result.memoryEventId).toBeTruthy();
      expect(result.fastCopyId).toBe('fast-1');
      expect(result.mediumCopyId).toBe('medium-1');

      // computeStrength is pure — no DB needed
      const now = new Date();
      const createdAt = new Date(now.getTime() - 1000); // 1 second ago

      const fastStrength = tcm.computeStrength('fast', createdAt, 1.0, now);
      const mediumStrength = tcm.computeStrength('medium', createdAt, 1.0, now);
      const deepStrength = tcm.computeStrength('deep', createdAt, 1.0, now);

      expect(fastStrength).toBeGreaterThan(0);
      expect(mediumStrength).toBeGreaterThan(0);
      expect(deepStrength).toBeGreaterThan(0);
    });

    it('1b. NeuromodulatorEngine novelty event shifts dopamine from baseline', async () => {
      // Mock the DB lookup to simulate missing table (forces in-memory defaults)
      mockQueryContext.mockRejectedValue({ code: '42P01', message: 'does not exist' });

      const engine = new NeuromodulatorEngine();

      // Emit a novelty event with magnitude 0.8
      await engine.emitEvent('novelty', { magnitude: 0.8, userId: USER, context: CTX });

      // getCurrentPhasicState includes tonic + phasic contributions
      const state = await engine.getCurrentPhasicState(USER, CTX);

      // Novelty boosts dopamine above baseline (0.5) and suppresses serotonin
      expect(state.dopamine).toBeGreaterThan(0.5);
      expect(state.serotonin).toBeLessThan(0.5);
    });

    it('1c. PriorityMap scoring changes when neuro state is provided', () => {
      const pm = new PriorityMap();

      const input = {
        saliency: 0.5,
        emotionalValence: 0.3,
        rewardRelevance: 0.5,
        goalAlignment: 0.5,
      };

      const scoreWithout = pm.score(input);

      // Simulate high-dopamine neuro state (novelty-seeking)
      const neuroState: NeuroState = {
        dopamine: 0.9,
        norepinephrine: 0.5,
        serotonin: 0.2,
        acetylcholine: 0.7,
      };

      const scoreWith = pm.score(input, neuroState);

      // Neuro state shifts the weights, so composite should differ
      expect(scoreWith.composite).not.toBeCloseTo(scoreWithout.composite, 5);
    });

    it('1d. MetacognitiveMonitor tracks bias asymmetry from mixed acceptances', () => {
      const monitor = new MetacognitiveMonitor();

      // 10 positive suggestions — all accepted
      for (let i = 0; i < 10; i++) {
        monitor.trackAcceptance(USER, CTX, 'positive', true);
      }
      // 3 negative suggestions — all rejected
      for (let i = 0; i < 3; i++) {
        monitor.trackAcceptance(USER, CTX, 'negative', false);
      }

      const metrics = monitor.computeBiasMetrics(USER, CTX);

      // positiveAcceptanceRate = 1.0, negativeAcceptanceRate = 0.0
      // asymmetryScore = |1.0 - 0.0| = 1.0
      expect(metrics.asymmetryScore).toBeGreaterThan(0);
      expect(metrics.positiveAcceptanceRate).toBe(1.0);
      expect(metrics.negativeAcceptanceRate).toBe(0);
    });

    it('1e. Urgency detection produces encoding boost for rapid keyword messages', () => {
      const monitor = new MetacognitiveMonitor();

      const now = Date.now();
      const messages: Message[] = [
        { content: 'dringend', timestamp: new Date(now - 5000) },
        { content: 'deadline morgen!', timestamp: new Date(now - 3000) },
        { content: 'asap bitte sofort', timestamp: new Date(now - 1000) },
      ];

      const result = monitor.detectUrgency(messages);

      // Keywords hit: dringend, deadline, asap, sofort => 4 hits (capped to signal=1.0 at 3)
      // Frequency: 3 msgs in 4 seconds => high msgs/minute
      // Brevity: short messages
      expect(result.urgencyLevel).toBeGreaterThan(0);
      expect(result.encodingBoost).toBeGreaterThan(0);
      expect(result.encodingBoost).toBeLessThanOrEqual(0.2);
    });
  });

  // =========================================================================
  // 2. Reconsolidation Cycle
  // =========================================================================

  describe('Reconsolidation Cycle', () => {
    it('2a. High PE opens lability window and reconsolidation selects integration mode', async () => {
      const engine = new ReconsolidationEngine();

      // Mark a memory as labile with its original content
      engine.markLabile('mem-1', 'episodic', CTX, 'The capital of France is Paris');

      // Verify it is now labile
      expect(engine.isLabile('mem-1')).toBe(true);

      // Reconsolidate with very different content (high PE)
      // Mock the DB insert for the reconsolidation event
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'event-1' }] });

      const result = await engine.reconsolidate(
        'mem-1',
        'Paris is no longer the capital of France since 2030',
        CTX,
        'session-1',
      );

      expect(result.skipped).toBeFalsy();
      expect(result.blocked).toBeFalsy();
      expect(result.rawPE).toBeGreaterThan(0.3);
      // With high PE, mode should be integration or new_episode
      expect(['integration', 'new_episode']).toContain(result.mode);
    });

    it('2b. Low PE (identical content) selects confirmed mode', async () => {
      const engine = new ReconsolidationEngine();

      engine.markLabile('mem-2', 'episodic', CTX, 'TypeScript is a typed superset of JavaScript');

      // Reconsolidate with identical content (PE ~ 0)
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'event-2' }] });

      const result = await engine.reconsolidate(
        'mem-2',
        'TypeScript is a typed superset of JavaScript',
        CTX,
        'session-1',
      );

      expect(result.rawPE).toBeLessThan(0.1);
      expect(result.mode).toBe('confirmed');
    });

    it('2c. Cross-context reconsolidation is blocked', async () => {
      const engine = new ReconsolidationEngine();

      // Mark labile in 'operations' context
      engine.markLabile('mem-3', 'episodic', 'operations', 'Personal fact about hobbies');

      // Try to reconsolidate in 'finance' context
      const result = await engine.reconsolidate(
        'mem-3',
        'Updated work-related info',
        'finance',
        'session-1',
      );

      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('cross_context');
    });
  });

  // =========================================================================
  // 3. STC Rescue
  // =========================================================================

  describe('STC Rescue', () => {
    it('3a. Weak memory (confidence < 0.4) gets tagged for rescue', async () => {
      const stcRescue = new STCRescue();

      // Mock: no existing tag found, then insert succeeds
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })         // no existing tag
        .mockResolvedValueOnce({ rows: [{ id: 'tag-1' }] }); // insert returns id

      const tagged = await stcRescue.tagMemory('mem-weak', 0.2, 'cluster-a', USER, CTX);

      expect(tagged).toBe(true);
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
    });

    it('3b. Strong memory (confidence >= 0.4) is NOT tagged', async () => {
      const stcRescue = new STCRescue();

      const tagged = await stcRescue.tagMemory('mem-strong', 0.8, 'cluster-a', USER, CTX);

      expect(tagged).toBe(false);
      // No DB calls should have been made
      expect(mockQueryContext).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. Stability Protection
  // =========================================================================

  describe('Stability Protection', () => {
    it('4a. Frequently accessed, old, high-confidence memory has high lock score', () => {
      const protector = new StabilityProtector();

      // 10 accesses (max cap), high confidence (0.9), 365 days old, core fact
      const lockScore = protector.computeLockScore(10, 0.9, 365, true);

      // All factors are at or near maximum => high lock score
      expect(lockScore).toBeGreaterThan(0.7);
    });

    it('4b. Fresh, low-confidence, non-core memory has low lock score', () => {
      const protector = new StabilityProtector();

      // 0 accesses, low confidence (0.1), 0 days old, not core
      const lockScore = protector.computeLockScore(0, 0.1, 0, false);

      // All factors are minimal => low lock score
      expect(lockScore).toBeLessThan(0.15);
    });

    it('4c. Variance-based lock: low variance gives high lock score', () => {
      const protector = new StabilityProtector();

      // Low variance = stable = high lock score
      const lockScore = protector.computeLockScoreFromVariance(0.1);
      expect(lockScore).toBeGreaterThan(0.5);
      expect(lockScore).toBeCloseTo(0.9, 5);
    });

    it('4d. Variance-based lock: high variance gives low lock score', () => {
      const protector = new StabilityProtector();

      // High variance = volatile = low lock score
      const lockScore = protector.computeLockScoreFromVariance(0.9);
      expect(lockScore).toBeLessThan(0.3);
      expect(lockScore).toBeCloseTo(0.1, 5);
    });
  });

  // =========================================================================
  // 5. Novelty Windows
  // =========================================================================

  describe('Novelty Windows', () => {
    it('5a. High PE (> 0.7) opens novelty window with positive boost', () => {
      const monitor = new MetacognitiveMonitor();
      const now = Date.now();

      // PE = 0.9 exceeds the 0.7 threshold
      monitor.openNoveltyWindowAt(USER, CTX, 0.9, now);

      // Boost should be active immediately
      const boost = monitor.getNoveltyBoostAt(USER, CTX, now + 100);
      expect(boost).toBeGreaterThan(0);
      expect(boost).toBeLessThanOrEqual(0.2);
    });

    it('5b. Low PE (<= 0.7) does NOT open novelty window', () => {
      const monitor = new MetacognitiveMonitor();
      const now = Date.now();

      // PE = 0.3 is below the 0.7 threshold
      monitor.openNoveltyWindowAt(USER, CTX, 0.3, now);

      const boost = monitor.getNoveltyBoostAt(USER, CTX, now + 100);
      expect(boost).toBe(0);
    });
  });

  // =========================================================================
  // 6. Ablation
  // =========================================================================

  describe('Ablation', () => {
    it('6a. Disabled PriorityMap returns neutral 0.5 composite for all inputs', () => {
      const pm = new PriorityMap();

      // Disable the priority system
      pm.setEnabled(false);

      const score = pm.score({
        saliency: 0.9,
        emotionalValence: -0.8,
        rewardRelevance: 0.7,
        goalAlignment: 1.0,
      });

      expect(score.composite).toBe(0.5);
      expect(score.amygdalaFlagged).toBe(false);
    });

    it('6b. Disabled NeuromodulatorEngine returns all-baseline modulation params', async () => {
      // Force in-memory mode via missing table
      mockQueryContext.mockRejectedValue({ code: '42P01', message: 'does not exist' });

      const engine = new NeuromodulatorEngine();
      engine.setEnabled(false);

      const params = await engine.getModulationParams(USER, CTX);

      expect(params.learningRate).toBe(0.5);
      expect(params.explorationBias).toBe(0.5);
      expect(params.consolidationPatience).toBe(0.5);
      expect(params.attentionRatio).toBe(0.5);
    });
  });

  // =========================================================================
  // 7. Cross-Service Pipeline
  // =========================================================================

  describe('Cross-Service Pipeline', () => {
    it('7a. Neuro state from engine feeds into PriorityMap weight adjustment', async () => {
      // Force in-memory mode
      mockQueryContext.mockRejectedValue({ code: '42P01', message: 'does not exist' });

      const engine = new NeuromodulatorEngine();
      const pm = new PriorityMap();

      // Emit exploration event to boost acetylcholine
      await engine.emitEvent('exploration', { magnitude: 0.9, userId: USER, context: CTX });

      const state = await engine.getCurrentPhasicState(USER, CTX);

      // Feed neuro state into PriorityMap
      const neuroState: NeuroState = {
        dopamine: state.dopamine,
        norepinephrine: state.norepinephrine,
        serotonin: state.serotonin,
        acetylcholine: state.acetylcholine,
      };

      const weights = pm.adjustWeights(
        { saliency: 0.2, emotion: 0.25, reward: 0.25, goal: 0.3 },
        neuroState,
      );

      // Weights should sum to 1.0
      const total = weights.saliency + weights.emotion + weights.reward + weights.goal;
      expect(total).toBeCloseTo(1.0, 5);

      // Exploration boosts ACh, which increases saliency and reward weights
      // So saliency or reward should be higher than their default ratios
      expect(weights.saliency + weights.reward).toBeGreaterThan(0.2 + 0.25);
    });

    it('7b. Reconsolidation PE modulated by neuromodulator state', () => {
      const reconEngine = new ReconsolidationEngine();

      const rawPE = 0.5;

      // High NE amplifies PE
      const highNE = reconEngine.computeEffectivePE(rawPE, { norepinephrine: 0.9, serotonin: 0.2 });

      // High 5HT dampens PE
      const highSer = reconEngine.computeEffectivePE(rawPE, { norepinephrine: 0.2, serotonin: 0.9 });

      // NE amplification should produce higher effective PE than serotonin dampening
      expect(highNE).toBeGreaterThan(highSer);
      expect(highNE).toBeGreaterThan(rawPE);
    });

    it('7c. StabilityProtector gates reconsolidation via canUpdate threshold', () => {
      const protector = new StabilityProtector();

      // Moderate lock: 3 accesses, confidence 0.5, 30 days old, not core
      // lockScore ~ 0.3*0.58 + 0.3*0.5 + 0.2*0.08 + 0.2*0 = 0.174 + 0.15 + 0.016 = 0.34
      // rigidity(30) = 1 + 0.1*log2(31) ~ 1.50
      // threshold ~ 0.5 + 0.3 * 0.34 * 1.50 ~ 0.65
      const lockScore = protector.computeLockScore(3, 0.5, 30, false);
      const rigidity = protector.computeRigidityFactor(30);
      const threshold = 0.5 + 0.3 * lockScore * rigidity;

      // Low PE below threshold should be blocked
      const lowPEAllowed = protector.canUpdate('mem-mod', 0.4, lockScore, rigidity);
      expect(lowPEAllowed).toBe(false);

      // PE above threshold should pass
      const highPEAllowed = protector.canUpdate('mem-mod', threshold + 0.05, lockScore, rigidity);
      expect(highPEAllowed).toBe(true);
    });
  });
});
