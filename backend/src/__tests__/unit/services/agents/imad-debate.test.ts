import {
  SelfCritique,
  HesitationFeatures,
  extractHesitationFeatures,
  shouldTriggerDebate,
  executeSelectiveDebate,
  IMAD_DEFAULTS,
} from '../../../../services/agents/imad-debate';

describe('iMAD Selective Debate Protocol', () => {
  describe('extractHesitationFeatures', () => {
    it('should extract confidence gap', () => {
      const features = extractHesitationFeatures({
        initialReasoning: 'X is correct',
        counterArgument: 'Y might also work',
        initialConfidence: 0.9,
        counterConfidence: 0.3,
      });
      expect(features.confidenceGap).toBeCloseTo(0.6);
    });

    it('should detect hedging language', () => {
      const features = extractHesitationFeatures({
        initialReasoning: 'X might possibly be correct, perhaps',
        counterArgument: 'Y could arguably also work, maybe',
        initialConfidence: 0.5,
        counterConfidence: 0.5,
      });
      expect(features.hedgingScore).toBeGreaterThan(0);
    });

    it('should detect contradiction indicators', () => {
      const features = extractHesitationFeatures({
        initialReasoning: 'The data clearly shows X',
        counterArgument: 'But actually the same data contradicts X',
        initialConfidence: 0.6,
        counterConfidence: 0.5,
      });
      expect(features.contradictionScore).toBeGreaterThan(0);
    });
  });

  describe('shouldTriggerDebate', () => {
    it('should NOT trigger debate for confident, consistent responses', () => {
      const features: HesitationFeatures = {
        confidenceGap: 0.7,
        hedgingScore: 0.1,
        contradictionScore: 0.0,
        lengthRatio: 1.2,
        uncertaintyMarkers: 0,
      };
      expect(shouldTriggerDebate(features)).toBe(false);
    });

    it('should trigger debate for uncertain, hedging responses', () => {
      const features: HesitationFeatures = {
        confidenceGap: 0.1,
        hedgingScore: 0.8,
        contradictionScore: 0.6,
        lengthRatio: 2.5,
        uncertaintyMarkers: 4,
      };
      expect(shouldTriggerDebate(features)).toBe(true);
    });
  });

  describe('executeSelectiveDebate', () => {
    it('should skip debate when not triggered', async () => {
      const result = await executeSelectiveDebate(
        'simple question',
        'clear answer',
        { confidenceGap: 0.8, hedgingScore: 0, contradictionScore: 0, lengthRatio: 1, uncertaintyMarkers: 0 },
        [],
      );
      expect(result.debateTriggered).toBe(false);
      expect(result.finalAnswer).toBe('clear answer');
    });

    it('should execute debate when triggered and agents provided', async () => {
      const mockAgents = [
        { name: 'agent1', argue: async () => 'Position A' },
        { name: 'agent2', argue: async () => 'Position B' },
      ];
      const result = await executeSelectiveDebate(
        'contested question',
        'ambiguous answer',
        { confidenceGap: 0.1, hedgingScore: 0.9, contradictionScore: 0.7, lengthRatio: 3, uncertaintyMarkers: 5 },
        mockAgents,
      );
      expect(result.debateTriggered).toBe(true);
      expect(result.positions.length).toBeGreaterThan(0);
    });
  });
});
