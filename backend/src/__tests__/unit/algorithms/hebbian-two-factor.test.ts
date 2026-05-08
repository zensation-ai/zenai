import {
  TwoFactorEdge,
  createTwoFactorEdge,
  hebbianUpdateTwoFactor,
  getImportance,
  computeEWCPenalty,
  TWO_FACTOR_DEFAULTS,
} from '../../../algorithms/hebbian-two-factor';

describe('Two-Factor Synaptic Model', () => {
  describe('createTwoFactorEdge', () => {
    it('should create edge with high initial variance (uncertainty)', () => {
      const edge = createTwoFactorEdge('entity-a', 'related_to', 'entity-b');
      expect(edge.weight).toBe(TWO_FACTOR_DEFAULTS.INITIAL_WEIGHT);
      expect(edge.variance).toBe(TWO_FACTOR_DEFAULTS.INITIAL_VARIANCE);
      expect(edge.activationCount).toBe(0);
      expect(edge.u).toBe('entity-a');
      expect(edge.r).toBe('related_to');
      expect(edge.v).toBe('entity-b');
    });
  });

  describe('hebbianUpdateTwoFactor', () => {
    it('should increase weight with positive co-activation', () => {
      const edge = createTwoFactorEdge('a', 'r', 'b');
      const updated = hebbianUpdateTwoFactor(edge, 0.8, 0.9);
      expect(updated.weight).toBeGreaterThan(edge.weight);
    });

    it('should decrease variance with each activation (maturation)', () => {
      const edge = createTwoFactorEdge('a', 'r', 'b');
      const updated = hebbianUpdateTwoFactor(edge, 0.5, 0.5);
      expect(updated.variance).toBeLessThan(edge.variance);
    });

    it('should increment activation count', () => {
      const edge = createTwoFactorEdge('a', 'r', 'b');
      const updated = hebbianUpdateTwoFactor(edge, 0.5, 0.5);
      expect(updated.activationCount).toBe(1);
    });

    it('should mature faster with repeated activations', () => {
      let edge = createTwoFactorEdge('a', 'r', 'b');
      const varianceDrops: number[] = [];
      for (let i = 0; i < 10; i++) {
        const prev = edge.variance;
        edge = hebbianUpdateTwoFactor(edge, 0.7, 0.7);
        varianceDrops.push(prev - edge.variance);
      }
      expect(varianceDrops[0]).toBeGreaterThan(varianceDrops[9]);
    });

    it('should clamp variance to minimum (never reaches zero)', () => {
      let edge = createTwoFactorEdge('a', 'r', 'b');
      for (let i = 0; i < 1000; i++) {
        edge = hebbianUpdateTwoFactor(edge, 1.0, 1.0);
      }
      expect(edge.variance).toBeGreaterThan(0);
      expect(edge.variance).toBeGreaterThanOrEqual(TWO_FACTOR_DEFAULTS.MIN_VARIANCE);
    });

    it('should clamp weight to MAX_WEIGHT', () => {
      let edge = createTwoFactorEdge('a', 'r', 'b');
      for (let i = 0; i < 1000; i++) {
        edge = hebbianUpdateTwoFactor(edge, 1.0, 1.0);
      }
      expect(edge.weight).toBeLessThanOrEqual(TWO_FACTOR_DEFAULTS.MAX_WEIGHT);
    });
  });

  describe('getImportance (Fisher Information proxy)', () => {
    it('should return low importance for new edges (high variance)', () => {
      const edge = createTwoFactorEdge('a', 'r', 'b');
      expect(getImportance(edge)).toBeLessThan(2);
    });

    it('should return high importance for mature edges (low variance)', () => {
      let edge = createTwoFactorEdge('a', 'r', 'b');
      for (let i = 0; i < 50; i++) {
        edge = hebbianUpdateTwoFactor(edge, 0.8, 0.8);
      }
      expect(getImportance(edge)).toBeGreaterThan(5);
    });

    it('should be equivalent to 1/variance (EWC definition)', () => {
      const edge = createTwoFactorEdge('a', 'r', 'b');
      expect(getImportance(edge)).toBeCloseTo(1 / edge.variance, 5);
    });
  });

  describe('computeEWCPenalty', () => {
    it('should penalize changes to mature edges more than new edges', () => {
      let mature = createTwoFactorEdge('a', 'r', 'b');
      for (let i = 0; i < 50; i++) {
        mature = hebbianUpdateTwoFactor(mature, 0.8, 0.8);
      }
      const newEdge = createTwoFactorEdge('c', 'r', 'd');
      const maturePenalty = computeEWCPenalty(mature, mature.weight + 0.5);
      const newPenalty = computeEWCPenalty(newEdge, newEdge.weight + 0.5);
      expect(maturePenalty).toBeGreaterThan(newPenalty);
    });

    it('should return 0 when weight unchanged', () => {
      const edge = createTwoFactorEdge('a', 'r', 'b');
      expect(computeEWCPenalty(edge, edge.weight)).toBe(0);
    });
  });
});
