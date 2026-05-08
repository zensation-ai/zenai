import {
  MetacognitiveHyperAgent,
  MetaInsight,
  StrategyRecord,
} from '../../../../services/agents/metacognitive-hyperagent';

describe('Metacognitive HyperAgent', () => {
  describe('analyzeStrategyPerformance', () => {
    it('should identify underperforming strategies', () => {
      const strategies: StrategyRecord[] = [
        { id: 's1', type: 'knowledge_gap_research', successRate: 0.9, attempts: 10 },
        { id: 's2', type: 'procedural_optimization', successRate: 0.3, attempts: 8 },
        { id: 's3', type: 'calibration_fix', successRate: 0.7, attempts: 5 },
      ];
      const agent = new MetacognitiveHyperAgent();
      const underperforming = agent.analyzeStrategyPerformance(strategies);
      expect(underperforming.some(s => s.id === 's2')).toBe(true);
    });

    it('should ignore strategies with insufficient attempts', () => {
      const strategies: StrategyRecord[] = [
        { id: 's1', type: 'new_strategy', successRate: 0.1, attempts: 2 },
      ];
      const agent = new MetacognitiveHyperAgent();
      const underperforming = agent.analyzeStrategyPerformance(strategies);
      expect(underperforming).toHaveLength(0);
    });
  });

  describe('generateMetaInsight', () => {
    it('should produce actionable meta-insight from strategy history', () => {
      const agent = new MetacognitiveHyperAgent();
      const insight = agent.generateMetaInsight([
        { id: 's1', type: 'knowledge_gap_research', successRate: 0.3, attempts: 15 },
      ]);
      expect(insight.recommendation).toBeTruthy();
      expect(insight.confidence).toBeGreaterThan(0);
      expect(insight.confidence).toBeLessThanOrEqual(1);
    });

    it('should return safe message when no underperformers', () => {
      const agent = new MetacognitiveHyperAgent();
      const insight = agent.generateMetaInsight([]);
      expect(insight.riskLevel).toBe('low');
      expect(insight.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('shouldRequireGovernanceApproval', () => {
    it('should require approval for medium+ risk changes', () => {
      const agent = new MetacognitiveHyperAgent();
      expect(agent.shouldRequireGovernanceApproval('medium')).toBe(true);
      expect(agent.shouldRequireGovernanceApproval('high')).toBe(true);
      expect(agent.shouldRequireGovernanceApproval('low')).toBe(false);
    });
  });

  describe('getInsightHistory', () => {
    it('should persist meta-insights', () => {
      const agent = new MetacognitiveHyperAgent();
      agent.generateMetaInsight([
        { id: 's1', type: 'test', successRate: 0.2, attempts: 10 },
      ]);
      const history = agent.getInsightHistory();
      expect(history.length).toBe(1);
    });
  });
});
