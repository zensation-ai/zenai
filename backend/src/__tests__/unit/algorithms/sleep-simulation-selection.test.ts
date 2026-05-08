import {
  ReplayCandidate,
  SleepConfig,
  SLEEP_DEFAULTS,
  generateReplayCandidates,
  scoreByTDValue,
  selectAndApply,
  runSimulationSelectionCycle,
  identifyCounterfactualCandidates,
} from '../../../algorithms/sleep-simulation-selection';

describe('Simulation-Selection Sleep Loop', () => {
  const mockEpisodes: ReplayCandidate[] = [
    { id: 'ep1', content: 'learned TypeScript generics', tdError: 0.8, reward: 0.9, source: 'real', relatedEntityIds: ['ts', 'generics'] },
    { id: 'ep2', content: 'failed to understand monads', tdError: 0.9, reward: 0.2, source: 'real', relatedEntityIds: ['monads', 'fp'] },
    { id: 'ep3', content: 'reviewed React hooks', tdError: 0.3, reward: 0.7, source: 'real', relatedEntityIds: ['react', 'hooks'] },
    { id: 'ep4', content: 'debugged memory leak', tdError: 0.7, reward: 0.8, source: 'real', relatedEntityIds: ['memory', 'debugging'] },
  ];

  describe('generateReplayCandidates', () => {
    it('should include all real episodes', () => {
      const candidates = generateReplayCandidates(mockEpisodes, []);
      const realOnes = candidates.filter(c => c.source === 'real');
      expect(realOnes.length).toBe(mockEpisodes.length);
    });

    it('should generate counterfactual candidates for high-PE low-reward episodes', () => {
      const counterfactualPaths = [
        { id: 'cf1', content: 'understood monads via category theory', tdError: 0.5, reward: 0.6, source: 'counterfactual' as const, relatedEntityIds: ['monads', 'category-theory'] },
      ];
      const candidates = generateReplayCandidates(mockEpisodes, counterfactualPaths);
      expect(candidates.some(c => c.source === 'counterfactual')).toBe(true);
    });
  });

  describe('scoreByTDValue', () => {
    it('should assign high scores to high-TD-error + high-reward episodes', () => {
      const score = scoreByTDValue(mockEpisodes[0]); // high TD, high reward
      // Threshold lowered from 0.7 to 0.6 after PMA 4.8.4 rebalanced weights
      // (alpha/beta/gamma reduced to make room for deltaTag=0.15 emotional weight)
      expect(score).toBeGreaterThan(0.6);
    });

    it('should assign moderate scores to high-TD-error + low-reward (learning opportunity)', () => {
      const score = scoreByTDValue(mockEpisodes[1]); // high TD, low reward
      expect(score).toBeGreaterThan(0.3);
    });

    it('should assign low scores to low-TD-error episodes (already consolidated)', () => {
      const score = scoreByTDValue(mockEpisodes[2]); // low TD
      expect(score).toBeLessThan(0.5);
    });
  });

  describe('selectAndApply', () => {
    it('should strengthen high-value candidates', () => {
      const results = selectAndApply(mockEpisodes);
      const strengthened = results.filter(r => r.action === 'strengthen');
      expect(strengthened.length).toBeGreaterThan(0);
    });

    it('should decay low-value candidates', () => {
      const lowValueEpisodes: ReplayCandidate[] = [
        { id: 'low1', content: 'trivial fact', tdError: 0.1, reward: 0.1, source: 'real', relatedEntityIds: [] },
      ];
      const results = selectAndApply(lowValueEpisodes);
      expect(results.some(r => r.action === 'decay')).toBe(true);
    });
  });

  describe('runSimulationSelectionCycle', () => {
    it('should return consolidated results with statistics', () => {
      const result = runSimulationSelectionCycle(mockEpisodes, []);
      expect(result.strengthened).toBeGreaterThanOrEqual(0);
      expect(result.decayed).toBeGreaterThanOrEqual(0);
      expect(result.totalCandidates).toBe(mockEpisodes.length);
      expect(result.strengthened + result.decayed).toBeLessThanOrEqual(result.totalCandidates);
    });
  });

  describe('identifyCounterfactualCandidates', () => {
    it('should identify high-PE low-reward episodes for counterfactual generation', () => {
      const candidates = identifyCounterfactualCandidates(mockEpisodes);
      // ep2 has tdError=0.9, reward=0.2 — should be identified
      expect(candidates.some(c => c.id === 'ep2')).toBe(true);
      // ep1 has high reward — should NOT be identified
      expect(candidates.some(c => c.id === 'ep1')).toBe(false);
    });
  });
});
