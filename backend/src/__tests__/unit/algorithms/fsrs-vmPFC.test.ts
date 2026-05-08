import {
  computeKGPredictionError,
  computeAdaptiveFSRSInterval,
  computeReEncodingFactor,
  VMPFC_DEFAULTS,
} from '../../../algorithms/fsrs-vmPFC';

describe('vmPFC Prediction-Error Coupled FSRS', () => {
  describe('computeKGPredictionError', () => {
    it('should return high PE when KG context changed significantly', () => {
      const pe = computeKGPredictionError(
        [1.0, 0.0, 0.0, 0.0],  // embedding at last review
        [0.0, 0.0, 0.0, 1.0],  // current embedding (orthogonal = max change)
      );
      expect(pe).toBeGreaterThan(0.5);
    });

    it('should return low PE when KG context is stable', () => {
      const pe = computeKGPredictionError(
        [0.5, 0.5, 0.5, 0.5],
        [0.51, 0.49, 0.52, 0.48],
      );
      expect(pe).toBeLessThan(0.2);
    });

    it('should return value in [0, 1]', () => {
      const pe = computeKGPredictionError([1, 0, 0], [0, 1, 0]);
      expect(pe).toBeGreaterThanOrEqual(0);
      expect(pe).toBeLessThanOrEqual(1);
    });
  });

  describe('computeReEncodingFactor', () => {
    it('should return high factor for high PE (good learning moment)', () => {
      const factor = computeReEncodingFactor(0.9);
      expect(factor).toBeGreaterThan(0.7);
    });

    it('should return low factor for low PE (no re-encoding benefit)', () => {
      const factor = computeReEncodingFactor(0.1);
      expect(factor).toBeLessThan(0.3);
    });

    it('should be a sigmoid function centered at threshold', () => {
      const atThreshold = computeReEncodingFactor(VMPFC_DEFAULTS.REENCODING_THRESHOLD);
      expect(atThreshold).toBeCloseTo(0.5, 1);
    });
  });

  describe('computeAdaptiveFSRSInterval', () => {
    const baseInterval = 7; // 7 days standard

    it('should extend interval when PE is low (review too early)', () => {
      const adapted = computeAdaptiveFSRSInterval(baseInterval, 0.1);
      expect(adapted).toBeGreaterThan(baseInterval);
    });

    it('should shorten interval when PE is high (ideal learning moment)', () => {
      const adapted = computeAdaptiveFSRSInterval(baseInterval, 0.9);
      expect(adapted).toBeLessThan(baseInterval);
    });

    it('should return approximately base interval at threshold PE', () => {
      const adapted = computeAdaptiveFSRSInterval(
        baseInterval,
        VMPFC_DEFAULTS.REENCODING_THRESHOLD,
      );
      expect(adapted).toBeCloseTo(baseInterval, 0);
    });

    it('should never return negative interval', () => {
      const adapted = computeAdaptiveFSRSInterval(1, 1.0);
      expect(adapted).toBeGreaterThan(0);
    });

    it('should respect max adaptation bounds', () => {
      const extended = computeAdaptiveFSRSInterval(baseInterval, 0.0);
      expect(extended).toBeLessThanOrEqual(baseInterval * 2);

      const shortened = computeAdaptiveFSRSInterval(baseInterval, 1.0);
      expect(shortened).toBeGreaterThanOrEqual(baseInterval * 0.3);
    });
  });
});
