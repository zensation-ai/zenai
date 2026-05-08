import {
  LearningProgressTracker,
  computeLearningProgress,
} from '../../../../services/curiosity/learning-progress';

describe('Learning Progress Signal', () => {
  describe('computeLearningProgress', () => {
    it('should return positive progress when errors are decreasing', () => {
      const errorHistory = [0.9, 0.7, 0.5, 0.3]; // improving
      const progress = computeLearningProgress(errorHistory);
      expect(progress).toBeGreaterThan(0);
    });

    it('should return negative progress when errors are increasing', () => {
      const errorHistory = [0.3, 0.5, 0.7, 0.9]; // getting worse
      const progress = computeLearningProgress(errorHistory);
      expect(progress).toBeLessThan(0);
    });

    it('should return ~0 for plateau', () => {
      const errorHistory = [0.5, 0.5, 0.5, 0.5];
      const progress = computeLearningProgress(errorHistory);
      expect(Math.abs(progress)).toBeLessThan(0.05);
    });

    it('should handle single data point gracefully', () => {
      const progress = computeLearningProgress([0.5]);
      expect(progress).toBe(0);
    });
  });

  describe('LearningProgressTracker', () => {
    let tracker: LearningProgressTracker;

    beforeEach(() => {
      tracker = new LearningProgressTracker();
    });

    it('should track errors per domain', () => {
      tracker.recordError('typescript', 0.8);
      tracker.recordError('typescript', 0.5);
      tracker.recordError('react', 0.9);

      const tsProgress = tracker.getProgress('typescript');
      expect(tsProgress).toBeGreaterThan(0); // improving
    });

    it('should prioritize domains with highest learning progress', () => {
      // Domain A: rapid improvement
      tracker.recordError('improving', 0.9);
      tracker.recordError('improving', 0.6);
      tracker.recordError('improving', 0.3);

      // Domain B: plateau
      tracker.recordError('plateau', 0.5);
      tracker.recordError('plateau', 0.5);
      tracker.recordError('plateau', 0.5);

      const ranked = tracker.rankByLearningProgress();
      expect(ranked[0].domain).toBe('improving');
    });
  });
});
